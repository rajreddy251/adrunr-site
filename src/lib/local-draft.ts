import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";

export const LOCAL_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const LOCAL_BIDDING_STRATEGIES = ["MAXIMIZE_CONVERSIONS", "TARGET_CPA", "TARGET_ROAS"] as const;
export const LOCAL_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const LOCAL_GOALS = ["STORE_VISITS", "STORE_SALES"] as const;
export const LOCAL_LOCATION_KINDS = ["BUSINESS_PROFILE", "PLACE_ID", "ADDRESS"] as const;

export type LocalDraftStatusValue = (typeof LOCAL_DRAFT_STATUSES)[number];
export type LocalBiddingStrategyValue = (typeof LOCAL_BIDDING_STRATEGIES)[number];
export type LocalTargetTypeValue = (typeof LOCAL_TARGET_TYPES)[number];
export type LocalGoalValue = (typeof LOCAL_GOALS)[number];
export type LocalLocationKindValue = (typeof LOCAL_LOCATION_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;
export const LOCAL_HEADLINE_MIN = 1;
export const LOCAL_HEADLINE_MAX = 5;
export const LOCAL_HEADLINE_CHAR_MAX = 30;
export const LOCAL_DESCRIPTION_MIN = 1;
export const LOCAL_DESCRIPTION_MAX = 5;
export const LOCAL_DESCRIPTION_CHAR_MAX = 90;
export const DEFAULT_LOCAL_PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList };

export type LocalLocationInput = {
  kind: LocalLocationKindValue;
  valueText: string;
  placeIdText: string;
  addressText: string;
  included: boolean;
  sortOrder?: number;
};

export type LocalAdInput = {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
};

export type LocalAdGroupInput = {
  name: string;
  defaultBidMicros: number;
  sortOrder: number;
  ads: LocalAdInput[];
};

export type LocalTargetInput = {
  type: LocalTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type LocalDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: LocalBiddingStrategyValue;
  goal: LocalGoalValue;
  targetCpaMicros?: number | null;
  targetRoasText?: string | null;
  businessName?: string | null;
  finalUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  locations: LocalLocationInput[];
  adGroups: LocalAdGroupInput[];
  targets: LocalTargetInput[];
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

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  const raw = String(value ?? fallback).toUpperCase();
  if (!(allowed as readonly string[]).includes(raw)) {
    throw validationError(`Unknown ${label} ${raw}.`, `Use ${allowed.join(", ")}.`);
  }
  return raw as T;
}

function parseEnumLoose<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const raw = String(value ?? fallback).toUpperCase();
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function parseStringList(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") return decodeTextList(value);
  return fallback;
}

