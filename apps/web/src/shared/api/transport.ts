import type { paths } from "./generated/schema";

export function apiOrigin(
  value: string = import.meta.env.VITE_API_ORIGIN ?? "http://127.0.0.1:3001",
): string {
  const origin = new URL(value);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== value)
    throw new Error("Invalid API origin");
  return origin.origin;
}

type Health =
  paths["/health"]["get"]["responses"][200]["content"]["application/json"];

export async function readHealth(origin = apiOrigin()): Promise<Health> {
  const response = await fetch(`${apiOrigin(origin)}/health`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`API health HTTP ${response.status}`);
  return response.json() as Promise<Health>;
}
