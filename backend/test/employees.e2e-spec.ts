import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { JwtService } from '@nestjs/jwt';
import {
  createTestApp,
  TEST_JWT_SECRET,
  type TestApp,
} from './support/test-app.js';

/**
 * The directory endpoint is `QUERY /employees`: the filters travel in a JSON
 * body, so they can be as many and as structured as needed. supertest cannot
 * send the QUERY method (its `.query()` sets the query string), so these tests
 * call the running server with fetch.
 */
describe('QUERY /employees (e2e)', () => {
  const jwt = new JwtService({ secret: TEST_JWT_SECRET });
  let testApp: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    const server = testApp.app.getHttpServer() as unknown as Server;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    testApp.queryRaw.mockReset().mockResolvedValue([]);
  });

  const accessToken = (role: 'HR_ADMIN' | 'EMPLOYEE') =>
    jwt.signAsync(
      { sub: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11', role },
      { algorithm: 'HS256', expiresIn: 900 },
    );

  const send = async (body: unknown, token?: string) =>
    fetch(`${baseUrl}/employees`, {
      method: 'QUERY',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('refuses a request with no access token', async () => {
    const response = await send({});

    expect(response.status).toBe(401);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a user who is not an HR admin', async () => {
    const response = await send({}, await accessToken('EMPLOYEE'));

    expect(response.status).toBe(403);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses an invalid body without touching the database', async () => {
    const token = await accessToken('HR_ADMIN');

    const tooBig = await send({ pageSize: 1000 }, token);
    const unknownValue = await send({ statuses: ['FIRED'] }, token);

    expect(tooBig.status).toBe(400);
    expect(unknownValue.status).toBe(400);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('answers an HR admin with a page: an empty body means everyone, page 1 of 25', async () => {
    const response = await send({}, await accessToken('HR_ADMIN'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });
  });
});

/** The values the directory's filter dropdowns offer: a plain GET, nothing to send. */
describe('GET /employees/filter-options (e2e)', () => {
  const jwt = new JwtService({ secret: TEST_JWT_SECRET });
  let testApp: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    const server = testApp.app.getHttpServer() as unknown as Server;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    testApp.findCountries
      .mockReset()
      .mockResolvedValue([{ code: 'IN', name: 'India' }]);
    testApp.findDepartments
      .mockReset()
      .mockResolvedValue([{ name: 'Engineering' }, { name: 'Finance' }]);
  });

  const get = async (role?: 'HR_ADMIN' | 'EMPLOYEE') =>
    fetch(`${baseUrl}/employees/filter-options`, {
      headers: role
        ? {
            authorization: `Bearer ${await jwt.signAsync(
              { sub: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11', role },
              { algorithm: 'HS256', expiresIn: 900 },
            )}`,
          }
        : {},
    });

  it('refuses a request with no access token', async () => {
    const response = await get();

    expect(response.status).toBe(401);
    expect(testApp.findCountries).not.toHaveBeenCalled();
  });

  it('refuses a user who is not an HR admin', async () => {
    const response = await get('EMPLOYEE');

    expect(response.status).toBe(403);
    expect(testApp.findCountries).not.toHaveBeenCalled();
    expect(testApp.findDepartments).not.toHaveBeenCalled();
  });

  it('gives an HR admin the countries (code and name) and the department names', async () => {
    const response = await get('HR_ADMIN');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      countries: [{ code: 'IN', name: 'India' }],
      departments: ['Engineering', 'Finance'],
    });
  });
});
