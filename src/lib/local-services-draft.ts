import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";

export const LOCAL_SERVICES_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const LOCAL_SERVICES_BIDDING_STRATEGIES = ["MANUAL_CPC", "MAXIMIZE_CONVERSIONS"] as const;
export const LOCAL_SERVICES_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const LOCAL_SERVICES_CATEGORY_KINDS = ["PRIMARY", "ADDITIONAL"] as const;

export type LocalServicesDraftStatusValue = (typeof LOCAL_SERVICES_DRAFT_STATUSES)[number];
export type LocalServicesBiddingStrategyValue = (typeof LOCAL_SERVICES_BIDDING_STRATEGIES)[number];
export type LocalServicesTargetTypeValue = (typeof LOCAL_SERVICES_TARGET_TYPES)[number];
export type LocalServicesCategoryKindValue = (typeof LOCAL_SERVICES_CATEGORY_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_LEAD_BID_MICROS = 10_000;
export const DEFAULT_LSA_CATEGORY_ID = "xcat:home_services:plumber";

export const LSA_CATEGORY_PRESETS = [
  { categoryId: "xcat:home_services:plumber", valueText: "Plumber" },
  { categoryId: "xcat:home_services:electrician", valueText: "Electrician" },
  { categoryId: "xcat:home_services:hvac", valueText: "HVAC" },
  { categoryId: "xcat:home_services:locksmith", valueText: "Locksmith" },
  { categoryId: "xcat:professional_services:lawyer", valueText: "Lawyer" },
] as const;

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList };

export type LocalServicesCategoryInput = {
  kind: LocalServicesCategoryKindValue;
  categoryId: string;
  valueText: string;
  included: boolean;
  sortOrder?: number;
};

