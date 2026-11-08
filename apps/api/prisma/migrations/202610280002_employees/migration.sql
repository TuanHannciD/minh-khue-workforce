CREATE TYPE "AttendanceKind" AS ENUM ('work', 'overtime');
CREATE TYPE "CellValueType" AS ENUM ('empty', 'number', 'absence');

CREATE TABLE "Employee" (
  "id" uuid PRIMARY KEY,
  "name" text NOT NULL,
  "startDate" date NOT NULL,
  "endDate" date,
  "revision" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Employee_name_check" CHECK (char_length("name") BETWEEN 1 AND 200 AND "name" = btrim("name")),
  CONSTRAINT "Employee_dates_check" CHECK (
    "startDate" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    AND ("endDate" IS NULL OR ("endDate" >= "startDate" AND "endDate" <= DATE '9999-12-31'))
  )
);

-- Minimal cell storage is needed now to reject date changes that hide data.
-- No attendance mutation endpoint is introduced by this migration.
CREATE TABLE "AttendanceCell" (
  "employeeId" uuid NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "date" date NOT NULL,
  "kind" "AttendanceKind" NOT NULL,
  "valueType" "CellValueType" NOT NULL,
  "halfUnits" smallint,
  "reminder" boolean NOT NULL DEFAULT false,
  "revision" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("employeeId", "date", "kind"),
  CONSTRAINT "AttendanceCell_date_check" CHECK ("date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  CONSTRAINT "AttendanceCell_value_check" CHECK (
    ("valueType" = 'empty' AND "halfUnits" IS NULL)
    OR ("valueType" = 'absence' AND "kind" = 'work' AND "halfUnits" IS NULL)
    OR ("valueType" = 'number' AND "halfUnits" IS NOT NULL AND "halfUnits" >= 1
      AND (("kind" = 'work' AND "halfUnits" <= 60) OR ("kind" = 'overtime' AND "halfUnits" <= 48)))
  )
);
CREATE INDEX "AttendanceCell_date_employeeId_idx" ON "AttendanceCell"("date", "employeeId");
