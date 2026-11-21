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

/** One employee: the directory row plus the whole salary history. */
describe('GET /employees/:id (e2e)', () => {
  const jwt = new JwtService({ secret: TEST_JWT_SECRET });
  const id = '5b1c6d0a-8f3e-4c52-9a1e-2d7f4b6a9c10';
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

  const get = async (path: string, role?: 'HR_ADMIN' | 'EMPLOYEE') =>
    fetch(`${baseUrl}/employees/${path}`, {
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
    const response = await get(id);

    expect(response.status).toBe(401);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a user who is not an HR admin', async () => {
    const response = await get(id, 'EMPLOYEE');

    expect(response.status).toBe(403);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a UUID without touching the database', async () => {
    const response = await get('not-an-id', 'HR_ADMIN');

    expect(response.status).toBe(400);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('answers 404 for an employee that does not exist', async () => {
    const response = await get(id, 'HR_ADMIN');

    expect(response.status).toBe(404);
  });

  it('gives an HR admin the employee with the salary history, newest first, each step with what it changed', async () => {
    testApp.queryRaw
      .mockResolvedValueOnce([
        {
          id,
          employeeCode: 'EMP-00001',
          fullName: 'Asha Rao',
          jobTitle: 'Engineer',
          level: 3,
          department: 'Engineering',
          countryCode: 'IN',
          countryName: 'India',
          joiningDate: '2023-11-20',
          status: 'ACTIVE',
          terminatedOn: null,
          tenureBand: '1-3',
          annualAmount: '88000.00',
          currencyCode: 'INR',
          annualAmountUsd: '1055.00',
          bandPosition: 'WITHIN',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: '11111111-1111-4111-8111-111111111111',
          annualAmount: '88000.00',
          currencyCode: 'INR',
          effectiveFrom: '2024-11-20',
          reason: 'MERIT',
          changedByName: 'Hana Tester',
          previousAmount: '80000.00',
          previousCurrencyCode: 'INR',
          changePercent: '10.0',
          state: 'CURRENT',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          annualAmount: '80000.00',
          currencyCode: 'INR',
          effectiveFrom: '2023-11-20',
          reason: 'HIRE',
          changedByName: null,
          previousAmount: null,
          previousCurrencyCode: null,
          changePercent: null,
          state: 'PAST',
        },
      ]);

    const response = await get(id, 'HR_ADMIN');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id,
      employeeCode: 'EMP-00001',
      fullName: 'Asha Rao',
      jobTitle: 'Engineer',
      level: 3,
      department: 'Engineering',
      country: { code: 'IN', name: 'India' },
      joiningDate: '2023-11-20',
      status: 'ACTIVE',
      terminatedOn: null,
      tenureBand: '1-3',
      currentSalary: {
        annualAmount: '88000.00',
        currencyCode: 'INR',
        annualAmountUsd: '1055.00',
      },
      bandPosition: 'WITHIN',
      salaryHistory: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          annualAmount: '88000.00',
          currencyCode: 'INR',
          effectiveFrom: '2024-11-20',
          reason: 'MERIT',
          changedBy: 'Hana Tester',
          previous: { annualAmount: '80000.00', currencyCode: 'INR' },
          changePercent: '10.0',
          state: 'CURRENT',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          annualAmount: '80000.00',
          currencyCode: 'INR',
          effectiveFrom: '2023-11-20',
          reason: 'HIRE',
          changedBy: null,
          previous: null,
          changePercent: null,
          state: 'PAST',
        },
      ],
    });
  });
});
