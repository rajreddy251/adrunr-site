import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";
import { PLACEHOLDER_IMAGE_PNG_B64 } from "./display-draft";

export const VIDEO_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const VIDEO_BIDDING_STRATEGIES = [
  "MANUAL_CPV",
  "TARGET_CPM",
  "MAXIMIZE_CONVERSIONS",
  "TARGET_CPA",
] as const;
export const VIDEO_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const VIDEO_AUDIENCE_KINDS = ["USER_LIST", "AFFINITY", "IN_MARKET", "CUSTOM"] as const;
export const VIDEO_ASSET_KINDS = ["YOUTUBE_VIDEO", "COMPANION_BANNER", "MARKETING_IMAGE"] as const;

export type VideoDraftStatusValue = (typeof VIDEO_DRAFT_STATUSES)[number];
export type VideoBiddingStrategyValue = (typeof VIDEO_BIDDING_STRATEGIES)[number];
export type VideoTargetTypeValue = (typeof VIDEO_TARGET_TYPES)[number];
export type VideoAudienceKindValue = (typeof VIDEO_AUDIENCE_KINDS)[number];
export type VideoAssetKindValue = (typeof VIDEO_ASSET_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;
export const VIDEO_HEADLINE_MIN = 1;
export const VIDEO_HEADLINE_MAX = 5;
export const VIDEO_HEADLINE_CHAR_MAX = 30;
export const VIDEO_DESCRIPTION_MIN = 1;
export const VIDEO_DESCRIPTION_MAX = 5;
export const VIDEO_DESCRIPTION_CHAR_MAX = 90;
export const VIDEO_LONG_HEADLINE_CHAR_MAX = 90;

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList, PLACEHOLDER_IMAGE_PNG_B64 };

export const AUDIENCE_PRESETS = [
  {
    kind: "USER_LIST" as const,
    valueText: "Website visitors (Video audience)",
    listSuffix: "111",
  },
  {
    kind: "USER_LIST" as const,
    valueText: "Cart abandoners (Video audience)",
    listSuffix: "222",
  },
  {
    kind: "USER_LIST" as const,
    valueText: "Past converters (Video audience)",
    listSuffix: "333",
  },
] as const;

export const DEFAULT_YOUTUBE_VIDEO = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
export const DEFAULT_COMPANION_BANNER = "https://placehold.co/300x60/png?text=Companion";

export type VideoAssetInput = {
  kind: VideoAssetKindValue;
  urlText: string;
  sortOrder?: number;
};

export type VideoAdInput = {
  headlines: string[];
  descriptions: string[];
  longHeadline?: string | null;
  finalUrl: string;
  callToActionText?: string | null;
  assets: VideoAssetInput[];
};

export type VideoAdGroupInput = {
  name: string;
  defaultBidMicros: number;
  sortOrder: number;
  ads: VideoAdInput[];
};

export type VideoTargetInput = {
  type: VideoTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type VideoAudienceInput = {
  kind: VideoAudienceKindValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type VideoDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: VideoBiddingStrategyValue;
  maxCpvMicros?: number | null;
  targetCpmMicros?: number | null;
  targetCpaMicros?: number | null;
  inStream: boolean;
  bumper: boolean;
  inFeed: boolean;
  shorts: boolean;
  outstream: boolean;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  adGroups: VideoAdGroupInput[];
  targets: VideoTargetInput[];
  audiences: VideoAudienceInput[];
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

function parseFormatFlag(value: unknown, fallback: boolean): boolean {
  if (value === false || value === "false" || value === 0) return false;
  if (value === true || value === "true" || value === 1) return true;
  return fallback;
}

function parseBiddingStrategy(value: unknown): VideoBiddingStrategyValue {
  const raw = String(value ?? "MANUAL_CPV").toUpperCase();
  if (!(VIDEO_BIDDING_STRATEGIES as readonly string[]).includes(raw)) {
    throw validationError(
      `Unknown bidding strategy ${raw}.`,
      `MVP applies MANUAL_CPV. Schema also stores ${VIDEO_BIDDING_STRATEGIES.join(", ")}.`,
    );
  }
  return raw as VideoBiddingStrategyValue;
}

function parseTargetType(value: unknown): VideoTargetTypeValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(VIDEO_TARGET_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown target type ${raw}.`, `Use ${VIDEO_TARGET_TYPES.join(", ")}.`);
  }
  return raw as VideoTargetTypeValue;
}

function parseAudienceKind(value: unknown): VideoAudienceKindValue {
  const raw = String(value ?? "USER_LIST").toUpperCase();
  if (!(VIDEO_AUDIENCE_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown audience kind ${raw}.`, `Use ${VIDEO_AUDIENCE_KINDS.join(", ")}.`);
  }
  return raw as VideoAudienceKindValue;
}

