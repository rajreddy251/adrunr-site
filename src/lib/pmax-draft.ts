import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";
import { PLACEHOLDER_IMAGE_PNG_B64 } from "./display-draft";

export const PMAX_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const PMAX_BIDDING_STRATEGIES = [
  "MAXIMIZE_CONVERSIONS",
  "MAXIMIZE_CONVERSION_VALUE",
  "TARGET_CPA",
  "TARGET_ROAS",
] as const;
export const PMAX_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const PMAX_SIGNAL_KINDS = ["SEARCH_THEME", "USER_LIST", "CUSTOM"] as const;
export const PMAX_ASSET_KINDS = [
  "MARKETING_IMAGE",
  "SQUARE_MARKETING_IMAGE",
  "PORTRAIT_MARKETING_IMAGE",
  "LOGO",
  "LANDSCAPE_LOGO",
  "YOUTUBE_VIDEO",
] as const;
export const PMAX_LISTING_KINDS = ["ALL_PRODUCTS", "UNIT"] as const;

export type PmaxDraftStatusValue = (typeof PMAX_DRAFT_STATUSES)[number];
export type PmaxBiddingStrategyValue = (typeof PMAX_BIDDING_STRATEGIES)[number];
export type PmaxTargetTypeValue = (typeof PMAX_TARGET_TYPES)[number];
export type PmaxSignalKindValue = (typeof PMAX_SIGNAL_KINDS)[number];
export type PmaxAssetKindValue = (typeof PMAX_ASSET_KINDS)[number];
export type PmaxListingKindValue = (typeof PMAX_LISTING_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const PMAX_HEADLINE_MIN = 3;
export const PMAX_HEADLINE_MAX = 15;
export const PMAX_HEADLINE_CHAR_MAX = 30;
export const PMAX_LONG_HEADLINE_MIN = 1;
export const PMAX_LONG_HEADLINE_MAX = 5;
export const PMAX_LONG_HEADLINE_CHAR_MAX = 90;
export const PMAX_DESCRIPTION_MIN = 2;
export const PMAX_DESCRIPTION_MAX = 5;
export const PMAX_DESCRIPTION_CHAR_MAX = 90;
export const PMAX_BUSINESS_NAME_CHAR_MAX = 25;
export const PMAX_SEARCH_THEME_CHAR_MAX = 80;

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList, PLACEHOLDER_IMAGE_PNG_B64 };

export const DEFAULT_MARKETING_IMAGE = "https://placehold.co/1200x628/png?text=PMax";
export const DEFAULT_SQUARE_IMAGE = "https://placehold.co/300x300/png?text=Square";
export const DEFAULT_LOGO_IMAGE = "https://placehold.co/128x128/png?text=Logo";

export const SIGNAL_PRESETS = [
  { kind: "SEARCH_THEME" as const, valueText: "paused campaign tools", criterionText: "paused campaign tools" },
  { kind: "SEARCH_THEME" as const, valueText: "performance max draft", criterionText: "performance max draft" },
] as const;

export type PmaxAssetInput = {
  kind: PmaxAssetKindValue;
  urlText: string;
  sortOrder?: number;
};

export type PmaxListingInput = {
  kind: PmaxListingKindValue;
  valueText: string;
  dimensionText: string;
  included: boolean;
};

export type PmaxAssetGroupInput = {
  name: string;
  finalUrl: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  businessName: string;
  sortOrder: number;
  assets: PmaxAssetInput[];
  listings: PmaxListingInput[];
};

export type PmaxTargetInput = {
  type: PmaxTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type PmaxSignalInput = {
  kind: PmaxSignalKindValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type PmaxDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: PmaxBiddingStrategyValue;
  targetCpaMicros?: number | null;
  targetRoasText?: string | null;
  urlExpansionOptOut: boolean;
  brandGuidelinesEnabled: boolean;
  merchantCenterId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  assetGroups: PmaxAssetGroupInput[];
  targets: PmaxTargetInput[];
  signals: PmaxSignalInput[];
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

function parseBiddingStrategy(value: unknown): PmaxBiddingStrategyValue {
  const raw = String(value ?? "MAXIMIZE_CONVERSIONS").toUpperCase();
  if (!(PMAX_BIDDING_STRATEGIES as readonly string[]).includes(raw)) {
    throw validationError(
      `Unknown bidding strategy ${raw}.`,
      `MVP applies MAXIMIZE_CONVERSIONS. Schema also stores ${PMAX_BIDDING_STRATEGIES.join(", ")}.`,
    );
  }
  return raw as PmaxBiddingStrategyValue;
}

function parseTargetType(value: unknown): PmaxTargetTypeValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(PMAX_TARGET_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown target type ${raw}.`, `Use ${PMAX_TARGET_TYPES.join(", ")}.`);
  }
  return raw as PmaxTargetTypeValue;
}

function parseSignalKind(value: unknown): PmaxSignalKindValue {
  const raw = String(value ?? "SEARCH_THEME").toUpperCase();
  if (!(PMAX_SIGNAL_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown signal kind ${raw}.`, `Use ${PMAX_SIGNAL_KINDS.join(", ")}.`);
  }
  return raw as PmaxSignalKindValue;
}

