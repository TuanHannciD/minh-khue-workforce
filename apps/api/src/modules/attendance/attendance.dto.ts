import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import type { SchemaObject } from "@nestjs/swagger";
import { EmployeeDto } from "../employees/index.js";
import type { CellValue } from "./attendance.types.js";

export class NumberValueDto {
  @ApiProperty({ enum: ["number"] }) type!: "number";
  @ApiProperty({ type: Number, multipleOf: 0.5, minimum: 0, maximum: 30 })
  value!: number;
}
export class AbsenceValueDto {
  @ApiProperty({ enum: ["absence"] }) type!: "absence";
}
const valueSchema = {
  oneOf: [
    { $ref: getSchemaPath(NumberValueDto) },
    { $ref: getSchemaPath(AbsenceValueDto) },
    { type: "object" as const, nullable: true, enum: [null] },
  ],
};
export class CellKeyDto {
  @ApiProperty({ format: "uuid" }) employeeId!: string;
  @ApiProperty({ format: "date" }) date!: string;
  @ApiProperty({ enum: ["work", "overtime"] }) kind!: "work" | "overtime";
}
export class CellExpectationDto extends CellKeyDto {
  @ApiProperty({ minLength: 1 }) expectedRevision!: string;
}
export class CellSnapshotDto extends CellKeyDto {
  @ApiProperty(valueSchema) value!: CellValue;
  @ApiProperty() reminder!: boolean;
  @ApiProperty() revision!: string;
  @ApiProperty({ enum: ["editable", "before-start", "after-end"] }) state!:
    "editable" | "before-start" | "after-end";
}
export class EmployeeExpectationDto {
  @ApiProperty({ format: "uuid" }) employeeId!: string;
  @ApiProperty({ minLength: 1 }) expectedRevision!: string;
}
export class SetValueOperationDto {
  @ApiProperty({ enum: ["set-value"] }) type!: "set-value";
  @ApiProperty(valueSchema) value!: CellValue;
  @ApiProperty({ enum: ["fill-empty", "replace"] }) mode!:
    "fill-empty" | "replace";
}
export class SetReminderOperationDto {
  @ApiProperty({ enum: ["set-reminder"] }) type!: "set-reminder";
  @ApiProperty() reminder!: boolean;
}
export class CellPatchDto {
  @ApiPropertyOptional(valueSchema) value?: CellValue;
  @ApiPropertyOptional() reminder?: boolean;
}
export class PatchCellOperationDto {
  @ApiProperty({ enum: ["patch-cell"] }) type!: "patch-cell";
  @ApiProperty({ type: CellPatchDto }) patch!: CellPatchDto;
}
class WriteBaseDto {
  @ApiProperty({ pattern: "^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$" })
  month!: string;
  @ApiProperty({ type: [EmployeeExpectationDto], minItems: 1 })
  expectedEmployees!: EmployeeExpectationDto[];
  @ApiProperty({ type: [CellExpectationDto], minItems: 1 })
  targets!: CellExpectationDto[];
}
export class SetValueWriteDto extends WriteBaseDto {
  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(SetValueOperationDto) }],
    discriminator: {
      propertyName: "type",
      mapping: { "set-value": getSchemaPath(SetValueOperationDto) },
    },
  })
  operation!: SetValueOperationDto;
  @ApiPropertyOptional({ type: CellExpectationDto })
  source?: CellExpectationDto;
}
export class SetReminderWriteDto extends WriteBaseDto {
  @ApiProperty({ type: [CellExpectationDto], minItems: 1, maxItems: 1 })
  declare targets: CellExpectationDto[];
  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(SetReminderOperationDto) }],
    discriminator: {
      propertyName: "type",
      mapping: { "set-reminder": getSchemaPath(SetReminderOperationDto) },
    },
  })
  operation!: SetReminderOperationDto;
}
export class PatchCellWriteDto extends WriteBaseDto {
  @ApiProperty({ type: [CellExpectationDto], minItems: 1, maxItems: 1 })
  declare targets: CellExpectationDto[];
  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(PatchCellOperationDto) }],
    discriminator: {
      propertyName: "type",
      mapping: { "patch-cell": getSchemaPath(PatchCellOperationDto) },
    },
  })
  operation!: PatchCellOperationDto;
}
export type WriteAttendanceDto =
  SetValueWriteDto | SetReminderWriteDto | PatchCellWriteDto;
