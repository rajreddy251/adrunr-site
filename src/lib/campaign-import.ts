import { defaultAppDraftTree } from "./app-draft";
import { defaultDemandGenDraftTree } from "./demand-gen-draft";
import {
  DEFAULT_LOGO_IMAGE,
  DEFAULT_MARKETING_IMAGE,
  DEFAULT_SQUARE_IMAGE,
  defaultDisplayDraftTree,
} from "./display-draft";
import { defaultHotelDraftTree } from "./hotel-draft";
import { digitsOnly } from "./ids";
import { defaultLocalDraftTree } from "./local-draft";
import { defaultLocalServicesDraftTree } from "./local-services-draft";
import { defaultPmaxDraftTree } from "./pmax-draft";
import {
  CAMPAIGN_IMPORT_NOTE,
  resolveDryRun,
} from "./safety";
import {
  decodeTextList,
  defaultSearchDraftTree,
  DESCRIPTION_CHAR_MAX,
  DESCRIPTION_MIN,
  HEADLINE_CHAR_MAX,
  HEADLINE_MIN,
  SEARCH_KEYWORD_MATCH_TYPES,
  type SearchKeywordMatchTypeValue,
} from "./search-draft";
import { searchCreatePath } from "./search-create";
import { defaultShoppingDraftTree } from "./shopping-draft";
import type { AssistantCampaignKind, SyncedAdView, SyncedCampaignView, SyncedKeywordView } from "./types";
import { defaultVideoDraftTree } from "./video-draft";

export const CAMPAIGN_IMPORT_JOB_TYPE = "import_campaign";

export const IMPORT_DRAFT_KINDS = [
  "SEARCH",
  "DISPLAY",
  "PMAX",
  "DEMAND_GEN",
  "VIDEO",
  "SHOPPING",
  "APP",
  "HOTEL",
  "LOCAL",
  "LOCAL_SERVICES",
] as const;

export type ImportDraftKind = (typeof IMPORT_DRAFT_KINDS)[number];

export const ENABLE_REFUSAL_KEYS = [
  "enable",
  "unpause",
  "goLive",
  "go_live",
  "golive",
  "servingStatus",
  "campaignStatus",
  "mutateOperations",
  "mutate",
] as const;

export const DEFAULT_IMPORT_BUDGET_MICROS = 1_000_000;
export const DEFAULT_IMPORT_BID_MICROS = 1_000_000;

const CHANNEL_TO_KIND: Record<string, ImportDraftKind> = {
  SEARCH: "SEARCH",
  DISPLAY: "DISPLAY",
  PERFORMANCE_MAX: "PMAX",
  DEMAND_GEN: "DEMAND_GEN",
  DISCOVERY: "DEMAND_GEN",
  VIDEO: "VIDEO",
  VIDEO_ACTION: "VIDEO",
  VIDEO_NON_SKIPPABLE: "VIDEO",
  VIDEO_OUTSTREAM: "VIDEO",
  VIDEO_RESPONSIVE: "VIDEO",
  VIDEO_TRUEVIEW: "VIDEO",
  SHOPPING: "SHOPPING",
  MULTI_CHANNEL: "APP",
  APP: "APP",
  APP_CAMPAIGN: "APP",
  UNIVERSAL_APP_CAMPAIGN: "APP",
  HOTEL: "HOTEL",
  LOCAL: "LOCAL",
  LOCAL_SERVICES: "LOCAL_SERVICES",
  LOCAL_SERVICES_CAMPAIGN: "LOCAL_SERVICES",
};

export type CampaignImportInput = {
  customerId: string;
  syncedCampaignId?: string | null;
  campaignExternalId?: string | null;
  dryRun: boolean;
};

export type CampaignImportPreview = {
  draftKind: ImportDraftKind;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: string;
  sourceCampaignExternalId: string;
  sourceName: string;
  sourceAdvertisingChannelType: string | null;
  sourceStatus: string | null;
  sourceServingStatus: string | null;
  sourceBiddingStrategyType: string | null;
  adGroupCount: number;
  adCount: number;
  keywordCount: number;
  usedSafeDefaults: string[];
  warnings: string[];
  neverEnable: true;
  applyPath: "PAUSED";
};

