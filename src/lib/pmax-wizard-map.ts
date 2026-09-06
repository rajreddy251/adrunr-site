import type { PmaxDraftClientView } from "./types";

export type PmaxWizardAsset = {
  kind:
    | "MARKETING_IMAGE"
    | "SQUARE_MARKETING_IMAGE"
    | "PORTRAIT_MARKETING_IMAGE"
    | "LOGO"
    | "LANDSCAPE_LOGO"
    | "YOUTUBE_VIDEO";
  urlText: string;
};

export type PmaxWizardListing = {
  kind: "ALL_PRODUCTS" | "UNIT";
  valueText: string;
  dimensionText: string;
  included: boolean;
};

export type PmaxWizardAssetGroup = {
  name: string;
  finalUrl: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  businessName: string;
  assets: PmaxWizardAsset[];
  listings: PmaxWizardListing[];
};

export type PmaxWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type PmaxWizardSignal = {
  kind: "SEARCH_THEME" | "USER_LIST" | "CUSTOM";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type PmaxWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  startDate: string;
  endDate: string;
  groups: PmaxWizardAssetGroup[];
  targets: PmaxWizardTarget[];
  signals: PmaxWizardSignal[];
  merchantCenterId: string;
  urlExpansionOptOut: boolean;
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asAssetKind(value: string): PmaxWizardAsset["kind"] {
  if (
    value === "SQUARE_MARKETING_IMAGE" ||
    value === "PORTRAIT_MARKETING_IMAGE" ||
    value === "LOGO" ||
    value === "LANDSCAPE_LOGO" ||
    value === "YOUTUBE_VIDEO" ||
    value === "MARKETING_IMAGE"
  ) {
    return value;
  }
  return "MARKETING_IMAGE";
}

function emptyGroup(): PmaxWizardAssetGroup {
  return {
    name: "Performance Max asset group 1",
    finalUrl: "",
    headlines: [""],
    longHeadlines: [""],
    descriptions: [""],
    businessName: "",
    assets: [],
    listings: [],
  };
}

export function hydratePmaxWizardFromDraft(draft: PmaxDraftClientView): PmaxWizardHydrateState {
  const groups: PmaxWizardAssetGroup[] = draft.assetGroups.length
    ? draft.assetGroups.map((group) => ({
        name: group.name,
        finalUrl: group.finalUrl,
        headlines: group.headlines.length ? group.headlines : [""],
        longHeadlines: group.longHeadlines.length ? group.longHeadlines : [""],
        descriptions: group.descriptions.length ? group.descriptions : [""],
        businessName: group.businessName,
        assets: group.assets.length
          ? group.assets.map((asset) => ({
              kind: asAssetKind(asset.kind),
              urlText: asset.urlText,
            }))
          : [],
        listings: group.listings.map((listing) => ({
          kind: listing.kind === "UNIT" ? "UNIT" : "ALL_PRODUCTS",
          valueText: listing.valueText,
          dimensionText: listing.dimensionText,
          included: listing.included,
        })),
      }))
    : [emptyGroup()];

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
    signals: draft.signals.map((signal) => ({
      kind:
        signal.kind === "USER_LIST" || signal.kind === "CUSTOM"
          ? signal.kind
          : "SEARCH_THEME",
      valueText: signal.valueText,
      criterionText: signal.criterionText,
      included: signal.included,
    })),
    merchantCenterId: draft.merchantCenterId ?? "",
    urlExpansionOptOut: draft.urlExpansionOptOut,
  };
}