function parseAssetKind(value: unknown): PmaxAssetKindValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(PMAX_ASSET_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown asset kind ${raw}.`, `Use ${PMAX_ASSET_KINDS.join(", ")}.`);
  }
  return raw as PmaxAssetKindValue;
}

function parseListingKind(value: unknown): PmaxListingKindValue {
  const raw = String(value ?? "ALL_PRODUCTS").toUpperCase();
  if (!(PMAX_LISTING_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown listing kind ${raw}.`, `Use ${PMAX_LISTING_KINDS.join(", ")}.`);
  }
  return raw as PmaxListingKindValue;
}

function parseTextList(
  raw: unknown,
  opts: { min: number; max: number; charMax: number; label: string },
): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < opts.min || items.length > opts.max) {
    throw validationError(
      `Performance Max ${opts.label} need ${opts.min}–${opts.max} items.`,
      `Each is at most ${opts.charMax} characters.`,
    );
  }
  for (const item of items) {
    if (item.length > opts.charMax) {
      throw validationError(`${opts.label} exceeds ${opts.charMax} characters: "${item.slice(0, 24)}…"`);
    }
  }
  return items;
}

function parseBusinessName(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("businessName is required for each asset group.");
  if (raw.length > PMAX_BUSINESS_NAME_CHAR_MAX) {
    throw validationError(`businessName must be at most ${PMAX_BUSINESS_NAME_CHAR_MAX} characters.`);
  }
  return raw;
}

function parseFinalUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("finalUrl is required for each asset group.");
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

