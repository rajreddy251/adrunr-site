import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildDisplayDraftMutate,
  defaultDisplayDraftTree,
  extractDisplayResourceNames,
  parseDisplayDraftTree,
  parseDisplayDraftWrite,
} from "@/lib/display-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops display tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "MANUAL_CPC",
  adGroups: [
    {
      name: "Display group 1",
      defaultBidMicros: 1_000_000,
      ads: [
        {
          headlines: ["One headline here", "Second headline", "Third headline"],
          longHeadline: "Long headline for the paused Display draft.",
          descriptions: ["First description for the RDA.", "Second description for the RDA."],
          businessName: "Adrunr",
          finalUrl: "https://adrunr.app",
          assets: [
            { kind: "MARKETING_IMAGE", urlText: "https://placehold.co/1200x628/png" },
            { kind: "SQUARE_MARKETING_IMAGE", urlText: "https://placehold.co/300x300/png" },
          ],
        },
      ],
    },
  ],
  targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
  audiences: [
    {
      kind: "USER_LIST",
      valueText: "Website visitors (remarketing)",
      criterionText: "customers/1234567890/userLists/111",
    },
  ],
};

describe("display draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED DISPLAY and validateOnly by default", () => {
    const tree = parseDisplayDraftTree(completeTree);
    const request = buildDisplayDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("DISPLAY");
    expect(request.mutateOperations.some((op) => "adGroupOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "assetOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupAdOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupCriterionOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
    const ad = (
      request.mutateOperations.find((op) => "adGroupAdOperation" in op) as {
        adGroupAdOperation: { create: { status: string } };
      }
    ).adGroupAdOperation.create;
    expect(ad.status).toBe("PAUSED");
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parseDisplayDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects incomplete RDA / missing geo / unimplemented bidding apply", () => {
    expect(() =>
      parseDisplayDraftTree({
        ...completeTree,
        adGroups: [
          {
            name: "Thin",
            defaultBidMicros: 1_000_000,
            ads: [
              {
                headlines: [],
                longHeadline: "Long enough headline",
                descriptions: ["Only one desc"],
                businessName: "Adrunr",
                finalUrl: "https://adrunr.app",
                assets: [
                  { kind: "MARKETING_IMAGE", urlText: "https://placehold.co/1200x628/png" },
                  { kind: "SQUARE_MARKETING_IMAGE", urlText: "https://placehold.co/300x300/png" },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrow(/headlines/);
    expect(() =>
      parseDisplayDraftTree({
        ...completeTree,
        targets: [],
      }),
    ).toThrow(/GEO/);
    expect(() => parseDisplayDraftTree({ ...completeTree, biddingStrategy: "TARGET_ROAS" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() =>
      parseDisplayDraftTree({
        ...completeTree,
        audiences: [
          {
            kind: "AFFINITY",
            valueText: "Sports fans",
            criterionText: "affinityConstants/1",
          },
        ],
      }),
    ).toThrow(/schema-ready but not applied/);
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseDisplayDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      adGroups: [{ name: "Later", ads: [] }],
    });
    expect(written.adGroups).toHaveLength(1);
    expect(written.adGroups[0].ads).toEqual([]);
    expect(written.biddingStrategy).toBe("MANUAL_CPC");
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractDisplayResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultDisplayDraftTree({ customerId: "1234567890" });
    expect(() => parseDisplayDraftTree(tree)).not.toThrow();
    const request = buildDisplayDraftMutate(parseDisplayDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("DISPLAY");
    expect(tree.audiences[0].kind).toBe("USER_LIST");
  });
});