function parseLocation(raw: unknown, index: number): LocalLocationInput {
  const row = asRecord(raw);
  const kind = parseEnum(row.kind, LOCAL_LOCATION_KINDS, "PLACE_ID", "location kind");
  const valueText = String(row.valueText ?? row.value ?? row.businessName ?? "").trim();
  const placeIdText = String(row.placeIdText ?? row.placeId ?? "").trim();
  const addressText = String(row.addressText ?? row.address ?? "").trim();
  if (!valueText && !placeIdText && !addressText) {
    throw validationError("Each location needs a name, place id, or address.");
  }
  return {
    kind,
    valueText: valueText || addressText || placeIdText,
    placeIdText,
    addressText,
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseLocationLoose(raw: unknown, index: number): LocalLocationInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "PLACE_ID").toUpperCase();
  if (!(LOCAL_LOCATION_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? row.businessName ?? "").trim();
  const placeIdText = String(row.placeIdText ?? row.placeId ?? "").trim();
  const addressText = String(row.addressText ?? row.address ?? "").trim();
  if (!valueText && !placeIdText && !addressText) return null;
  return {
    kind: kindRaw as LocalLocationKindValue,
    valueText: valueText || addressText || placeIdText,
    placeIdText,
    addressText,
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAd(raw: unknown): LocalAdInput {
  const row = asRecord(raw);
  const headlines = parseStringList(row.headlines ?? row.headlinesText);
  const descriptions = parseStringList(row.descriptions ?? row.descriptionsText);
  const finalUrl = String(row.finalUrl ?? row.url ?? "").trim();
  if (headlines.length < LOCAL_HEADLINE_MIN) {
    throw validationError(`Each local ad needs at least ${LOCAL_HEADLINE_MIN} headline.`);
  }
  if (descriptions.length < LOCAL_DESCRIPTION_MIN) {
    throw validationError(`Each local ad needs at least ${LOCAL_DESCRIPTION_MIN} description.`);
  }
  if (headlines.length > LOCAL_HEADLINE_MAX) {
    throw validationError(`Each local ad allows at most ${LOCAL_HEADLINE_MAX} headlines.`);
  }
  if (descriptions.length > LOCAL_DESCRIPTION_MAX) {
    throw validationError(`Each local ad allows at most ${LOCAL_DESCRIPTION_MAX} descriptions.`);
  }
  for (const headline of headlines) {
    if (headline.length > LOCAL_HEADLINE_CHAR_MAX) {
      throw validationError(`Headlines must be <= ${LOCAL_HEADLINE_CHAR_MAX} characters.`);
    }
  }
  for (const description of descriptions) {
    if (description.length > LOCAL_DESCRIPTION_CHAR_MAX) {
      throw validationError(`Descriptions must be <= ${LOCAL_DESCRIPTION_CHAR_MAX} characters.`);
    }
  }
  if (!finalUrl) throw validationError("Each local ad needs a finalUrl.");
  return { headlines, descriptions, finalUrl };
}

function parseAdLoose(raw: unknown): LocalAdInput | null {
  const row = asRecord(raw);
  const headlines = parseStringList(row.headlines ?? row.headlinesText);
  const descriptions = parseStringList(row.descriptions ?? row.descriptionsText);
  const finalUrl = String(row.finalUrl ?? row.url ?? "").trim();
  if (!headlines.length && !descriptions.length && !finalUrl) return null;
  return { headlines, descriptions, finalUrl };
}

function parseAdGroup(raw: unknown, index: number): LocalAdGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) throw validationError(`Ad group ${index + 1} needs a name.`);
  const ads = Array.isArray(row.ads) ? row.ads.map(parseAd) : [];
  if (ads.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one local ad.`);
  }
  const defaultBidMicros = Number(row.defaultBidMicros);
  return {
    name,
    defaultBidMicros:
      Number.isFinite(defaultBidMicros) && defaultBidMicros >= MIN_BID_MICROS
        ? Math.trunc(defaultBidMicros)
        : 1_000_000,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    ads,
  };
}

function parseAdGroupLoose(raw: unknown, index: number): LocalAdGroupInput | null {
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
    ads: Array.isArray(row.ads)
      ? row.ads.map(parseAdLoose).filter((item): item is LocalAdInput => Boolean(item))
      : [],
  };
}

function parseTarget(raw: unknown): LocalTargetInput {
  const row = asRecord(raw);
  const type = parseEnum(row.type, LOCAL_TARGET_TYPES, "GEO", "target type");
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

function parseTargetLoose(raw: unknown): LocalTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(LOCAL_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as LocalTargetTypeValue,
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

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseLocalDraftTree. */
export function parseLocalDraftWrite(body: unknown): LocalDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled Local draft";
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
    biddingStrategy: parseEnumLoose(raw.biddingStrategy, LOCAL_BIDDING_STRATEGIES, "MAXIMIZE_CONVERSIONS"),
    goal: parseEnumLoose(raw.goal, LOCAL_GOALS, "STORE_VISITS"),
    targetCpaMicros: parseOptionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText),
    businessName: optionalString(raw.businessName),
    finalUrl: optionalString(raw.finalUrl),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    locations: Array.isArray(raw.locations)
      ? raw.locations.map(parseLocationLoose).filter((item): item is LocalLocationInput => Boolean(item))
      : [],
    adGroups: Array.isArray(raw.adGroups)
      ? raw.adGroups.map(parseAdGroupLoose).filter((item): item is LocalAdGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is LocalTargetInput => Boolean(item))
      : [],
  };
}

export function parseLocalDraftTree(body: unknown): LocalDraftTree {
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

  const biddingStrategy = parseEnum(raw.biddingStrategy, LOCAL_BIDDING_STRATEGIES, "MAXIMIZE_CONVERSIONS", "bidding strategy");
  if (biddingStrategy !== "MAXIMIZE_CONVERSIONS") {
    throw validationError(
      `${biddingStrategy} is schema-ready but not applied in Local MVP.`,
      "Use MAXIMIZE_CONVERSIONS. Target CPA / tROAS stay stored for later phases.",
    );
  }

  const goal = parseEnum(raw.goal, LOCAL_GOALS, "STORE_VISITS", "goal");
  if (goal !== "STORE_VISITS") {
    throw validationError(
      `${goal} is schema-ready but not applied in Local MVP.`,
      "MVP applies STORE_VISITS. Store sales stay stored for later.",
    );
  }

  const locations = Array.isArray(raw.locations) ? raw.locations.map(parseLocation) : [];
  const included = locations.filter((item) => item.included && (item.placeIdText || item.addressText || item.valueText));
  if (included.length === 0) {
    throw validationError(
      "At least one included store location is required.",
      "Add a Google Business Profile, Place ID, or address.",
    );
  }

  const adGroups = Array.isArray(raw.adGroups) ? raw.adGroups.map(parseAdGroup) : [];
  if (adGroups.length === 0) {
    throw validationError("At least one ad group is required.");
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
    goal,
    targetCpaMicros: parseOptionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText),
    businessName: optionalString(raw.businessName),
    finalUrl: optionalString(raw.finalUrl),
    startDate,
    endDate,
    notesText: optionalString(raw.notesText),
    locations,
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

export function primaryLocalLocation(locations: LocalLocationInput[]): LocalLocationInput {
  const included = locations.filter((item) => item.included && (item.placeIdText || item.addressText || item.valueText));
  return included.find((item) => item.kind === "PLACE_ID" && item.placeIdText) ?? included[0];
}

export function buildLocalDraftMutate(tree: LocalDraftTree, validateOnly: boolean): MutateRequest {
  const customerId = digitsOnly(tree.customerId);
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  const campaignResourceName = `customers/${customerId}/campaigns/-2`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const primary = primaryLocalLocation(tree.locations);
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
          advertisingChannelType: "LOCAL",
          advertisingChannelSubType: "LOCAL_CAMPAIGN",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          maximizeConversions: {},
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

  if (primary.placeIdText) {
    mutateOperations.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResourceName,
          proximity: {
            address: {
              streetAddress: primary.addressText || primary.valueText,
              placeId: primary.placeIdText,
            },
            radius: 10,
            radiusUnits: "MILES",
          },
        },
      },
    });
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
          cpcBidMicros: String(group.defaultBidMicros),
        },
      },
    });

    for (const ad of group.ads) {
      mutateOperations.push({
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "PAUSED",
            ad: {
              finalUrls: [ad.finalUrl || tree.finalUrl || "https://adrunr.app"],
              localAd: {
                headlines: ad.headlines.map((text) => ({ text })),
                descriptions: ad.descriptions.map((text) => ({ text })),
              },
            },
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

export function extractLocalResourceNames(response: unknown): {
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

export function defaultLocalDraftTree(partial?: Partial<LocalDraftTree>): LocalDraftTree {
  return {
    customerId: partial?.customerId ?? "",
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused Local",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "MAXIMIZE_CONVERSIONS",
    goal: "STORE_VISITS",
    targetCpaMicros: partial?.targetCpaMicros ?? null,
    targetRoasText: partial?.targetRoasText ?? null,
    businessName: partial?.businessName ?? "Adrunr Local",
    finalUrl: partial?.finalUrl ?? "https://adrunr.app",
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    notesText: partial?.notesText ?? null,
    locations: partial?.locations ?? [
      {
        kind: "PLACE_ID",
        valueText: "Adrunr store",
        placeIdText: DEFAULT_LOCAL_PLACE_ID,
        addressText: "1 Market St, San Francisco, CA",
        included: true,
        sortOrder: 0,
      },
    ],
    adGroups: partial?.adGroups ?? [
      {
        name: "Store visits 1",
        defaultBidMicros: 1_000_000,
        sortOrder: 0,
        ads: [
          {
            headlines: ["Visit the store", "Find us nearby", "Local pickup"],
            descriptions: [
              "Store-visit Local ads stay PAUSED until you apply from the form.",
              "Locations + geo — validate the full tree first.",
            ],
            finalUrl: "https://adrunr.app",
          },
        ],
      },
    ],
    targets: partial?.targets ?? [
      { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
    ],
  };
}
