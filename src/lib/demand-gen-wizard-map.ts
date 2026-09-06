import type { DemandGenDraftClientView } from "./types";

export type DemandGenWizardAsset = {
  kind:
    | "MARKETING_IMAGE"
    | "SQUARE_MARKETING_IMAGE"
    | "PORTRAIT_MARKETING_IMAGE"
    | "LOGO"
    | "YOUTUBE_VIDEO";
  urlText: string;
};

export type DemandGenWizardAd = {
  headlines: string[];
  descriptions: string[];
  businessName: string;
  finalUrl: string;
  callToActionText: string;
  assets: DemandGenWizardAsset[];
};

export type DemandGenWizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  ads: DemandGenWizardAd[];
};

export type DemandGenWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type DemandGenWizardAudience = {
  kind: "USER_LIST" | "AFFINITY" | "IN_MARKET" | "CUSTOM";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type DemandGenWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  startDate: string;
  endDate: string;
  groups: DemandGenWizardAdGroup[];
  targets: DemandGenWizardTarget[];
  audiences: DemandGenWizardAudience[];
  youtubeInStream: boolean;
  youtubeInFeed: boolean;
  youtubeShorts: boolean;
  discover: boolean;
  gmail: boolean;
  display: boolean;
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asAssetKind(value: string): DemandGenWizardAsset["kind"] {
  if (
    value === "SQUARE_MARKETING_IMAGE" ||
    value === "PORTRAIT_MARKETING_IMAGE" ||
    value === "LOGO" ||
    value === "YOUTUBE_VIDEO" ||
    value === "MARKETING_IMAGE"
  ) {
    return value;
  }
  return "MARKETING_IMAGE";
}

function emptyAd(): DemandGenWizardAd {
  return {
    headlines: [""],
    descriptions: [""],
    businessName: "",
    finalUrl: "",
    callToActionText: "",
    assets: [],
  };
}

export function hydrateDemandGenWizardFromDraft(draft: DemandGenDraftClientView): DemandGenWizardHydrateState {
  const groups: DemandGenWizardAdGroup[] = draft.adGroups.length
    ? draft.adGroups.map((group) => ({
        name: group.name,
        defaultBidDollars: microsToDollars(group.defaultBidMicros),
        ads: group.ads.length
          ? group.ads.map((ad) => ({
              headlines: ad.headlines.length ? ad.headlines : [""],
              descriptions: ad.descriptions.length ? ad.descriptions : [""],
              businessName: ad.businessName,
              finalUrl: ad.finalUrl,
              callToActionText: ad.callToActionText ?? "",
              assets: ad.assets.length
                ? ad.assets.map((asset) => ({
                    kind: asAssetKind(asset.kind),
                    urlText: asset.urlText,
                  }))
                : [],
            }))
          : [emptyAd()],
      }))
    : [
        {
          name: "Demand Gen ad group 1",
          defaultBidDollars: "1.00",
          ads: [emptyAd()],
        },
      ];

  return {
    draftId: draft.id,
    customerId: draft.customerId,
    name: draft.name,
    budgetDollars: microsToDollars(draft.dailyBudgetMicros),
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
    groups,
    targets: draft.targets
      .filter((target) => target.type === "GEO" || target.type === "LANGUAGE")
      .map((target) => ({
        type: target.type as "GEO" | "LANGUAGE",
        valueText: target.valueText,
        criterionText: target.criterionText,
        included: target.included,
      })),
    audiences: draft.audiences.map((audience) => ({
      kind:
        audience.kind === "AFFINITY" || audience.kind === "IN_MARKET" || audience.kind === "CUSTOM"
          ? audience.kind
          : "USER_LIST",
      valueText: audience.valueText,
      criterionText: audience.criterionText,
      included: audience.included,
    })),
    youtubeInStream: draft.youtubeInStream,
    youtubeInFeed: draft.youtubeInFeed,
    youtubeShorts: draft.youtubeShorts,
    discover: draft.discover,
    gmail: draft.gmail,
    display: draft.display,
  };
}
