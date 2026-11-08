import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString, ValidateIf } from "class-validator";

export class CreateEmployeeDto {
  @ApiProperty({ description: "Trimmed, 1–200 Unicode code points" })
  @IsString()
  name!: string;
  @ApiProperty({ format: "date" })
  @IsString()
  startDate!: string;
  @ApiPropertyOptional({
    type: String,
    format: "date",
    nullable: true,
    description: "Omission defaults to null; null means no end date",
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  endDate?: string | null;
}
export class UpdateEmploymentDto {
  @ApiProperty({ description: "Opaque baseline revision" })
  @IsString()
  @IsNotEmpty()
  expectedRevision!: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  name?: string;
  @ApiPropertyOptional({ format: "date" })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  startDate?: string;
  @ApiPropertyOptional({ type: String, format: "date", nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  endDate?: string | null;
}
export class EmployeeDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: "date" }) startDate!: string;
  @ApiProperty({ type: String, format: "date", nullable: true }) endDate!:
    string | null;
  @ApiProperty() revision!: string;
}
export class EmploymentCellKeyDto {
  @ApiProperty({ format: "uuid" }) employeeId!: string;
  @ApiProperty({ format: "date" }) date!: string;
  @ApiProperty({ enum: ["work", "overtime"] }) kind!: "work" | "overtime";
}
export class EmploymentFieldErrorDto {
  @ApiProperty() path!: string;
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
}
export class EmploymentErrorDetailsDto {
  @ApiPropertyOptional({ type: [EmploymentCellKeyDto] })
  cells?: EmploymentCellKeyDto[];
  @ApiPropertyOptional({ type: EmployeeDto }) current?: EmployeeDto;
  @ApiPropertyOptional({ type: [EmploymentFieldErrorDto] })
  fields?: EmploymentFieldErrorDto[];
}
export class EmploymentErrorDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ type: EmploymentErrorDetailsDto })
  details?: EmploymentErrorDetailsDto;
}
export class EmploymentApiErrorDto {
  @ApiProperty({ type: EmploymentErrorDto }) error!: EmploymentErrorDto;
  @ApiProperty({ format: "uuid" }) requestId!: string;
}
