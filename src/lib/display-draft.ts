import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";

export const DISPLAY_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const DISPLAY_BIDDING_STRATEGIES = [
  "MANUAL_CPC",
  "MAXIMIZE_CLICKS",
  "MAXIMIZE_CONVERSIONS",
  "TARGET_CPA",
  "TARGET_ROAS",
] as const;
export const DISPLAY_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const DISPLAY_AUDIENCE_KINDS = ["USER_LIST", "AFFINITY", "IN_MARKET", "CUSTOM"] as const;
export const DISPLAY_ASSET_KINDS = [
  "MARKETING_IMAGE",
  "SQUARE_MARKETING_IMAGE",
  "LOGO",
  "YOUTUBE_VIDEO",
] as const;

export type DisplayDraftStatusValue = (typeof DISPLAY_DRAFT_STATUSES)[number];
export type DisplayBiddingStrategyValue = (typeof DISPLAY_BIDDING_STRATEGIES)[number];
export type DisplayTargetTypeValue = (typeof DISPLAY_TARGET_TYPES)[number];
export type DisplayAudienceKindValue = (typeof DISPLAY_AUDIENCE_KINDS)[number];
export type DisplayAssetKindValue = (typeof DISPLAY_ASSET_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;
export const DISPLAY_HEADLINE_MIN = 1;
export const DISPLAY_HEADLINE_MAX = 5;
export const DISPLAY_HEADLINE_CHAR_MAX = 30;
export const DISPLAY_LONG_HEADLINE_CHAR_MAX = 90;
export const DISPLAY_DESCRIPTION_MIN = 1;
export const DISPLAY_DESCRIPTION_MAX = 5;
export const DISPLAY_DESCRIPTION_CHAR_MAX = 90;
export const DISPLAY_BUSINESS_NAME_CHAR_MAX = 25;

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList };

export const AUDIENCE_PRESETS = [
  {
    kind: "USER_LIST" as const,
    valueText: "Website visitors (remarketing)",
    listSuffix: "111",
  },
  {
    kind: "USER_LIST" as const,
    valueText: "Cart abandoners (remarketing)",
    listSuffix: "222",
  },
  {
    kind: "USER_LIST" as const,
    valueText: "Past converters (remarketing)",
    listSuffix: "333",
  },
] as const;

export const DEFAULT_MARKETING_IMAGE = "https://placehold.co/1200x628/png?text=Display";
export const DEFAULT_SQUARE_IMAGE = "https://placehold.co/300x300/png?text=Square";
export const DEFAULT_LOGO_IMAGE = "https://placehold.co/128x128/png?text=Logo";

/** 1x1 PNG — structural placeholder when live bytes are not fetched. */
export const PLACEHOLDER_IMAGE_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export type DisplayAssetInput = {
  kind: DisplayAssetKindValue;
  urlText: string;
  sortOrder?: number;
};

export type DisplayAdInput = {
  headlines: string[];
  longHeadline: string;
  descriptions: string[];
  businessName: string;
  finalUrl: string;
  assets: DisplayAssetInput[];
};

export type DisplayAdGroupInput = {
  name: string;
  defaultBidMicros: number;
  sortOrder: number;
  ads: DisplayAdInput[];
};

