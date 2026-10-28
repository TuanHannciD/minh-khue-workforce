import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { validateAuthConfig } from "./infrastructure/config/auth-config.js";
import type { AuthConfig } from "./infrastructure/config/auth-config.js";
import {
  parserError,
  requestPolicy,
  SafeHttpErrors,
} from "./infrastructure/config/http-policy.js";

export async function createApp(
  webOrigin = "http://127.0.0.1:5173",
  options: Omit<AuthConfig, "webOrigin"> = {},
): Promise<NestExpressApplication> {
  const config = validateAuthConfig({ ...options, webOrigin });
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config),
    {
      logger: false,
      bodyParser: false,
    },
  );
  app.use(
    helmet({
      strictTransportSecurity: config.production ? { maxAge: 31536000 } : false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use(requestPolicy(webOrigin));
  app.use(json({ limit: "16mb", strict: true }));
  app.use(parserError);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
      transform: false,
    }),
  );
  app.useGlobalFilters(new SafeHttpErrors());
  app.enableCors({ origin: webOrigin, credentials: true });
  app.enableShutdownHooks();
  return app;
}
