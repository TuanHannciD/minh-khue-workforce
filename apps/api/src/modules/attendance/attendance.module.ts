import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { AttendanceRepository } from "./attendance.repository.js";

@Module({})
export class AttendanceModule {
  static register(
    authModule: DynamicModule,
    employeesModule: DynamicModule,
  ): DynamicModule {
    return {
      module: AttendanceModule,
      imports: [authModule, employeesModule],
      controllers: [AttendanceController],
      providers: [AttendanceService, AttendanceRepository],
      exports: [AttendanceService],
    };
  }
}
