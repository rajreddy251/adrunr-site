import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList } from "./search-draft";
import { PLACEHOLDER_IMAGE_PNG_B64 } from "./display-draft";

export const APP_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const APP_BIDDING_STRATEGIES = ["TARGET_CPA", "MAXIMIZE_CONVERSIONS", "TARGET_ROAS"] as const;
export const APP_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const APP_PLATFORMS = ["ANDROID", "IOS"] as const;
export const APP_GOALS = ["INSTALLS", "IN_APP_ACTIONS"] as const;
export const APP_ASSET_KINDS = ["MARKETING_IMAGE", "SQUARE_MARKETING_IMAGE", "YOUTUBE_VIDEO", "HTML5"] as const;

export type AppDraftStatusValue = (typeof APP_DRAFT_STATUSES)[number];
export type AppBiddingStrategyValue = (typeof APP_BIDDING_STRATEGIES)[number];
export type AppTargetTypeValue = (typeof APP_TARGET_TYPES)[number];
export type AppPlatformValue = (typeof APP_PLATFORMS)[number];
export type AppGoalValue = (typeof APP_GOALS)[number];
export type AppAssetKindValue = (typeof APP_ASSET_KINDS)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;
export const MIN_TARGET_CPA_MICROS = 10_000;
export const APP_HEADLINE_MIN = 1;
export const APP_HEADLINE_MAX = 5;
export const APP_HEADLINE_CHAR_MAX = 30;
export const APP_DESCRIPTION_MIN = 1;
export const APP_DESCRIPTION_MAX = 5;
export const APP_DESCRIPTION_CHAR_MAX = 90;
export const DEFAULT_ANDROID_APP_ID = "com.adrunr.demo";
export const DEFAULT_IOS_APP_ID = "123456789";
export const DEFAULT_MARKETING_IMAGE = "https://placehold.co/1200x628/png?text=App";
export const DEFAULT_SQUARE_IMAGE = "https://placehold.co/300x300/png?text=App";

export { GEO_PRESETS, LANGUAGE_PRESETS, encodeTextList, decodeTextList, PLACEHOLDER_IMAGE_PNG_B64 };

export type AppPlatformInput = {
  platform: AppPlatformValue;
  appId: string;
  included: boolean;
  sortOrder?: number;
};

export type AppAssetInput = {
  kind: AppAssetKindValue;
  urlText: string;
  sortOrder?: number;
};

export type AppAdInput = {
  headlines: string[];
  descriptions: string[];
  assets: AppAssetInput[];
};

export type AppAdGroupInput = {
  name: string;
  defaultBidMicros: number;
  sortOrder: number;
  ads: AppAdInput[];
};

export type AppTargetInput = {
  type: AppTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type AppDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: AppBiddingStrategyValue;
  goal: AppGoalValue;
  targetCpaMicros?: number | null;
  targetRoasText?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  platforms: AppPlatformInput[];
  adGroups: AppAdGroupInput[];
  targets: AppTargetInput[];
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

function parseAndroidAppId(value: unknown): string {
  const raw = optionalString(value) ?? "";
  if (!raw) throw validationError("Android app id is required.", "Use a package name such as com.example.app.");
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(raw)) {
    throw validationError(
      "Android app id must be a package name.",
      "Example: com.adrunr.demo",
    );
  }
  return raw;
}

function parseIosAppId(value: unknown): string {
  const raw = optionalString(value) ?? "";
  if (!raw) throw validationError("iOS app id is required.", "Use the numeric App Store id.");
  const digits = digitsOnly(raw);
  if (!digits) {
    throw validationError("iOS app id must be numeric.", "Use the App Store id, such as 123456789.");
  }
  return digits;
}

function parseAppIdForPlatform(platform: AppPlatformValue, value: unknown): string {
  return platform === "ANDROID" ? parseAndroidAppId(value) : parseIosAppId(value);
}

function parseAppIdLoose(platform: AppPlatformValue, value: unknown): string {
  const raw = optionalString(value) ?? "";
  if (!raw) return platform === "ANDROID" ? "" : "";
  if (platform === "IOS") return digitsOnly(raw) || raw;
  return raw;
}

function parseStringList(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") return decodeTextList(value);
  return fallback;
}

