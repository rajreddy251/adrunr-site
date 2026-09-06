import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildShoppingDraftMutate,
  defaultShoppingDraftTree,
  extractShoppingResourceNames,
  parseShoppingDraftTree,
  parseShoppingDraftWrite,
} from "@/lib/shopping-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops shopping tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "MANUAL_CPC",
  merchantCenterId: "123456789",
  salesCountry: "US",
  campaignPriority: "LOW",
  adGroups: [
    {
      name: "Shopping group 1",
      defaultBidMicros: 1_000_000,
      productGroups: [
        { kind: "ALL_PRODUCTS", valueText: "All products", dimensionText: "", included: true },
      ],
      listings: [],
    },
  ],
  targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
};

describe("shopping draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED SHOPPING and validateOnly by default", () => {
    const tree = parseShoppingDraftTree(completeTree);
    const request = buildShoppingDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: {
            status: string;
            advertisingChannelType: string;
            manualCpc?: object;
            shoppingSetting?: { merchantId?: string; feedLabel?: string; campaignPriority?: string };
          };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("SHOPPING");
    expect(campaign.manualCpc).toEqual({ enhancedCpcEnabled: false });
    expect(campaign.shoppingSetting).toEqual({
      merchantId: "123456789",
      feedLabel: "US",
      campaignPriority: "LOW",
      enableLocal: false,
    });
    expect(request.mutateOperations.some((op) => "adGroupOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupCriterionOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
    const adGroup = (
      request.mutateOperations.find((op) => "adGroupOperation" in op) as {
        adGroupOperation: { create: { status: string; type: string } };
      }
    ).adGroupOperation.create;
    expect(adGroup.status).toBe("PAUSED");
    expect(adGroup.type).toBe("SHOPPING_PRODUCT_ADS");
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parseShoppingDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects missing merchant / missing geo / unimplemented bidding apply", () => {
    expect(() => parseShoppingDraftTree({ ...completeTree, merchantCenterId: "" })).toThrow(/merchantCenterId/);
    expect(() => parseShoppingDraftTree({ ...completeTree, targets: [] })).toThrow(/GEO/);
    expect(() => parseShoppingDraftTree({ ...completeTree, biddingStrategy: "TARGET_ROAS" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() =>
      parseShoppingDraftTree({
        ...completeTree,
        adGroups: [
          {
            name: "Thin",
            productGroups: [{ kind: "UNIT", valueText: "Brand Acme", dimensionText: "brand" }],
          },
        ],
      }),
    ).toThrow(/schema-ready but not applied/);
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseShoppingDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      adGroups: [{ name: "Later", productGroups: [] }],
    });
    expect(written.adGroups).toHaveLength(1);
    expect(written.adGroups[0].productGroups).toEqual([]);
    expect(written.biddingStrategy).toBe("MANUAL_CPC");
    expect(written.salesCountry).toBe("US");
    expect(written.merchantCenterId).toBeNull();
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractShoppingResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultShoppingDraftTree({ customerId: "1234567890" });
    expect(() => parseShoppingDraftTree(tree)).not.toThrow();
    const request = buildShoppingDraftMutate(parseShoppingDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("SHOPPING");
    expect(tree.adGroups[0].productGroups[0].kind).toBe("ALL_PRODUCTS");
  });
});
