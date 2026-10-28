import type { paths } from "./generated/schema";
import { sessionBoundary } from "./session-boundary";
import type { SessionBoundary } from "./session-boundary";

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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    signal?: AbortSignal;
    expectedEpoch?: number;
    boundary?: SessionBoundary;
  } = {},
): Promise<T> {
  const boundary = options.boundary ?? sessionBoundary;
  const epoch = boundary.current();
  const method = options.method ?? "GET";
  const auth = path.startsWith("/auth/");
  if (!auth && !boundary.isActive())
    throw new ApiError(401, "SESSION_REQUIRED", "Vui lòng đăng nhập lại.");
  if (!auth && method !== "GET" && !boundary.canWrite(options.expectedEpoch))
    throw new ApiError(
      401,
      "SESSION_CHANGED",
      "Phiên đã thay đổi. Vui lòng kiểm tra lại trước khi lưu.",
    );
  const controller = new AbortController();
  const untrack = auth ? () => {} : boundary.track(controller);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  try {
    const response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      signal,
      ...(method === "GET"
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(options.body ?? {}),
          }),
    });
    const assertCurrentSession = () => {
      if (!auth && epoch !== boundary.current())
        throw new ApiError(401, "SESSION_CHANGED", "Phiên đã thay đổi.");
    };
    assertCurrentSession();
    if (!response.ok) {
      if (response.status === 401 && !auth) boundary.fail();
      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      throw new ApiError(
        response.status,
        payload?.error?.code ?? "REQUEST_FAILED",
        payload?.error?.message ?? "Chưa thể xử lý. Vui lòng thử lại.",
      );
    }
    const payload =
      response.status === 204
        ? (undefined as T)
        : ((await response.json()) as T);
    assertCurrentSession();
    return payload;
  } finally {
    untrack();
  }
}
