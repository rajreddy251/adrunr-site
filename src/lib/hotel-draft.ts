import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";

export const HOTEL_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const HOTEL_BIDDING_STRATEGIES = ["PERCENT_CPC", "COMMISSION", "MANUAL_CPC", "TARGET_ROAS"] as const;
export const HOTEL_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const HOTEL_LISTING_KINDS = ["ALL_HOTELS", "UNIT"] as const;

export type HotelDraftStatusValue = (typeof HOTEL_DRAFT_STATUSES)[number];
export type HotelBiddingStrategyValue = (typeof HOTEL_BIDDING_STRATEGIES)[number];
export type HotelTargetTypeValue = (typeof HOTEL_TARGET_TYPES)[number];
export type HotelListingKindValue = (typeof HOTEL_LISTING_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;
export const MIN_PERCENT_CPC_CEILING_MICROS = 10_000;
export const DEFAULT_HOTEL_CENTER_ID = "123456789";

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList };

export type HotelListingInput = {
  kind: HotelListingKindValue;
  valueText: string;
  hotelIdText: string;
  included: boolean;
  sortOrder?: number;
};

export type HotelAdGroupInput = {
  name: string;
  defaultBidMicros: number;
  sortOrder: number;
  listings: HotelListingInput[];
};

export type HotelTargetInput = {
  type: HotelTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type HotelDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: HotelBiddingStrategyValue;
  hotelCenterId?: string | null;
  percentCpcCeilingMicros?: number | null;
  commissionRateText?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  adGroups: HotelAdGroupInput[];
  targets: HotelTargetInput[];
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

function parseHotelCenterId(value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  const digits = digitsOnly(raw);
  if (!digits) {
    throw validationError("hotelCenterId must be numeric.", "Use the Hotel Center account id.");
  }
  return digits;
}

function parseListingKind(value: unknown): HotelListingKindValue {
  const raw = String(value ?? "ALL_HOTELS").toUpperCase();
  if (!(HOTEL_LISTING_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown listing kind ${raw}.`, `Use ${HOTEL_LISTING_KINDS.join(", ")}.`);
  }
  return raw as HotelListingKindValue;
}

function parseTargetType(value: unknown): HotelTargetTypeValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(HOTEL_TARGET_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown target type ${raw}.`, `Use ${HOTEL_TARGET_TYPES.join(", ")}.`);
  }
  return raw as HotelTargetTypeValue;
}

function parseBiddingStrategy(value: unknown): HotelBiddingStrategyValue {
  const raw = String(value ?? "PERCENT_CPC").toUpperCase();
  if (!(HOTEL_BIDDING_STRATEGIES as readonly string[]).includes(raw)) {
    throw validationError(
      `Unknown bidding strategy ${raw}.`,
      `MVP applies PERCENT_CPC. Schema also stores ${HOTEL_BIDDING_STRATEGIES.join(", ")}.`,
    );
  }
  return raw as HotelBiddingStrategyValue;
}

function parseListing(raw: unknown, index: number): HotelListingInput {
  const row = asRecord(raw);
  const kind = parseListingKind(row.kind);
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  if (!valueText) throw validationError("Each hotel listing needs valueText.");
  return {
    kind,
    valueText,
    hotelIdText: String(row.hotelIdText ?? row.hotelId ?? "").trim(),
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAdGroup(raw: unknown, index: number): HotelAdGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) throw validationError(`Ad group ${index + 1} needs a name.`);
  const listings = Array.isArray(row.listings) ? row.listings.map(parseListing) : [];
  if (listings.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one hotel listing.`);
  }
  const defaultBidMicros = Number(row.defaultBidMicros);
  return {
    name,
    defaultBidMicros:
      Number.isFinite(defaultBidMicros) && defaultBidMicros >= MIN_BID_MICROS
        ? Math.trunc(defaultBidMicros)
        : 1_000_000,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    listings,
  };
}

function parseTarget(raw: unknown): HotelTargetInput {
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

function parseListingLoose(raw: unknown, index: number): HotelListingInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "ALL_HOTELS").toUpperCase();
  if (!(HOTEL_LISTING_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  if (!valueText) return null;
  return {
    kind: kindRaw as HotelListingKindValue,
    valueText,
    hotelIdText: String(row.hotelIdText ?? row.hotelId ?? "").trim(),
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAdGroupLoose(raw: unknown, index: number): HotelAdGroupInput | null {
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
    listings: Array.isArray(row.listings)
      ? row.listings.map(parseListingLoose).filter((item): item is HotelListingInput => Boolean(item))
      : [],
  };
}

function parseTargetLoose(raw: unknown): HotelTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(HOTEL_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as HotelTargetTypeValue,
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

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseHotelDraftTree. */
export function parseHotelDraftWrite(body: unknown): HotelDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled Hotel draft";
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
    hotelCenterId: parseHotelCenterId(raw.hotelCenterId),
    percentCpcCeilingMicros: parseOptionalMicros(raw.percentCpcCeilingMicros),
    commissionRateText: optionalString(raw.commissionRateText),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    adGroups: Array.isArray(raw.adGroups)
      ? raw.adGroups.map(parseAdGroupLoose).filter((item): item is HotelAdGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is HotelTargetInput => Boolean(item))
      : [],
  };
}

export function parseHotelDraftTree(body: unknown): HotelDraftTree {
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
  if (biddingStrategy !== "PERCENT_CPC") {
    throw validationError(
      `${biddingStrategy} is schema-ready but not applied in Hotel MVP.`,
      "Use PERCENT_CPC. Commission / Manual CPC / tROAS stay stored for later phases.",
    );
  }

  const hotelCenterId = parseHotelCenterId(raw.hotelCenterId);
  if (!hotelCenterId) {
    throw validationError(
      "hotelCenterId is required to validate or apply a Hotel campaign.",
      "Link the Hotel Center account id. Listings apply against that feed.",
    );
  }

  const percentCpcCeilingMicros = parseOptionalMicros(raw.percentCpcCeilingMicros);
  if (percentCpcCeilingMicros == null || percentCpcCeilingMicros < MIN_PERCENT_CPC_CEILING_MICROS) {
    throw validationError(
      `percentCpcCeilingMicros must be an integer >= ${MIN_PERCENT_CPC_CEILING_MICROS} for Hotel percent CPC.`,
      "Set a bid ceiling. The campaign still applies PAUSED.",
    );
  }

  const adGroups = Array.isArray(raw.adGroups) ? raw.adGroups.map(parseAdGroup) : [];
  if (adGroups.length === 0) {
    throw validationError("At least one ad group is required.");
  }
  for (const group of adGroups) {
    const allHotels = group.listings.filter((item) => item.kind === "ALL_HOTELS" && item.included);
    if (allHotels.length === 0) {
      throw validationError(
        `Ad group "${group.name}" needs an ALL_HOTELS listing.`,
        "UNIT hotel listings are schema-ready but not applied in Hotel MVP.",
      );
    }
    for (const listing of group.listings) {
      if (listing.kind !== "ALL_HOTELS") {
        throw validationError(
          `${listing.kind} hotel listings are schema-ready but not applied in Hotel MVP.`,
          "Apply uses ALL_HOTELS. UNIT stays stored for later.",
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
    hotelCenterId,
    percentCpcCeilingMicros,
    commissionRateText: optionalString(raw.commissionRateText),
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

export function buildHotelDraftMutate(tree: HotelDraftTree, validateOnly: boolean): MutateRequest {
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
          advertisingChannelType: "HOTEL",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          percentCpc: { cpcBidCeilingMicros: String(tree.percentCpcCeilingMicros ?? 2_000_000) },
          hotelSetting: { hotelCenterId: tree.hotelCenterId },
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
          type: "HOTEL_ADS",
          cpcBidMicros: String(group.defaultBidMicros),
        },
      },
    });

    for (const listing of group.listings) {
      if (listing.kind !== "ALL_HOTELS" || !listing.included) continue;
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

export function extractHotelResourceNames(response: unknown): {
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

export function defaultHotelDraftTree(partial?: Partial<HotelDraftTree>): HotelDraftTree {
  return {
    customerId: partial?.customerId ?? "",
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused Hotel",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "PERCENT_CPC",
    hotelCenterId: partial?.hotelCenterId ?? DEFAULT_HOTEL_CENTER_ID,
    percentCpcCeilingMicros: partial?.percentCpcCeilingMicros ?? 2_000_000,
    commissionRateText: partial?.commissionRateText ?? null,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    notesText: partial?.notesText ?? null,
    adGroups: partial?.adGroups ?? [
      {
        name: "Hotel listing group 1",
        defaultBidMicros: 1_000_000,
        sortOrder: 0,
        listings: [
          {
            kind: "ALL_HOTELS",
            valueText: "All hotels",
            hotelIdText: "",
            included: true,
            sortOrder: 0,
          },
        ],
      },
    ],
    targets: partial?.targets ?? [
      { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
    ],
  };
}
