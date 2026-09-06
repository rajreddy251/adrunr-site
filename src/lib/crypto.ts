import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getEnv } from "./env";

const ALGO = "aes-256-gcm";
const MOCK_KEY_MATERIAL = "adrunr-mock-only-token-encryption-key";

export const TOKEN_DECRYPT_MESSAGE = "Unable to decrypt stored Google Ads tokens.";
export const TOKEN_DECRYPT_HINT =
  "TOKEN_ENCRYPTION_KEY does not match the key that encrypted these tokens (or the ciphertext is corrupt). Restore the original production key, or Disconnect and Connect Google Ads again so tokens are re-encrypted. Do not rotate TOKEN_ENCRYPTION_KEY without reconnecting.";

export class TokenDecryptError extends Error {
  readonly status = 401;
  readonly info: {
    kind: "token_decrypt";
    hint: string;
    recovery: "reconnect";
  };

  constructor() {
    super(TOKEN_DECRYPT_MESSAGE);
    this.name = "TokenDecryptError";
    this.info = {
      kind: "token_decrypt",
      hint: TOKEN_DECRYPT_HINT,
      recovery: "reconnect",
    };
  }
}

function decodeKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const fromB64 = Buffer.from(raw, "base64");
  if (fromB64.length === 32) {
    return fromB64;
  }
  throw Object.assign(new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)."), {
    status: 500,
    info: { kind: "config", hint: "Generate with: openssl rand -hex 32" },
  });
}

export function resolveEncryptionKey(): Buffer {
  const env = getEnv();
  if (env.tokenEncryptionKey) {
    return decodeKey(env.tokenEncryptionKey);
  }
  if (env.mockMode) {
    return createHash("sha256").update(MOCK_KEY_MATERIAL).digest();
  }
  throw Object.assign(new Error("TOKEN_ENCRYPTION_KEY is required to encrypt OAuth tokens at rest."), {
    status: 500,
    info: {
      kind: "config",
      hint: "Set TOKEN_ENCRYPTION_KEY in .env.local (32-byte hex or base64). Mock mode may omit it.",
    },
  });
}

function isConfigError(error: unknown): boolean {
  const err = error as { status?: number; info?: { kind?: string } };
  return err.status === 500 && err.info?.kind === "config";
}

/** Node AES-GCM auth-tag failure (wrong key / corrupt ciphertext). Never treat as a 500. */
export function isOpaqueCryptoDecryptError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unsupported state or unable to authenticate data/i.test(message);
}

export function encryptSecret(plaintext: string): string {
  const key = resolveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  const [ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64 || parts.length !== 3) {
    throw new TokenDecryptError();
  }

  try {
    const key = resolveEncryptionKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof TokenDecryptError || isConfigError(error)) {
      throw error;
    }
    throw new TokenDecryptError();
  }
}

/** Decrypt OAuthConnection token columns. Throws TokenDecryptError — never returns ciphertext. */
export function decryptOAuthTokenFields(connection: {
  refreshTokenEncrypted: string;
  accessTokenEncrypted: string | null;
}): { refreshToken: string; accessToken?: string } {
  return {
    refreshToken: decryptSecret(connection.refreshTokenEncrypted),
    accessToken: connection.accessTokenEncrypted
      ? decryptSecret(connection.accessTokenEncrypted)
      : undefined,
  };
}
