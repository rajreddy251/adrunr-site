import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildHotelDraftMutate,
  defaultHotelDraftTree,
  extractHotelResourceNames,
  parseHotelDraftTree,
  parseHotelDraftWrite,
} from "@/lib/hotel-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops hotel tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "PERCENT_CPC",
  hotelCenterId: "123456789",
  percentCpcCeilingMicros: 2_000_000,
  adGroups: [
    {
      name: "Hotel group 1",
      defaultBidMicros: 1_000_000,
      listings: [{ kind: "ALL_HOTELS", valueText: "All hotels", hotelIdText: "", included: true }],
    },
  ],
  targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
};

describe("hotel draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED HOTEL and validateOnly by default", () => {
    const tree = parseHotelDraftTree(completeTree);
    const request = buildHotelDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: {
            status: string;
            advertisingChannelType: string;
            percentCpc?: { cpcBidCeilingMicros?: string };
            hotelSetting?: { hotelCenterId?: string };
          };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("HOTEL");
    expect(campaign.percentCpc).toEqual({ cpcBidCeilingMicros: "2000000" });
    expect(campaign.hotelSetting).toEqual({ hotelCenterId: "123456789" });
    expect(request.mutateOperations.some((op) => "adGroupOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupCriterionOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
    const adGroup = (
      request.mutateOperations.find((op) => "adGroupOperation" in op) as {
        adGroupOperation: { create: { status: string; type: string } };
      }
    ).adGroupOperation.create;
    expect(adGroup.status).toBe("PAUSED");
    expect(adGroup.type).toBe("HOTEL_ADS");
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parseHotelDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects missing Hotel Center / missing geo / unimplemented listing or bidding apply", () => {
    expect(() => parseHotelDraftTree({ ...completeTree, hotelCenterId: "" })).toThrow(/hotelCenterId/);
    expect(() => parseHotelDraftTree({ ...completeTree, targets: [] })).toThrow(/GEO/);
    expect(() => parseHotelDraftTree({ ...completeTree, biddingStrategy: "TARGET_ROAS" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() =>
      parseHotelDraftTree({
        ...completeTree,
        adGroups: [
          {
            name: "Thin",
            listings: [
              { kind: "ALL_HOTELS", valueText: "All hotels", hotelIdText: "", included: true },
              { kind: "UNIT", valueText: "Hotel 1", hotelIdText: "H1", included: true },
            ],
          },
        ],
      }),
    ).toThrow(/schema-ready but not applied/);
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseHotelDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      adGroups: [{ name: "Later", listings: [] }],
    });
    expect(written.adGroups).toHaveLength(1);
    expect(written.adGroups[0].listings).toEqual([]);
    expect(written.biddingStrategy).toBe("PERCENT_CPC");
    expect(written.hotelCenterId).toBeNull();
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractHotelResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultHotelDraftTree({ customerId: "1234567890" });
    expect(() => parseHotelDraftTree(tree)).not.toThrow();
    const request = buildHotelDraftMutate(parseHotelDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("HOTEL");
    expect(tree.adGroups[0].listings[0].kind).toBe("ALL_HOTELS");
  });
});
