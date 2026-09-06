import type { VideoDraftClientView } from "./types";

export type VideoWizardAsset = {
  kind: "YOUTUBE_VIDEO" | "COMPANION_BANNER" | "MARKETING_IMAGE";
  urlText: string;
};

export type VideoWizardAd = {
  headlines: string[];
  descriptions: string[];
  longHeadline: string;
  finalUrl: string;
  callToActionText: string;
  assets: VideoWizardAsset[];
};

export type VideoWizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  ads: VideoWizardAd[];
};

export type VideoWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type VideoWizardAudience = {
  kind: "USER_LIST" | "AFFINITY" | "IN_MARKET" | "CUSTOM";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type VideoWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  startDate: string;
  endDate: string;
  groups: VideoWizardAdGroup[];
  targets: VideoWizardTarget[];
  audiences: VideoWizardAudience[];
  inStream: boolean;
  bumper: boolean;
  inFeed: boolean;
  shorts: boolean;
  outstream: boolean;
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asAssetKind(value: string): VideoWizardAsset["kind"] {
  if (value === "COMPANION_BANNER" || value === "MARKETING_IMAGE" || value === "YOUTUBE_VIDEO") {
    return value;
  }
  return "YOUTUBE_VIDEO";
}

function emptyAd(): VideoWizardAd {
  return {
    headlines: [""],
    descriptions: [""],
    longHeadline: "",
    finalUrl: "",
    callToActionText: "",
    assets: [],
  };
}

export function hydrateVideoWizardFromDraft(draft: VideoDraftClientView): VideoWizardHydrateState {
  const groups: VideoWizardAdGroup[] = draft.adGroups.length
    ? draft.adGroups.map((group) => ({
        name: group.name,
        defaultBidDollars: microsToDollars(group.defaultBidMicros),
        ads: group.ads.length
          ? group.ads.map((ad) => ({
              headlines: ad.headlines.length ? ad.headlines : [""],
              descriptions: ad.descriptions.length ? ad.descriptions : [""],
              longHeadline: ad.longHeadline ?? "",
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
          name: "Video ad group 1",
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
    inStream: draft.inStream,
    bumper: draft.bumper,
    inFeed: draft.inFeed,
    shorts: draft.shorts,
    outstream: draft.outstream,
  };
}
