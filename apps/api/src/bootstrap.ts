import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";

export async function createApp(
  webOrigin = "http://127.0.0.1:5173",
): Promise<NestExpressApplication> {
  const origin = new URL(webOrigin);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.origin !== webOrigin
  ) {
    throw new Error("WEB_ORIGIN must be an exact HTTP(S) origin");
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });
  app.enableCors({ origin: webOrigin, credentials: true });
  app.enableShutdownHooks();
  return app;
}
