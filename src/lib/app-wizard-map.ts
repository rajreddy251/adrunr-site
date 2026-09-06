import type { AppDraftClientView } from "./types";

export type AppWizardPlatform = {
  platform: "ANDROID" | "IOS";
  appId: string;
  included: boolean;
};

export type AppWizardAsset = {
  kind: "MARKETING_IMAGE" | "SQUARE_MARKETING_IMAGE" | "YOUTUBE_VIDEO" | "HTML5";
  urlText: string;
};

export type AppWizardAd = {
  headlines: string[];
  descriptions: string[];
  assets: AppWizardAsset[];
};

export type AppWizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  ads: AppWizardAd[];
};

export type AppWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type AppWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  goal: "INSTALLS" | "IN_APP_ACTIONS";
  targetCpaDollars: string;
  startDate: string;
  endDate: string;
  platforms: AppWizardPlatform[];
  groups: AppWizardAdGroup[];
  targets: AppWizardTarget[];
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asGoal(value: string): AppWizardHydrateState["goal"] {
  return value === "IN_APP_ACTIONS" ? "IN_APP_ACTIONS" : "INSTALLS";
}

function asPlatform(value: string): AppWizardPlatform["platform"] {
  return value === "IOS" ? "IOS" : "ANDROID";
}

function asAssetKind(value: string): AppWizardAsset["kind"] {
  if (value === "SQUARE_MARKETING_IMAGE" || value === "YOUTUBE_VIDEO" || value === "HTML5") return value;
  return "MARKETING_IMAGE";
}

function emptyGroup(): AppWizardAdGroup {
  return {
    name: "App installs 1",
    defaultBidDollars: "1.00",
    ads: [
      {
        headlines: ["Install Adrunr", "Download the app", "Get it now"],
        descriptions: [
          "Mobile installs stay PAUSED until you apply from the form.",
          "Android / iOS downloads — validate the full tree first.",
        ],
        assets: [{ kind: "MARKETING_IMAGE", urlText: "https://placehold.co/1200x628/png?text=App" }],
      },
    ],
  };
}

export function hydrateAppWizardFromDraft(draft: AppDraftClientView): AppWizardHydrateState {
  const groups: AppWizardAdGroup[] = draft.adGroups.length
    ? draft.adGroups.map((group) => ({
        name: group.name,
        defaultBidDollars: microsToDollars(group.defaultBidMicros),
        ads: group.ads.length
          ? group.ads.map((ad) => ({
              headlines: ad.headlines,
              descriptions: ad.descriptions,
              assets: ad.assets.map((asset) => ({
                kind: asAssetKind(asset.kind),
                urlText: asset.urlText,
              })),
            }))
          : emptyGroup().ads,
      }))
    : [emptyGroup()];

  return {
    draftId: draft.id,
    customerId: draft.customerId,
    name: draft.name,
    budgetDollars: microsToDollars(draft.dailyBudgetMicros),
    goal: asGoal(draft.goal),
    targetCpaDollars: microsToDollars(draft.targetCpaMicros ?? "2000000"),
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
    platforms: draft.platforms.length
      ? draft.platforms.map((item) => ({
          platform: asPlatform(item.platform),
          appId: item.appId,
          included: item.included,
        }))
      : [{ platform: "ANDROID", appId: "com.adrunr.demo", included: true }],
    groups,
    targets: draft.targets
      .filter((target) => target.type === "GEO" || target.type === "LANGUAGE")
      .map((target) => ({
        type: target.type as "GEO" | "LANGUAGE",
        valueText: target.valueText,
        criterionText: target.criterionText,
        included: target.included,
      })),
  };
}
