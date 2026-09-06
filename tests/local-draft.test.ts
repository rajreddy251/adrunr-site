import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildLocalDraftMutate,
  defaultLocalDraftTree,
  extractLocalResourceNames,
  parseLocalDraftTree,
  parseLocalDraftWrite,
} from "@/lib/local-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops local tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "MAXIMIZE_CONVERSIONS",
  goal: "STORE_VISITS",
  businessName: "Adrunr Local",
  finalUrl: "https://adrunr.app",
  locations: [
    {
      kind: "PLACE_ID",
      valueText: "Adrunr store",
      placeIdText: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      addressText: "1 Market St, San Francisco, CA",
      included: true,
    },
  ],
  adGroups: [
    {
      name: "Store visits 1",
      defaultBidMicros: 1_000_000,
      ads: [
        {
          headlines: ["Visit the store", "Find us nearby"],
          descriptions: ["Store-visit Local ads stay PAUSED.", "Validate the full tree first."],
          finalUrl: "https://adrunr.app",
        },
      ],
    },
  ],
  targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
};

describe("local draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED LOCAL and validateOnly by default", () => {
    const tree = parseLocalDraftTree(completeTree);
    const request = buildLocalDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: {
          create: {
            status: string;
            advertisingChannelType: string;
            advertisingChannelSubType?: string;
            maximizeConversions?: object;
          };
        };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("LOCAL");
    expect(campaign.advertisingChannelSubType).toBe("LOCAL_CAMPAIGN");
    expect(campaign.maximizeConversions).toEqual({});
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
    expect(() => parseLocalDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects missing location / missing geo / unimplemented goal or bidding apply", () => {
    expect(() => parseLocalDraftTree({ ...completeTree, locations: [] })).toThrow(/store location/);
    expect(() => parseLocalDraftTree({ ...completeTree, targets: [] })).toThrow(/GEO/);
    expect(() => parseLocalDraftTree({ ...completeTree, biddingStrategy: "TARGET_ROAS" })).toThrow(
      /schema-ready but not applied/,
    );
    expect(() => parseLocalDraftTree({ ...completeTree, goal: "STORE_SALES" })).toThrow(
      /schema-ready but not applied/,
    );
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseLocalDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      adGroups: [{ name: "Later", ads: [] }],
    });
    expect(written.adGroups).toHaveLength(1);
    expect(written.adGroups[0].ads).toEqual([]);
    expect(written.biddingStrategy).toBe("MAXIMIZE_CONVERSIONS");
    expect(written.goal).toBe("STORE_VISITS");
    expect(written.locations).toEqual([]);
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractLocalResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultLocalDraftTree({ customerId: "1234567890" });
    expect(() => parseLocalDraftTree(tree)).not.toThrow();
    const request = buildLocalDraftMutate(parseLocalDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("LOCAL");
    expect(tree.locations[0].kind).toBe("PLACE_ID");
    expect(tree.goal).toBe("STORE_VISITS");
  });
});