export type LocalServicesTargetInput = {
  type: LocalServicesTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type LocalServicesDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: LocalServicesBiddingStrategyValue;
  maxLeadBidMicros?: number | null;
  businessName?: string | null;
  licenseText?: string | null;
  insuranceText?: string | null;
  googleGuaranteed: boolean;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  categories: LocalServicesCategoryInput[];
  targets: LocalServicesTargetInput[];
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

function parseOptionalMicros(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseGuaranteed(value: unknown, fallback: boolean): boolean {
  if (value === false || value === "false" || value === 0) return false;
  if (value === true || value === "true" || value === 1) return true;
  return fallback;
}

function parseBiddingStrategy(value: unknown): LocalServicesBiddingStrategyValue {
  const raw = String(value ?? "MANUAL_CPC").toUpperCase();
  if (!(LOCAL_SERVICES_BIDDING_STRATEGIES as readonly string[]).includes(raw)) {
    throw validationError(
      `Unknown bidding strategy ${raw}.`,
      `MVP applies MANUAL_CPC (max bid per lead). Schema also stores ${LOCAL_SERVICES_BIDDING_STRATEGIES.join(", ")}.`,
    );
  }
  return raw as LocalServicesBiddingStrategyValue;
}

function parseCategoryKind(value: unknown): LocalServicesCategoryKindValue {
  const raw = String(value ?? "PRIMARY").toUpperCase();
  if (!(LOCAL_SERVICES_CATEGORY_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown category kind ${raw}.`, `Use ${LOCAL_SERVICES_CATEGORY_KINDS.join(", ")}.`);
  }
  return raw as LocalServicesCategoryKindValue;
}

function parseTargetType(value: unknown): LocalServicesTargetTypeValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(LOCAL_SERVICES_TARGET_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown target type ${raw}.`, `Use ${LOCAL_SERVICES_TARGET_TYPES.join(", ")}.`);
  }
  return raw as LocalServicesTargetTypeValue;
}

function parseCategory(raw: unknown, index: number): LocalServicesCategoryInput {
  const row = asRecord(raw);
  const kind = parseCategoryKind(row.kind);
  const categoryId = String(row.categoryId ?? row.id ?? "").trim();
  const valueText = String(row.valueText ?? row.value ?? row.name ?? "").trim();
  if (!categoryId && !valueText) {
    throw validationError("Each Local Services category needs categoryId or valueText.");
  }
  return {
    kind,
    categoryId: categoryId || valueText,
    valueText: valueText || categoryId,
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseCategoryLoose(raw: unknown, index: number): LocalServicesCategoryInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "PRIMARY").toUpperCase();
  if (!(LOCAL_SERVICES_CATEGORY_KINDS as readonly string[]).includes(kindRaw)) return null;
  const categoryId = String(row.categoryId ?? row.id ?? "").trim();
  const valueText = String(row.valueText ?? row.value ?? row.name ?? "").trim();
  if (!categoryId && !valueText) return null;
  return {
    kind: kindRaw as LocalServicesCategoryKindValue,
    categoryId: categoryId || valueText,
    valueText: valueText || categoryId,
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseTarget(raw: unknown): LocalServicesTargetInput {
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

function parseTargetLoose(raw: unknown): LocalServicesTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(LOCAL_SERVICES_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as LocalServicesTargetTypeValue,
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

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseLocalServicesDraftTree. */
export function parseLocalServicesDraftWrite(body: unknown): LocalServicesDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled Local Services draft";
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
    maxLeadBidMicros: parseOptionalMicros(raw.maxLeadBidMicros),
    businessName: optionalString(raw.businessName),
    licenseText: optionalString(raw.licenseText),
    insuranceText: optionalString(raw.insuranceText),
    googleGuaranteed: parseGuaranteed(raw.googleGuaranteed, false),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    categories: Array.isArray(raw.categories)
      ? raw.categories.map(parseCategoryLoose).filter((item): item is LocalServicesCategoryInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is LocalServicesTargetInput => Boolean(item))
      : [],
  };
}

export function parseLocalServicesDraftTree(body: unknown): LocalServicesDraftTree {
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
      `${biddingStrategy} is schema-ready but not applied in Local Services MVP.`,
      "Use MANUAL_CPC (max bid per lead). Maximize conversions stay stored for later phases.",
    );
  }

  const maxLeadBidMicros = parseOptionalMicros(raw.maxLeadBidMicros);
  if (maxLeadBidMicros == null || maxLeadBidMicros < MIN_LEAD_BID_MICROS) {
    throw validationError(
      `maxLeadBidMicros must be an integer >= ${MIN_LEAD_BID_MICROS} for Local Services lead ads.`,
      "Set a max bid per lead. The campaign still applies PAUSED.",
    );
  }

  const categories = Array.isArray(raw.categories) ? raw.categories.map(parseCategory) : [];
  const primary = categories.filter((item) => item.kind === "PRIMARY" && item.included && item.categoryId);
  if (primary.length === 0) {
    throw validationError(
      "At least one included PRIMARY service category is required.",
      "ADDITIONAL categories are schema-ready but not applied in Local Services MVP.",
    );
  }
  for (const category of categories) {
    if (category.kind !== "PRIMARY") {
      throw validationError(
        `${category.kind} categories are schema-ready but not applied in Local Services MVP.`,
        "Apply uses PRIMARY. ADDITIONAL stay stored for later.",
      );
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
    maxLeadBidMicros,
    businessName: optionalString(raw.businessName),
    licenseText: optionalString(raw.licenseText),
    insuranceText: optionalString(raw.insuranceText),
    googleGuaranteed: parseGuaranteed(raw.googleGuaranteed, false),
    startDate,
    endDate,
    notesText: optionalString(raw.notesText),
    categories,
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

export function primaryLocalServicesCategory(categories: LocalServicesCategoryInput[]): LocalServicesCategoryInput {
  const included = categories.filter((item) => item.included && item.categoryId);
  return included.find((item) => item.kind === "PRIMARY") ?? included[0];
}

export function buildLocalServicesDraftMutate(tree: LocalServicesDraftTree, validateOnly: boolean): MutateRequest {
  const customerId = digitsOnly(tree.customerId);
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  const campaignResourceName = `customers/${customerId}/campaigns/-2`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const primary = primaryLocalServicesCategory(tree.categories);
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
          advertisingChannelType: "LOCAL_SERVICES",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          manualCpc: { enhancedCpcEnabled: false },
          localServicesCampaignSettings: {
            categoryId: primary.categoryId,
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

  return {
    customerId,
    validateOnly,
    responseContentType: "MUTABLE_RESOURCE",
    mutateOperations,
  };
}

export function extractLocalServicesResourceNames(response: unknown): {
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

export function defaultLocalServicesDraftTree(partial?: Partial<LocalServicesDraftTree>): LocalServicesDraftTree {
  return {
    customerId: partial?.customerId ?? "",
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused Local Services",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "MANUAL_CPC",
    maxLeadBidMicros: partial?.maxLeadBidMicros ?? 2_000_000,
    businessName: partial?.businessName ?? "Adrunr Local Services",
    licenseText: partial?.licenseText ?? null,
    insuranceText: partial?.insuranceText ?? null,
    googleGuaranteed: partial?.googleGuaranteed ?? false,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    notesText: partial?.notesText ?? null,
    categories: partial?.categories ?? [
      {
        kind: "PRIMARY",
        categoryId: DEFAULT_LSA_CATEGORY_ID,
        valueText: "Plumber",
        included: true,
        sortOrder: 0,
      },
    ],
    targets: partial?.targets ?? [
      { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
    ],
  };
}
