import { describe, expect, it } from "vitest";

import {
  digitsOnly,
  formatCustomerId,
  isKnownNotEnabledCustomer,
  parseCustomerResourceName,
  PLATFORM_MCC_ID,
} from "@/lib/ids";

describe("customer ids", () => {
  it("strips hyphens from MCC display form", () => {
    expect(digitsOnly("857-080-5596")).toBe(PLATFORM_MCC_ID);
  });

  it("formats a 10-digit id", () => {
    expect(formatCustomerId("8570805596")).toBe("857-080-5596");
  });

  it("parses customer resource names", () => {
    expect(parseCustomerResourceName("customers/4856517690")).toBe("4856517690");
  });

  it("flags the known CUSTOMER_NOT_ENABLED account", () => {
    expect(isKnownNotEnabledCustomer("485-651-7690")).toBe(true);
    expect(isKnownNotEnabledCustomer("857-080-5596")).toBe(false);
  });
});
