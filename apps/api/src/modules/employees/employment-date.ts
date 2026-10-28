// Date-only values never pass through local timezone getters or Date.parse.
const leap = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
function dayCount(year: number, month: number) {
  return (
    [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
      month - 1
    ] ?? 0
  );
}
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  return year >= 1 && year <= 9999 && day >= 1 && day <= dayCount(year, month);
}
export function calendarMonth(month: string) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000"))
    throw new Error("Invalid calendar month");
  const [year = 0, number = 0] = month.split("-").map(Number);
  const days = Array.from({ length: dayCount(year, number) }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const utc = new Date(0);
    utc.setUTCFullYear(year, number - 1, index + 1);
    return { date, weekday: utc.getUTCDay() };
  });
  return { start: `${month}-01`, end: days.at(-1)!.date, days };
}
export function employmentState(
  employee: { startDate: string; endDate: string | null },
  date: string,
) {
  if (date < employee.startDate) return "before-start";
  if (employee.endDate !== null && date > employee.endDate) return "after-end";
  return "editable";
}
