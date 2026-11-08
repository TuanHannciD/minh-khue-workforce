import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ValidationPipe } from "@nestjs/common";
import {
  CreateEmployeeDto,
  UpdateEmploymentDto,
} from "../dist/modules/employees/employees.dto.js";
import { EmployeesService } from "../dist/modules/employees/employees.service.js";

test("employee validation and service preserve create defaults and PATCH missing/null semantics", async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: false,
    transform: false,
  });
  const validate = (body, metatype) =>
    pipe.transform(body, { type: "body", metatype });
  // Persistence/auth ports are in-memory fixtures; DTO validation, normalization
  // and patch merging use the compiled production service. No HTTP/PG claim.
  let stored;
  const persist = async (_tx, employee) => {
    stored = { ...employee };
    return { ...stored };
  };
  const service = new EmployeesService(
    { transaction: async (work) => work({}) },
    { authorizeMutation: async () => {} },
    { create: persist, update: persist },
    {
      lockEmployees: async () => [{ ...stored }],
      findExcludedCells: async () => [],
    },
  );
  for (const body of [
    { name: " Thử ", startDate: "2026-10-15" },
    { name: " Thử ", startDate: "2026-10-15", endDate: null },
  ]) {
    const created = await service.create(
      await validate(body, CreateEmployeeDto),
      {},
    );
    assert.equal(created.endDate, null);
    assert.equal(created.name, "Thử");
    assert.equal(stored.endDate, null);
  }
  const bounded = await service.create(
    await validate(
      { name: "Giữ ngày", startDate: "2026-10-15", endDate: "2026-10-20" },
      CreateEmployeeDto,
    ),
    {},
  );
  const renamed = await service.updateEmployment(
    bounded.id,
    await validate(
      { expectedRevision: bounded.revision, name: "Đổi tên" },
      UpdateEmploymentDto,
    ),
    {},
  );
  assert.equal(renamed.startDate, "2026-10-15");
  assert.equal(renamed.endDate, "2026-10-20");
  assert.notEqual(renamed.revision, bounded.revision);
  const cleared = await service.updateEmployment(
    renamed.id,
    await validate(
      { expectedRevision: renamed.revision, endDate: null },
      UpdateEmploymentDto,
    ),
    {},
  );
  assert.equal(cleared.endDate, null);
  assert.equal(cleared.name, "Đổi tên");
  assert.equal(cleared.startDate, "2026-10-15");
  assert.notEqual(cleared.revision, renamed.revision);
  await assert.rejects(
    service.updateEmployment(
      cleared.id,
      { expectedRevision: cleared.revision },
      {},
    ),
    (error) => error.getResponse().error.code === "EMPTY_PATCH",
  );
  for (const metatype of [CreateEmployeeDto, UpdateEmploymentDto])
    for (const field of ["name", "startDate"])
      await assert.rejects(
        validate(
          {
            ...(metatype === CreateEmployeeDto
              ? { name: "Thử", startDate: "2026-10-15" }
              : { expectedRevision: cleared.revision }),
            [field]: null,
          },
          metatype,
        ),
        (error) => error.getStatus() === 400,
      );
  assert.equal(stored.revision, cleared.revision);
});
