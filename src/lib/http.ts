import { AdsApiError } from "./ads-errors";
import { TokenDecryptError, isOpaqueCryptoDecryptError } from "./crypto";

function tokenDecryptJson(error: TokenDecryptError) {
  return Response.json(
    {
      ok: false,
      error: error.message,
      kind: error.info.kind,
      hint: error.info.hint,
      recovery: error.info.recovery,
    },
    { status: error.status },
  );
}

export function jsonError(error: unknown, fallbackStatus = 500) {
  if (error instanceof TokenDecryptError) {
    return tokenDecryptJson(error);
  }
  if (isOpaqueCryptoDecryptError(error)) {
    return tokenDecryptJson(new TokenDecryptError());
  }

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
