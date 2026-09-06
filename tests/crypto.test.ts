import { afterEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/crypto";

const HEX_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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
});