function parseAssetKind(value: unknown): VideoAssetKindValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(VIDEO_ASSET_KINDS as readonly string[]).includes(raw)) {
    throw validationError(`Unknown asset kind ${raw}.`, `Use ${VIDEO_ASSET_KINDS.join(", ")}.`);
  }
  return raw as VideoAssetKindValue;
}

function parseHeadlines(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < VIDEO_HEADLINE_MIN || items.length > VIDEO_HEADLINE_MAX) {
    throw validationError(
      `Video ads need ${VIDEO_HEADLINE_MIN}–${VIDEO_HEADLINE_MAX} headlines.`,
      `Each headline is at most ${VIDEO_HEADLINE_CHAR_MAX} characters.`,
    );
  }
  for (const headline of items) {
    if (headline.length > VIDEO_HEADLINE_CHAR_MAX) {
      throw validationError(`Headline exceeds ${VIDEO_HEADLINE_CHAR_MAX} characters: "${headline.slice(0, 24)}…"`);
    }
  }
  return items;
}

function parseDescriptions(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < VIDEO_DESCRIPTION_MIN || items.length > VIDEO_DESCRIPTION_MAX) {
    throw validationError(
      `Video ads need ${VIDEO_DESCRIPTION_MIN}–${VIDEO_DESCRIPTION_MAX} descriptions.`,
      `Each description is at most ${VIDEO_DESCRIPTION_CHAR_MAX} characters.`,
    );
  }
  for (const description of items) {
    if (description.length > VIDEO_DESCRIPTION_CHAR_MAX) {
      throw validationError(`Description exceeds ${VIDEO_DESCRIPTION_CHAR_MAX} characters.`);
    }
  }
  return items;
}

function parseLongHeadline(value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  if (raw.length > VIDEO_LONG_HEADLINE_CHAR_MAX) {
    throw validationError(`longHeadline must be at most ${VIDEO_LONG_HEADLINE_CHAR_MAX} characters.`);
  }
  return raw;
}

function parseFinalUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("finalUrl is required for each Video ad.");
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