function validationError(message: string, hint?: string, kind = "validation"): Error {
  return Object.assign(new Error(message), {
    status: 400,
    info: { kind, hint },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("Expected an object payload.");
  }
  return value as Record<string, unknown>;
}

export function resolveImportDraftKind(channelType: string | null | undefined): ImportDraftKind {
  const raw = String(channelType ?? "").trim().toUpperCase();
  const kind = CHANNEL_TO_KIND[raw];
  if (!kind) {
    throw validationError(
      `Unsupported advertising channel ${raw || "(missing)"} for import.`,
      `Import maps SEARCH, DISPLAY, PERFORMANCE_MAX, DEMAND_GEN, VIDEO, SHOPPING, MULTI_CHANNEL/APP, HOTEL, LOCAL, and LOCAL_SERVICES. Sync a supported campaign first.`,
    );
  }
  return kind;
}

export function refuseEnableOnImport(body: unknown): void {
  const raw = asRecord(body ?? {});
  for (const key of ENABLE_REFUSAL_KEYS) {
    const value = raw[key];
    if (
      value === true ||
      (typeof value === "string" && value.trim() !== "") ||
      (Array.isArray(value) && value.length > 0) ||
      (value && typeof value === "object")
    ) {
      throw Object.assign(new Error(CAMPAIGN_IMPORT_NOTE), {
        status: 400,
        info: {
          kind: "import_enable_refused",
          hint: `Remove ${key}. Import writes create-type drafts only and never enables, unpauses, or goes live.`,
        },
      });
    }
  }
  const status = String(raw.status ?? "").toUpperCase();
  if (status === "ENABLED" && (raw.apply === true || raw.persistStatus === true || raw.goLive === true)) {
    throw Object.assign(new Error(CAMPAIGN_IMPORT_NOTE), {
      status: 400,
      info: {
        kind: "import_enable_refused",
        hint: "Cached ENABLED is a snapshot only. Imported drafts stay on the PAUSED create path.",
      },
    });
  }
}

export function parseCampaignImportInput(body: unknown): CampaignImportInput {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  refuseEnableOnImport(record);
  const customerId = digitsOnly(String(record.customerId ?? ""));
  if (!customerId) {
    throw validationError("customerId is required.", "Select an Ads customer, then pick a cached campaign.");
  }
  const syncedCampaignId = record.syncedCampaignId ? String(record.syncedCampaignId).trim() : "";
  const campaignExternalId = String(record.campaignExternalId ?? record.externalId ?? "").trim();
  if (!syncedCampaignId && !campaignExternalId) {
    throw validationError(
      "syncedCampaignId or campaignExternalId is required.",
      "Pick a cached SyncedCampaign from listings first.",
    );
  }
  return {
    customerId,
    syncedCampaignId: syncedCampaignId || null,
    campaignExternalId: campaignExternalId || null,
    dryRun: resolveDryRun(record.dryRun),
  };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

function padLines(items: string[], min: number, maxChars: number, fillers: string[]): string[] {
  const next = items.map((item) => clip(item.trim(), maxChars)).filter(Boolean);
  let i = 0;
  while (next.length < min) {
    const filler = fillers[i % fillers.length] ?? "Imported paused draft";
    next.push(clip(i >= fillers.length ? `${filler} ${i + 1}` : filler, maxChars));
    i += 1;
  }
  return next;
}

function importedName(sourceName: string): string {
  const base = sourceName.trim() || "Imported campaign";
  const suffix = " (import)";
  return clip(`${base}${suffix}`, 120);
}

function keywordMatchType(value: string | null | undefined): SearchKeywordMatchTypeValue {
  const raw = String(value ?? "PHRASE").toUpperCase().replace(/_MATCH$/, "");
  if ((SEARCH_KEYWORD_MATCH_TYPES as readonly string[]).includes(raw)) {
    return raw as SearchKeywordMatchTypeValue;
  }
  return "PHRASE";
}

function countTree(campaign: SyncedCampaignView) {
  let ads = 0;
  let keywords = 0;
  for (const group of campaign.adGroups) {
    ads += group.ads.length;
    keywords += group.keywords.length;
  }
  return { adGroupCount: campaign.adGroups.length, adCount: ads, keywordCount: keywords };
}

function importNotes(campaign: SyncedCampaignView, kind: ImportDraftKind, extras: string[]): string {
  return [
    `Imported from cached Google campaign ${campaign.externalId} (${campaign.advertisingChannelType ?? "UNKNOWN"}).`,
    `Source live status ${campaign.status ?? "unknown"} is a snapshot only — this draft stays on the PAUSED create path.`,
    `Mapped to ${kind} create-type draft. Never enable / unpause from import.`,
    ...extras,
  ].join(" ");
}

function headlinesFromAd(ad: SyncedAdView): string[] {
  return decodeTextList(ad.headlinesText);
}

function descriptionsFromAd(ad: SyncedAdView): string[] {
  return decodeTextList(ad.descriptionsText);
}

function searchAdsFromSynced(ads: SyncedAdView[]) {
  const source = ads.length
    ? ads
    : [
        {
          headlinesText: "Imported Search ad\nPaused create draft\nOps, not autopilot",
          descriptionsText:
            "Imported from a cached Google campaign.\nValidate, then CREATE PAUSED — never enable from import.",
          finalUrl: "https://adrunr.app",
        } as SyncedAdView,
      ];
  return source.map((ad) => ({
    headlines: padLines(headlinesFromAd(ad), HEADLINE_MIN, HEADLINE_CHAR_MAX, [
      "Imported Search ad",
      "Paused create draft",
      "Ops, not autopilot",
    ]),
    descriptions: padLines(descriptionsFromAd(ad), DESCRIPTION_MIN, DESCRIPTION_CHAR_MAX, [
      "Imported from a cached Google campaign.",
      "Validate, then CREATE PAUSED — never enable from import.",
    ]),
    finalUrl: ad.finalUrl || "https://adrunr.app",
    path1: "import",
    path2: "paused",
  }));
}

function searchKeywordsFromSynced(keywords: SyncedKeywordView[]) {
  if (!keywords.length) {
    return [{ text: "adrunr import", matchType: "PHRASE" as const, isNegative: false }];
  }
  return keywords.map((keyword) => ({
    text: keyword.text,
    matchType: keywordMatchType(keyword.matchType),
    isNegative: Boolean(keyword.isNegative),
  }));
}

export function buildImportedDraftTree(input: {
  customerId: string;
  campaign: SyncedCampaignView;
  dailyBudgetMicros?: number | null;
}): { kind: ImportDraftKind; tree: Record<string, unknown>; preview: CampaignImportPreview } {
  const kind = resolveImportDraftKind(input.campaign.advertisingChannelType);
  const usedSafeDefaults: string[] = [];
  const warnings: string[] = [];
  const counts = countTree(input.campaign);
  const budget =
    input.dailyBudgetMicros && input.dailyBudgetMicros >= 10_000
      ? input.dailyBudgetMicros
      : DEFAULT_IMPORT_BUDGET_MICROS;
  if (!input.dailyBudgetMicros) {
    usedSafeDefaults.push("dailyBudgetMicros");
  }
  const name = importedName(input.campaign.name);
  const extras: string[] = [];

  if (input.campaign.status && input.campaign.status.toUpperCase() === "ENABLED") {
    warnings.push(
      "Source campaign status is ENABLED in the listings cache. Import copies structure only — the new draft stays PAUSED-path and cannot enable spend.",
    );
  }

  let tree: Record<string, unknown>;
  const withNotes = (built: Record<string, unknown>, extraNotes: string[] = extras) => ({
    ...built,
    notesText: importNotes(input.campaign, kind, extraNotes),
  });
  switch (kind) {
    case "SEARCH": {
      const adGroups = input.campaign.adGroups.length
        ? input.campaign.adGroups.map((group, index) => ({
            name: group.name,
            defaultBidMicros: DEFAULT_IMPORT_BID_MICROS,
            sortOrder: index,
            keywords: searchKeywordsFromSynced(group.keywords),
            ads: searchAdsFromSynced(group.ads),
          }))
        : undefined;
      if (!adGroups) usedSafeDefaults.push("adGroups");
      tree = withNotes(
        defaultSearchDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
          adGroups,
        }),
      );
      break;
    }
    case "DISPLAY": {
      const adGroups = input.campaign.adGroups.length
        ? input.campaign.adGroups.map((group, index) => ({
            name: group.name,
            defaultBidMicros: DEFAULT_IMPORT_BID_MICROS,
            sortOrder: index,
            ads: (group.ads.length ? group.ads : [{} as SyncedAdView]).map((ad) => {
              const headlines = padLines(headlinesFromAd(ad), 1, 30, ["Imported Display ad"]);
              const descriptions = padLines(descriptionsFromAd(ad), 1, 90, [
                "Imported Display draft stays PAUSED-path only.",
              ]);
              return {
                headlines,
                longHeadline: clip(
                  headlines[0] ?? "Imported Display campaign — PAUSED create draft",
                  90,
                ),
                descriptions,
                businessName: clip(input.campaign.name || "Adrunr", 25),
                finalUrl: ad.finalUrl || "https://adrunr.app",
                assets: [
                  { kind: "MARKETING_IMAGE" as const, urlText: DEFAULT_MARKETING_IMAGE, sortOrder: 0 },
                  { kind: "SQUARE_MARKETING_IMAGE" as const, urlText: DEFAULT_SQUARE_IMAGE, sortOrder: 1 },
                  { kind: "LOGO" as const, urlText: DEFAULT_LOGO_IMAGE, sortOrder: 2 },
                ],
              };
            }),
          }))
        : undefined;
      if (!adGroups) usedSafeDefaults.push("adGroups");
      usedSafeDefaults.push("displayAssets");
      tree = withNotes(
        defaultDisplayDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
          adGroups,
        }),
      );
      break;
    }
    case "PMAX":
      usedSafeDefaults.push("assetGroup", "signals");
      extras.push("Listings cache has no Performance Max asset group — safe create defaults were applied.");
      warnings.push("Performance Max import uses safe asset-group defaults. Review in the wizard before validate.");
      tree = withNotes(
        defaultPmaxDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
        }),
      );
      break;
    case "DEMAND_GEN":
      usedSafeDefaults.push("demandGenCreatives", "audiences");
      extras.push("Demand Gen creatives/audiences are not in the listings cache — safe defaults applied.");
      warnings.push("Demand Gen import uses safe creative defaults. Review in the wizard before validate.");
      tree = withNotes(
        defaultDemandGenDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
        }),
      );
      break;
    case "VIDEO":
      usedSafeDefaults.push("youtubeAsset", "audiences");
      extras.push("Video YouTube assets are not in the listings cache — safe defaults applied.");
      warnings.push("Video import uses safe YouTube defaults. Review in the wizard before validate.");
      tree = withNotes(
        defaultVideoDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
        }),
      );
      break;
    case "SHOPPING":
      usedSafeDefaults.push("merchantCenterId", "allProducts");
      extras.push("Shopping Merchant Center / product groups are not in the listings cache — safe defaults applied.");
      warnings.push("Shopping import uses a demo Merchant Center id. Replace it before apply.");
      tree = withNotes(
        defaultShoppingDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
        }),
      );
      break;
    case "APP":
      usedSafeDefaults.push("appId", "installsGoal");
      extras.push("App platform / app id are not in the listings cache — safe defaults applied.");
      warnings.push("App import uses a demo Android app id. Replace it before apply.");
      tree = withNotes(
        defaultAppDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
        }),
      );
      break;
    case "HOTEL":
      usedSafeDefaults.push("hotelCenterId", "allHotels");
      extras.push("Hotel Center is not in the listings cache — safe defaults applied.");
      warnings.push("Hotel import uses a demo Hotel Center id. Replace it before apply.");
      tree = withNotes(
        defaultHotelDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
        }),
      );
      break;
    case "LOCAL":
      usedSafeDefaults.push("location", "storeVisits");
      extras.push("Local business location is not in the listings cache — safe defaults applied.");
      warnings.push("Local import uses a demo place id. Replace it before apply.");
      tree = withNotes(
        defaultLocalDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
        }),
      );
      break;
    case "LOCAL_SERVICES":
      usedSafeDefaults.push("primaryCategory", "maxLeadBid");
      extras.push("Local Services category is not in the listings cache — safe defaults applied.");
      warnings.push("Local Services import uses a demo PRIMARY category. Replace it before apply.");
      tree = withNotes(
        defaultLocalServicesDraftTree({
          customerId: input.customerId,
          name,
          dailyBudgetMicros: budget,
        }),
      );
      break;
    default: {
      const exhaustive: never = kind;
      throw validationError(`Unhandled import kind ${String(exhaustive)}.`);
    }
  }

  const preview: CampaignImportPreview = {
    draftKind: kind,
    name,
    dailyBudgetMicros: budget,
    biddingStrategy: String(tree.biddingStrategy ?? ""),
    sourceCampaignExternalId: input.campaign.externalId,
    sourceName: input.campaign.name,
    sourceAdvertisingChannelType: input.campaign.advertisingChannelType,
    sourceStatus: input.campaign.status,
    sourceServingStatus: input.campaign.servingStatus,
    sourceBiddingStrategyType: input.campaign.biddingStrategyType,
    adGroupCount: counts.adGroupCount,
    adCount: counts.adCount,
    keywordCount: counts.keywordCount,
    usedSafeDefaults,
    warnings,
    neverEnable: true,
    applyPath: "PAUSED",
  };

  return { kind, tree, preview };
}

export function importWizardHint(kind: ImportDraftKind): string {
  if (kind === "SEARCH") {
    return `Open Search draft at ${searchCreatePath()} to validate / CREATE PAUSED. Import never enables spend.`;
  }
  const labels: Record<Exclude<ImportDraftKind, "SEARCH">, string> = {
    DISPLAY: "Display",
    PMAX: "Performance Max",
    DEMAND_GEN: "Demand Gen",
    VIDEO: "Video",
    SHOPPING: "Shopping",
    APP: "App",
    HOTEL: "Hotel",
    LOCAL: "Local",
    LOCAL_SERVICES: "Local Services",
  };
  return `Open the ${labels[kind]} tab to validate / CREATE PAUSED. Import never enables spend.`;
}

export function isAssistantCampaignKind(value: string): value is AssistantCampaignKind {
  return (IMPORT_DRAFT_KINDS as readonly string[]).includes(value);
}
