import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";
import { PLACEHOLDER_IMAGE_PNG_B64 } from "./display-draft";

export const DEMAND_GEN_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const DEMAND_GEN_BIDDING_STRATEGIES = [
  "MAXIMIZE_CONVERSIONS",
  "MAXIMIZE_CONVERSION_VALUE",
  "TARGET_CPA",
  "TARGET_ROAS",
] as const;
export const DEMAND_GEN_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const DEMAND_GEN_AUDIENCE_KINDS = ["USER_LIST", "AFFINITY", "IN_MARKET", "CUSTOM"] as const;
export const DEMAND_GEN_ASSET_KINDS = [
  "MARKETING_IMAGE",
  "SQUARE_MARKETING_IMAGE",
  "PORTRAIT_MARKETING_IMAGE",
  "LOGO",
  "YOUTUBE_VIDEO",
] as const;

export type DemandGenDraftStatusValue = (typeof DEMAND_GEN_DRAFT_STATUSES)[number];
export type DemandGenBiddingStrategyValue = (typeof DEMAND_GEN_BIDDING_STRATEGIES)[number];
export type DemandGenTargetTypeValue = (typeof DEMAND_GEN_TARGET_TYPES)[number];
export type DemandGenAudienceKindValue = (typeof DEMAND_GEN_AUDIENCE_KINDS)[number];
export type DemandGenAssetKindValue = (typeof DEMAND_GEN_ASSET_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;
export const DEMAND_GEN_HEADLINE_MIN = 3;
export const DEMAND_GEN_HEADLINE_MAX = 5;
export const DEMAND_GEN_HEADLINE_CHAR_MAX = 40;
export const DEMAND_GEN_DESCRIPTION_MIN = 1;
export const DEMAND_GEN_DESCRIPTION_MAX = 5;
export const DEMAND_GEN_DESCRIPTION_CHAR_MAX = 90;
export const DEMAND_GEN_BUSINESS_NAME_CHAR_MAX = 25;

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList, PLACEHOLDER_IMAGE_PNG_B64 };

export const AUDIENCE_PRESETS = [
  {
    kind: "USER_LIST" as const,
    valueText: "Website visitors (Demand Gen audience)",
    listSuffix: "111",
  },
  {
    kind: "USER_LIST" as const,
    valueText: "Cart abandoners (Demand Gen audience)",
    listSuffix: "222",
  },
  {
    kind: "USER_LIST" as const,
    valueText: "Past converters (Demand Gen audience)",
    listSuffix: "333",
  },
] as const;

export const DEFAULT_MARKETING_IMAGE = "https://placehold.co/1200x628/png?text=DemandGen";
export const DEFAULT_SQUARE_IMAGE = "https://placehold.co/300x300/png?text=Square";
export const DEFAULT_LOGO_IMAGE = "https://placehold.co/128x128/png?text=Logo";

export type DemandGenAssetInput = {
  kind: DemandGenAssetKindValue;
  urlText: string;
  sortOrder?: number;
};

export type DemandGenAdInput = {
  headlines: string[];
  descriptions: string[];
  businessName: string;
  finalUrl: string;
  callToActionText?: string | null;
  assets: DemandGenAssetInput[];
};

export type DemandGenAdGroupInput = {
  name: string;
  defaultBidMicros: number;
  sortOrder: number;
  ads: DemandGenAdInput[];
};

