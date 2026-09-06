import { describe, expect, it } from "vitest";

import { classifyAdsError } from "@/lib/ads-errors";

describe("Google Ads error mapping", () => {
  it("explains Test Account developer-token failures", () => {
    const info = classifyAdsError(403, {
      error: {
        status: "PERMISSION_DENIED",
        details: [
          {
            errors: [
              {
                errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" },
                message: "Developer token is not approved.",
              },
            ],
          },
        ],
      },
    });
    expect(info.kind).toBe("developer_token");
    expect(info.hint).toMatch(/Test Account/);
  });

  it("calls out known CUSTOMER_NOT_ENABLED 485-651-7690", () => {
    const info = classifyAdsError(
      403,
      {
        error: {
          details: [
            {
              errors: [
                {
                  errorCode: { authorizationError: "CUSTOMER_NOT_ENABLED" },
                  message: "The customer is not enabled.",
                },
              ],
            },
          ],
        },
      },
      "485-651-7690",
    );
    expect(info.kind).toBe("customer_not_enabled");
    expect(info.hint).toMatch(/485-651-7690/);
  });
});