export type DisplayTargetInput = {
  type: DisplayTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type DisplayAudienceInput = {
  kind: DisplayAudienceKindValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type DisplayDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: DisplayBiddingStrategyValue;
  enhancedCpcEnabled: boolean;
  targetCpaMicros?: number | null;
  targetRoasText?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  adGroups: DisplayAdGroupInput[];
  targets: DisplayTargetInput[];
  audiences: DisplayAudienceInput[];
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

function parseBiddingStrategy(value: unknown): DisplayBiddingStrategyValue {
  const raw = String(value ?? "MANUAL_CPC").toUpperCase();
  if (!(DISPLAY_BIDDING_STRATEGIES as readonly string[]).includes(raw)) {
    throw validationError(
      `Unknown bidding strategy ${raw}.`,
      `MVP applies MANUAL_CPC. Schema also stores ${DISPLAY_BIDDING_STRATEGIES.join(", ")}.`,
    );
  }
  return raw as DisplayBiddingStrategyValue;
}

function parseTargetType(value: unknown): DisplayTargetTypeValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(DISPLAY_TARGET_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown target type ${raw}.`, `Use ${DISPLAY_TARGET_TYPES.join(", ")}.`);
  }
  return raw as DisplayTargetTypeValue;
}

function parseAudienceKind(value: unknown): DisplayAudienceKindValue {
  const raw = String(value ?? "USER_LIST").toUpperCase();
  if (!(DISPLAY_AUDIENCE_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown audience kind ${raw}.`, `Use ${DISPLAY_AUDIENCE_KINDS.join(", ")}.`);
  }
  return raw as DisplayAudienceKindValue;
}

function parseAssetKind(value: unknown): DisplayAssetKindValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(DISPLAY_ASSET_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown asset kind ${raw}.`, `Use ${DISPLAY_ASSET_KINDS.join(", ")}.`);
  }
  return raw as DisplayAssetKindValue;
}

function parseHeadlines(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < DISPLAY_HEADLINE_MIN || items.length > DISPLAY_HEADLINE_MAX) {
    throw validationError(
      `Responsive display ads need ${DISPLAY_HEADLINE_MIN}–${DISPLAY_HEADLINE_MAX} headlines.`,
      `Each headline is at most ${DISPLAY_HEADLINE_CHAR_MAX} characters.`,
    );
  }
  for (const headline of items) {
    if (headline.length > DISPLAY_HEADLINE_CHAR_MAX) {
      throw validationError(`Headline exceeds ${DISPLAY_HEADLINE_CHAR_MAX} characters: "${headline.slice(0, 24)}…"`);
    }
  }
  return items;
}

function parseDescriptions(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < DISPLAY_DESCRIPTION_MIN || items.length > DISPLAY_DESCRIPTION_MAX) {
    throw validationError(
      `Responsive display ads need ${DISPLAY_DESCRIPTION_MIN}–${DISPLAY_DESCRIPTION_MAX} descriptions.`,
      `Each description is at most ${DISPLAY_DESCRIPTION_CHAR_MAX} characters.`,
    );
  }
  for (const description of items) {
    if (description.length > DISPLAY_DESCRIPTION_CHAR_MAX) {
      throw validationError(`Description exceeds ${DISPLAY_DESCRIPTION_CHAR_MAX} characters.`);
    }
  }
  return items;
}

function parseLongHeadline(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("longHeadline is required for each responsive display ad.");
  if (raw.length > DISPLAY_LONG_HEADLINE_CHAR_MAX) {
    throw validationError(`longHeadline must be at most ${DISPLAY_LONG_HEADLINE_CHAR_MAX} characters.`);
  }
  return raw;
}

function parseBusinessName(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("businessName is required for each responsive display ad.");
  if (raw.length > DISPLAY_BUSINESS_NAME_CHAR_MAX) {
    throw validationError(`businessName must be at most ${DISPLAY_BUSINESS_NAME_CHAR_MAX} characters.`);
  }
  return raw;
}

function parseFinalUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("finalUrl is required for each responsive display ad.");
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

function parseAssetUrl(value: unknown, kind: DisplayAssetKindValue): string {
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

function parseAsset(raw: unknown, index: number): DisplayAssetInput {
  const row = asRecord(raw);
  const kind = parseAssetKind(row.kind);
  return {
    kind,
    urlText: parseAssetUrl(row.urlText ?? row.url, kind),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAd(raw: unknown): DisplayAdInput {
  const row = asRecord(raw);
  const assets = Array.isArray(row.assets) ? row.assets.map(parseAsset) : [];
  const marketing = assets.filter((asset) => asset.kind === "MARKETING_IMAGE");
  const square = assets.filter((asset) => asset.kind === "SQUARE_MARKETING_IMAGE");
  if (marketing.length === 0) {
    throw validationError("Each responsive display ad needs at least one MARKETING_IMAGE asset.");
  }
  if (square.length === 0) {
    throw validationError("Each responsive display ad needs at least one SQUARE_MARKETING_IMAGE asset.");
  }
  return {
    headlines: parseHeadlines(row.headlines ?? row.headlinesText),
    longHeadline: parseLongHeadline(row.longHeadline),
    descriptions: parseDescriptions(row.descriptions ?? row.descriptionsText),
    businessName: parseBusinessName(row.businessName),
    finalUrl: parseFinalUrl(row.finalUrl),
    assets,
  };
}

function parseAdGroup(raw: unknown, index: number): DisplayAdGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  const defaultBidMicros = Number(row.defaultBidMicros);
  if (!name) throw validationError(`Ad group ${index + 1} needs a name.`);
  if (!Number.isFinite(defaultBidMicros) || defaultBidMicros < MIN_BID_MICROS) {
    throw validationError(`Ad group "${name}" defaultBidMicros must be >= ${MIN_BID_MICROS}.`);
  }
  const ads = Array.isArray(row.ads) ? row.ads.map(parseAd) : [];
  if (ads.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one responsive display ad.`);
  }
  return {
    name,
    defaultBidMicros: Math.trunc(defaultBidMicros),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    ads,
  };
}

