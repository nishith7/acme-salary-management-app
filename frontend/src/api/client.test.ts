import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { createAuthApi } from './auth.ts';
import { createApiClient } from './client.ts';
import { ApiError } from './errors.ts';

interface SeenRequest {
  url: string;
  authorization: string | undefined;
}
interface Reply {
  status: number;
  data?: unknown;
}

/** A stand-in for the API: axios talks to this adapter instead of the network. */
function fakeServer(handler: (request: SeenRequest) => Reply | Promise<Reply>) {
  const requests: SeenRequest[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const header = config.headers.get('Authorization');
    const request = {
      url: config.url ?? '',
      authorization: typeof header === 'string' ? header : undefined,
    };
    requests.push(request);
    // A client that retries forever would never yield to the test timeout (it is all
    // microtasks), so stop it here and let the assertions report what happened.
    if (requests.length > 50) {
      throw new Error('the client kept sending requests');
    }
    const { status, data } = await handler(request);
    const response: AxiosResponse = {
      data,
      status,
      statusText: '',
      headers: {},
      config,
    };
    if (status >= 400) {
      // A real adapter rejects like this for a status outside 2xx.
      throw new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        response,
      );
    }
    return response;
  };
  return {
    adapter,
    requests,
    count: (url: string) => requests.filter((r) => r.url === url).length,
    withToken: (token: string) =>
      requests.filter((r) => r.authorization === `Bearer ${token}`).length,
  };
}

const session = (accessToken: string): Reply => ({
  status: 200,
  data: {
    accessToken,
    expiresIn: 900,
    user: { id: 'u1', email: 'hr@acme.test', name: 'HR', role: 'HR_ADMIN' },
  },
});

/** Holds a reply back until the test lets it go, so requests can overlap. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

function clientFor(server: ReturnType<typeof fakeServer>) {
  return createApiClient({ baseURL: '/api', adapter: server.adapter });
}

describe('the API client', () => {
  it('refreshes once when several requests get a 401 at the same time', async () => {
    const refreshReply = gate();
    const server = fakeServer(async ({ url, authorization }) => {
      if (url === '/auth/refresh') {
        await refreshReply.opened;
        return session('fresh');
      }
      return authorization === 'Bearer fresh'
        ? { status: 200, data: [] }
        : { status: 401 };
    });
    const client = clientFor(server);
    client.setAccessToken('stale');

    const requests = Promise.all([
      client.http.get('/a'),
      client.http.get('/b'),
      client.http.get('/c'),
    ]);
    await vi.waitFor(() => expect(server.withToken('stale')).toBe(3));
    refreshReply.open();
    await requests;

    expect(server.count('/auth/refresh')).toBe(1);
    expect(server.withToken('fresh')).toBe(3);
  });

  it('shares one refresh request between callers that ask together, as React StrictMode does on start-up', async () => {
    const server = fakeServer(() => session('fresh'));
    const client = clientFor(server);

    const [first, second] = await Promise.all([
      client.refreshSession(),
      client.refreshSession(),
    ]);

    expect(server.count('/auth/refresh')).toBe(1);
    expect(first).toBe(second);
    expect(client.getAccessToken()).toBe('fresh');
  });

  it('retries a request once after a refresh and gives up if it is refused again', async () => {
    const server = fakeServer(({ url }) =>
      url === '/auth/refresh'
        ? session('fresh')
        : { status: 401, data: { statusCode: 401, message: 'Unauthorized' } },
    );
    const client = clientFor(server);
    client.setAccessToken('stale');

    const outcome = client.http.get('/employees');

    await expect(outcome).rejects.toBeInstanceOf(ApiError);
    await expect(outcome).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized',
    });
    expect(server.count('/employees')).toBe(2);
    expect(server.count('/auth/refresh')).toBe(1);
  });

  it('reports the session expired once, clears the token and does not retry when the refresh is refused', async () => {
    const refreshReply = gate();
    const server = fakeServer(async ({ url }) => {
      if (url === '/auth/refresh') {
        await refreshReply.opened;
      }
      return { status: 401 };
    });
    const client = clientFor(server);
    const expired = vi.fn();
    client.onSessionExpired(expired);
    client.setAccessToken('stale');

    const requests = Promise.allSettled([
      client.http.get('/a'),
      client.http.get('/b'),
      client.http.get('/c'),
    ]);
    await vi.waitFor(() => expect(server.withToken('stale')).toBe(3));
    refreshReply.open();
    const outcomes = await requests;

    expect(outcomes.map((o) => o.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(client.getAccessToken()).toBeNull();
    expect(server.count('/auth/refresh')).toBe(1);
    expect(server.requests).toHaveLength(4); // three requests and one refresh: no retries
  });

  it('refreshes again when a later request is refused, after an earlier refresh has finished', async () => {
    let accepted = 't1';
    let issued = 0;
    const server = fakeServer(({ url, authorization }) => {
      if (url === '/auth/refresh') {
        issued += 1;
        return session(`t${issued}`);
      }
      return authorization === `Bearer ${accepted}`
        ? { status: 200 }
        : { status: 401 };
    });
    const client = clientFor(server);
    client.setAccessToken('t0');

    await client.http.get('/employees'); // t0 is refused, the refresh gives t1
    accepted = 't2'; // the server stops accepting t1
    await client.http.get('/employees'); // t1 is refused, the refresh gives t2

    expect(server.count('/auth/refresh')).toBe(2);
    expect(client.getAccessToken()).toBe('t2');
  });

  it('treats a refused login as an answer: no refresh and no expiry signal', async () => {
    const server = fakeServer(() => ({
      status: 401,
      data: { statusCode: 401, message: 'Invalid email or password' },
    }));
    const client = clientFor(server);
    const expired = vi.fn();
    client.onSessionExpired(expired);

    await expect(
      createAuthApi(client).login({ email: 'hr@acme.test', password: 'wrong' }),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });

    expect(server.count('/auth/refresh')).toBe(0);
    expect(expired).not.toHaveBeenCalled();
    expect(client.getAccessToken()).toBeNull();
  });
});
