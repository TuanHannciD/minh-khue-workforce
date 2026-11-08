import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length, MaxLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  username!: string;

  @ApiProperty({
    maxLength: 1024,
    format: "password",
    writeOnly: true,
    description: "Maximum 1024 UTF-8 bytes; never trimmed",
  })
  @IsString()
  @MaxLength(1024)
  password!: string;
}

export class LogoutDto {}

export class SessionIdentityDto {
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty() username!: string;
}

export class SessionDto {
  @ApiProperty({ type: SessionIdentityDto }) user!: SessionIdentityDto;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
  @ApiProperty({ format: "date-time" }) idleExpiresAt!: string;
}

export class ErrorDetailDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
}
export class ApiErrorDto {
  @ApiProperty({ type: ErrorDetailDto }) error!: ErrorDetailDto;
  @ApiProperty({ format: "uuid" }) requestId!: string;
}
