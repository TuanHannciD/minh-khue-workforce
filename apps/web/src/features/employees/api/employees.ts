import { apiRequest } from "@/shared/api/transport";
import { sessionBoundary } from "@/shared/api/session-boundary";
import type { components } from "@/shared/api/generated/schema";

export type Employee = components["schemas"]["EmployeeDto"];
export type CreateEmployee = components["schemas"]["CreateEmployeeDto"];
export type UpdateEmployment = components["schemas"]["UpdateEmploymentDto"];
export type EmploymentDetails =
  components["schemas"]["EmploymentErrorDetailsDto"];
export type EmployeeIntent =
  | { id?: undefined; input: CreateEmployee; expectedEpoch?: number }
  | { id: string; input: UpdateEmployment; expectedEpoch?: number };
export function saveEmployee(intent: EmployeeIntent): Promise<Employee> {
  const expectedEpoch = intent.expectedEpoch ?? sessionBoundary.current();
  return apiRequest<Employee>(
    intent.id ? `/employees/${intent.id}` : "/employees",
    { method: intent.id ? "PATCH" : "POST", body: intent.input, expectedEpoch },
  );
}
