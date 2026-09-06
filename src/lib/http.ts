import { AdsApiError } from "./ads-errors";

export function jsonError(error: unknown, fallbackStatus = 500) {
  if (error instanceof AdsApiError) {
    return Response.json(
      { ok: false, error: error.info.message, ...error.info },
      { status: error.status || fallbackStatus },
    );
  }

  const err = error as { status?: number; message?: string; info?: Record<string, unknown> };
  const status = typeof err.status === "number" ? err.status : fallbackStatus;
  return Response.json(
    {
      ok: false,
      error: err.message || "Unexpected error",
      kind: err.info?.kind ?? "unknown",
      hint: err.info?.hint,
    },
    { status },
  );
}

export function toJsonText(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => (typeof inner === "bigint" ? inner.toString() : inner));
}
