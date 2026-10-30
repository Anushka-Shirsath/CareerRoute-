export class ApiError extends Error {
  constructor(
    message: string,
    public code = "CONFLICT",
    public fields: { path: string; message: string }[] = [],
    public status = 500,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/v1" + path, {
      method: options.method || "GET",
      credentials: "include",
      headers:
        options.body === undefined
          ? {}
          : { "Content-Type": "application/json" },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      "The connection was interrupted. Please try again.",
      "CONNECTION_FAILED",
    );
  }
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      value?.error?.message || "The request could not be completed.",
      value?.error?.code,
      value?.error?.fields,
      response.status,
    );
  return value.data as T;
}
export const write = <T>(path: string, body?: unknown, method = "POST") =>
  api<T>(path, { method, body });
export const query = (
  path: string,
  values: Record<string, string | number | undefined | null>,
) =>
  path +
  "?" +
  new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
export const errorText = (error: unknown) =>
  error instanceof ApiError && error.fields.length
    ? error.fields.map((f) => f.message).join(" ")
    : error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
export const numberOrNull = (value: string) =>
  value.trim() === "" ? null : Number(value);
