import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiProperty } from "@nestjs/swagger";

export class HealthDto {
  @ApiProperty({ enum: ["ok"] })
  readonly status = "ok" as const;
}

@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthDto })
  read(): HealthDto {
    return new HealthDto();
  }
}
