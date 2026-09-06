import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getEnv } from "./env";

const ALGO = "aes-256-gcm";
const MOCK_KEY_MATERIAL = "adrunr-mock-only-token-encryption-key";

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

export function encryptSecret(plaintext: string): string {
  const key = resolveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const key = resolveEncryptionKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
