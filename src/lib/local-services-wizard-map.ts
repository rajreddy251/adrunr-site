import type { LocalServicesDraftClientView } from "./types";

export type LocalServicesWizardCategory = {
  kind: "PRIMARY" | "ADDITIONAL";
  categoryId: string;
  valueText: string;
  included: boolean;
};

export type LocalServicesWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type LocalServicesWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  maxLeadBidDollars: string;
  businessName: string;
  licenseText: string;
  insuranceText: string;
  googleGuaranteed: boolean;
  startDate: string;
  endDate: string;
  categories: LocalServicesWizardCategory[];
  targets: LocalServicesWizardTarget[];
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asCategoryKind(value: string): LocalServicesWizardCategory["kind"] {
  return value === "ADDITIONAL" ? "ADDITIONAL" : "PRIMARY";
}

export function hydrateLocalServicesWizardFromDraft(
  draft: LocalServicesDraftClientView,
): LocalServicesWizardHydrateState {
  return {
    draftId: draft.id,
    customerId: draft.customerId,
    name: draft.name,
    budgetDollars: microsToDollars(draft.dailyBudgetMicros),
    maxLeadBidDollars: microsToDollars(draft.maxLeadBidMicros ?? "2000000"),
    businessName: draft.businessName ?? "Adrunr Local Services",
    licenseText: draft.licenseText ?? "",
    insuranceText: draft.insuranceText ?? "",
    googleGuaranteed: draft.googleGuaranteed,
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
    categories: draft.categories.length
      ? draft.categories.map((item) => ({
          kind: asCategoryKind(item.kind),
          categoryId: item.categoryId,
          valueText: item.valueText,
          included: item.included,
        }))
      : [{ kind: "PRIMARY", categoryId: "xcat:home_services:plumber", valueText: "Plumber", included: true }],
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