function parseAssetUrl(value: unknown, kind: VideoAssetKindValue): string {
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

function parseAsset(raw: unknown, index: number): VideoAssetInput {
  const row = asRecord(raw);
  const kind = parseAssetKind(row.kind);
  return {
    kind,
    urlText: parseAssetUrl(row.urlText ?? row.url, kind),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAd(raw: unknown): VideoAdInput {
  const row = asRecord(raw);
  const assets = Array.isArray(row.assets) ? row.assets.map(parseAsset) : [];
  const videos = assets.filter((asset) => asset.kind === "YOUTUBE_VIDEO");
  if (videos.length === 0) {
    throw validationError("Each Video ad needs at least one YOUTUBE_VIDEO asset.");
  }
  return {
    headlines: parseHeadlines(row.headlines ?? row.headlinesText),
    descriptions: parseDescriptions(row.descriptions ?? row.descriptionsText),
    longHeadline: parseLongHeadline(row.longHeadline ?? row.longHeadlines),
    finalUrl: parseFinalUrl(row.finalUrl),
    callToActionText: optionalString(row.callToActionText ?? row.callToAction),
    assets,
  };
}

function parseAdGroup(raw: unknown, index: number): VideoAdGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) throw validationError(`Ad group ${index + 1} needs a name.`);
  const ads = Array.isArray(row.ads) ? row.ads.map(parseAd) : [];
  if (ads.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one Video ad.`);
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

function parseTarget(raw: unknown): VideoTargetInput {
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

function parseAudience(raw: unknown): VideoAudienceInput {
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

function parseAssetLoose(raw: unknown, index: number): VideoAssetInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "").toUpperCase();
  if (!(VIDEO_ASSET_KINDS as readonly string[]).includes(kindRaw)) return null;
  const urlText = optionalString(row.urlText ?? row.url);
  if (!urlText) return null;
  return {
    kind: kindRaw as VideoAssetKindValue,
    urlText,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAdLoose(raw: unknown): VideoAdInput | null {
  const row = asRecord(raw);
  const headlines = Array.isArray(row.headlines)
    ? row.headlines.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.headlinesText ?? row.headlines));
  const descriptions = Array.isArray(row.descriptions)
    ? row.descriptions.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.descriptionsText ?? row.descriptions));
  const finalUrl = optionalString(row.finalUrl) ?? "";
  if (!headlines.length && !descriptions.length && !finalUrl && !Array.isArray(row.assets)) {
    return null;
  }
  return {
    headlines,
    descriptions,
    longHeadline: optionalString(row.longHeadline ?? row.longHeadlines),
    finalUrl,
    callToActionText: optionalString(row.callToActionText ?? row.callToAction),
    assets: Array.isArray(row.assets)
      ? row.assets.map(parseAssetLoose).filter((item): item is VideoAssetInput => Boolean(item))
      : [],
  };
}

function parseAdGroupLoose(raw: unknown, index: number): VideoAdGroupInput | null {
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
      ? row.ads.map(parseAdLoose).filter((item): item is VideoAdInput => Boolean(item))
      : [],
  };
}

function parseTargetLoose(raw: unknown): VideoTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(VIDEO_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as VideoTargetTypeValue,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseAudienceLoose(raw: unknown): VideoAudienceInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "USER_LIST").toUpperCase();
  if (!(VIDEO_AUDIENCE_KINDS as readonly string[]).includes(kindRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    kind: kindRaw as VideoAudienceKindValue,
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

function formatFields(raw: Record<string, unknown>): Pick<
  VideoDraftTree,
  "inStream" | "bumper" | "inFeed" | "shorts" | "outstream"
> {
  return {
    inStream: parseFormatFlag(raw.inStream, true),
    bumper: parseFormatFlag(raw.bumper, false),
    inFeed: parseFormatFlag(raw.inFeed, true),
    shorts: parseFormatFlag(raw.shorts, true),
    outstream: parseFormatFlag(raw.outstream, false),
  };
}

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseVideoDraftTree. */
export function parseVideoDraftWrite(body: unknown): VideoDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled Video draft";
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
    maxCpvMicros: optionalMicros(raw.maxCpvMicros),
    targetCpmMicros: optionalMicros(raw.targetCpmMicros),
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    ...formatFields(raw),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    adGroups: Array.isArray(raw.adGroups)
      ? raw.adGroups.map(parseAdGroupLoose).filter((item): item is VideoAdGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is VideoTargetInput => Boolean(item))
      : [],
    audiences: Array.isArray(raw.audiences)
      ? raw.audiences.map(parseAudienceLoose).filter((item): item is VideoAudienceInput => Boolean(item))
      : [],
  };
}

export function parseVideoDraftTree(body: unknown): VideoDraftTree {
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
  if (biddingStrategy !== "MANUAL_CPV") {
    throw validationError(
      `${biddingStrategy} is schema-ready but not applied in Video MVP.`,
      "Use MANUAL_CPV. Target CPM / Maximize conversions / tCPA stay stored for later phases.",
    );
  }

  const formats = formatFields(raw);
  if (!formats.inStream && !formats.bumper && !formats.inFeed && !formats.shorts && !formats.outstream) {
    throw validationError("At least one Video format must be enabled.", "Turn on In-stream, In-feed, or Shorts.");
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
        `${audience.kind} audiences are schema-ready but not applied in Video MVP.`,
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
    maxCpvMicros: optionalMicros(raw.maxCpvMicros),
    targetCpmMicros: optionalMicros(raw.targetCpmMicros),
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    ...formats,
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

export function extractYoutubeId(value: string): string {
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

export function buildVideoDraftMutate(tree: VideoDraftTree, validateOnly: boolean): MutateRequest {
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
          advertisingChannelType: "VIDEO",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          manualCpv: {},
          videoCampaignSettings: {
            videoAdInventoryControl: {
              allowInStream: tree.inStream,
              allowInFeed: tree.inFeed,
              allowShorts: tree.shorts,
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
      const videos: string[] = [];
      const companions: string[] = [];

      for (const asset of ad.assets) {
        const assetResourceName = `customers/${customerId}/assets/${nextTemp}`;
        nextTemp -= 1;
        if (asset.kind === "YOUTUBE_VIDEO") {
          const videoId = extractYoutubeId(asset.urlText);
          mutateOperations.push({
            assetOperation: {
              create: {
                resourceName: assetResourceName,
                name: `video ${stamp} ${assetResourceName}`,
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
              name: `video-image ${asset.kind} ${stamp}`,
              type: "IMAGE",
              imageAsset: { data: PLACEHOLDER_IMAGE_PNG_B64 },
            },
          },
        });
        companions.push(assetResourceName);
      }

      mutateOperations.push({
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "PAUSED",
            ad: {
              finalUrls: [ad.finalUrl],
              videoResponsiveAd: {
                headlines: ad.headlines.map((text) => ({ text })),
                descriptions: ad.descriptions.map((text) => ({ text })),
                videos: videos.map((asset) => ({ asset })),
                ...(ad.longHeadline ? { longHeadlines: [{ text: ad.longHeadline }] } : {}),
                ...(companions.length ? { companionBanners: companions.map((asset) => ({ asset })) } : {}),
                ...(ad.callToActionText ? { callToActions: [{ text: ad.callToActionText }] } : {}),
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

export function extractVideoResourceNames(response: unknown): {
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

export function defaultVideoDraftTree(partial?: Partial<VideoDraftTree>): VideoDraftTree {
  const customerId = partial?.customerId ?? "";
  return {
    customerId,
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused Video",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "MANUAL_CPV",
    inStream: partial?.inStream ?? true,
    bumper: partial?.bumper ?? false,
    inFeed: partial?.inFeed ?? true,
    shorts: partial?.shorts ?? true,
    outstream: partial?.outstream ?? false,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    adGroups: partial?.adGroups ?? [
      {
        name: "Video ad group 1",
        defaultBidMicros: 1_000_000,
        sortOrder: 0,
        ads: [
          {
            headlines: ["Adrunr Video Ads", "Paused YouTube Tools", "Ops, Not Autopilot"],
            descriptions: [
              "Video formats stay on this draft — not a Demand Gen campaign.",
              "Validate the full tree before any Google Ads apply.",
            ],
            longHeadline: "YouTube in-stream, in-feed, and Shorts — created PAUSED only.",
            finalUrl: "https://adrunr.app",
            callToActionText: "LEARN_MORE",
            assets: [
              { kind: "YOUTUBE_VIDEO", urlText: DEFAULT_YOUTUBE_VIDEO, sortOrder: 0 },
              { kind: "COMPANION_BANNER", urlText: DEFAULT_COMPANION_BANNER, sortOrder: 1 },
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