// OpenAPI3.0 cannot express a nested discriminator at the request root. Each
// request branch uses the operation discriminator and exact target cardinality.
// Context narrows numeric bounds/absence for the common target/source kind.
export const writeAttendanceSchema: SchemaObject = {
  oneOf: ["work", "overtime"].flatMap((kind) =>
    [SetValueWriteDto, SetReminderWriteDto, PatchCellWriteDto].map((c) => {
      const contextualValue: SchemaObject = {
        oneOf: [
          {
            type: "object",
            required: ["type", "value"],
            properties: {
              type: { type: "string", enum: ["number"] },
              value: {
                type: "number",
                minimum: kind === "work" ? 0 : 0.5,
                maximum: kind === "work" ? 30 : 24,
                multipleOf: 0.5,
              },
            },
          },
          ...(kind === "work"
            ? [{ $ref: getSchemaPath(AbsenceValueDto) }]
            : []),
          { type: "object", nullable: true, enum: [null] },
        ],
      };
      return {
        allOf: [
          { $ref: getSchemaPath(c) },
          {
            type: "object",
            properties: {
              targets: {
                type: "array",
                items: {
                  type: "object",
                  properties: { kind: { type: "string", enum: [kind] } },
                },
              },
              source: {
                type: "object",
                properties: { kind: { type: "string", enum: [kind] } },
              },
              operation: {
                type: "object",
                properties: {
                  value: contextualValue,
                  patch: {
                    type: "object",
                    properties: { value: contextualValue },
                  },
                },
              },
            },
          },
        ],
      };
    }),
  ),
};
export class ReconcileRequestDto {
  @ApiProperty({ type: [String], items: { type: "string", format: "uuid" } })
  employeeIds!: string[];
  @ApiProperty({ type: [CellKeyDto] }) cells!: CellKeyDto[];
}
export class ReconcileSnapshotDto {
  @ApiProperty({ format: "date-time" }) fetchedAt!: string;
  @ApiProperty({ type: [EmployeeDto] }) employees!: EmployeeDto[];
  @ApiProperty({ type: [CellSnapshotDto] }) cells!: CellSnapshotDto[];
  @ApiProperty({ type: [String], items: { type: "string", format: "uuid" } })
  missingEmployeeIds!: string[];
}
export class EmployeeTotalDto {
  @ApiProperty({ format: "uuid" }) employeeId!: string;
  @ApiProperty({ type: Number }) value!: number;
}
export class DateTotalDto {
  @ApiProperty({ format: "date" }) date!: string;
  @ApiProperty({ type: Number }) value!: number;
}
export class KindTotalsDto {
  @ApiProperty({ type: [EmployeeTotalDto] }) byEmployee!: EmployeeTotalDto[];
  @ApiProperty({ type: [DateTotalDto] }) byDate!: DateTotalDto[];
  @ApiProperty({ type: Number }) grandTotal!: number;
}
export class AttendanceTotalsDto {
  @ApiProperty({ type: KindTotalsDto }) work!: KindTotalsDto;
  @ApiProperty({ type: KindTotalsDto }) overtime!: KindTotalsDto;
}
export class MonthDto {
  @ApiProperty() month!: string;
  @ApiProperty({ format: "date-time" }) fetchedAt!: string;
  @ApiProperty({ type: [EmployeeDto] }) employees!: EmployeeDto[];
  @ApiProperty({ type: [CellSnapshotDto] }) cells!: CellSnapshotDto[];
  @ApiProperty({ type: AttendanceTotalsDto }) totals!: AttendanceTotalsDto;
}
export class TargetPreviewDto {
  @ApiProperty({ minimum: 0 }) selected!: number;
  @ApiProperty({ minimum: 0 }) eligible!: number;
  @ApiProperty({ minimum: 0 }) skipped!: number;
  @ApiProperty({ minimum: 0 }) changed!: number;
}
export class WriteResultDto {
  @ApiProperty({ enum: ["saved"] }) state!: "saved";
  @ApiProperty({ type: [CellSnapshotDto] }) cells!: CellSnapshotDto[];
  @ApiProperty({ type: [EmployeeDto] }) employees!: EmployeeDto[];
  @ApiProperty({ type: TargetPreviewDto }) counts!: TargetPreviewDto;
  @ApiProperty({ format: "date-time" }) savedAt!: string;
}
export class AttendanceFieldErrorDto {
  @ApiProperty() path!: string;
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
}
export class AttendanceErrorDetailsDto {
  @ApiPropertyOptional({ type: [CellSnapshotDto] }) cells?: CellSnapshotDto[];
  @ApiPropertyOptional({ type: [EmployeeDto] }) employees?: EmployeeDto[];
  @ApiPropertyOptional() sourceChanged?: boolean;
  @ApiPropertyOptional({ type: [AttendanceFieldErrorDto] })
  fields?: AttendanceFieldErrorDto[];
}
export class AttendanceErrorDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ type: AttendanceErrorDetailsDto })
  details?: AttendanceErrorDetailsDto;
}
export class AttendanceApiErrorDto {
  @ApiProperty({ type: AttendanceErrorDto }) error!: AttendanceErrorDto;
  @ApiProperty() requestId!: string;
}