export type DemandGenTargetInput = {
  type: DemandGenTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type DemandGenAudienceInput = {
  kind: DemandGenAudienceKindValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type DemandGenDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: DemandGenBiddingStrategyValue;
  targetCpaMicros?: number | null;
  targetRoasText?: string | null;
  youtubeInStream: boolean;
  youtubeInFeed: boolean;
  youtubeShorts: boolean;
  discover: boolean;
  gmail: boolean;
  display: boolean;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  adGroups: DemandGenAdGroupInput[];
  targets: DemandGenTargetInput[];
  audiences: DemandGenAudienceInput[];
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

function optionalMicros(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseDate(value: unknown, label: string): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw validationError(`${label} must be YYYY-MM-DD.`, "Use an ISO date such as 2026-09-06.");
  }
  return raw;
}

function parseChannelFlag(value: unknown, fallback = true): boolean {
  if (value === false || value === "false" || value === 0) return false;
  if (value === true || value === "true" || value === 1) return true;
  return fallback;
}

function parseBiddingStrategy(value: unknown): DemandGenBiddingStrategyValue {
  const raw = String(value ?? "MAXIMIZE_CONVERSIONS").toUpperCase();
  if (!(DEMAND_GEN_BIDDING_STRATEGIES as readonly string[]).includes(raw)) {
    throw validationError(
      `Unknown bidding strategy ${raw}.`,
      `MVP applies MAXIMIZE_CONVERSIONS. Schema also stores ${DEMAND_GEN_BIDDING_STRATEGIES.join(", ")}.`,
    );
  }
  return raw as DemandGenBiddingStrategyValue;
}

function parseTargetType(value: unknown): DemandGenTargetTypeValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(DEMAND_GEN_TARGET_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown target type ${raw}.`, `Use ${DEMAND_GEN_TARGET_TYPES.join(", ")}.`);
  }
  return raw as DemandGenTargetTypeValue;
}

function parseAudienceKind(value: unknown): DemandGenAudienceKindValue {
  const raw = String(value ?? "USER_LIST").toUpperCase();
  if (!(DEMAND_GEN_AUDIENCE_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown audience kind ${raw}.`, `Use ${DEMAND_GEN_AUDIENCE_KINDS.join(", ")}.`);
  }
  return raw as DemandGenAudienceKindValue;
}

function parseAssetKind(value: unknown): DemandGenAssetKindValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(DEMAND_GEN_ASSET_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown asset kind ${raw}.`, `Use ${DEMAND_GEN_ASSET_KINDS.join(", ")}.`);
  }
  return raw as DemandGenAssetKindValue;
}

function parseHeadlines(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < DEMAND_GEN_HEADLINE_MIN || items.length > DEMAND_GEN_HEADLINE_MAX) {
    throw validationError(
      `Demand Gen ads need ${DEMAND_GEN_HEADLINE_MIN}–${DEMAND_GEN_HEADLINE_MAX} headlines.`,
      `Each headline is at most ${DEMAND_GEN_HEADLINE_CHAR_MAX} characters.`,
    );
  }
  for (const headline of items) {
    if (headline.length > DEMAND_GEN_HEADLINE_CHAR_MAX) {
      throw validationError(`Headline exceeds ${DEMAND_GEN_HEADLINE_CHAR_MAX} characters: "${headline.slice(0, 24)}…"`);
    }
  }
  return items;
}

function parseDescriptions(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < DEMAND_GEN_DESCRIPTION_MIN || items.length > DEMAND_GEN_DESCRIPTION_MAX) {
    throw validationError(
      `Demand Gen ads need ${DEMAND_GEN_DESCRIPTION_MIN}–${DEMAND_GEN_DESCRIPTION_MAX} descriptions.`,
      `Each description is at most ${DEMAND_GEN_DESCRIPTION_CHAR_MAX} characters.`,
    );
  }
  for (const description of items) {
    if (description.length > DEMAND_GEN_DESCRIPTION_CHAR_MAX) {
      throw validationError(`Description exceeds ${DEMAND_GEN_DESCRIPTION_CHAR_MAX} characters.`);
    }
  }
  return items;
}

function parseBusinessName(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("businessName is required for each Demand Gen ad.");
  if (raw.length > DEMAND_GEN_BUSINESS_NAME_CHAR_MAX) {
    throw validationError(`businessName must be at most ${DEMAND_GEN_BUSINESS_NAME_CHAR_MAX} characters.`);
  }
  return raw;
}

function parseFinalUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("finalUrl is required for each Demand Gen ad.");
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("protocol");
    }
  } catch {
    throw validationError("finalUrl must be an http(s) URL.");
  }
  return raw;
}

function parseAssetUrl(value: unknown, kind: DemandGenAssetKindValue): string {
  const raw = optionalString(value);
  if (!raw) throw validationError(`Asset URL is required for ${kind}.`);
  if (kind === "YOUTUBE_VIDEO") {
    if (!/^[A-Za-z0-9_-]{11}$/.test(raw) && !/youtube\.com|youtu\.be/i.test(raw)) {
      throw validationError("YouTube assets need a video URL or 11-character video id.");
    }
    return raw;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("protocol");
    }
  } catch {
    throw validationError(`${kind} urlText must be an http(s) URL.`);
  }
  return raw;
}

function parseAsset(raw: unknown, index: number): DemandGenAssetInput {
  const row = asRecord(raw);
  const kind = parseAssetKind(row.kind);
  return {
    kind,
    urlText: parseAssetUrl(row.urlText ?? row.url, kind),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAd(raw: unknown): DemandGenAdInput {
  const row = asRecord(raw);
  const assets = Array.isArray(row.assets) ? row.assets.map(parseAsset) : [];
  const marketing = assets.filter((asset) => asset.kind === "MARKETING_IMAGE");
  const square = assets.filter((asset) => asset.kind === "SQUARE_MARKETING_IMAGE");
  if (marketing.length === 0) {
    throw validationError("Each Demand Gen ad needs at least one MARKETING_IMAGE asset.");
  }
  if (square.length === 0) {
    throw validationError("Each Demand Gen ad needs at least one SQUARE_MARKETING_IMAGE asset.");
  }
  return {
    headlines: parseHeadlines(row.headlines ?? row.headlinesText),
    descriptions: parseDescriptions(row.descriptions ?? row.descriptionsText),
    businessName: parseBusinessName(row.businessName),
    finalUrl: parseFinalUrl(row.finalUrl),
    callToActionText: optionalString(row.callToActionText ?? row.callToAction),
    assets,
  };
}

function parseAdGroup(raw: unknown, index: number): DemandGenAdGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) throw validationError(`Ad group ${index + 1} needs a name.`);
  const ads = Array.isArray(row.ads) ? row.ads.map(parseAd) : [];
  if (ads.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one Demand Gen ad.`);
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