function parseAssetUrl(value: unknown, kind: PmaxAssetKindValue): string {
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

function parseAsset(raw: unknown, index: number): PmaxAssetInput {
  const row = asRecord(raw);
  const kind = parseAssetKind(row.kind);
  return {
    kind,
    urlText: parseAssetUrl(row.urlText ?? row.url, kind),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseListing(raw: unknown): PmaxListingInput {
  const row = asRecord(raw);
  const kind = parseListingKind(row.kind);
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const dimensionText = String(row.dimensionText ?? row.dimension ?? "").trim();
  if (!valueText) {
    throw validationError("Each listing needs valueText.");
  }
  return {
    kind,
    valueText,
    dimensionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAssetGroup(raw: unknown, index: number): PmaxAssetGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) throw validationError(`Asset group ${index + 1} needs a name.`);
  const assets = Array.isArray(row.assets) ? row.assets.map(parseAsset) : [];
  const marketing = assets.filter((asset) => asset.kind === "MARKETING_IMAGE");
  const square = assets.filter((asset) => asset.kind === "SQUARE_MARKETING_IMAGE");
  if (marketing.length === 0) {
    throw validationError(`Asset group "${name}" needs at least one MARKETING_IMAGE asset.`);
  }
  if (square.length === 0) {
    throw validationError(`Asset group "${name}" needs at least one SQUARE_MARKETING_IMAGE asset.`);
  }
  return {
    name,
    finalUrl: parseFinalUrl(row.finalUrl),
    headlines: parseTextList(row.headlines ?? row.headlinesText, {
      min: PMAX_HEADLINE_MIN,
      max: PMAX_HEADLINE_MAX,
      charMax: PMAX_HEADLINE_CHAR_MAX,
      label: "headlines",
    }),
    longHeadlines: parseTextList(row.longHeadlines ?? row.longHeadlinesText, {
      min: PMAX_LONG_HEADLINE_MIN,
      max: PMAX_LONG_HEADLINE_MAX,
      charMax: PMAX_LONG_HEADLINE_CHAR_MAX,
      label: "long headlines",
    }),
    descriptions: parseTextList(row.descriptions ?? row.descriptionsText, {
      min: PMAX_DESCRIPTION_MIN,
      max: PMAX_DESCRIPTION_MAX,
      charMax: PMAX_DESCRIPTION_CHAR_MAX,
      label: "descriptions",
    }),
    businessName: parseBusinessName(row.businessName),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    assets,
    listings: Array.isArray(row.listings) ? row.listings.map(parseListing) : [],
  };
}

function parseTarget(raw: unknown): PmaxTargetInput {
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

function parseSignal(raw: unknown): PmaxSignalInput {
  const row = asRecord(raw);
  const kind = parseSignalKind(row.kind);
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? valueText).trim();
  if (!valueText || !criterionText) {
    throw validationError("Each signal needs valueText and criterionText.");
  }
  if (kind === "SEARCH_THEME" && criterionText.length > PMAX_SEARCH_THEME_CHAR_MAX) {
    throw validationError(`Search theme exceeds ${PMAX_SEARCH_THEME_CHAR_MAX} characters.`);
  }
  return {
    kind,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAssetLoose(raw: unknown, index: number): PmaxAssetInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "").toUpperCase();
  if (!(PMAX_ASSET_KINDS as readonly string[]).includes(kindRaw)) return null;
  const urlText = optionalString(row.urlText ?? row.url);
  if (!urlText) return null;
  return {
    kind: kindRaw as PmaxAssetKindValue,
    urlText,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseListingLoose(raw: unknown): PmaxListingInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "ALL_PRODUCTS").toUpperCase();
  if (!(PMAX_LISTING_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  if (!valueText) return null;
  return {
    kind: kindRaw as PmaxListingKindValue,
    valueText,
    dimensionText: String(row.dimensionText ?? row.dimension ?? "").trim(),
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAssetGroupLoose(raw: unknown, index: number): PmaxAssetGroupInput | null {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) return null;
  const headlines = Array.isArray(row.headlines)
    ? row.headlines.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.headlinesText ?? row.headlines));
  const longHeadlines = Array.isArray(row.longHeadlines)
    ? row.longHeadlines.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.longHeadlinesText ?? row.longHeadlines));
  const descriptions = Array.isArray(row.descriptions)
    ? row.descriptions.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.descriptionsText ?? row.descriptions));
  return {
    name,
    finalUrl: optionalString(row.finalUrl) ?? "",
    headlines,
    longHeadlines,
    descriptions,
    businessName: optionalString(row.businessName) ?? "",
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    assets: Array.isArray(row.assets)
      ? row.assets.map(parseAssetLoose).filter((item): item is PmaxAssetInput => Boolean(item))
      : [],
    listings: Array.isArray(row.listings)
      ? row.listings.map(parseListingLoose).filter((item): item is PmaxListingInput => Boolean(item))
      : [],
  };
}

function parseTargetLoose(raw: unknown): PmaxTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(PMAX_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as PmaxTargetTypeValue,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseSignalLoose(raw: unknown): PmaxSignalInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "SEARCH_THEME").toUpperCase();
  if (!(PMAX_SIGNAL_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? valueText).trim();
  if (!valueText || !criterionText) return null;
  return {
    kind: kindRaw as PmaxSignalKindValue,
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

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parsePmaxDraftTree. */
export function parsePmaxDraftWrite(body: unknown): PmaxDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled Performance Max draft";
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
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText ?? raw.targetRoas),
    urlExpansionOptOut: Boolean(raw.urlExpansionOptOut),
    brandGuidelinesEnabled: Boolean(raw.brandGuidelinesEnabled),
    merchantCenterId: optionalString(raw.merchantCenterId),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    assetGroups: Array.isArray(raw.assetGroups)
      ? raw.assetGroups.map(parseAssetGroupLoose).filter((item): item is PmaxAssetGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is PmaxTargetInput => Boolean(item))
      : [],
    signals: Array.isArray(raw.signals)
      ? raw.signals.map(parseSignalLoose).filter((item): item is PmaxSignalInput => Boolean(item))
      : [],
  };
}

