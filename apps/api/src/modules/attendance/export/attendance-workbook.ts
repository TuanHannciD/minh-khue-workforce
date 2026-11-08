import ExcelJS from "exceljs";
import { calendarMonth } from "../../employees/index.js";
import type { MonthDto } from "../attendance.dto.js";
import { cellId } from "../attendance.types.js";

// Build only after readMonth's read transaction has closed. Browser drafts and
// optimistic totals never enter this pure snapshot-to-workbook boundary.
export async function buildAttendanceWorkbook(
  month: MonthDto,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Minh Khuê";
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet("Chấm công", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 6 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const { days } = calendarMonth(month.month);
  const lastDay = days.length + 2;
  const totalColumn = lastDay + 1;
  sheet.getColumn(1).width = 7;
  sheet.getColumn(2).width = 36;
  for (let col = 3; col <= lastDay; col++) sheet.getColumn(col).width = 6;
  sheet.getColumn(totalColumn).width = 12;
  sheet.mergeCells(1, 1, 1, totalColumn);
  sheet.getCell("A1").value = `Bảng chấm công tháng ${month.month}`;
  sheet.getCell("A1").font = {
    name: "Arial",
    size: 16,
    bold: true,
    color: { argb: "FF153E30" },
  };
  sheet.mergeCells(2, 1, 2, totalColumn);
  sheet.getCell("A2").value = `Dữ liệu đã lưu lúc ${month.fetchedAt}`;
  const cells = new Map(month.cells.map((cell) => [cellId(cell), cell]));
  let title = 4;
  for (const kind of ["work", "overtime"] as const) {
    const first = title + 3;
    const last = first + month.employees.length - 1;
    const totalRow = last + 1;
    const totals = month.totals[kind];
    const byEmployee = new Map(
      totals.byEmployee.map((item) => [item.employeeId, item.value]),
    );
    const byDate = new Map(
      totals.byDate.map((item) => [item.date, item.value]),
    );
    sheet.mergeCells(title, 1, title, totalColumn);
    sheet.getCell(title, 1).value =
      kind === "work" ? "Công · Đơn vị: công" : "Tăng ca · Đơn vị: giờ";
    sheet.getCell(title, 1).font = {
      name: "Arial",
      size: 12,
      bold: true,
      color: { argb: "FF153E30" },
    };
    sheet.getCell(title + 1, 1).value = "STT";
    sheet.getCell(title + 1, 2).value = "Nhân sự";
    sheet.getCell(title + 1, totalColumn).value =
      kind === "work" ? "Tổng công" : "Tổng giờ";
    for (const [i, day] of days.entries()) {
      sheet.getCell(title + 1, i + 3).value = day.date.slice(-2);
      sheet.getCell(title + 2, i + 3).value = [
        "CN",
        "T2",
        "T3",
        "T4",
        "T5",
        "T6",
        "T7",
      ][day.weekday]!;
    }
    for (const [index, employee] of month.employees.entries()) {
      const row = first + index;
      sheet.getCell(row, 1).value = index + 1;
      // ExcelJS strings are shared-string text, never formula objects, even
      // when a name starts with '=' or '+'. Do not prepend visible apostrophes.
      sheet.getCell(row, 2).value = employee.name;
      sheet.getCell(row, 2).alignment = { vertical: "middle", wrapText: true };
      sheet.getRow(row).height = Math.max(
        24,
        Math.ceil(employee.name.length / 30) * 16,
      );
      for (const [i, day] of days.entries()) {
        const source = cells.get(
          cellId({ employeeId: employee.id, date: day.date, kind }),
        );
        if (!source) throw new Error("Incomplete attendance snapshot");
        const cell = sheet.getCell(row, i + 3);
        cell.value =
          source.state === "before-start"
            ? "N"
            : source.state === "after-end"
              ? "—"
              : source.value?.type === "number"
                ? source.value.value
                : source.value?.type === "absence"
                  ? "F"
                  : null;
        if (source.reminder)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFEDF4D6" },
          };
      }
      sheet.getCell(row, totalColumn).value = {
        formula: `SUM(C${row}:${sheet.getColumn(lastDay).letter}${row})`,
        result: byEmployee.get(employee.id)!,
      };
    }
    sheet.getCell(totalRow, 2).value =
      kind === "work" ? "Tổng công" : "Tổng giờ";
    for (let col = 3; col <= totalColumn; col++) {
      const letter = sheet.getColumn(col).letter;
      sheet.getCell(totalRow, col).value = {
        formula: month.employees.length
          ? `SUM(${letter}${first}:${letter}${last})`
          : "SUM(0)",
        result:
          col === totalColumn
            ? totals.grandTotal
            : byDate.get(days[col - 3]!.date)!,
      };
    }
    for (let row = title + 1; row <= totalRow; row++) {
      for (let col = 1; col <= totalColumn; col++) {
        const cell = sheet.getCell(row, col);
        cell.font = {
          name: "Arial",
          size: 10,
          bold: row < first || row === totalRow || col === totalColumn,
        };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFD9DDE4" } },
        };
        if (col !== 2)
          cell.alignment = { horizontal: "center", vertical: "middle" };
        if (row < first || row === totalRow)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFEAF3EE" },
          };
        if (col >= 3) cell.numFmt = "0.#";
      }
    }
    title = totalRow + 3;
  }
  sheet.getCell(title, 2).value =
    "F: nghỉ cả ngày · N: chưa bắt đầu · —: đã kết thúc · Màu xanh: nhắc kiểm tra, vẫn tính tổng.";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
