import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildAppDraftMutate,
  defaultAppDraftTree,
  extractAppResourceNames,
  parseAppDraftTree,
  parseAppDraftWrite,
} from "@/lib/app-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops app tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "TARGET_CPA",
  goal: "INSTALLS",
  targetCpaMicros: 2_000_000,
  platforms: [{ platform: "ANDROID", appId: "com.adrunr.demo", included: true }],
  adGroups: [
    {
      name: "App group 1",
      defaultBidMicros: 1_000_000,
      ads: [
        {
          headlines: ["Install Adrunr", "Download the app"],
          descriptions: ["Mobile installs stay PAUSED.", "Validate the full tree first."],
          assets: [{ kind: "MARKETING_IMAGE", urlText: "https://placehold.co/1200x628/png?text=App" }],
        },
      ],
    },
  ],
  targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
};

describe("app draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED MULTI_CHANNEL APP_CAMPAIGN and validateOnly by default", () => {
    const tree = parseAppDraftTree(completeTree);
    const request = buildAppDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: {
            status: string;
            advertisingChannelType: string;
            advertisingChannelSubType: string;
            targetCpa?: { targetCpaMicros?: string };
            appCampaignSetting?: {
              appId?: string;
              appStore?: string;
              biddingStrategyGoalType?: string;
            };
          };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("MULTI_CHANNEL");
    expect(campaign.advertisingChannelSubType).toBe("APP_CAMPAIGN");
    expect(campaign.targetCpa).toEqual({ targetCpaMicros: "2000000" });
    expect(campaign.appCampaignSetting).toEqual({
      appId: "com.adrunr.demo",
      appStore: "GOOGLE_APP_STORE",
      biddingStrategyGoalType: "OPTIMIZE_INSTALLS_TARGET_INSTALL_COST",
    });
    expect(request.mutateOperations.some((op) => "adGroupOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupAdOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
    const adGroup = (
      request.mutateOperations.find((op) => "adGroupOperation" in op) as {
        adGroupOperation: { create: { status: string } };
      }
    ).adGroupOperation.create;
    expect(adGroup.status).toBe("PAUSED");
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parseAppDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects missing app id / missing geo / unimplemented goal or bidding apply", () => {
    expect(() => parseAppDraftTree({ ...completeTree, platforms: [] })).toThrow(/app id/);
    expect(() =>
      parseAppDraftTree({
        ...completeTree,
        platforms: [{ platform: "ANDROID", appId: "", included: true }],
      }),
    ).toThrow(/Android app id/);
    expect(() => parseAppDraftTree({ ...completeTree, targets: [] })).toThrow(/GEO/);
    expect(() => parseAppDraftTree({ ...completeTree, biddingStrategy: "TARGET_ROAS" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() => parseAppDraftTree({ ...completeTree, goal: "IN_APP_ACTIONS" })).toThrow(
      /schema-ready but not applied/,
    );
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseAppDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      adGroups: [{ name: "Later", ads: [] }],
    });
    expect(written.adGroups).toHaveLength(1);
    expect(written.adGroups[0].ads).toEqual([]);
    expect(written.biddingStrategy).toBe("TARGET_CPA");
    expect(written.goal).toBe("INSTALLS");
    expect(written.platforms).toEqual([]);
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractAppResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultAppDraftTree({ customerId: "1234567890" });
    expect(() => parseAppDraftTree(tree)).not.toThrow();
    const request = buildAppDraftMutate(parseAppDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: {
            status: string;
            advertisingChannelType: string;
            advertisingChannelSubType: string;
          };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("MULTI_CHANNEL");
    expect(campaign.advertisingChannelSubType).toBe("APP_CAMPAIGN");
    expect(tree.platforms[0].appId).toBe("com.adrunr.demo");
    expect(tree.goal).toBe("INSTALLS");
  });
});
