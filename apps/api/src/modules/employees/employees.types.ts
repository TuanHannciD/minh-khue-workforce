export interface LockedEmployee {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  revision: string;
}
export interface EmploymentCellKey {
  employeeId: string;
  date: string;
  kind: "work" | "overtime";
}
