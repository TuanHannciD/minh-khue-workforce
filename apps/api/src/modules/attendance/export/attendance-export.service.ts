import { Inject, Injectable } from "@nestjs/common";
import { AttendanceService } from "../attendance.service.js";
import { buildAttendanceWorkbook } from "./attendance-workbook.js";
import { attendanceError } from "../attendance-errors.js";

@Injectable()
export class AttendanceExportService {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
  ) {}

  async download(month: string): Promise<Buffer> {
    const snapshot = await this.attendance.readMonth(month);
    // readMonth commits before serialization; never hold a DB transaction while
    // compressing or streaming the workbook to a potentially slow client.
    try {
      return await buildAttendanceWorkbook(snapshot);
    } catch {
      return attendanceError(
        500,
        "EXPORT_FAILED",
        "Chưa thể xuất tệp Excel. Vui lòng thử lại.",
      );
    }
  }
}
