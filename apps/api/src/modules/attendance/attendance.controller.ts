import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { SessionGuard } from "../auth/index.js";
import type { SessionRequest } from "../auth/index.js";
import { AttendanceService } from "./attendance.service.js";
import {
  AbsenceValueDto,
  AttendanceApiErrorDto,
  MonthDto,
  NumberValueDto,
  PatchCellOperationDto,
  PatchCellWriteDto,
  ReconcileRequestDto,
  ReconcileSnapshotDto,
  SetReminderOperationDto,
  SetReminderWriteDto,
  SetValueOperationDto,
  SetValueWriteDto,
  WriteResultDto,
} from "./attendance.dto.js";

@ApiTags("attendance")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@ApiExtraModels(
  NumberValueDto,
  AbsenceValueDto,
  SetValueWriteDto,
  SetReminderWriteDto,
  PatchCellWriteDto,
  SetValueOperationDto,
  SetReminderOperationDto,
  PatchCellOperationDto,
)
@ApiResponse({ status: 400, type: AttendanceApiErrorDto })
@ApiResponse({ status: 401, type: AttendanceApiErrorDto })
@ApiResponse({ status: 403, type: AttendanceApiErrorDto })
@ApiResponse({ status: 413, type: AttendanceApiErrorDto })
@ApiResponse({ status: 415, type: AttendanceApiErrorDto })
@ApiResponse({ status: 503, type: AttendanceApiErrorDto })
@Controller("api/v1/attendance")
export class AttendanceController {
  constructor(
    @Inject(AttendanceService) private readonly service: AttendanceService,
  ) {}
  @Get("month")
  @ApiQuery({
    name: "month",
    required: true,
    schema: { type: "string", pattern: "^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$" },
  })
  @ApiOkResponse({ type: MonthDto })
  month(@Query() query: unknown) {
    return this.service.readMonth(parseMonthQuery(query));
  }
  @Post("reconcile")
  @HttpCode(200)
  @ApiBody({ type: ReconcileRequestDto })
  @ApiOkResponse({ type: ReconcileSnapshotDto })
  reconcile(@Body() input: unknown) {
    return this.service.reconcile(parseReconcile(input));
  }
  @Post("changes")
  @HttpCode(200)
  @ApiBody({ schema: { $ref: "#/components/schemas/WriteAttendanceDto" } })
  @ApiOkResponse({ type: WriteResultDto })
  @ApiResponse({ status: 409, type: AttendanceApiErrorDto })
  @ApiResponse({ status: 422, type: AttendanceApiErrorDto })
  changes(@Body() input: unknown, @Req() request: SessionRequest) {
    return this.service.write(
      parseWrite(input),
      request.authenticatedSession.credential,
    );
  }
}

import {
  parseMonthQuery,
  parseReconcile,
  parseWrite,
} from "./attendance-validation.js";
