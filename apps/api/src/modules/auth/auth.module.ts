import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { AUTH_CONFIG } from "../../infrastructure/config/auth-config.js";
import type { AuthConfig } from "../../infrastructure/config/auth-config.js";
import { Database } from "../../infrastructure/db/database.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionGuard } from "./session.guard.js";
import { SessionAuthorizer } from "./session-authorizer.js";

@Module({})
export class AuthModule {
  static register(config: AuthConfig): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        { provide: AUTH_CONFIG, useValue: config },
        {
          provide: Database,
          useFactory: () =>
            new Database(
              config.databaseUrl ??
                "postgresql://unconfigured@127.0.0.1:1/unconfigured",
            ),
        },
        AuthService,
        SessionGuard,
        SessionAuthorizer,
      ],
      exports: [AuthService, SessionGuard, SessionAuthorizer, Database],
    };
  }
}
