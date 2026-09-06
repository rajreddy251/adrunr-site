import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";

export const SHOPPING_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const SHOPPING_BIDDING_STRATEGIES = [
  "MANUAL_CPC",
  "MAXIMIZE_CLICKS",
  "MAXIMIZE_CONVERSION_VALUE",
  "TARGET_ROAS",
] as const;
export const SHOPPING_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const SHOPPING_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export const SHOPPING_PRODUCT_GROUP_KINDS = ["ALL_PRODUCTS", "UNIT", "SUBDIVISION"] as const;
export const SHOPPING_LISTING_KINDS = ["ALL_PRODUCTS", "UNIT"] as const;

export type ShoppingDraftStatusValue = (typeof SHOPPING_DRAFT_STATUSES)[number];
export type ShoppingBiddingStrategyValue = (typeof SHOPPING_BIDDING_STRATEGIES)[number];
export type ShoppingTargetTypeValue = (typeof SHOPPING_TARGET_TYPES)[number];
export type ShoppingPriorityValue = (typeof SHOPPING_PRIORITIES)[number];
export type ShoppingProductGroupKindValue = (typeof SHOPPING_PRODUCT_GROUP_KINDS)[number];
export type ShoppingListingKindValue = (typeof SHOPPING_LISTING_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;
export const DEFAULT_MERCHANT_CENTER_ID = "123456789";

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList };

export const SALES_COUNTRY_PRESETS = [
  { valueText: "United States", salesCountry: "US" },
  { valueText: "Canada", salesCountry: "CA" },
  { valueText: "United Kingdom", salesCountry: "GB" },
] as const;

export type ShoppingProductGroupInput = {
  kind: ShoppingProductGroupKindValue;
  valueText: string;
  dimensionText: string;
  included: boolean;
  sortOrder?: number;
};

export type ShoppingListingInput = {
  kind: ShoppingListingKindValue;
  valueText: string;
  dimensionText: string;
  included: boolean;
};

export type ShoppingAdGroupInput = {
  name: string;
  defaultBidMicros: number;
  sortOrder: number;
  productGroups: ShoppingProductGroupInput[];
  listings: ShoppingListingInput[];
};

export type ShoppingTargetInput = {
  type: ShoppingTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type ShoppingDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: ShoppingBiddingStrategyValue;
  merchantCenterId?: string | null;
  salesCountry: string;
  campaignPriority: ShoppingPriorityValue;
  enableLocal: boolean;
  targetRoasText?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  adGroups: ShoppingAdGroupInput[];
  targets: ShoppingTargetInput[];
};

function validationError(message: string, hint?: string): Error {
  return Object.assign(new Error(message), {
    status: 400,
    info: { kind: "validation", hint },
  });
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function optionalString(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}

function parseDate(value: unknown, label: string): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw validationError(`${label} must be YYYY-MM-DD.`, "Use an ISO date such as 2026-09-06.");
  }
  return raw;
}

function parseLocalFlag(value: unknown, fallback: boolean): boolean {
  if (value === false || value === "false" || value === 0) return false;
  if (value === true || value === "true" || value === 1) return true;
  return fallback;
}

function parseBiddingStrategy(value: unknown): ShoppingBiddingStrategyValue {
  const raw = String(value ?? "MANUAL_CPC").toUpperCase();
  if (!(SHOPPING_BIDDING_STRATEGIES as readonly string[]).includes(raw)) {
    throw validationError(
      `Unknown bidding strategy ${raw}.`,
      `MVP applies MANUAL_CPC. Schema also stores ${SHOPPING_BIDDING_STRATEGIES.join(", ")}.`,
    );
  }
  return raw as ShoppingBiddingStrategyValue;
}