function parseTarget(raw: unknown): DemandGenTargetInput {
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

function parseAudience(raw: unknown): DemandGenAudienceInput {
  const row = asRecord(raw);
  const kind = parseAudienceKind(row.kind);
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) {
    throw validationError("Each audience needs valueText and criterionText.");
  }
  return {
    kind,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAssetLoose(raw: unknown, index: number): DemandGenAssetInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "").toUpperCase();
  if (!(DEMAND_GEN_ASSET_KINDS as readonly string[]).includes(kindRaw)) return null;
  const urlText = optionalString(row.urlText ?? row.url);
  if (!urlText) return null;
  return {
    kind: kindRaw as DemandGenAssetKindValue,
    urlText,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAdLoose(raw: unknown): DemandGenAdInput | null {
  const row = asRecord(raw);
  const headlines = Array.isArray(row.headlines)
    ? row.headlines.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.headlinesText ?? row.headlines));
  const descriptions = Array.isArray(row.descriptions)
    ? row.descriptions.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.descriptionsText ?? row.descriptions));
  const businessName = optionalString(row.businessName) ?? "";
  const finalUrl = optionalString(row.finalUrl) ?? "";
  if (!headlines.length && !descriptions.length && !businessName && !finalUrl && !Array.isArray(row.assets)) {
    return null;
  }
  return {
    headlines,
    descriptions,
    businessName,
    finalUrl,
    callToActionText: optionalString(row.callToActionText ?? row.callToAction),
    assets: Array.isArray(row.assets)
      ? row.assets.map(parseAssetLoose).filter((item): item is DemandGenAssetInput => Boolean(item))
      : [],
  };
}

function parseAdGroupLoose(raw: unknown, index: number): DemandGenAdGroupInput | null {
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
      ? row.ads.map(parseAdLoose).filter((item): item is DemandGenAdInput => Boolean(item))
      : [],
  };
}

function parseTargetLoose(raw: unknown): DemandGenTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(DEMAND_GEN_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as DemandGenTargetTypeValue,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAudienceLoose(raw: unknown): DemandGenAudienceInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "USER_LIST").toUpperCase();
  if (!(DEMAND_GEN_AUDIENCE_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    kind: kindRaw as DemandGenAudienceKindValue,
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

function channelFields(raw: Record<string, unknown>): Pick<
  DemandGenDraftTree,
  "youtubeInStream" | "youtubeInFeed" | "youtubeShorts" | "discover" | "gmail" | "display"
> {
  return {
    youtubeInStream: parseChannelFlag(raw.youtubeInStream),
    youtubeInFeed: parseChannelFlag(raw.youtubeInFeed),
    youtubeShorts: parseChannelFlag(raw.youtubeShorts),
    discover: parseChannelFlag(raw.discover),
    gmail: parseChannelFlag(raw.gmail),
    display: parseChannelFlag(raw.display),
  };
}

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseDemandGenDraftTree. */
export function parseDemandGenDraftWrite(body: unknown): DemandGenDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled Demand Gen draft";
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
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText ?? raw.targetRoas),
    ...channelFields(raw),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    adGroups: Array.isArray(raw.adGroups)
      ? raw.adGroups.map(parseAdGroupLoose).filter((item): item is DemandGenAdGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is DemandGenTargetInput => Boolean(item))
      : [],
    audiences: Array.isArray(raw.audiences)
      ? raw.audiences.map(parseAudienceLoose).filter((item): item is DemandGenAudienceInput => Boolean(item))
      : [],
  };
}

