import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller.js';
import { EmployeesRepository } from './employees.repository.js';
import { EmployeesService } from './employees.service.js';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesRepository],
  // The salary updates read the directory's own queries, so there is one definition of each.
  exports: [EmployeesRepository],
})
export class EmployeesModule {}