export function parsePmaxDraftTree(body: unknown): PmaxDraftTree {
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
      `${biddingStrategy} is schema-ready but not applied in Performance Max MVP.`,
      "Use MAXIMIZE_CONVERSIONS. tROAS / tCPA / max conversion value stay stored for later phases.",
    );
  }

  const assetGroups = Array.isArray(raw.assetGroups) ? raw.assetGroups.map(parseAssetGroup) : [];
  if (assetGroups.length === 0) {
    throw validationError("At least one asset group is required.");
  }

  const targets = Array.isArray(raw.targets) ? raw.targets.map(parseTarget) : [];
  const geos = targets.filter((target) => target.type === "GEO");
  if (geos.length === 0) {
    throw validationError("At least one GEO target is required.", "United States (geoTargetConstants/2840) is the usual default.");
  }

  const signals = Array.isArray(raw.signals) ? raw.signals.map(parseSignal) : [];
  for (const signal of signals) {
    if (signal.kind !== "SEARCH_THEME") {
      throw validationError(
        `${signal.kind} signals are schema-ready but not applied in Performance Max MVP.`,
        "Apply uses SEARCH_THEME. USER_LIST / CUSTOM stay stored for later.",
      );
    }
  }

  for (const group of assetGroups) {
    for (const listing of group.listings) {
      if (listing.kind !== "ALL_PRODUCTS") {
        throw validationError(
          `${listing.kind} listings are schema-ready but not applied in Performance Max MVP.`,
          "ALL_PRODUCTS applies only when merchantCenterId is set. Sync listings is out of scope.",
        );
      }
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
    urlExpansionOptOut: Boolean(raw.urlExpansionOptOut),
    brandGuidelinesEnabled: Boolean(raw.brandGuidelinesEnabled),
    merchantCenterId: optionalString(raw.merchantCenterId),
    startDate,
    endDate,
    notesText: optionalString(raw.notesText),
    assetGroups,
    targets,
    signals,
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

export function buildPmaxDraftMutate(tree: PmaxDraftTree, validateOnly: boolean): MutateRequest {
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
          advertisingChannelType: "PERFORMANCE_MAX",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          maximizeConversions: {},
          urlExpansionOptOut: tree.urlExpansionOptOut,
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
  for (const group of tree.assetGroups) {
    const assetGroupResourceName = `customers/${customerId}/assetGroups/${nextTemp}`;
    nextTemp -= 1;
    mutateOperations.push({
      assetGroupOperation: {
        create: {
          resourceName: assetGroupResourceName,
          campaign: campaignResourceName,
          name: group.name,
          finalUrls: [group.finalUrl],
          status: "PAUSED",
        },
      },
    });

    const textAssets: Array<{ fieldType: string; text: string }> = [
      ...group.headlines.map((text) => ({ fieldType: "HEADLINE", text })),
      ...group.longHeadlines.map((text) => ({ fieldType: "LONG_HEADLINE", text })),
      ...group.descriptions.map((text) => ({ fieldType: "DESCRIPTION", text })),
      { fieldType: "BUSINESS_NAME", text: group.businessName },
    ];
    for (const textAsset of textAssets) {
      const assetResourceName = `customers/${customerId}/assets/${nextTemp}`;
      nextTemp -= 1;
      mutateOperations.push({
        assetOperation: {
          create: {
            resourceName: assetResourceName,
            name: `pmax-text ${textAsset.fieldType} ${stamp}`,
            type: "TEXT",
            textAsset: { text: textAsset.text },
          },
        },
      });
      mutateOperations.push({
        assetGroupAssetOperation: {
          create: {
            assetGroup: assetGroupResourceName,
            asset: assetResourceName,
            fieldType: textAsset.fieldType,
          },
        },
      });
    }

    for (const asset of group.assets) {
      const assetResourceName = `customers/${customerId}/assets/${nextTemp}`;
      nextTemp -= 1;
      if (asset.kind === "YOUTUBE_VIDEO") {
        const videoId = extractYoutubeId(asset.urlText);
        mutateOperations.push({
          assetOperation: {
            create: {
              resourceName: assetResourceName,
              name: `pmax-video ${stamp} ${assetResourceName}`,
              type: "YOUTUBE_VIDEO",
              youtubeVideoAsset: { youtubeVideoId: videoId },
            },
          },
        });
        mutateOperations.push({
          assetGroupAssetOperation: {
            create: {
              assetGroup: assetGroupResourceName,
              asset: assetResourceName,
              fieldType: "YOUTUBE_VIDEO",
            },
          },
        });
        continue;
      }
      mutateOperations.push({
        assetOperation: {
          create: {
            resourceName: assetResourceName,
            name: `pmax-image ${asset.kind} ${stamp}`,
            type: "IMAGE",
            imageAsset: { data: PLACEHOLDER_IMAGE_PNG_B64 },
          },
        },
      });
      mutateOperations.push({
        assetGroupAssetOperation: {
          create: {
            assetGroup: assetGroupResourceName,
            asset: assetResourceName,
            fieldType: asset.kind,
          },
        },
      });
    }

    for (const signal of tree.signals) {
      if (signal.kind !== "SEARCH_THEME" || !signal.included) continue;
      mutateOperations.push({
        assetGroupSignalOperation: {
          create: {
            assetGroup: assetGroupResourceName,
            searchTheme: { text: signal.criterionText },
          },
        },
      });
    }

    if (tree.merchantCenterId) {
      for (const listing of group.listings) {
        if (listing.kind !== "ALL_PRODUCTS" || !listing.included) continue;
        const listingResourceName = `customers/${customerId}/assetGroupListingGroupFilters/${nextTemp}`;
        nextTemp -= 1;
        mutateOperations.push({
          assetGroupListingGroupFilterOperation: {
            create: {
              resourceName: listingResourceName,
              assetGroup: assetGroupResourceName,
              type: "UNIT_INCLUDED",
            },
          },
        });
      }
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

export function extractPmaxResourceNames(response: unknown): {
  campaign?: string;
  assetGroups: string[];
  assets: string[];
  signals: string[];
  listings: string[];
} {
  const body = asRecord(response);
  const ops = Array.isArray(body.mutateOperationResponses)
    ? (body.mutateOperationResponses as Array<Record<string, unknown>>)
    : [];
  const assetGroups: string[] = [];
  const assets: string[] = [];
  const signals: string[] = [];
  const listings: string[] = [];
  let campaign: string | undefined;
  for (const op of ops) {
    const campaignResult = asRecord(op.campaignResult);
    if (typeof campaignResult.resourceName === "string") campaign = campaignResult.resourceName;
    const assetGroupResult = asRecord(op.assetGroupResult);
    if (typeof assetGroupResult.resourceName === "string") assetGroups.push(assetGroupResult.resourceName);
    const assetResult = asRecord(op.assetResult);
    if (typeof assetResult.resourceName === "string") assets.push(assetResult.resourceName);
    const signalResult = asRecord(op.assetGroupSignalResult);
    if (typeof signalResult.resourceName === "string") signals.push(signalResult.resourceName);
    const listingResult = asRecord(op.assetGroupListingGroupFilterResult);
    if (typeof listingResult.resourceName === "string") listings.push(listingResult.resourceName);
  }
  return { campaign, assetGroups, assets, signals, listings };
}

export function defaultPmaxDraftTree(partial?: Partial<PmaxDraftTree>): PmaxDraftTree {
  return {
    customerId: partial?.customerId ?? "",
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused Performance Max",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "MAXIMIZE_CONVERSIONS",
    urlExpansionOptOut: false,
    brandGuidelinesEnabled: false,
    merchantCenterId: partial?.merchantCenterId ?? null,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    assetGroups: partial?.assetGroups ?? [
      {
        name: "Performance Max asset group 1",
        finalUrl: "https://adrunr.app",
        headlines: ["Adrunr Performance Max", "Paused Campaign Tools", "Ops, Not Autopilot"],
        longHeadlines: ["Create Performance Max campaigns as PAUSED. Dry-run is the default path."],
        descriptions: [
          "Asset groups, search-theme signals, and optional listings stay on this draft.",
          "Validate the full tree before any Google Ads apply.",
        ],
        businessName: "Adrunr",
        sortOrder: 0,
        assets: [
          { kind: "MARKETING_IMAGE", urlText: DEFAULT_MARKETING_IMAGE, sortOrder: 0 },
          { kind: "SQUARE_MARKETING_IMAGE", urlText: DEFAULT_SQUARE_IMAGE, sortOrder: 1 },
          { kind: "LOGO", urlText: DEFAULT_LOGO_IMAGE, sortOrder: 2 },
        ],
        listings: [],
      },
    ],
    targets: partial?.targets ?? [
      { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
    ],
    signals: partial?.signals ?? [
      {
        kind: "SEARCH_THEME",
        valueText: SIGNAL_PRESETS[0].valueText,
        criterionText: SIGNAL_PRESETS[0].criterionText,
        included: true,
      },
    ],
  };
}