export function parseDemandGenDraftTree(body: unknown): DemandGenDraftTree {
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
  if (biddingStrategy !== "MAXIMIZE_CONVERSIONS") {
    throw validationError(
      `${biddingStrategy} is schema-ready but not applied in Demand Gen MVP.`,
      "Use MAXIMIZE_CONVERSIONS. tROAS / tCPA / max conversion value stay stored for later phases.",
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

  const audiences = Array.isArray(raw.audiences) ? raw.audiences.map(parseAudience) : [];
  for (const audience of audiences) {
    if (audience.kind !== "USER_LIST") {
      throw validationError(
        `${audience.kind} audiences are schema-ready but not applied in Demand Gen MVP.`,
        "Apply uses USER_LIST. Affinity / in-market stay stored for later.",
      );
    }
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
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText ?? raw.targetRoas),
    ...channelFields(raw),
    startDate,
    endDate,
    notesText: optionalString(raw.notesText),
    adGroups,
    targets,
    audiences,
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

export function audienceCriterionForCustomer(customerId: string, listSuffix: string): string {
  return `customers/${digitsOnly(customerId)}/userLists/${listSuffix}`;
}

export function buildDemandGenDraftMutate(tree: DemandGenDraftTree, validateOnly: boolean): MutateRequest {
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
          advertisingChannelType: "DEMAND_GEN",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          maximizeConversions: {},
          demandGenCampaignSettings: {
            upgradedTargeting: true,
            channelControls: {
              selectedChannels: {
                youtubeInStream: tree.youtubeInStream,
                youtubeInFeed: tree.youtubeInFeed,
                youtubeShorts: tree.youtubeShorts,
                discover: tree.discover,
                gmail: tree.gmail,
                display: tree.display,
              },
            },
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
        },
      },
    });

    for (const audience of tree.audiences) {
      if (audience.kind !== "USER_LIST") continue;
      mutateOperations.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "ENABLED",
            negative: !audience.included,
            userList: { userList: audience.criterionText },
          },
        },
      });
    }

    for (const ad of group.ads) {
      const marketing: string[] = [];
      const square: string[] = [];
      const portrait: string[] = [];
      const logos: string[] = [];
      const videos: string[] = [];

      for (const asset of ad.assets) {
        const assetResourceName = `customers/${customerId}/assets/${nextTemp}`;
        nextTemp -= 1;
        if (asset.kind === "YOUTUBE_VIDEO") {
          const videoId = extractYoutubeId(asset.urlText);
          mutateOperations.push({
            assetOperation: {
              create: {
                resourceName: assetResourceName,
                name: `demand-gen-video ${stamp} ${assetResourceName}`,
                type: "YOUTUBE_VIDEO",
                youtubeVideoAsset: { youtubeVideoId: videoId },
              },
            },
          });
          videos.push(assetResourceName);
          continue;
        }
        mutateOperations.push({
          assetOperation: {
            create: {
              resourceName: assetResourceName,
              name: `demand-gen-image ${asset.kind} ${stamp}`,
              type: "IMAGE",
              imageAsset: { data: PLACEHOLDER_IMAGE_PNG_B64 },
            },
          },
        });
        if (asset.kind === "MARKETING_IMAGE") marketing.push(assetResourceName);
        else if (asset.kind === "SQUARE_MARKETING_IMAGE") square.push(assetResourceName);
        else if (asset.kind === "PORTRAIT_MARKETING_IMAGE") portrait.push(assetResourceName);
        else logos.push(assetResourceName);
      }

      mutateOperations.push({
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "PAUSED",
            ad: {
              finalUrls: [ad.finalUrl],
              demandGenMultiAssetAd: {
                headlines: ad.headlines.map((text) => ({ text })),
                descriptions: ad.descriptions.map((text) => ({ text })),
                businessName: ad.businessName,
                marketingImages: marketing.map((asset) => ({ asset })),
                squareMarketingImages: square.map((asset) => ({ asset })),
                ...(portrait.length ? { portraitMarketingImages: portrait.map((asset) => ({ asset })) } : {}),
                ...(logos.length ? { logoImages: logos.map((asset) => ({ asset })) } : {}),
                ...(videos.length ? { videos: videos.map((asset) => ({ asset })) } : {}),
                ...(ad.callToActionText ? { callToActionText: ad.callToActionText } : {}),
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

function extractYoutubeId(value: string): string {
  const idOnly = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(idOnly)) return idOnly;
  try {
    const url = new URL(idOnly);
    if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "").slice(0, 11);
    const v = url.searchParams.get("v");
    if (v) return v;
  } catch {
    // fall through
  }
  return idOnly.slice(0, 11);
}

export function extractDemandGenResourceNames(response: unknown): {
  campaign?: string;
  adGroups: string[];
  criteria: string[];
  ads: string[];
  assets: string[];
} {
  const body = asRecord(response);
  const ops = Array.isArray(body.mutateOperationResponses)
    ? (body.mutateOperationResponses as Array<Record<string, unknown>>)
    : [];
  const adGroups: string[] = [];
  const criteria: string[] = [];
  const ads: string[] = [];
  const assets: string[] = [];
  let campaign: string | undefined;
  for (const op of ops) {
    const campaignResult = asRecord(op.campaignResult);
    if (typeof campaignResult.resourceName === "string") campaign = campaignResult.resourceName;
    const adGroupResult = asRecord(op.adGroupResult);
    if (typeof adGroupResult.resourceName === "string") adGroups.push(adGroupResult.resourceName);
    const criterionResult = asRecord(op.adGroupCriterionResult);
    if (typeof criterionResult.resourceName === "string") criteria.push(criterionResult.resourceName);
    const adResult = asRecord(op.adGroupAdResult);
    if (typeof adResult.resourceName === "string") ads.push(adResult.resourceName);
    const assetResult = asRecord(op.assetResult);
    if (typeof assetResult.resourceName === "string") assets.push(assetResult.resourceName);
  }
  return { campaign, adGroups, criteria, ads, assets };
}

export function defaultDemandGenDraftTree(partial?: Partial<DemandGenDraftTree>): DemandGenDraftTree {
  const customerId = partial?.customerId ?? "";
  return {
    customerId,
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused Demand Gen",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "MAXIMIZE_CONVERSIONS",
    youtubeInStream: partial?.youtubeInStream ?? true,
    youtubeInFeed: partial?.youtubeInFeed ?? true,
    youtubeShorts: partial?.youtubeShorts ?? true,
    discover: partial?.discover ?? true,
    gmail: partial?.gmail ?? true,
    display: partial?.display ?? true,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    adGroups: partial?.adGroups ?? [
      {
        name: "Demand Gen ad group 1",
        defaultBidMicros: 1_000_000,
        sortOrder: 0,
        ads: [
          {
            headlines: ["Adrunr Demand Gen Ads", "Paused Campaign Tools", "Ops, Not Autopilot"],
            descriptions: [
              "Demand Gen audiences stay on this draft — not a separate campaign type.",
              "Validate the full tree before any Google Ads apply.",
            ],
            businessName: "Adrunr",
            finalUrl: "https://adrunr.app",
            callToActionText: "LEARN_MORE",
            assets: [
              { kind: "MARKETING_IMAGE", urlText: DEFAULT_MARKETING_IMAGE, sortOrder: 0 },
              { kind: "SQUARE_MARKETING_IMAGE", urlText: DEFAULT_SQUARE_IMAGE, sortOrder: 1 },
              { kind: "LOGO", urlText: DEFAULT_LOGO_IMAGE, sortOrder: 2 },
            ],
          },
        ],
      },
    ],
    targets: partial?.targets ?? [
      { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
    ],
    audiences: partial?.audiences ?? [
      {
        kind: "USER_LIST",
        valueText: AUDIENCE_PRESETS[0].valueText,
        criterionText: customerId
          ? audienceCriterionForCustomer(customerId, AUDIENCE_PRESETS[0].listSuffix)
          : "customers/0000000000/userLists/111",
        included: true,
      },
    ],
  };
}
