import type { MonthDto } from "../model/types";

// Explicit synthetic UI fixture. No API, persistence, or real personnel.
const employees: MonthDto["employees"] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Nguyễn Văn An",
    startDate: "2024-02-01",
    endDate: null,
    revision: "fixture-employee-1",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "Nguyễn Văn An",
    startDate: "2024-02-02",
    endDate: "2024-02-28",
    revision: "fixture-employee-2",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    name: "Nhân sự giả có họ và tên rất dài để kiểm tra bảng tháng và nhận diện đúng người khi cuộn",
    startDate: "2024-01-01",
    endDate: null,
    revision: "fixture-employee-3",
  },
  ...Array.from({ length: 17 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(104 + i).padStart(12, "0")}`,
    name: `Nhân sự giả ${String(i + 4).padStart(2, "0")}`,
    startDate: "2024-02-01",
    endDate: null,
    revision: `fixture-employee-${i + 4}`,
  })),
];
const cells: MonthDto["cells"] = employees.flatMap((employee) =>
  Array.from({ length: 29 }, (_, index) => {
    const date = `2024-02-${String(index + 1).padStart(2, "0")}`;
    return (["work", "overtime"] as const).map((kind) => ({
      employeeId: employee.id,
      date,
      kind,
      state:
        date < employee.startDate
          ? ("before-start" as const)
          : employee.endDate && date > employee.endDate
            ? ("after-end" as const)
            : ("editable" as const),
      reminder:
        employee.id === employees[0]!.id &&
        date === "2024-02-02" &&
        kind === "work",
      revision: "fixture-cell",
      value:
        employee.id === employees[0]!.id &&
        date === "2024-02-01" &&
        kind === "work"
          ? { type: "absence" as const }
          : employee.id === employees[0]!.id && date === "2024-02-03"
            ? { type: "number" as const, value: kind === "work" ? 3.5 : 2 }
            : null,
    }));
  }).flat(),
);
export const attendanceFixture: MonthDto = {
  month: "2024-02",
  fetchedAt: "2024-02-29T00:00:00.000Z",
  employees,
  cells,
  totals: Object.fromEntries(
    (["work", "overtime"] as const).map((kind) => [
      kind,
      {
        byEmployee: employees.map((e, i) => ({
          employeeId: e.id,
          value: i === 0 ? (kind === "work" ? 3.5 : 2) : 0,
        })),
        byDate: Array.from({ length: 29 }, (_, i) => ({
          date: `2024-02-${String(i + 1).padStart(2, "0")}`,
          value: i === 2 ? (kind === "work" ? 3.5 : 2) : 0,
        })),
        grandTotal: kind === "work" ? 3.5 : 2,
      },
    ]),
  ) as MonthDto["totals"],
};