function parsePriority(value: unknown): ShoppingPriorityValue {
  const raw = String(value ?? "LOW").toUpperCase();
  if (!(SHOPPING_PRIORITIES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown campaign priority ${raw}.`, `Use ${SHOPPING_PRIORITIES.join(", ")}.`);
  }
  return raw as ShoppingPriorityValue;
}

function parseTargetType(value: unknown): ShoppingTargetTypeValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(SHOPPING_TARGET_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown target type ${raw}.`, `Use ${SHOPPING_TARGET_TYPES.join(", ")}.`);
  }
  return raw as ShoppingTargetTypeValue;
}

function parseProductGroupKind(value: unknown): ShoppingProductGroupKindValue {
  const raw = String(value ?? "ALL_PRODUCTS").toUpperCase();
  if (!(SHOPPING_PRODUCT_GROUP_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown product group kind ${raw}.`, `Use ${SHOPPING_PRODUCT_GROUP_KINDS.join(", ")}.`);
  }
  return raw as ShoppingProductGroupKindValue;
}

function parseListingKind(value: unknown): ShoppingListingKindValue {
  const raw = String(value ?? "ALL_PRODUCTS").toUpperCase();
  if (!(SHOPPING_LISTING_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown listing kind ${raw}.`, `Use ${SHOPPING_LISTING_KINDS.join(", ")}.`);
  }
  return raw as ShoppingListingKindValue;
}

function parseSalesCountry(value: unknown): string {
  const raw = optionalString(value)?.toUpperCase() ?? "US";
  if (!/^[A-Z]{2}$/.test(raw)) {
    throw validationError("salesCountry must be a 2-letter ISO country code.", "Use US, CA, or GB.");
  }
  return raw;
}

function parseMerchantCenterId(value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  const digits = digitsOnly(raw);
  if (!digits) {
    throw validationError("merchantCenterId must be numeric.", "Use the Merchant Center account id.");
  }
  return digits;
}

