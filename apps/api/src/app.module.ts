import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { AuthModule } from "./modules/auth/index.js";
import type { AuthConfig } from "./infrastructure/config/auth-config.js";
import { HealthController } from "./health.controller.js";
import { EmployeesModule } from "./modules/employees/index.js";
import { AttendanceModule } from "./modules/attendance/index.js";

@Module({})
export class AppModule {
  static register(config: AuthConfig): DynamicModule {
    // Reuse the same dynamic-module references across consumers. Registering
    // each dependency again creates duplicate controllers and separate DB pools.
    const auth = AuthModule.register(config);
    const employees = EmployeesModule.register(config, auth);
    return {
      module: AppModule,
      controllers: [HealthController],
      imports: [auth, employees, AttendanceModule.register(auth, employees)],
    };
  }
}