function parseTarget(raw: unknown): DisplayTargetInput {
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

function parseAudience(raw: unknown): DisplayAudienceInput {
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

function parseAssetLoose(raw: unknown, index: number): DisplayAssetInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "").toUpperCase();
  if (!(DISPLAY_ASSET_KINDS as readonly string[]).includes(kindRaw)) return null;
  const urlText = optionalString(row.urlText ?? row.url);
  if (!urlText) return null;
  return {
    kind: kindRaw as DisplayAssetKindValue,
    urlText,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAdLoose(raw: unknown): DisplayAdInput {
  const row = asRecord(raw);
  const headlines = Array.isArray(row.headlines)
    ? row.headlines.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.headlinesText ?? row.headlines));
  const descriptions = Array.isArray(row.descriptions)
    ? row.descriptions.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.descriptionsText ?? row.descriptions));
  return {
    headlines,
    longHeadline: optionalString(row.longHeadline) ?? "",
    descriptions,
    businessName: optionalString(row.businessName) ?? "",
    finalUrl: optionalString(row.finalUrl) ?? "",
    assets: Array.isArray(row.assets)
      ? row.assets.map(parseAssetLoose).filter((item): item is DisplayAssetInput => Boolean(item))
      : [],
  };
}

function parseAdGroupLoose(raw: unknown, index: number): DisplayAdGroupInput | null {
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
    ads: Array.isArray(row.ads) ? row.ads.map(parseAdLoose) : [],
  };
}

function parseTargetLoose(raw: unknown): DisplayTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(DISPLAY_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as DisplayTargetTypeValue,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAudienceLoose(raw: unknown): DisplayAudienceInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "USER_LIST").toUpperCase();
  if (!(DISPLAY_AUDIENCE_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    kind: kindRaw as DisplayAudienceKindValue,
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

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseDisplayDraftTree. */
export function parseDisplayDraftWrite(body: unknown): DisplayDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled display draft";
  const dailyBudgetMicros = Number(raw.dailyBudgetMicros);
  if (!customerId && !optionalString(raw.externalAccountId)) {
    throw validationError("customerId or externalAccountId is required.", "Pick a Google Ads customer.");
  }
  assertPausedStatus(raw);
  const biddingStrategy = parseBiddingStrategy(raw.biddingStrategy);
  return {
    customerId,
    externalAccountId: optionalString(raw.externalAccountId) ?? undefined,
    name,
    dailyBudgetMicros:
      Number.isFinite(dailyBudgetMicros) && dailyBudgetMicros >= MIN_BUDGET_MICROS
        ? Math.trunc(dailyBudgetMicros)
        : 1_000_000,
    biddingStrategy,
    enhancedCpcEnabled: Boolean(raw.enhancedCpcEnabled),
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText ?? raw.targetRoas),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    adGroups: Array.isArray(raw.adGroups)
      ? raw.adGroups.map(parseAdGroupLoose).filter((item): item is DisplayAdGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is DisplayTargetInput => Boolean(item))
      : [],
    audiences: Array.isArray(raw.audiences)
      ? raw.audiences.map(parseAudienceLoose).filter((item): item is DisplayAudienceInput => Boolean(item))
      : [],
  };
}

