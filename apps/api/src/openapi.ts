import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";
import { createApp } from "./bootstrap.js";

export async function createDocument(): Promise<OpenAPIObject> {
  const app = await createApp();
  try {
    await app.init();
    const config = new DocumentBuilder()
      .setTitle("Minh Khuê bootstrap API")
      .setVersion("0.0.0")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    document.openapi = "3.0.3";
    return document;
  } finally {
    await app.close();
  }
}
