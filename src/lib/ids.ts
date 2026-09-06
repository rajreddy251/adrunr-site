/** Platform MCC (red4code). Hyphens are display-only; APIs use digits. */
export const PLATFORM_MCC_DISPLAY = "857-080-5596";
export const PLATFORM_MCC_ID = "8570805596";

/** Known customer that may return CUSTOMER_NOT_ENABLED. Mutations are blocked. */
export const KNOWN_NOT_ENABLED_CUSTOMER_DISPLAY = "485-651-7690";
export const KNOWN_NOT_ENABLED_CUSTOMER_ID = "4856517690";

const DIGITS = /\D/g;

export function digitsOnly(value: string | undefined | null): string {
  return (value ?? "").replace(DIGITS, "");
}

export function formatCustomerId(value: string | undefined | null): string {
  const digits = digitsOnly(value);
  if (digits.length !== 10) {
    return digits || "—";
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function customerResourceName(customerId: string): string {
  return `customers/${digitsOnly(customerId)}`;
}

export function parseCustomerResourceName(resourceName: string): string {
  const match = resourceName.match(/customers\/(\d+)/);
  return match?.[1] ?? digitsOnly(resourceName);
}

export function isKnownNotEnabledCustomer(customerId: string): boolean {
  return digitsOnly(customerId) === KNOWN_NOT_ENABLED_CUSTOMER_ID;
}
