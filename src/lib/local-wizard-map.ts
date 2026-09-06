import type { LocalDraftClientView } from "./types";

export type LocalWizardLocation = {
  kind: "BUSINESS_PROFILE" | "PLACE_ID" | "ADDRESS";
  valueText: string;
  placeIdText: string;
  addressText: string;
  included: boolean;
};

export type LocalWizardAd = {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
};

export type LocalWizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  ads: LocalWizardAd[];
};

export type LocalWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type LocalWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  goal: "STORE_VISITS" | "STORE_SALES";
  businessName: string;
  finalUrl: string;
  startDate: string;
  endDate: string;
  locations: LocalWizardLocation[];
  groups: LocalWizardAdGroup[];
  targets: LocalWizardTarget[];
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asGoal(value: string): LocalWizardHydrateState["goal"] {
  return value === "STORE_SALES" ? "STORE_SALES" : "STORE_VISITS";
}

function asLocationKind(value: string): LocalWizardLocation["kind"] {
  if (value === "BUSINESS_PROFILE" || value === "ADDRESS") return value;
  return "PLACE_ID";
}

function emptyGroup(): LocalWizardAdGroup {
  return {
    name: "Store visits 1",
    defaultBidDollars: "1.00",
    ads: [
      {
        headlines: ["Visit the store", "Find us nearby", "Local pickup"],
        descriptions: [
          "Store-visit Local ads stay PAUSED until you apply from the form.",
          "Locations + geo — validate the full tree first.",
        ],
        finalUrl: "https://adrunr.app",
      },
    ],
  };
}

export function hydrateLocalWizardFromDraft(draft: LocalDraftClientView): LocalWizardHydrateState {
  const groups: LocalWizardAdGroup[] = draft.adGroups.length
    ? draft.adGroups.map((group) => ({
        name: group.name,
        defaultBidDollars: microsToDollars(group.defaultBidMicros),
        ads: group.ads.length
          ? group.ads.map((ad) => ({
              headlines: ad.headlines,
              descriptions: ad.descriptions,
              finalUrl: ad.finalUrl,
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
    businessName: draft.businessName ?? "Adrunr Local",
    finalUrl: draft.finalUrl ?? "https://adrunr.app",
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
    locations: draft.locations.length
      ? draft.locations.map((item) => ({
          kind: asLocationKind(item.kind),
          valueText: item.valueText,
          placeIdText: item.placeIdText,
          addressText: item.addressText,
          included: item.included,
        }))
      : [
          {
            kind: "PLACE_ID",
            valueText: "Adrunr store",
            placeIdText: "ChIJN1t_tDeuEmsRUsoyG83frY4",
            addressText: "1 Market St, San Francisco, CA",
            included: true,
          },
        ],
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