function parseAsset(raw: unknown, index: number): AppAssetInput {
  const row = asRecord(raw);
  const kind = parseEnum(row.kind, APP_ASSET_KINDS, "MARKETING_IMAGE", "asset kind");
  const urlText = String(row.urlText ?? row.url ?? "").trim();
  if (!urlText) throw validationError("Each asset needs urlText.");
  return {
    kind,
    urlText,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAssetLoose(raw: unknown, index: number): AppAssetInput | null {
  const row = asRecord(raw);
  const kindRaw = String(row.kind ?? "MARKETING_IMAGE").toUpperCase();
  if (!(APP_ASSET_KINDS as readonly string[]).includes(kindRaw)) return null;
  const urlText = String(row.urlText ?? row.url ?? "").trim();
  if (!urlText) return null;
  return {
    kind: kindRaw as AppAssetKindValue,
    urlText,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseAd(raw: unknown): AppAdInput {
  const row = asRecord(raw);
  const headlines = parseStringList(row.headlines ?? row.headlinesText);
  const descriptions = parseStringList(row.descriptions ?? row.descriptionsText);
  if (headlines.length < APP_HEADLINE_MIN) {
    throw validationError(`Each app ad needs at least ${APP_HEADLINE_MIN} headline.`);
  }
  if (descriptions.length < APP_DESCRIPTION_MIN) {
    throw validationError(`Each app ad needs at least ${APP_DESCRIPTION_MIN} description.`);
  }
  if (headlines.length > APP_HEADLINE_MAX) {
    throw validationError(`Each app ad allows at most ${APP_HEADLINE_MAX} headlines.`);
  }
  if (descriptions.length > APP_DESCRIPTION_MAX) {
    throw validationError(`Each app ad allows at most ${APP_DESCRIPTION_MAX} descriptions.`);
  }
  for (const headline of headlines) {
    if (headline.length > APP_HEADLINE_CHAR_MAX) {
      throw validationError(`Headlines must be <= ${APP_HEADLINE_CHAR_MAX} characters.`);
    }
  }
  for (const description of descriptions) {
    if (description.length > APP_DESCRIPTION_CHAR_MAX) {
      throw validationError(`Descriptions must be <= ${APP_DESCRIPTION_CHAR_MAX} characters.`);
    }
  }
  return {
    headlines,
    descriptions,
    assets: Array.isArray(row.assets) ? row.assets.map(parseAsset) : [],
  };
}

function parseAdLoose(raw: unknown): AppAdInput | null {
  const row = asRecord(raw);
  const headlines = parseStringList(row.headlines ?? row.headlinesText);
  const descriptions = parseStringList(row.descriptions ?? row.descriptionsText);
  if (!headlines.length && !descriptions.length && !Array.isArray(row.assets)) return null;
  return {
    headlines,
    descriptions,
    assets: Array.isArray(row.assets)
      ? row.assets.map(parseAssetLoose).filter((item): item is AppAssetInput => Boolean(item))
      : [],
  };
}

function parseAdGroup(raw: unknown, index: number): AppAdGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) throw validationError(`Ad group ${index + 1} needs a name.`);
  const ads = Array.isArray(row.ads) ? row.ads.map(parseAd) : [];
  if (ads.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one app ad.`);
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

function parseAdGroupLoose(raw: unknown, index: number): AppAdGroupInput | null {
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
      ? row.ads.map(parseAdLoose).filter((item): item is AppAdInput => Boolean(item))
      : [],
  };
}

function parsePlatform(raw: unknown, index: number): AppPlatformInput {
  const row = asRecord(raw);
  const platform = parseEnum(row.platform, APP_PLATFORMS, "ANDROID", "platform");
  return {
    platform,
    appId: parseAppIdForPlatform(platform, row.appId ?? row.app_id),
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parsePlatformLoose(raw: unknown, index: number): AppPlatformInput | null {
  const row = asRecord(raw);
  const platformRaw = String(row.platform ?? "").toUpperCase();
  if (!(APP_PLATFORMS as readonly string[]).includes(platformRaw)) return null;
  const platform = platformRaw as AppPlatformValue;
  const appId = parseAppIdLoose(platform, row.appId ?? row.app_id);
  if (!appId && row.included === false) {
    return { platform, appId: "", included: false, sortOrder: index };
  }
  if (!appId) return null;
  return {
    platform,
    appId,
    included: row.included === false || row.exclude === true ? false : true,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
  };
}

function parseTarget(raw: unknown): AppTargetInput {
  const row = asRecord(raw);
  const type = parseEnum(row.type, APP_TARGET_TYPES, "GEO", "target type");
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

function parseTargetLoose(raw: unknown): AppTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(APP_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as AppTargetTypeValue,
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

function parseOptionalMicros(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseAppDraftTree. */
export function parseAppDraftWrite(body: unknown): AppDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled App draft";
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
    biddingStrategy: parseEnumLoose(raw.biddingStrategy, APP_BIDDING_STRATEGIES, "TARGET_CPA"),
    goal: parseEnumLoose(raw.goal, APP_GOALS, "INSTALLS"),
    targetCpaMicros: parseOptionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    platforms: Array.isArray(raw.platforms)
      ? raw.platforms.map(parsePlatformLoose).filter((item): item is AppPlatformInput => Boolean(item))
      : [],
    adGroups: Array.isArray(raw.adGroups)
      ? raw.adGroups.map(parseAdGroupLoose).filter((item): item is AppAdGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is AppTargetInput => Boolean(item))
      : [],
  };
}

export function parseAppDraftTree(body: unknown): AppDraftTree {
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

  const biddingStrategy = parseEnum(raw.biddingStrategy, APP_BIDDING_STRATEGIES, "TARGET_CPA", "bidding strategy");
  if (biddingStrategy !== "TARGET_CPA") {
    throw validationError(
      `${biddingStrategy} is schema-ready but not applied in App MVP.`,
      "Use TARGET_CPA for install / download campaigns. Maximize conversions / tROAS stay stored for later phases.",
    );
  }

  const goal = parseEnum(raw.goal, APP_GOALS, "INSTALLS", "goal");
  if (goal !== "INSTALLS") {
    throw validationError(
      `${goal} is schema-ready but not applied in App MVP.`,
      "MVP applies INSTALLS (downloads). In-app actions stay stored for later.",
    );
  }

  const targetCpaMicros = parseOptionalMicros(raw.targetCpaMicros);
  if (targetCpaMicros == null || targetCpaMicros < MIN_TARGET_CPA_MICROS) {
    throw validationError(
      `targetCpaMicros must be an integer >= ${MIN_TARGET_CPA_MICROS} for install / download App campaigns.`,
      "Set a target cost per install. The campaign still applies PAUSED.",
    );
  }

  const platforms = Array.isArray(raw.platforms) ? raw.platforms.map(parsePlatform) : [];
  const included = platforms.filter((item) => item.included && item.appId);
  if (included.length === 0) {
    throw validationError(
      "At least one included platform with an app id is required.",
      "Add Android (package name) and/or iOS (App Store id).",
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
    targetCpaMicros,
    targetRoasText: optionalString(raw.targetRoasText),
    startDate,
    endDate,
    notesText: optionalString(raw.notesText),
    platforms,
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

export function primaryAppPlatform(platforms: AppPlatformInput[]): AppPlatformInput {
  const included = platforms.filter((item) => item.included && item.appId);
  return included.find((item) => item.platform === "ANDROID") ?? included[0];
}

function appStoreFor(platform: AppPlatformValue): "GOOGLE_APP_STORE" | "APPLE_APP_STORE" {
  return platform === "IOS" ? "APPLE_APP_STORE" : "GOOGLE_APP_STORE";
}

export function buildAppDraftMutate(tree: AppDraftTree, validateOnly: boolean): MutateRequest {
  const customerId = digitsOnly(tree.customerId);
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  const campaignResourceName = `customers/${customerId}/campaigns/-2`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const primary = primaryAppPlatform(tree.platforms);
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
          advertisingChannelType: "MULTI_CHANNEL",
          advertisingChannelSubType: "APP_CAMPAIGN",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          targetCpa: { targetCpaMicros: String(tree.targetCpaMicros ?? 2_000_000) },
          appCampaignSetting: {
            appId: primary.appId,
            appStore: appStoreFor(primary.platform),
            biddingStrategyGoalType: "OPTIMIZE_INSTALLS_TARGET_INSTALL_COST",
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
          cpcBidMicros: String(group.defaultBidMicros),
        },
      },
    });

    for (const ad of group.ads) {
      const images: string[] = [];
      const videos: string[] = [];

      for (const asset of ad.assets) {
        if (asset.kind === "HTML5") continue;
        const assetResourceName = `customers/${customerId}/assets/${nextTemp}`;
        nextTemp -= 1;
        if (asset.kind === "YOUTUBE_VIDEO") {
          const videoId = extractYoutubeId(asset.urlText);
          mutateOperations.push({
            assetOperation: {
              create: {
                resourceName: assetResourceName,
                name: `app-video ${stamp} ${assetResourceName}`,
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
              name: `app-image ${asset.kind} ${stamp}`,
              type: "IMAGE",
              imageAsset: { data: PLACEHOLDER_IMAGE_PNG_B64 },
            },
          },
        });
        images.push(assetResourceName);
      }

      mutateOperations.push({
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "PAUSED",
            ad: {
              appAd: {
                headlines: ad.headlines.map((text) => ({ text })),
                descriptions: ad.descriptions.map((text) => ({ text })),
                ...(images.length ? { images: images.map((asset) => ({ asset })) } : {}),
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
  const trimmed = value.trim();
  const watch = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watch) return watch[1];
  const short = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (short) return short[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return "aqz-KE-bpKQ";
}

export function extractAppResourceNames(response: unknown): {
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

export function defaultAppDraftTree(partial?: Partial<AppDraftTree>): AppDraftTree {
  return {
    customerId: partial?.customerId ?? "",
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused App",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "TARGET_CPA",
    goal: "INSTALLS",
    targetCpaMicros: partial?.targetCpaMicros ?? 2_000_000,
    targetRoasText: partial?.targetRoasText ?? null,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    notesText: partial?.notesText ?? null,
    platforms: partial?.platforms ?? [
      { platform: "ANDROID", appId: DEFAULT_ANDROID_APP_ID, included: true, sortOrder: 0 },
    ],
    adGroups: partial?.adGroups ?? [
      {
        name: "App installs 1",
        defaultBidMicros: 1_000_000,
        sortOrder: 0,
        ads: [
          {
            headlines: ["Install Adrunr", "Download the app", "Get it now"],
            descriptions: [
              "Mobile installs stay PAUSED until you apply from the form.",
              "Android / iOS downloads — validate the full tree first.",
            ],
            assets: [{ kind: "MARKETING_IMAGE", urlText: DEFAULT_MARKETING_IMAGE, sortOrder: 0 }],
          },
        ],
      },
    ],
    targets: partial?.targets ?? [
      { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
    ],
  };
}
