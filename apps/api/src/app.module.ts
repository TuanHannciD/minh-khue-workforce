import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { AuthModule } from "./modules/auth/index.js";
import type { AuthConfig } from "./infrastructure/config/auth-config.js";
import { HealthController } from "./health.controller.js";

@Module({})
export class AppModule {
  static register(config: AuthConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      imports: [AuthModule.register(config)],
    };
  }
}
