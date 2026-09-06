import type { DisplayDraftClientView } from "./types";

export type DisplayWizardAsset = {
  kind: "MARKETING_IMAGE" | "SQUARE_MARKETING_IMAGE" | "LOGO" | "YOUTUBE_VIDEO";
  urlText: string;
};

export type DisplayWizardAd = {
  headlines: string[];
  longHeadline: string;
  descriptions: string[];
  businessName: string;
  finalUrl: string;
  assets: DisplayWizardAsset[];
};

export type DisplayWizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  ads: DisplayWizardAd[];
};

export type DisplayWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type DisplayWizardAudience = {
  kind: "USER_LIST" | "AFFINITY" | "IN_MARKET" | "CUSTOM";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type DisplayWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  startDate: string;
  endDate: string;
  groups: DisplayWizardAdGroup[];
  targets: DisplayWizardTarget[];
  audiences: DisplayWizardAudience[];
  enhancedCpc: boolean;
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asAssetKind(value: string): DisplayWizardAsset["kind"] {
  if (
    value === "SQUARE_MARKETING_IMAGE" ||
    value === "LOGO" ||
    value === "YOUTUBE_VIDEO" ||
    value === "MARKETING_IMAGE"
  ) {
    return value;
  }
  return "MARKETING_IMAGE";
}

export function hydrateDisplayWizardFromDraft(draft: DisplayDraftClientView): DisplayWizardHydrateState {
  const groups: DisplayWizardAdGroup[] = draft.adGroups.length
    ? draft.adGroups.map((group) => ({
        name: group.name,
        defaultBidDollars: microsToDollars(group.defaultBidMicros),
        ads: group.ads.length
          ? group.ads.map((ad) => ({
              headlines: ad.headlines.length ? ad.headlines : [""],
              longHeadline: ad.longHeadline,
              descriptions: ad.descriptions.length ? ad.descriptions : [""],
              businessName: ad.businessName,
              finalUrl: ad.finalUrl,
              assets: ad.assets.length
                ? ad.assets.map((asset) => ({
                    kind: asAssetKind(asset.kind),
                    urlText: asset.urlText,
                  }))
                : [],
            }))
          : [
              {
                headlines: [""],
                longHeadline: "",
                descriptions: [""],
                businessName: "",
                finalUrl: "",
                assets: [],
              },
            ],
      }))
    : [
        {
          name: "Display ad group 1",
          defaultBidDollars: "1.00",
          ads: [
            {
              headlines: [""],
              longHeadline: "",
              descriptions: [""],
              businessName: "",
              finalUrl: "",
              assets: [],
            },
          ],
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
      kind: audience.kind === "USER_LIST" ? "USER_LIST" : (audience.kind as DisplayWizardAudience["kind"]),
      valueText: audience.valueText,
      criterionText: audience.criterionText,
      included: audience.included,
    })),
    enhancedCpc: draft.enhancedCpcEnabled,
  };
}
