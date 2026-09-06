import type { SearchDraftClientView } from "./types";

export type WizardKeyword = {
  text: string;
  matchType: "BROAD" | "PHRASE" | "EXACT";
  isNegative: boolean;
};

export type WizardAd = {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1: string;
  path2: string;
};

export type WizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  keywords: WizardKeyword[];
  ads: WizardAd[];
};

export type WizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type WizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  startDate: string;
  endDate: string;
  groups: WizardAdGroup[];
  targets: WizardTarget[];
  enhancedCpc: boolean;
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

export function hydrateWizardFromDraft(draft: SearchDraftClientView): WizardHydrateState {
  const groups: WizardAdGroup[] = draft.adGroups.length
    ? draft.adGroups.map((group) => ({
        name: group.name,
        defaultBidDollars: microsToDollars(group.defaultBidMicros),
        keywords: group.keywords.length
          ? group.keywords.map((keyword) => ({
              text: keyword.text,
              matchType:
                keyword.matchType === "BROAD" || keyword.matchType === "EXACT" ? keyword.matchType : "PHRASE",
              isNegative: keyword.isNegative,
            }))
          : [{ text: "", matchType: "PHRASE" as const, isNegative: false }],
        ads: group.ads.length
          ? group.ads.map((ad) => ({
              headlines: ad.headlines.length ? ad.headlines : [""],
              descriptions: ad.descriptions.length ? ad.descriptions : [""],
              finalUrl: ad.finalUrl,
              path1: ad.path1 ?? "",
              path2: ad.path2 ?? "",
            }))
          : [
              {
                headlines: [""],
                descriptions: [""],
                finalUrl: "",
                path1: "",
                path2: "",
              },
            ],
      }))
    : [
        {
          name: "Ad group 1",
          defaultBidDollars: "1.00",
          keywords: [{ text: "", matchType: "PHRASE", isNegative: false }],
          ads: [{ headlines: [""], descriptions: [""], finalUrl: "", path1: "", path2: "" }],
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
    enhancedCpc: draft.enhancedCpcEnabled,
  };
}
