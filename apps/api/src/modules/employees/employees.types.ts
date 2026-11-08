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
export interface MonthEmployeeQuery {
  start: string;
  end: string;
  q: string;
  page: number;
  pageSize: 25 | 50;
}
export interface MonthEmployeePage {
  employees: LockedEmployee[];
  monthEmployeeCount: number;
  totalResults: number;
  page: number;
  totalPages: number;
  from: number;
  to: number;
}
