import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildVideoDraftMutate,
  defaultVideoDraftTree,
  extractVideoResourceNames,
  parseVideoDraftTree,
  parseVideoDraftWrite,
} from "@/lib/video-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops video tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "MANUAL_CPV",
  adGroups: [
    {
      name: "Video group 1",
      defaultBidMicros: 1_000_000,
      ads: [
        {
          headlines: ["One headline here", "Second headline"],
          descriptions: ["First description for the Video ad."],
          longHeadline: "YouTube in-stream stays PAUSED.",
          finalUrl: "https://adrunr.app",
          callToActionText: "LEARN_MORE",
          assets: [
            { kind: "YOUTUBE_VIDEO", urlText: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
            { kind: "COMPANION_BANNER", urlText: "https://placehold.co/300x60/png" },
          ],
        },
      ],
    },
  ],
  targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
  audiences: [
    {
      kind: "USER_LIST",
      valueText: "Website visitors (Video audience)",
      criterionText: "customers/1234567890/userLists/111",
    },
  ],
};

describe("video draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED VIDEO and validateOnly by default", () => {
    const tree = parseVideoDraftTree(completeTree);
    const request = buildVideoDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: {
            status: string;
            advertisingChannelType: string;
            manualCpv?: object;
            videoCampaignSettings?: { videoAdInventoryControl?: object };
          };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("VIDEO");
    expect(campaign.manualCpv).toEqual({});
    expect(campaign.videoCampaignSettings?.videoAdInventoryControl).toEqual({
      allowInStream: true,
      allowInFeed: true,
      allowShorts: true,
    });
    expect(request.mutateOperations.some((op) => "adGroupOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "assetOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupAdOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupCriterionOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
    const ad = (
      request.mutateOperations.find((op) => "adGroupAdOperation" in op) as {
        adGroupAdOperation: { create: { status: string; ad: { videoResponsiveAd?: object } } };
      }
    ).adGroupAdOperation.create;
    expect(ad.status).toBe("PAUSED");
    expect(ad.ad.videoResponsiveAd).toBeTruthy();
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parseVideoDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects missing youtube / missing geo / unimplemented bidding apply", () => {
    expect(() =>
      parseVideoDraftTree({
        ...completeTree,
        adGroups: [
          {
            name: "Thin",
            ads: [
              {
                headlines: ["Only one"],
                descriptions: ["Only one desc"],
                finalUrl: "https://adrunr.app",
                assets: [{ kind: "COMPANION_BANNER", urlText: "https://placehold.co/300x60/png" }],
              },
            ],
          },
        ],
      }),
    ).toThrow(/YOUTUBE_VIDEO/);
    expect(() => parseVideoDraftTree({ ...completeTree, targets: [] })).toThrow(/GEO/);
    expect(() => parseVideoDraftTree({ ...completeTree, biddingStrategy: "TARGET_CPA" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() =>
      parseVideoDraftTree({
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
    expect(() =>
      parseVideoDraftTree({
        ...completeTree,
        inStream: false,
        bumper: false,
        inFeed: false,
        shorts: false,
        outstream: false,
      }),
    ).toThrow(/format/);
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseVideoDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      adGroups: [{ name: "Later", ads: [] }],
    });
    expect(written.adGroups).toHaveLength(1);
    expect(written.adGroups[0].ads).toEqual([]);
    expect(written.biddingStrategy).toBe("MANUAL_CPV");
    expect(written.inStream).toBe(true);
    expect(written.bumper).toBe(false);
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractVideoResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultVideoDraftTree({ customerId: "1234567890" });
    expect(() => parseVideoDraftTree(tree)).not.toThrow();
    const request = buildVideoDraftMutate(parseVideoDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("VIDEO");
    expect(tree.audiences[0].kind).toBe("USER_LIST");
    expect(tree.adGroups[0].ads[0].assets.some((asset) => asset.kind === "YOUTUBE_VIDEO")).toBe(true);
  });
});
