import type { HotelDraftClientView } from "./types";

export type HotelWizardListing = {
  kind: "ALL_HOTELS" | "UNIT";
  valueText: string;
  hotelIdText: string;
  included: boolean;
};

export type HotelWizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  listings: HotelWizardListing[];
};

export type HotelWizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type HotelWizardHydrateState = {
  draftId: string;
  customerId: string;
  name: string;
  budgetDollars: string;
  hotelCenterId: string;
  percentCpcCeilingDollars: string;
  startDate: string;
  endDate: string;
  groups: HotelWizardAdGroup[];
  targets: HotelWizardTarget[];
};

function microsToDollars(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "1.00";
  return (n / 1_000_000).toFixed(2);
}

function asListingKind(value: string): HotelWizardListing["kind"] {
  return value === "UNIT" ? "UNIT" : "ALL_HOTELS";
}

function emptyGroup(): HotelWizardAdGroup {
  return {
    name: "Hotel listing group 1",
    defaultBidDollars: "1.00",
    listings: [{ kind: "ALL_HOTELS", valueText: "All hotels", hotelIdText: "", included: true }],
  };
}

export function hydrateHotelWizardFromDraft(draft: HotelDraftClientView): HotelWizardHydrateState {
  const groups: HotelWizardAdGroup[] = draft.adGroups.length
    ? draft.adGroups.map((group) => ({
        name: group.name,
        defaultBidDollars: microsToDollars(group.defaultBidMicros),
        listings: group.listings.length
          ? group.listings.map((item) => ({
              kind: asListingKind(item.kind),
              valueText: item.valueText,
              hotelIdText: item.hotelIdText,
              included: item.included,
            }))
          : emptyGroup().listings,
      }))
    : [emptyGroup()];

  return {
    draftId: draft.id,
    customerId: draft.customerId,
    name: draft.name,
    budgetDollars: microsToDollars(draft.dailyBudgetMicros),
    hotelCenterId: draft.hotelCenterId ?? "123456789",
    percentCpcCeilingDollars: microsToDollars(draft.percentCpcCeilingMicros ?? "2000000"),
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
