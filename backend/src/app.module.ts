import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.validation.js';
import { EmployeesModule } from './employees/employees.module.js';
import { HealthModule } from './health/health.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SalaryUpdatesModule } from './salary-updates/salary-updates.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    EmployeesModule,
    SalaryUpdatesModule,
    InsightsModule,
    HealthModule,
  ],
})
export class AppModule {}
