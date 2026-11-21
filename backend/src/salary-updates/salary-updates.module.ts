import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module.js';
import { SalaryUpdatesController } from './salary-updates.controller.js';
import { SalaryUpdatesRepository } from './salary-updates.repository.js';
import { SalaryUpdatesService } from './salary-updates.service.js';

@Module({
  imports: [EmployeesModule],
  controllers: [SalaryUpdatesController],
  providers: [SalaryUpdatesService, SalaryUpdatesRepository],
})
export class SalaryUpdatesModule {}
