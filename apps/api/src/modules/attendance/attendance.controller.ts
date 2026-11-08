import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  StreamableFile,
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
import { AttendanceExportService } from "./export/attendance-export.service.js";
import {
  AbsenceValueDto,
  AttendanceApiErrorDto,
  AttendancePageDto,
  AttendancePageQueryDto,
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
  AttendancePageQueryDto,
  AttendancePageDto,
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
    @Inject(AttendanceExportService)
    private readonly exporter: AttendanceExportService,
  ) {}
  @Get("export")
  @ApiQuery({
    name: "month",
    required: true,
    schema: { type: "string", pattern: "^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$" },
  })
  @ApiOkResponse({
    content: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        schema: { type: "string", format: "binary" },
      },
    },
    headers: { "Content-Disposition": { schema: { type: "string" } } },
  })
  @ApiResponse({ status: 500, type: AttendanceApiErrorDto })
  async export(@Query() query: unknown) {
    const month = parseMonthQuery(query);
    const bytes = await this.exporter.download(month);
    return new StreamableFile(bytes, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="minh-khue-${month}.xlsx"`,
      length: bytes.length,
    });
  }
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
  @Post("search")
  @HttpCode(200)
  @ApiBody({ type: AttendancePageQueryDto })
  @ApiOkResponse({ type: AttendancePageDto })
  search(@Body() input: unknown) {
    return this.service.readPage(parseAttendancePageQuery(input));
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
  parseAttendancePageQuery,
  parseMonthQuery,
  parseReconcile,
  parseWrite,
} from "./attendance-validation.js";
