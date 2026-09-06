import type { ShoppingDraftClientView } from "./types";

export type ShoppingWizardProductGroup = {
  kind: "ALL_PRODUCTS" | "UNIT" | "SUBDIVISION";
  valueText: string;
  dimensionText: string;
  included: boolean;
};

export type ShoppingWizardListing = {
  kind: "ALL_PRODUCTS" | "UNIT";
  valueText: string;
  dimensionText: string;
  included: boolean;
};

export type ShoppingWizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  productGroups: ShoppingWizardProductGroup[];
  listings: ShoppingWizardListing[];
};

export type ShoppingWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type ShoppingWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  merchantCenterId: string;
  salesCountry: string;
  campaignPriority: "LOW" | "MEDIUM" | "HIGH";
  enableLocal: boolean;
  startDate: string;
  endDate: string;
  groups: ShoppingWizardAdGroup[];
  targets: ShoppingWizardTarget[];
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asPriority(value: string): ShoppingWizardHydrateState["campaignPriority"] {
  if (value === "MEDIUM" || value === "HIGH") return value;
  return "LOW";
}

function asProductGroupKind(value: string): ShoppingWizardProductGroup["kind"] {
  if (value === "UNIT" || value === "SUBDIVISION" || value === "ALL_PRODUCTS") return value;
  return "ALL_PRODUCTS";
}

function emptyGroup(): ShoppingWizardAdGroup {
  return {
    name: "Shopping product group 1",
    defaultBidDollars: "1.00",
    productGroups: [{ kind: "ALL_PRODUCTS", valueText: "All products", dimensionText: "", included: true }],
    listings: [],
  };
}

export function hydrateShoppingWizardFromDraft(draft: ShoppingDraftClientView): ShoppingWizardHydrateState {
  const groups: ShoppingWizardAdGroup[] = draft.adGroups.length
    ? draft.adGroups.map((group) => ({
        name: group.name,
        defaultBidDollars: microsToDollars(group.defaultBidMicros),
        productGroups: group.productGroups.length
          ? group.productGroups.map((item) => ({
              kind: asProductGroupKind(item.kind),
              valueText: item.valueText,
              dimensionText: item.dimensionText,
              included: item.included,
            }))
          : emptyGroup().productGroups,
        listings: group.listings.map((item) => ({
          kind: item.kind === "UNIT" ? "UNIT" : "ALL_PRODUCTS",
          valueText: item.valueText,
          dimensionText: item.dimensionText,
          included: item.included,
        })),
      }))
    : [emptyGroup()];

  return {
    draftId: draft.id,
    customerId: draft.customerId,
    name: draft.name,
    budgetDollars: microsToDollars(draft.dailyBudgetMicros),
    merchantCenterId: draft.merchantCenterId ?? "",
    salesCountry: draft.salesCountry || "US",
    campaignPriority: asPriority(draft.campaignPriority),
    enableLocal: draft.enableLocal,
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
  };
}
