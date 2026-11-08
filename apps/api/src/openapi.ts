import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";
import { createApp } from "./bootstrap.js";
import { writeAttendanceSchema } from "./modules/attendance/index.js";

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
    // Exact object shapes also cover ApiExtraModels without a route (page read).
    // Leave DTO integer bounds and pageSize enums intact for generated clients.
    for (const schema of Object.values(document.components?.schemas ?? {})) {
      if (!("$ref" in schema) && schema.type === "object")
        schema.additionalProperties = false;
    }
    document.openapi = "3.0.3";
    const patch = document.components?.schemas?.UpdateEmploymentDto;
    if (patch && !("$ref" in patch)) patch.minProperties = 2;
    const schemas = document.components!.schemas!;
    schemas.WriteAttendanceDto = writeAttendanceSchema;
    const cellPatch = schemas.CellPatchDto;
    if (cellPatch && !("$ref" in cellPatch)) cellPatch.minProperties = 1;
    const reconcile = schemas.ReconcileRequestDto;
    if (reconcile && !("$ref" in reconcile))
      // Intersect the cardinality alternatives with the required typed DTO.
      // A sibling anyOf becomes a union with partial unknown objects in TS.
      reconcile.allOf = [
        {
          anyOf: [
            { properties: { employeeIds: { minItems: 1 } } },
            { properties: { cells: { minItems: 1 } } },
          ],
        },
      ];
    return document;
  } finally {
    await app.close();
  }
}
