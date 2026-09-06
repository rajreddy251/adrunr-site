import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildPmaxDraftMutate,
  defaultPmaxDraftTree,
  extractPmaxResourceNames,
  parsePmaxDraftTree,
  parsePmaxDraftWrite,
} from "@/lib/pmax-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops pmax tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "MAXIMIZE_CONVERSIONS",
  assetGroups: [
    {
      name: "PMax group 1",
      finalUrl: "https://adrunr.app",
      headlines: ["One headline here", "Second headline", "Third headline"],
      longHeadlines: ["Long headline for the paused Performance Max draft."],
      descriptions: ["First description for the asset group.", "Second description for the asset group."],
      businessName: "Adrunr",
      assets: [
        { kind: "MARKETING_IMAGE", urlText: "https://placehold.co/1200x628/png" },
        { kind: "SQUARE_MARKETING_IMAGE", urlText: "https://placehold.co/300x300/png" },
      ],
    },
  ],
  targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
  signals: [
    {
      kind: "SEARCH_THEME",
      valueText: "paused campaign tools",
      criterionText: "paused campaign tools",
    },
  ],
};

describe("performance max draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED PERFORMANCE_MAX and validateOnly by default", () => {
    const tree = parsePmaxDraftTree(completeTree);
    const request = buildPmaxDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: { status: string; advertisingChannelType: string; maximizeConversions?: object };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("PERFORMANCE_MAX");
    expect(campaign.maximizeConversions).toEqual({});
    expect(request.mutateOperations.some((op) => "assetGroupOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "assetOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "assetGroupAssetOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "assetGroupSignalOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
    const assetGroup = (
      request.mutateOperations.find((op) => "assetGroupOperation" in op) as {
        assetGroupOperation: { create: { status: string } };
      }
    ).assetGroupOperation.create;
    expect(assetGroup.status).toBe("PAUSED");
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parsePmaxDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects incomplete assets / missing geo / unimplemented bidding apply", () => {
    expect(() =>
      parsePmaxDraftTree({
        ...completeTree,
        assetGroups: [
          {
            name: "Thin",
            finalUrl: "https://adrunr.app",
            headlines: ["Only one"],
            longHeadlines: ["Long enough headline"],
            descriptions: ["Only one desc", "Second desc"],
            businessName: "Adrunr",
            assets: [
              { kind: "MARKETING_IMAGE", urlText: "https://placehold.co/1200x628/png" },
              { kind: "SQUARE_MARKETING_IMAGE", urlText: "https://placehold.co/300x300/png" },
            ],
          },
        ],
      }),
    ).toThrow(/headlines/);
    expect(() =>
      parsePmaxDraftTree({
        ...completeTree,
        targets: [],
      }),
    ).toThrow(/GEO/);
    expect(() => parsePmaxDraftTree({ ...completeTree, biddingStrategy: "TARGET_ROAS" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() =>
      parsePmaxDraftTree({
        ...completeTree,
        signals: [
          {
            kind: "USER_LIST",
            valueText: "Website visitors",
            criterionText: "customers/1234567890/userLists/111",
          },
        ],
      }),
    ).toThrow(/schema-ready but not applied/);
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parsePmaxDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      assetGroups: [{ name: "Later", assets: [] }],
    });
    expect(written.assetGroups).toHaveLength(1);
    expect(written.assetGroups[0].assets).toEqual([]);
    expect(written.biddingStrategy).toBe("MAXIMIZE_CONVERSIONS");
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractPmaxResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultPmaxDraftTree({ customerId: "1234567890" });
    expect(() => parsePmaxDraftTree(tree)).not.toThrow();
    const request = buildPmaxDraftMutate(parsePmaxDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("PERFORMANCE_MAX");
    expect(tree.signals[0].kind).toBe("SEARCH_THEME");
  });

  it("applies ALL_PRODUCTS listing only when merchantCenterId is set", () => {
    const withoutMc = parsePmaxDraftTree({
      ...completeTree,
      assetGroups: [
        {
          ...completeTree.assetGroups[0],
          listings: [{ kind: "ALL_PRODUCTS", valueText: "All products", dimensionText: "" }],
        },
      ],
    });
    const skipped = buildPmaxDraftMutate(withoutMc, true);
    expect(skipped.mutateOperations.some((op) => "assetGroupListingGroupFilterOperation" in op)).toBe(false);

    const withMc = parsePmaxDraftTree({
      ...completeTree,
      merchantCenterId: "123456789",
      assetGroups: [
        {
          ...completeTree.assetGroups[0],
          listings: [{ kind: "ALL_PRODUCTS", valueText: "All products", dimensionText: "" }],
        },
      ],
    });
    const applied = buildPmaxDraftMutate(withMc, true);
    expect(applied.mutateOperations.some((op) => "assetGroupListingGroupFilterOperation" in op)).toBe(true);
  });
});