function parseProductGroup(raw: unknown, index: number): ShoppingProductGroupInput {
  const row = asRecord(raw);
  const kind = parseProductGroupKind(row.kind);
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  if (!valueText) throw validationError("Each product group needs valueText.");
  return {
    kind,
    valueText,
    dimensionText: String(row.dimensionText ?? row.dimension ?? "").trim(),
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseListing(raw: unknown): ShoppingListingInput {
  const row = asRecord(raw);
  const kind = parseListingKind(row.kind);
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  if (!valueText) throw validationError("Each listing needs valueText.");
  return {
    kind,
    valueText,
    dimensionText: String(row.dimensionText ?? row.dimension ?? "").trim(),
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAdGroup(raw: unknown, index: number): ShoppingAdGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) throw validationError(`Ad group ${index + 1} needs a name.`);
  const productGroups = Array.isArray(row.productGroups) ? row.productGroups.map(parseProductGroup) : [];
  if (productGroups.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one product group.`);
  }
  const defaultBidMicros = Number(row.defaultBidMicros);
  return {
    name,
    defaultBidMicros:
      Number.isFinite(defaultBidMicros) && defaultBidMicros >= MIN_BID_MICROS
        ? Math.trunc(defaultBidMicros)
        : 1_000_000,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    productGroups,
    listings: Array.isArray(row.listings) ? row.listings.map(parseListing) : [],
  };
}

function parseTarget(raw: unknown): ShoppingTargetInput {
  const row = asRecord(raw);
  const type = parseTargetType(row.type);
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) {
    throw validationError("Each target needs valueText and criterionText.");
  }
  return {
    type,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseProductGroupLoose(raw: unknown, index: number): ShoppingProductGroupInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "ALL_PRODUCTS").toUpperCase();
  if (!(SHOPPING_PRODUCT_GROUP_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  if (!valueText) return null;
  return {
    kind: kindRaw as ShoppingProductGroupKindValue,
    valueText,
    dimensionText: String(row.dimensionText ?? row.dimension ?? "").trim(),
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseListingLoose(raw: unknown): ShoppingListingInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "ALL_PRODUCTS").toUpperCase();
  if (!(SHOPPING_LISTING_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  if (!valueText) return null;
  return {
    kind: kindRaw as ShoppingListingKindValue,
    valueText,
    dimensionText: String(row.dimensionText ?? row.dimension ?? "").trim(),
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAdGroupLoose(raw: unknown, index: number): ShoppingAdGroupInput | null {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) return null;
  const defaultBidMicros = Number(row.defaultBidMicros);
  return {
    name,
    defaultBidMicros:
      Number.isFinite(defaultBidMicros) && defaultBidMicros >= MIN_BID_MICROS
        ? Math.trunc(defaultBidMicros)
        : 1_000_000,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    productGroups: Array.isArray(row.productGroups)
      ? row.productGroups
          .map(parseProductGroupLoose)
          .filter((item): item is ShoppingProductGroupInput => Boolean(item))
      : [],
    listings: Array.isArray(row.listings)
      ? row.listings.map(parseListingLoose).filter((item): item is ShoppingListingInput => Boolean(item))
      : [],
  };
}

function parseTargetLoose(raw: unknown): ShoppingTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(SHOPPING_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as ShoppingTargetTypeValue,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function assertPausedStatus(raw: Record<string, unknown>) {
  if (!raw.status) return;
  try {
    assertPausedOnly(String(raw.status));
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      status: 400,
      info: { kind: "validation", hint: "Adrunr only creates PAUSED campaigns." },
    });
  }
}

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseShoppingDraftTree. */
export function parseShoppingDraftWrite(body: unknown): ShoppingDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled Shopping draft";
  const dailyBudgetMicros = Number(raw.dailyBudgetMicros);
  if (!customerId && !optionalString(raw.externalAccountId)) {
    throw validationError("customerId or externalAccountId is required.", "Pick a Google Ads customer.");
  }
  assertPausedStatus(raw);
  return {
    customerId,
    externalAccountId: optionalString(raw.externalAccountId) ?? undefined,
    name,
    dailyBudgetMicros:
      Number.isFinite(dailyBudgetMicros) && dailyBudgetMicros >= MIN_BUDGET_MICROS
        ? Math.trunc(dailyBudgetMicros)
        : 1_000_000,
    biddingStrategy: parseBiddingStrategy(raw.biddingStrategy),
    merchantCenterId: parseMerchantCenterId(raw.merchantCenterId),
    salesCountry: optionalString(raw.salesCountry)?.toUpperCase() || "US",
    campaignPriority: parsePriority(raw.campaignPriority),
    enableLocal: parseLocalFlag(raw.enableLocal, false),
    targetRoasText: optionalString(raw.targetRoasText),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    adGroups: Array.isArray(raw.adGroups)
      ? raw.adGroups.map(parseAdGroupLoose).filter((item): item is ShoppingAdGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is ShoppingTargetInput => Boolean(item))
      : [],
  };
}

export function parseShoppingDraftTree(body: unknown): ShoppingDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim();
  const dailyBudgetMicros = Number(raw.dailyBudgetMicros);

  if (!customerId && !optionalString(raw.externalAccountId)) {
    throw validationError("customerId or externalAccountId is required.", "Pick a Google Ads customer.");
  }
  if (!name) throw validationError("Campaign name is required.");
  if (!Number.isFinite(dailyBudgetMicros) || dailyBudgetMicros < MIN_BUDGET_MICROS) {
    throw validationError(
      `dailyBudgetMicros must be an integer >= ${MIN_BUDGET_MICROS} (API requires a budget; campaign stays PAUSED).`,
    );
  }
  assertPausedStatus(raw);

  const biddingStrategy = parseBiddingStrategy(raw.biddingStrategy);
  if (biddingStrategy !== "MANUAL_CPC") {
    throw validationError(
      `${biddingStrategy} is schema-ready but not applied in Shopping MVP.`,
      "Use MANUAL_CPC. Maximize conversion value / tROAS stay stored for later phases.",
    );
  }

  const merchantCenterId = parseMerchantCenterId(raw.merchantCenterId);
  if (!merchantCenterId) {
    throw validationError(
      "merchantCenterId is required to validate or apply a Shopping campaign.",
      "Link the Merchant Center account id. Product groups apply against that feed.",
    );
  }

  const salesCountry = parseSalesCountry(raw.salesCountry);
  const adGroups = Array.isArray(raw.adGroups) ? raw.adGroups.map(parseAdGroup) : [];
  if (adGroups.length === 0) {
    throw validationError("At least one ad group is required.");
  }
  for (const group of adGroups) {
    const allProducts = group.productGroups.filter((item) => item.kind === "ALL_PRODUCTS" && item.included);
    if (allProducts.length === 0) {
      throw validationError(
        `Ad group "${group.name}" needs an ALL_PRODUCTS product group.`,
        "UNIT / SUBDIVISION product groups are schema-ready but not applied in Shopping MVP.",
      );
    }
    for (const productGroup of group.productGroups) {
      if (productGroup.kind !== "ALL_PRODUCTS") {
        throw validationError(
          `${productGroup.kind} product groups are schema-ready but not applied in Shopping MVP.`,
          "Apply uses ALL_PRODUCTS. UNIT / SUBDIVISION stay stored for later.",
        );
      }
    }
    for (const listing of group.listings) {
      if (listing.kind !== "ALL_PRODUCTS") {
        throw validationError(
          `${listing.kind} listings are schema-ready but not applied in Shopping MVP.`,
          "ALL_PRODUCTS listings apply with the product group. Sync listings is out of scope.",
        );
      }
    }
  }

  const targets = Array.isArray(raw.targets) ? raw.targets.map(parseTarget) : [];
  const geos = targets.filter((target) => target.type === "GEO");
  if (geos.length === 0) {
    throw validationError("At least one GEO target is required.", "United States (geoTargetConstants/2840) is the usual default.");
  }

  const startDate = parseDate(raw.startDate, "startDate");
  const endDate = parseDate(raw.endDate, "endDate");
  if (startDate && endDate && endDate < startDate) {
    throw validationError("endDate must be on or after startDate.");
  }

  return {
    customerId,
    externalAccountId: optionalString(raw.externalAccountId) ?? undefined,
    name,
    dailyBudgetMicros: Math.trunc(dailyBudgetMicros),
    biddingStrategy,
    merchantCenterId,
    salesCountry,
    campaignPriority: parsePriority(raw.campaignPriority),
    enableLocal: parseLocalFlag(raw.enableLocal, false),
    targetRoasText: optionalString(raw.targetRoasText),
    startDate,
    endDate,
    notesText: optionalString(raw.notesText),
    adGroups,
    targets,
  };
}

export function assertApplyConfirm(dryRun: unknown, confirmPhrase: unknown): void {
  if (!resolveDryRun(dryRun) && String(confirmPhrase ?? "") !== CONFIRM_PAUSED_PHRASE) {
    throw validationError(
      `Type ${CONFIRM_PAUSED_PHRASE} to apply a PAUSED campaign. Dry-run is preferred.`,
      "POST apply / dryRun:false requires confirmPhrase exactly CREATE PAUSED. Validate does not.",
    );
  }
}

export function buildShoppingDraftMutate(tree: ShoppingDraftTree, validateOnly: boolean): MutateRequest {
  const customerId = digitsOnly(tree.customerId);
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  const campaignResourceName = `customers/${customerId}/campaigns/-2`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mutateOperations: Array<Record<string, unknown>> = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResourceName,
          name: `${tree.name} budget ${stamp}`,
          amountMicros: String(tree.dailyBudgetMicros),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResourceName,
          name: tree.name,
          status: "PAUSED",
          advertisingChannelType: "SHOPPING",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          manualCpc: { enhancedCpcEnabled: false },
          shoppingSetting: {
            merchantId: tree.merchantCenterId,
            feedLabel: tree.salesCountry,
            campaignPriority: tree.campaignPriority,
            enableLocal: tree.enableLocal,
          },
          ...(tree.startDate ? { startDate: tree.startDate.replace(/-/g, "") } : {}),
          ...(tree.endDate ? { endDate: tree.endDate.replace(/-/g, "") } : {}),
        },
      },
    },
  ];

  for (const target of tree.targets) {
    const criterion: Record<string, unknown> = {
      campaign: campaignResourceName,
      negative: !target.included,
    };
    if (target.type === "GEO") {
      criterion.location = { geoTargetConstant: target.criterionText };
    } else if (target.type === "LANGUAGE") {
      criterion.language = { languageConstant: target.criterionText };
      delete criterion.negative;
    }
    mutateOperations.push({ campaignCriterionOperation: { create: criterion } });
  }

  let nextTemp = -3;
  for (const group of tree.adGroups) {
    const adGroupResourceName = `customers/${customerId}/adGroups/${nextTemp}`;
    nextTemp -= 1;
    mutateOperations.push({
      adGroupOperation: {
        create: {
          resourceName: adGroupResourceName,
          name: group.name,
          campaign: campaignResourceName,
          status: "PAUSED",
          type: "SHOPPING_PRODUCT_ADS",
          cpcBidMicros: String(group.defaultBidMicros),
        },
      },
    });

    for (const productGroup of group.productGroups) {
      if (productGroup.kind !== "ALL_PRODUCTS" || !productGroup.included) continue;
      mutateOperations.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "ENABLED",
            listingGroup: { type: "UNIT" },
          },
        },
      });
    }
  }

  return {
    customerId,
    validateOnly,
    responseContentType: "MUTABLE_RESOURCE",
    mutateOperations,
  };
}

export function extractShoppingResourceNames(response: unknown): {
  campaign?: string;
  adGroups: string[];
  criteria: string[];
} {
  const body = asRecord(response);
  const ops = Array.isArray(body.mutateOperationResponses)
    ? (body.mutateOperationResponses as Array<Record<string, unknown>>)
    : [];
  const adGroups: string[] = [];
  const criteria: string[] = [];
  let campaign: string | undefined;
  for (const op of ops) {
    const campaignResult = asRecord(op.campaignResult);
    if (typeof campaignResult.resourceName === "string") campaign = campaignResult.resourceName;
    const adGroupResult = asRecord(op.adGroupResult);
    if (typeof adGroupResult.resourceName === "string") adGroups.push(adGroupResult.resourceName);
    const criterionResult = asRecord(op.adGroupCriterionResult);
    if (typeof criterionResult.resourceName === "string") criteria.push(criterionResult.resourceName);
  }
  return { campaign, adGroups, criteria };
}

export function defaultShoppingDraftTree(partial?: Partial<ShoppingDraftTree>): ShoppingDraftTree {
  return {
    customerId: partial?.customerId ?? "",
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused Shopping",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "MANUAL_CPC",
    merchantCenterId: partial?.merchantCenterId ?? DEFAULT_MERCHANT_CENTER_ID,
    salesCountry: partial?.salesCountry ?? "US",
    campaignPriority: partial?.campaignPriority ?? "LOW",
    enableLocal: partial?.enableLocal ?? false,
    targetRoasText: partial?.targetRoasText ?? null,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    notesText: partial?.notesText ?? null,
    adGroups: partial?.adGroups ?? [
      {
        name: "Shopping product group 1",
        defaultBidMicros: 1_000_000,
        sortOrder: 0,
        productGroups: [
          {
            kind: "ALL_PRODUCTS",
            valueText: "All products",
            dimensionText: "",
            included: true,
            sortOrder: 0,
          },
        ],
        listings: [],
      },
    ],
    targets: partial?.targets ?? [
      { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
    ],
  };
}
