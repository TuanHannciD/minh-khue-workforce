import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("date-only Gregorian months and weekdays are timezone safe", async () => {
  const { calendarMonth, isCalendarDate } =
    await import("../dist/modules/employees/index.js");
  for (const [month, length, last] of [
    ["2026-02", 28, "2026-02-28"],
    ["2024-02", 29, "2024-02-29"],
    ["2000-02", 29, "2000-02-29"],
    ["1900-02", 28, "1900-02-28"],
    ["2026-04", 30, "2026-04-30"],
    ["2026-10", 31, "2026-10-31"],
    ["0001-01", 31, "0001-01-31"],
    ["9999-12", 31, "9999-12-31"],
  ]) {
    assert.equal(calendarMonth(month).days.length, length);
    assert.equal(calendarMonth(month).end, last);
  }
  for (const bad of [
    "0000-01-01",
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-1-01",
    "2026-10-01T00:00:00Z",
    "10000-01-01",
  ])
    assert.equal(isCalendarDate(bad), false);
  for (const tz of ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles"]) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {calendarMonth} from './dist/modules/employees/index.js'; process.stdout.write(JSON.stringify(calendarMonth('2026-10')));`,
      ],
      {
        cwd: new URL("../", import.meta.url),
        env: { ...process.env, TZ: tz },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0);
    const month = JSON.parse(result.stdout);
    assert.equal(month.start, "2026-10-01");
    assert.equal(month.days[0].weekday, 4);
    assert.equal(month.days.at(-1).weekday, 6);
  }
});
