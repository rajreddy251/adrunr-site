import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildLocalServicesDraftMutate,
  defaultLocalServicesDraftTree,
  extractLocalServicesResourceNames,
  parseLocalServicesDraftTree,
  parseLocalServicesDraftWrite,
} from "@/lib/local-services-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops LSA tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "MANUAL_CPC",
  maxLeadBidMicros: 2_000_000,
  businessName: "Adrunr Local Services",
  googleGuaranteed: false,
  categories: [
    {
      kind: "PRIMARY",
      categoryId: "xcat:home_services:plumber",
      valueText: "Plumber",
      included: true,
    },
  ],
  targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
};

describe("local services draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED LOCAL_SERVICES and validateOnly by default", () => {
    const tree = parseLocalServicesDraftTree(completeTree);
    const request = buildLocalServicesDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: {
            status: string;
            advertisingChannelType: string;
            manualCpc?: object;
            localServicesCampaignSettings?: { categoryId?: string };
          };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("LOCAL_SERVICES");
    expect(campaign.manualCpc).toEqual({ enhancedCpcEnabled: false });
    expect(campaign.localServicesCampaignSettings).toEqual({
      categoryId: "xcat:home_services:plumber",
    });
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parseLocalServicesDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects missing category / missing geo / unimplemented bidding apply", () => {
    expect(() => parseLocalServicesDraftTree({ ...completeTree, categories: [] })).toThrow(/PRIMARY/);
    expect(() => parseLocalServicesDraftTree({ ...completeTree, targets: [] })).toThrow(/GEO/);
    expect(() => parseLocalServicesDraftTree({ ...completeTree, biddingStrategy: "MAXIMIZE_CONVERSIONS" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() =>
      parseLocalServicesDraftTree({
        ...completeTree,
        categories: [
          { kind: "ADDITIONAL", categoryId: "xcat:home_services:electrician", valueText: "Electrician", included: true },
        ],
      }),
    ).toThrow(/schema-ready but not applied/);
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseLocalServicesDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      categories: [],
    });
    expect(written.categories).toEqual([]);
    expect(written.biddingStrategy).toBe("MANUAL_CPC");
    expect(written.maxLeadBidMicros).toBeNull();
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractLocalServicesResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultLocalServicesDraftTree({ customerId: "1234567890" });
    expect(() => parseLocalServicesDraftTree(tree)).not.toThrow();
    const request = buildLocalServicesDraftMutate(parseLocalServicesDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("LOCAL_SERVICES");
    expect(tree.categories[0].kind).toBe("PRIMARY");
  });
});
