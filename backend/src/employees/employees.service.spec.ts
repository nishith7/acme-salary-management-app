import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { EmployeesRepository } from './employees.repository.js';
import { EmployeesService } from './employees.service.js';

/** Recording a salary change: what the service decides, with the repository faked. */
describe('EmployeesService.recordSalaryChange', () => {
  const employeeId = '5b1c6d0a-8f3e-4c52-9a1e-2d7f4b6a9c10';
  const userId = '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11';
  const request = {
    annualAmount: '52000.00',
    effectiveFrom: '2026-11-20',
    reason: 'MERIT' as const,
  };

  function setup(
    context: object | null = {
      status: 'ACTIVE',
      joiningDate: '2023-11-20',
      countryCurrencyCode: 'GBP',
      salaryRecordCount: 3,
    },
  ) {
    const repository = {
      findSalaryContext: vi.fn().mockResolvedValue(context),
      currencyInForceOn: vi.fn().mockResolvedValue('EUR'),
      addSalaryRecord: vi.fn().mockResolvedValue(undefined),
      // What get() reads afterwards: a row for the person and an empty history.
      findById: vi.fn().mockResolvedValue({
        id: employeeId,
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
        currencyCode: 'EUR',
        annualAmountUsd: '56000.00',
        bandPosition: 'WITHIN',
      }),
      salaryHistory: vi.fn().mockResolvedValue([]),
    };
    const service = new EmployeesService(
      repository as unknown as EmployeesRepository,
    );
    return { service, repository };
  }

  it('records the salary in the currency in force on that date, by the signed-in user, and returns the updated profile', async () => {
    const { service, repository } = setup();

    const profile = await service.recordSalaryChange(
      employeeId,
      request,
      userId,
    );

    expect(repository.currencyInForceOn).toHaveBeenCalledWith(
      employeeId,
      '2026-11-20',
    );
    expect(repository.addSalaryRecord).toHaveBeenCalledExactlyOnceWith({
      employeeId,
      annualAmount: '52000.00',
      currencyCode: 'EUR',
      effectiveFrom: '2026-11-20',
      reason: 'MERIT',
      changedById: userId,
    });
    expect(profile.id).toBe(employeeId);
    expect(profile.currentSalary).toMatchObject({ annualAmount: '52000.00' });
  });

  it('uses the currency of the employee’s country for a first salary, when no salary exists to take it from', async () => {
    const { service, repository } = setup({
      status: 'ACTIVE',
      joiningDate: '2023-11-20',
      countryCurrencyCode: 'GBP',
      salaryRecordCount: 0,
    });
    repository.currencyInForceOn.mockResolvedValue(null);

    await service.recordSalaryChange(
      employeeId,
      { ...request, reason: 'HIRE', effectiveFrom: '2023-11-20' },
      userId,
    );

    expect(repository.addSalaryRecord).toHaveBeenCalledWith(
      expect.objectContaining({ currencyCode: 'GBP', reason: 'HIRE' }),
    );
  });

  it('says there is no such employee, and writes nothing', async () => {
    const { service, repository } = setup(null);

    await expect(
      service.recordSalaryChange(employeeId, request, userId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.addSalaryRecord).not.toHaveBeenCalled();
  });

  it('refuses a change for someone who has left, and writes nothing', async () => {
    const { service, repository } = setup({
      status: 'TERMINATED',
      joiningDate: '2023-11-20',
      countryCurrencyCode: 'GBP',
      salaryRecordCount: 3,
    });

    await expect(
      service.recordSalaryChange(employeeId, request, userId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.addSalaryRecord).not.toHaveBeenCalled();
  });

  it('refuses a date before the joining date, and writes nothing', async () => {
    const { service, repository } = setup();

    await expect(
      service.recordSalaryChange(
        employeeId,
        { ...request, effectiveFrom: '2020-01-01' },
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.addSalaryRecord).not.toHaveBeenCalled();
  });
});
