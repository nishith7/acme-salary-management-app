import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { JwtService } from '@nestjs/jwt';
import {
  createTestApp,
  TEST_JWT_SECRET,
  type TestApp,
} from './support/test-app.js';

/** Pay insights: `QUERY /insights/pay`, the directory's filters plus what to group by. */
describe('QUERY /insights/pay (e2e)', () => {
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
    fetch(`${baseUrl}/insights/pay`, {
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

  it('refuses a request with no access token, and a user who is not an HR admin, without reading anything', async () => {
    expect((await send({})).status).toBe(401);
    expect((await send({}, 'EMPLOYEE')).status).toBe(403);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a body it cannot read, without touching the database', async () => {
    const bodies = [
      { groupBy: 'gender' },
      { groupBy: 'country', levels: [0] },
      { groupBy: 'country', countries: [] },
      { groupBy: 'country', departments: [''] },
    ];

    for (const body of bodies) {
      expect((await send(body, 'HR_ADMIN')).status, JSON.stringify(body)).toBe(
        400,
      );
    }
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('answers with the groups big enough to show, the overall figures, and how many groups it left out', async () => {
    testApp.queryRaw
      // the groups
      .mockResolvedValueOnce([
        {
          key: 'IN',
          label: 'India',
          headcount: 800,
          p25: '30000.00',
          median: '40000.00',
          p75: '55000.00',
          total: '36000000.00',
        },
        {
          key: 'DE',
          label: 'Germany',
          headcount: 600,
          p25: '60000.00',
          median: '70000.00',
          p75: '85000.00',
          total: '42000000.00',
        },
        // Too small: it must not be in the answer, even though this row carries figures.
        {
          key: 'XX',
          label: 'Tiny',
          headcount: 3,
          p25: '1.00',
          median: '2.00',
          p75: '3.00',
          total: '6.00',
        },
      ])
      // everyone together
      .mockResolvedValueOnce([
        {
          headcount: 1403,
          p25: '40000.00',
          median: '55000.00',
          p75: '75000.00',
          total: '78000006.00',
          excluded: 7,
        },
      ]);

    const response = await send({ groupBy: 'country' }, 'HR_ADMIN');

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      groupBy: 'country',
      asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
      currency: 'USD',
      minimumGroupSize: 5,
      overall: {
        headcount: 1403,
        p25Usd: '40000.00',
        medianUsd: '55000.00',
        p75Usd: '75000.00',
        totalAnnualUsd: '78000006.00',
      },
      // Sorted by name, and without the group of 3.
      groups: [
        {
          key: 'DE',
          label: 'Germany',
          headcount: 600,
          p25Usd: '60000.00',
          medianUsd: '70000.00',
          p75Usd: '85000.00',
          totalAnnualUsd: '42000000.00',
        },
        {
          key: 'IN',
          label: 'India',
          headcount: 800,
          p25Usd: '30000.00',
          medianUsd: '40000.00',
          p75Usd: '55000.00',
          totalAnnualUsd: '36000000.00',
        },
      ],
      hiddenGroups: 1,
      excluded: 7,
    });
    expect(JSON.stringify(body)).not.toContain('Tiny');
  });

  it('groups by country when no grouping is asked for', async () => {
    testApp.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        headcount: 0,
        p25: null,
        median: null,
        p75: null,
        total: null,
        excluded: 0,
      },
    ]);

    const response = await send({}, 'HR_ADMIN');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      groupBy: 'country',
      overall: null,
      groups: [],
      hiddenGroups: 0,
    });
  });
});

/** The gender pay gap by level: `QUERY /insights/gender-gap`. */
describe('QUERY /insights/gender-gap (e2e)', () => {
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
    fetch(`${baseUrl}/insights/gender-gap`, {
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

  it('refuses a request with no access token, and a user who is not an HR admin, without reading anything', async () => {
    expect((await send({})).status).toBe(401);
    expect((await send({}, 'EMPLOYEE')).status).toBe(403);
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a body it cannot read, without touching the database', async () => {
    for (const body of [
      { countries: [] },
      { departments: [''] },
      { levels: [0] },
    ]) {
      expect((await send(body, 'HR_ADMIN')).status, JSON.stringify(body)).toBe(
        400,
      );
    }
    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('compares women and men level by level and overall, shows only levels with 5 or more of each, and says what it left out', async () => {
    testApp.queryRaw
      // by level and gender
      .mockResolvedValueOnce([
        { level: 2, gender: 'FEMALE', headcount: 5, median: '70000.00' },
        { level: 2, gender: 'MALE', headcount: 5, median: '90000.00' },
        // only 4 men at level 3: this level must not be in the answer, though a figure arrived
        { level: 3, gender: 'FEMALE', headcount: 6, median: '100000.00' },
        { level: 3, gender: 'MALE', headcount: 4, median: '120000.00' },
      ])
      // everyone together, by gender
      .mockResolvedValueOnce([
        { gender: 'FEMALE', headcount: 11, median: '100000.00' },
        { gender: 'MALE', headcount: 9, median: '110000.00' },
      ])
      // what was not compared
      .mockResolvedValueOnce([{ otherGender: 3, excluded: 2 }]);

    const response = await send({}, 'HR_ADMIN');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
      currency: 'USD',
      minimumGroupSize: 5,
      overall: {
        women: { headcount: 11, medianUsd: '100000.00' },
        men: { headcount: 9, medianUsd: '110000.00' },
        gapPercent: '-9.1',
      },
      levels: [
        {
          level: 2,
          label: 'Level 2',
          women: { headcount: 5, medianUsd: '70000.00' },
          men: { headcount: 5, medianUsd: '90000.00' },
          gapPercent: '-22.2',
        },
      ],
      hiddenLevels: 1,
      otherGender: 3,
      excluded: 2,
    });
  });
});
