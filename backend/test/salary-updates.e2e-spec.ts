import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import {
  createTestApp,
  TEST_JWT_SECRET,
  type TestApp,
} from './support/test-app.js';

/**
 * The bulk salary update, so far: the template to fill in, and the preview of a file. The
 * file travels as the request body with the type text/csv. Nothing here saves anything.
 */
describe('salary updates (e2e)', () => {
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

  const token = (role: 'HR_ADMIN' | 'EMPLOYEE') =>
    jwt.signAsync(
      { sub: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11', role },
      { algorithm: 'HS256', expiresIn: 900 },
    );

  const template = async (role?: 'HR_ADMIN' | 'EMPLOYEE') =>
    fetch(`${baseUrl}/salary-updates/template`, {
      headers: role ? { authorization: `Bearer ${await token(role)}` } : {},
    });

  const preview = async (
    body: string,
    options: { role?: 'HR_ADMIN' | 'EMPLOYEE'; type?: string } = {},
  ) =>
    fetch(`${baseUrl}/salary-updates/preview`, {
      method: 'POST',
      headers: {
        'content-type': options.type ?? 'text/csv',
        ...(options.role
          ? { authorization: `Bearer ${await token(options.role)}` }
          : {}),
      },
      body: body,
    });

  const target = {
    employeeId: '5b1c6d0a-8f3e-4c52-9a1e-2d7f4b6a9c10',
    employeeCode: 'EMP-00001',
    fullName: 'Asha Rao',
    status: 'ACTIVE',
    joiningDate: '2023-11-20',
    countryCurrencyCode: 'GBP',
    earliestCurrency: 'GBP',
    salaryRecordCount: 3,
    currentAmount: '50000.00',
    currentCurrency: 'GBP',
    currentEffectiveFrom: '2025-04-01',
  };
  const header = 'Employee ID,New annual salary,Effective from,Reason';

  describe('GET /salary-updates/template', () => {
    it('refuses a request with no access token, and a user who is not an HR admin', async () => {
      expect((await template()).status).toBe(401);
      expect((await template('EMPLOYEE')).status).toBe(403);
      expect(testApp.queryRaw).not.toHaveBeenCalled();
    });

    it('gives a CSV of the people who can still be given a salary, with the three empty columns to fill in', async () => {
      testApp.queryRaw.mockResolvedValue([
        {
          id: target.employeeId,
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
          annualAmount: '50000.00',
          currencyCode: 'GBP',
          annualAmountUsd: '63291.14',
          salaryEffectiveFrom: '2025-04-01',
          bandPosition: 'WITHIN',
        },
      ]);

      const response = await template('HR_ADMIN');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      expect(response.headers.get('content-disposition')).toContain(
        'attachment',
      );
      const text = await response.text();
      expect(text).toContain('Annual salary,Salary effective from');
      expect(text).toContain(
        'Pay band,New annual salary,Effective from,Reason',
      );
      expect(text).toContain('Within band,,,');
    });
  });

  describe('POST /salary-updates/preview', () => {
    it('refuses a request with no access token, and a user who is not an HR admin, without reading anything', async () => {
      expect((await preview(`${header}\n`)).status).toBe(401);
      expect((await preview(`${header}\n`, { role: 'EMPLOYEE' })).status).toBe(
        403,
      );
      expect(testApp.queryRaw).not.toHaveBeenCalled();
    });

    it('refuses a body that is not text/csv, or is empty', async () => {
      const json = await preview('{"csv":"x"}', {
        role: 'HR_ADMIN',
        type: 'application/json',
      });
      const empty = await preview('', { role: 'HR_ADMIN' });

      expect(json.status).toBe(400);
      expect(empty.status).toBe(400);
      expect(testApp.queryRaw).not.toHaveBeenCalled();
    });

    it('checks every row against the people it names, and saves nothing', async () => {
      testApp.queryRaw.mockResolvedValue([target]);

      const response = await preview(
        [
          header,
          'EMP-00001,52000.50,2026-12-01,Merit increase',
          'EMP-99999,52000,2026-12-01,Merit',
        ].join('\r\n'),
        { role: 'HR_ADMIN' },
      );

      expect(response.status).toBe(200);
      const report = (await response.json()) as {
        fileProblems: string[];
        rows: { employeeCode: string; outcome: string; change: unknown }[];
        summary: Record<string, number>;
      };
      expect(report.fileProblems).toEqual([]);
      expect(report.rows.map((r) => [r.employeeCode, r.outcome])).toEqual([
        ['EMP-00001', 'WILL_UPDATE'],
        ['EMP-99999', 'ERROR'],
      ]);
      expect(report.rows[0]?.change).toEqual({
        annualAmount: '52000.50',
        currencyCode: 'GBP',
        effectiveFrom: '2026-12-01',
        reason: 'MERIT',
        previousAmount: '50000.00',
        changePercent: '4.0',
      });
      expect(report.summary).toMatchObject({ willUpdate: 1, errors: 1 });
      // One lookup of the people named, and no write of any kind.
      expect(testApp.queryRaw).toHaveBeenCalledTimes(1);
      expect(testApp.createSalaryRecord).not.toHaveBeenCalled();
    });

    it('answers a file it cannot read with its problems, not an error, and looks nobody up', async () => {
      const missingColumn = await preview('Employee ID,Salary\nEMP-00001,1\n', {
        role: 'HR_ADMIN',
      });
      const unclosedQuote = await preview(
        `${header}\nEMP-00001,"52000,2026-12-01,Merit\n`,
        {
          role: 'HR_ADMIN',
        },
      );

      for (const response of [missingColumn, unclosedQuote]) {
        expect(response.status).toBe(200);
        const report = (await response.json()) as {
          fileProblems: string[];
          rows: unknown[];
        };
        expect(report.fileProblems.length).toBeGreaterThan(0);
        expect(report.rows).toEqual([]);
      }
      expect(testApp.queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('POST /salary-updates/apply', () => {
    const userId = '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11';
    const importId = '9d3c5e1a-7b24-4f60-8a1d-3c5e7f9b2a46';

    beforeEach(() => {
      testApp.createImport.mockReset().mockResolvedValue({ id: importId });
      testApp.createManySalaryRecords
        .mockReset()
        .mockResolvedValue({ count: 0 });
    });

    const apply = async (
      body: string,
      options: {
        role?: 'HR_ADMIN' | 'EMPLOYEE';
        type?: string;
        query?: string;
      } = {},
    ) =>
      fetch(`${baseUrl}/salary-updates/apply${options.query ?? ''}`, {
        method: 'POST',
        headers: {
          'content-type': options.type ?? 'text/csv',
          ...(options.role
            ? { authorization: `Bearer ${await token(options.role)}` }
            : {}),
        },
        body,
      });

    const second = {
      ...target,
      employeeId: '7a1c3e5f-9b2d-4f60-8c4e-1a3c5e7f9b20',
      employeeCode: 'EMP-00003',
      fullName: 'Cy Gamma',
      currentAmount: '40000.00',
    };

    it('refuses a request with no access token, and a user who is not an HR admin, and writes nothing', async () => {
      expect((await apply(`${header}\n`)).status).toBe(401);
      expect((await apply(`${header}\n`, { role: 'EMPLOYEE' })).status).toBe(
        403,
      );
      expect(testApp.queryRaw).not.toHaveBeenCalled();
      expect(testApp.createImport).not.toHaveBeenCalled();
    });

    it('refuses a body that is not text/csv, or is empty, or a file that cannot be read, and writes nothing', async () => {
      const json = await apply('{"csv":"x"}', {
        role: 'HR_ADMIN',
        type: 'application/json',
      });
      const empty = await apply('', { role: 'HR_ADMIN' });
      const unreadable = await apply('Employee ID,Salary\nEMP-00001,1\n', {
        role: 'HR_ADMIN',
      });

      expect(json.status).toBe(400);
      expect(empty.status).toBe(400);
      expect(unreadable.status).toBe(400);
      expect(testApp.createImport).not.toHaveBeenCalled();
      expect(testApp.createManySalaryRecords).not.toHaveBeenCalled();
    });

    it('adds the salaries that pass, as the signed-in user, under one import, and skips the rows with errors', async () => {
      testApp.queryRaw.mockResolvedValue([target, second]);
      const csv = [
        header,
        'EMP-00001,52000.50,2026-12-01,Merit increase', // applied
        'EMP-00003,40000,2026-12-01,Merit', //          already that salary
        'EMP-99999,52000,2026-12-01,Merit', //          nobody has this ID
      ].join('\r\n');

      const response = await apply(csv, {
        role: 'HR_ADMIN',
        query: '?fileName=raises.csv',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        importId,
        applied: 1,
        unchanged: 1,
        skipped: 1,
      });
      // The user and the fingerprint come from the token and the file, never from the caller.
      expect(testApp.createImport).toHaveBeenCalledExactlyOnceWith({
        data: {
          fileName: 'raises.csv',
          fileSha256: createHash('sha256').update(csv).digest('hex'),
          uploadedById: userId,
          rowCount: 3,
          appliedCount: 1,
          unchangedCount: 1,
          skippedCount: 1,
        },
        select: { id: true },
      });
      expect(testApp.createManySalaryRecords).toHaveBeenCalledExactlyOnceWith({
        data: [
          {
            employeeId: target.employeeId,
            annualAmount: '52000.50',
            currencyCode: 'GBP',
            effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
            reason: 'MERIT',
            changedById: userId,
            importId,
          },
        ],
      });
    });

    it('saves nothing at all, not even an import, when there is nothing to add', async () => {
      testApp.queryRaw.mockResolvedValue([target]);

      const response = await apply(
        [header, 'EMP-00001,50000,2026-12-01,Merit'].join('\r\n'),
        { role: 'HR_ADMIN' },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        importId: null,
        applied: 0,
        unchanged: 1,
        skipped: 0,
      });
      expect(testApp.createImport).not.toHaveBeenCalled();
      expect(testApp.createManySalaryRecords).not.toHaveBeenCalled();
    });
  });
});
