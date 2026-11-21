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

/** Recording a salary change: `POST /employees/:id/salary-changes`. */
describe('POST /employees/:id/salary-changes (e2e)', () => {
  const jwt = new JwtService({ secret: TEST_JWT_SECRET });
  const id = '5b1c6d0a-8f3e-4c52-9a1e-2d7f4b6a9c10';
  const userId = '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11';
  const valid = {
    annualAmount: '52000.00',
    effectiveFrom: '2026-12-01',
    reason: 'MERIT',
  };
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
    testApp.findEmployee.mockReset().mockResolvedValue({
      status: 'ACTIVE',
      joiningDate: new Date('2023-11-20T00:00:00.000Z'),
      country: { currencyCode: 'GBP' },
      _count: { salaryRecords: 2 },
    });
    testApp.findSalaryRecord.mockReset().mockResolvedValue({
      currencyCode: 'GBP',
    });
    testApp.createSalaryRecord.mockReset().mockResolvedValue({});
    testApp.queryRaw.mockReset().mockResolvedValue([]);
  });

  const post = async (
    body: unknown,
    options: { role?: 'HR_ADMIN' | 'EMPLOYEE'; path?: string } = {},
  ) =>
    fetch(`${baseUrl}/employees/${options.path ?? id}/salary-changes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.role
          ? {
              authorization: `Bearer ${await jwt.signAsync(
                { sub: userId, role: options.role },
                { algorithm: 'HS256', expiresIn: 900 },
              )}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    });

  it('refuses a request with no access token', async () => {
    const response = await post(valid);

    expect(response.status).toBe(401);
    expect(testApp.createSalaryRecord).not.toHaveBeenCalled();
  });

  it('refuses a user who is not an HR admin, and writes nothing', async () => {
    const response = await post(valid, { role: 'EMPLOYEE' });

    expect(response.status).toBe(403);
    expect(testApp.findEmployee).not.toHaveBeenCalled();
    expect(testApp.createSalaryRecord).not.toHaveBeenCalled();
  });

  it('refuses a body that is not a plain positive amount with at most two decimals, a real date and a known reason, without touching the database', async () => {
    const bodies = [
      { ...valid, annualAmount: '-5' },
      { ...valid, annualAmount: '0' },
      { ...valid, annualAmount: '0.00' },
      { ...valid, annualAmount: '52000.123' },
      { ...valid, annualAmount: '52,000' },
      { ...valid, annualAmount: 52000 },
      { ...valid, effectiveFrom: '2026-02-30' },
      { ...valid, effectiveFrom: '1 Dec 2026' },
      { ...valid, reason: 'BONUS' },
      { annualAmount: '52000.00' },
    ];

    for (const body of bodies) {
      const response = await post(body, { role: 'HR_ADMIN' });
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    const notAnId = await post(valid, { role: 'HR_ADMIN', path: 'not-an-id' });
    expect(notAnId.status).toBe(400);
    expect(testApp.findEmployee).not.toHaveBeenCalled();
    expect(testApp.createSalaryRecord).not.toHaveBeenCalled();
  });

  it('answers 404 for an employee that does not exist, and 409 for one who has left', async () => {
    testApp.findEmployee.mockResolvedValueOnce(null);
    const unknown = await post(valid, { role: 'HR_ADMIN' });

    testApp.findEmployee.mockResolvedValueOnce({
      status: 'TERMINATED',
      joiningDate: new Date('2023-11-20T00:00:00.000Z'),
      country: { currencyCode: 'GBP' },
      _count: { salaryRecords: 2 },
    });
    const left = await post(valid, { role: 'HR_ADMIN' });

    expect(unknown.status).toBe(404);
    expect(left.status).toBe(409);
    expect(testApp.createSalaryRecord).not.toHaveBeenCalled();
  });

  it('records the salary as the signed-in user, in the currency in force, and answers 201 with the updated profile', async () => {
    testApp.queryRaw
      .mockResolvedValueOnce([
        {
          id,
          employeeCode: 'EMP-00001',
          fullName: 'Asha Rao',
          jobTitle: 'Engineer',
          level: 3,
          department: 'Engineering',
          countryCode: 'GB',
          countryName: 'United Kingdom',
          joiningDate: '2023-11-20',
          status: 'ACTIVE',
          terminatedOn: null,
          tenureBand: '1-3',
          annualAmount: '52000.00',
          currencyCode: 'GBP',
          annualAmountUsd: '65800.00',
          bandPosition: 'WITHIN',
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await post(valid, { role: 'HR_ADMIN' });

    expect(response.status).toBe(201);
    expect(testApp.createSalaryRecord).toHaveBeenCalledExactlyOnceWith({
      data: {
        employeeId: id,
        annualAmount: '52000.00',
        currencyCode: 'GBP',
        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
        reason: 'MERIT',
        // The user comes from the token, never from the body.
        changedById: userId,
      },
    });
    expect(await response.json()).toMatchObject({
      id,
      fullName: 'Asha Rao',
      salaryHistory: [],
    });
  });
});

/** The CSV download: `QUERY /employees/export`, the list's filters without paging. */
describe('QUERY /employees/export (e2e)', () => {
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

  const send = async (body: unknown, role?: 'HR_ADMIN' | 'EMPLOYEE') =>
    fetch(`${baseUrl}/employees/export`, {
      method: 'QUERY',
      headers: {
        'content-type': 'application/json',
        ...(role
          ? {
              authorization: `Bearer ${await jwt.signAsync(
                { sub: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11', role },
                { algorithm: 'HS256', expiresIn: 900 },
              )}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    });

  it('refuses a request with no access token', async () => {
    const response = await send({});

    expect(response.status).toBe(401);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a user who is not an HR admin, and reads nothing', async () => {
    const response = await send({}, 'EMPLOYEE');

    expect(response.status).toBe(403);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses an invalid body without touching the database', async () => {
    const response = await send({ statuses: ['FIRED'] }, 'HR_ADMIN');

    expect(response.status).toBe(400);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('answers with a CSV download: Excel-ready bytes, a header row and a row per person, whatever paging the caller sent', async () => {
    testApp.queryRaw.mockResolvedValue([
      {
        id: '5b1c6d0a-8f3e-4c52-9a1e-2d7f4b6a9c10',
        employeeCode: 'EMP-00001',
        fullName: 'Olivia Müller',
        jobTitle: 'Analyst',
        level: 3,
        department: 'Finance',
        countryCode: 'DE',
        countryName: 'Germany',
        joiningDate: '2023-11-20',
        status: 'ACTIVE',
        terminatedOn: null,
        tenureBand: '1-3',
        annualAmount: '65000.00',
        currencyCode: 'EUR',
        annualAmountUsd: '70652.17',
        salaryEffectiveFrom: '2025-04-01',
        bandPosition: 'WITHIN',
      },
    ]);

    // A page and a page size are not part of an export; they are ignored, not refused.
    const response = await send({ page: 3, pageSize: 5 }, 'HR_ADMIN');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    // The UTF-8 byte order mark, which makes Excel read "Müller" correctly.
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = await response.text();
    expect(text).toContain('Employee ID,Full name,Job title');
    expect(text).toContain(
      'EMP-00001,Olivia Müller,Analyst,3,Finance,Germany,2023-11-20,Active,,EUR,65000.00,2025-04-01,70652.17,Within band',
    );
    // One query, with no count: an export is everyone, not a page.
    expect(testApp.queryRaw).toHaveBeenCalledTimes(1);
  });
});
