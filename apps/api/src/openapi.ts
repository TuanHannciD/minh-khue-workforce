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
      .addCookieAuth("mkw_session")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    for (const schema of Object.values(document.components?.schemas ?? {})) {
      if (!("$ref" in schema) && schema.type === "object")
        schema.additionalProperties = false;
    }
    document.openapi = "3.0.3";
    const patch = document.components?.schemas?.UpdateEmploymentDto;
    if (patch && !("$ref" in patch)) patch.minProperties = 2;
    return document;
  } finally {
    await app.close();
  }
}
