import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { AuthConfig } from "../../infrastructure/config/auth-config.js";
import { AuthModule } from "../auth/index.js";
import { EmployeesController } from "./employees.controller.js";
import { EmployeesService } from "./employees.service.js";
import { EmployeesRepository } from "./employees.repository.js";
import { EmploymentConsistency } from "./employment-consistency.js";

@Module({})
export class EmployeesModule {
  static register(
    config: AuthConfig,
    authModule = AuthModule.register(config),
  ): DynamicModule {
    return {
      module: EmployeesModule,
      imports: [authModule],
      controllers: [EmployeesController],
      providers: [EmployeesService, EmployeesRepository, EmploymentConsistency],
      exports: [EmployeesService, EmploymentConsistency],
    };
  }
}
