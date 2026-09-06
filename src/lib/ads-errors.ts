import { formatCustomerId, isKnownNotEnabledCustomer } from "./ids";

export type AdsErrorKind =
  | "developer_token"
  | "customer_not_enabled"
  | "auth"
  | "permission"
  | "not_connected"
  | "validation"
  | "database"
  | "config"
  | "unknown";

export type AdsErrorInfo = {
  kind: AdsErrorKind;
  code: string;
  message: string;
  hint: string;
  customerId?: string;
};

type GoogleAdsErrorShape = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      errors?: Array<{
        message?: string;
        errorCode?: Record<string, string>;
      }>;
    }>;
  };
  message?: string;
};

function flattenCodes(body: GoogleAdsErrorShape): { codes: string[]; messages: string[] } {
  const codes: string[] = [];
  const messages: string[] = [];
  if (body.error?.status) codes.push(body.error.status);
  if (body.error?.message) messages.push(body.error.message);
  if (body.message) messages.push(body.message);
  for (const detail of body.error?.details ?? []) {
    for (const err of detail.errors ?? []) {
      if (err.message) messages.push(err.message);
      for (const [key, value] of Object.entries(err.errorCode ?? {})) {
        codes.push(`${key}:${value}`, value);
      }
    }
  }
  return { codes, messages };
}

export function classifyAdsError(
  status: number,
  body: unknown,
  customerId?: string,
): AdsErrorInfo {
  const parsed = (body ?? {}) as GoogleAdsErrorShape;
  const { codes, messages } = flattenCodes(parsed);
  const joined = `${codes.join(" ")} ${messages.join(" ")}`.toUpperCase();
  const firstMessage = messages[0] || parsed.error?.message || "Google Ads API request failed.";
  const firstCode = codes.find((c) => c.includes(":")) ?? codes[0] ?? `HTTP_${status}`;

  if (
    joined.includes("DEVELOPER_TOKEN") ||
    joined.includes("DEVELOPER TOKEN") ||
    joined.includes("TEST ACCOUNT")
  ) {
    return {
      kind: "developer_token",
      code: firstCode,
      message: firstMessage,
      hint: "Developer token is still Test Account access. You can only act on test accounts until Basic Access is approved. Listing a production MCC (857-080-5596) will often fail in this state.",
      customerId,
    };
  }

  if (joined.includes("CUSTOMER_NOT_ENABLED") || joined.includes("CUSTOMER NOT ENABLED")) {
    const known = customerId && isKnownNotEnabledCustomer(customerId);
    return {
      kind: "customer_not_enabled",
      code: firstCode,
      message: firstMessage,
      hint: known
        ? `Customer ${formatCustomerId(customerId)} is a known CUSTOMER_NOT_ENABLED account. Skip it until the account is enabled in Google Ads.`
        : "This customer is not enabled for Google Ads API use (CUSTOMER_NOT_ENABLED). It cannot be queried or mutated until Google enables it.",
      customerId,
    };
  }

  if (status === 401 || joined.includes("UNAUTHENTICATED") || joined.includes("AUTHENTICATION")) {
    return {
      kind: "auth",
      code: firstCode,
      message: firstMessage,
      hint: "OAuth token missing or expired. Disconnect and Connect Google Ads again (or set GOOGLE_ADS_REFRESH_TOKEN).",
      customerId,
    };
  }

  if (status === 403 || joined.includes("PERMISSION") || joined.includes("AUTHORIZATION")) {
    return {
      kind: "permission",
      code: firstCode,
      message: firstMessage,
      hint: "The connected user cannot access this customer under the configured MCC login-customer-id. Confirm MCC 857-080-5596 and account access.",
      customerId,
    };
  }

  return {
    kind: "unknown",
    code: firstCode,
    message: firstMessage,
    hint: "See the Google Ads API error. Common causes: Test Account developer token, wrong login-customer-id, or a disabled customer.",
    customerId,
  };
}

export class AdsApiError extends Error {
  readonly info: AdsErrorInfo;
  readonly status: number;

  constructor(status: number, body: unknown, customerId?: string) {
    const info = classifyAdsError(status, body, customerId);
    super(info.message);
    this.name = "AdsApiError";
    this.info = info;
    this.status = status;
  }
}
