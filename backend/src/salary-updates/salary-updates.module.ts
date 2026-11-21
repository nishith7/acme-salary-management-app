import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module.js';
import { SalaryUpdatesController } from './salary-updates.controller.js';
import { SalaryUpdatesService } from './salary-updates.service.js';

@Module({
  imports: [EmployeesModule],
  controllers: [SalaryUpdatesController],
  providers: [SalaryUpdatesService],
})
export class SalaryUpdatesModule {}
