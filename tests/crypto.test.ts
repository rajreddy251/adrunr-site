import { afterEach, describe, expect, it } from "vitest";

import {
  TokenDecryptError,
  TOKEN_DECRYPT_HINT,
  TOKEN_DECRYPT_MESSAGE,
  decryptOAuthTokenFields,
  decryptSecret,
  encryptSecret,
  isOpaqueCryptoDecryptError,
} from "@/lib/crypto";
import { jsonError } from "@/lib/http";

const HEX_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_HEX_KEY = "ff".repeat(32);

function expectNoLeak(value: unknown, packed: string) {
  const serialized = JSON.stringify(value, Object.getOwnPropertyNames(value instanceof Error ? value : {}));
  const asString = `${serialized} ${value instanceof Error ? value.stack ?? value.message : String(value)}`;
  expect(asString).not.toContain(packed);
  expect(asString).not.toContain("refresh-token-value");
  expect(asString).not.toMatch(/Unsupported state or unable to authenticate data/i);
}

describe("token encryption", () => {
  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.ADRUNR_MOCK;
  });

  it("round-trips secrets with TOKEN_ENCRYPTION_KEY", () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const packed = encryptSecret("refresh-token-value");
    expect(packed.split(".")).toHaveLength(3);
    expect(decryptSecret(packed)).toBe("refresh-token-value");
  });

  it("uses a mock-only key when ADRUNR_MOCK=1 and no key is set", () => {
    process.env.ADRUNR_MOCK = "1";
    const packed = encryptSecret("mock-refresh-token");
    expect(decryptSecret(packed)).toBe("mock-refresh-token");
  });

  it("treats hex and matching 32-byte base64 TOKEN_ENCRYPTION_KEY as the same key", () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const packed = encryptSecret("same-key");
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from(HEX_KEY, "hex").toString("base64");
    expect(decryptSecret(packed)).toBe("same-key");
  });

  it("throws TokenDecryptError on key mismatch without leaking ciphertext", () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const packed = encryptSecret("refresh-token-value");
    process.env.TOKEN_ENCRYPTION_KEY = OTHER_HEX_KEY;

    expect(() => decryptSecret(packed)).toThrow(TokenDecryptError);

    try {
      decryptSecret(packed);
      expect.unreachable("decryptSecret should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenDecryptError);
      const mapped = error as TokenDecryptError;
      expect(mapped.message).toBe(TOKEN_DECRYPT_MESSAGE);
      expect(mapped.status).toBe(401);
      expect(mapped.info.kind).toBe("token_decrypt");
      expect(mapped.info.recovery).toBe("reconnect");
      expect(mapped.info.hint).toBe(TOKEN_DECRYPT_HINT);
      expect(mapped.info.hint).toMatch(/Connect Google Ads/);
      expectNoLeak(mapped, packed);
    }
  });

  it("throws TokenDecryptError on malformed payload without echoing the payload", () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const packed = "not-a-valid.ciphertext";
    expect(() => decryptSecret(packed)).toThrow(TokenDecryptError);
    try {
      decryptSecret(packed);
      expect.unreachable("decryptSecret should throw");
    } catch (error) {
      expectNoLeak(error, packed);
    }
  });

  it("maps decrypt failure through jsonError as 401 reconnect, not a raw crypto 500", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const packed = encryptSecret("refresh-token-value");
    process.env.TOKEN_ENCRYPTION_KEY = OTHER_HEX_KEY;

    let thrown: unknown;
    try {
      decryptOAuthTokenFields({
        refreshTokenEncrypted: packed,
        accessTokenEncrypted: packed,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TokenDecryptError);
    const response = jsonError(thrown);
    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      ok: boolean;
      error: string;
      kind: string;
      hint: string;
      recovery: string;
    };
    expect(body).toEqual({
      ok: false,
      error: TOKEN_DECRYPT_MESSAGE,
      kind: "token_decrypt",
      hint: TOKEN_DECRYPT_HINT,
      recovery: "reconnect",
    });
    expect(JSON.stringify(body)).not.toContain(packed);
    expect(JSON.stringify(body)).not.toMatch(/Unsupported state/i);
  });

  it("decrypts again after reconnect (re-encrypt with current key) or after restoring the original key", () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const original = encryptSecret("refresh-token-value");

    process.env.TOKEN_ENCRYPTION_KEY = OTHER_HEX_KEY;
    expect(() => decryptSecret(original)).toThrow(TokenDecryptError);

    const reconnected = encryptSecret("new-refresh-after-connect");
    expect(
      decryptOAuthTokenFields({
        refreshTokenEncrypted: reconnected,
        accessTokenEncrypted: null,
      }),
    ).toEqual({ refreshToken: "new-refresh-after-connect", accessToken: undefined });

    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    expect(decryptSecret(original)).toBe("refresh-token-value");
  });

  it("remaps the opaque Node AES-GCM error if it still reaches jsonError", async () => {
    const opaque = new Error("Unsupported state or unable to authenticate data");
    expect(isOpaqueCryptoDecryptError(opaque)).toBe(true);
    const response = jsonError(opaque);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string; kind: string; hint: string };
    expect(body.kind).toBe("token_decrypt");
    expect(body.error).toBe(TOKEN_DECRYPT_MESSAGE);
    expect(JSON.stringify(body)).not.toMatch(/Unsupported state/i);
    expect(body.hint).toMatch(/Connect Google Ads/);
  });
});
