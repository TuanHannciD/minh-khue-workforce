import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { SessionGuard } from "../auth/index.js";
import type { SessionRequest } from "../auth/index.js";
import { EmployeesService } from "./employees.service.js";
import {
  CreateEmployeeDto,
  EmployeeDto,
  EmploymentApiErrorDto,
  UpdateEmploymentDto,
} from "./employees.dto.js";

@ApiTags("employees")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@ApiResponse({ status: 400, type: EmploymentApiErrorDto })
@ApiResponse({ status: 401, type: EmploymentApiErrorDto })
@ApiResponse({ status: 403, type: EmploymentApiErrorDto })
@ApiResponse({ status: 413, type: EmploymentApiErrorDto })
@ApiResponse({ status: 415, type: EmploymentApiErrorDto })
@ApiResponse({ status: 422, type: EmploymentApiErrorDto })
@ApiResponse({ status: 503, type: EmploymentApiErrorDto })
@Controller("api/v1/employees")
export class EmployeesController {
  constructor(
    @Inject(EmployeesService) private readonly service: EmployeesService,
  ) {}
  @Post()
  @ApiBody({ type: CreateEmployeeDto })
  @ApiCreatedResponse({ type: EmployeeDto })
  create(@Body() input: CreateEmployeeDto, @Req() request: SessionRequest) {
    return this.service.create(input, request.authenticatedSession.credential);
  }
  @Patch(":id")
  @ApiBody({ type: UpdateEmploymentDto })
  @ApiOkResponse({ type: EmployeeDto })
  @ApiResponse({ status: 404, type: EmploymentApiErrorDto })
  @ApiResponse({ status: 409, type: EmploymentApiErrorDto })
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateEmploymentDto,
    @Req() request: SessionRequest,
  ) {
    return this.service.updateEmployment(
      id,
      input,
      request.authenticatedSession.credential,
    );
  }
}