export function parseDisplayDraftTree(body: unknown): DisplayDraftTree {
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
      `${biddingStrategy} is schema-ready but not applied in Display MVP.`,
      "Use MANUAL_CPC. tROAS / tCPA stay stored for later phases.",
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
        `${audience.kind} audiences are schema-ready but not applied in Display MVP.`,
        "Remarketing uses USER_LIST. Affinity / in-market stay stored for later.",
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
    enhancedCpcEnabled: Boolean(raw.enhancedCpcEnabled),
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText ?? raw.targetRoas),
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

export function buildDisplayDraftMutate(tree: DisplayDraftTree, validateOnly: boolean): MutateRequest {
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
          advertisingChannelType: "DISPLAY",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          manualCpc: { enhancedCpcEnabled: tree.enhancedCpcEnabled },
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
          status: "ENABLED",
          type: "DISPLAY_STANDARD",
          cpcBidMicros: String(group.defaultBidMicros),
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
                name: `display-video ${stamp} ${assetResourceName}`,
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
              name: `display-image ${asset.kind} ${stamp}`,
              type: "IMAGE",
              imageAsset: { data: PLACEHOLDER_IMAGE_PNG_B64 },
            },
          },
        });
        if (asset.kind === "MARKETING_IMAGE") marketing.push(assetResourceName);
        else if (asset.kind === "SQUARE_MARKETING_IMAGE") square.push(assetResourceName);
        else logos.push(assetResourceName);
      }

      mutateOperations.push({
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "PAUSED",
            ad: {
              finalUrls: [ad.finalUrl],
              responsiveDisplayAd: {
                headlines: ad.headlines.map((text) => ({ text })),
                longHeadline: { text: ad.longHeadline },
                descriptions: ad.descriptions.map((text) => ({ text })),
                businessName: ad.businessName,
                marketingImages: marketing.map((asset) => ({ asset })),
                squareMarketingImages: square.map((asset) => ({ asset })),
                ...(logos.length ? { logoImages: logos.map((asset) => ({ asset })) } : {}),
                ...(videos.length ? { youtubeVideos: videos.map((asset) => ({ asset })) } : {}),
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

export function extractDisplayResourceNames(response: unknown): {
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

export function defaultDisplayDraftTree(partial?: Partial<DisplayDraftTree>): DisplayDraftTree {
  const customerId = partial?.customerId ?? "";
  return {
    customerId,
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused display",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "MANUAL_CPC",
    enhancedCpcEnabled: false,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    adGroups: partial?.adGroups ?? [
      {
        name: "Display ad group 1",
        defaultBidMicros: 1_000_000,
        sortOrder: 0,
        ads: [
          {
            headlines: ["Adrunr Display Ads", "Paused Campaign Tools", "Ops, Not Autopilot"],
            longHeadline: "Create Display campaigns as PAUSED. Dry-run is the default path.",
            descriptions: [
              "Remarketing is a Display audience, not a separate campaign type.",
              "Validate the full tree before any Google Ads apply.",
            ],
            businessName: "Adrunr",
            finalUrl: "https://adrunr.app",
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
        valueText: "Website visitors (remarketing)",
        criterionText: customerId ? audienceCriterionForCustomer(customerId, "111") : "customers/0000000000/userLists/111",
        included: true,
      },
    ],
  };
}
