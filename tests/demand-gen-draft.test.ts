import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildDemandGenDraftMutate,
  defaultDemandGenDraftTree,
  extractDemandGenResourceNames,
  parseDemandGenDraftTree,
  parseDemandGenDraftWrite,
} from "@/lib/demand-gen-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops demand gen tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "MAXIMIZE_CONVERSIONS",
  adGroups: [
    {
      name: "Demand Gen group 1",
      defaultBidMicros: 1_000_000,
      ads: [
        {
          headlines: ["One headline here", "Second headline", "Third headline"],
          descriptions: ["First description for the Demand Gen ad."],
          businessName: "Adrunr",
          finalUrl: "https://adrunr.app",
          callToActionText: "LEARN_MORE",
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
      valueText: "Website visitors (Demand Gen audience)",
      criterionText: "customers/1234567890/userLists/111",
    },
  ],
};

describe("demand gen draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED DEMAND_GEN and validateOnly by default", () => {
    const tree = parseDemandGenDraftTree(completeTree);
    const request = buildDemandGenDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: {
            status: string;
            advertisingChannelType: string;
            maximizeConversions?: object;
            demandGenCampaignSettings?: { channelControls?: { selectedChannels?: object } };
          };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("DEMAND_GEN");
    expect(campaign.maximizeConversions).toEqual({});
    expect(campaign.demandGenCampaignSettings?.channelControls?.selectedChannels).toEqual({
      youtubeInStream: true,
      youtubeInFeed: true,
      youtubeShorts: true,
      discover: true,
      gmail: true,
      display: true,
    });
    expect(request.mutateOperations.some((op) => "adGroupOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "assetOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupAdOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupCriterionOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
    const ad = (
      request.mutateOperations.find((op) => "adGroupAdOperation" in op) as {
        adGroupAdOperation: { create: { status: string; ad: { demandGenMultiAssetAd?: object } } };
      }
    ).adGroupAdOperation.create;
    expect(ad.status).toBe("PAUSED");
    expect(ad.ad.demandGenMultiAssetAd).toBeTruthy();
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parseDemandGenDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects incomplete headlines / missing geo / unimplemented bidding apply", () => {
    expect(() =>
      parseDemandGenDraftTree({
        ...completeTree,
        adGroups: [
          {
            name: "Thin",
            ads: [
              {
                headlines: ["Only one"],
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
    expect(() => parseDemandGenDraftTree({ ...completeTree, targets: [] })).toThrow(/GEO/);
    expect(() => parseDemandGenDraftTree({ ...completeTree, biddingStrategy: "TARGET_ROAS" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() =>
      parseDemandGenDraftTree({
        ...completeTree,
        audiences: [
          {
            kind: "AFFINITY",
            valueText: "Sports fans",
            criterionText: "affinity/1",
          },
        ],
      }),
    ).toThrow(/schema-ready but not applied/);
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseDemandGenDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      adGroups: [{ name: "Later", ads: [] }],
    });
    expect(written.adGroups).toHaveLength(1);
    expect(written.adGroups[0].ads).toEqual([]);
    expect(written.biddingStrategy).toBe("MAXIMIZE_CONVERSIONS");
    expect(written.youtubeInStream).toBe(true);
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractDemandGenResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultDemandGenDraftTree({ customerId: "1234567890" });
    expect(() => parseDemandGenDraftTree(tree)).not.toThrow();
    const request = buildDemandGenDraftMutate(parseDemandGenDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("DEMAND_GEN");
    expect(tree.audiences[0].kind).toBe("USER_LIST");
  });
});
