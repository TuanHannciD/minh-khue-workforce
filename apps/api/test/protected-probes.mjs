import "reflect-metadata";
import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Module,
  HttpCode,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import {
  AuthModule,
  AuthService,
  SessionAuthorizer,
  SessionGuard,
} from "../dist/modules/auth/index.js";
import { Database } from "../dist/infrastructure/db/database.js";
import {
  SafeHttpErrors,
  requestPolicy,
} from "../dist/infrastructure/config/http-policy.js";

// Decorators applied explicitly in JS: only these test-owned routes expose guard seams.
export async function installProtectedProbes(config, origin) {
  class ProtectedProbes {
    async month(request) {
      return this.auth
        .requireSession(request)
        .then((session) => session.identity);
    }
    async export(request) {
      return this.month(request);
    }
    async write(request) {
      const session = await this.auth.requireSession(request);
      return this.db.client.$transaction((tx) =>
        this.authorizer.authorizeMutation(tx, session.credential),
      );
    }
  }
  Controller("test-owned")(ProtectedProbes);
  UseGuards(SessionGuard)(ProtectedProbes);
  for (const [name, decorator] of [
    ["month", Get],
    ["export", Get],
    ["write", Post],
  ]) {
    decorator(name)(
      ProtectedProbes.prototype,
      name,
      Object.getOwnPropertyDescriptor(ProtectedProbes.prototype, name),
    );
    Req()(ProtectedProbes.prototype, name, 0);
  }
  HttpCode(200)(
    ProtectedProbes.prototype,
    "write",
    Object.getOwnPropertyDescriptor(ProtectedProbes.prototype, "write"),
  );
  class ProbeModule {}
  Module({
    imports: [AuthModule.register({ ...config, webOrigin: origin })],
    controllers: [ProtectedProbes],
  })(ProbeModule);
  const app = await NestFactory.create(ProbeModule, { logger: false });
  const probes = app.get(ProtectedProbes);
  probes.auth = app.get(AuthService);
  probes.db = app.get(Database);
  probes.authorizer = app.get(SessionAuthorizer);
  app.use(requestPolicy(origin));
  app.use(cookieParser());
  app.useGlobalFilters(new SafeHttpErrors());
  await app.listen(0, "127.0.0.1");
  return { app, url: await app.getUrl(), close: () => app.close() };
}
