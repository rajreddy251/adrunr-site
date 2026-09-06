import { describe, expect, it } from "vitest";

import {
  assertApplyConfirm,
  buildSearchDraftMutate,
  defaultSearchDraftTree,
  extractResourceNames,
  parseSearchDraftTree,
  parseSearchDraftWrite,
} from "@/lib/search-draft";

const completeTree = {
  customerId: "123-456-7890",
  name: "Ops search tree",
  dailyBudgetMicros: 1_000_000,
  biddingStrategy: "MANUAL_CPC",
  adGroups: [
    {
      name: "Ad group 1",
      defaultBidMicros: 1_000_000,
      keywords: [{ text: "paused search", matchType: "PHRASE" }],
      ads: [
        {
          headlines: ["One headline here", "Second headline", "Third headline"],
          descriptions: ["First description for the RSA.", "Second description for the RSA."],
          finalUrl: "https://adrunr.app",
          path1: "search",
        },
      ],
    },
  ],
  targets: [
    { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" },
    { type: "LANGUAGE", valueText: "English", criterionText: "languageConstants/1000" },
  ],
};

describe("search draft tree", () => {
  it("builds a full-tree mutate that is always PAUSED and validateOnly by default", () => {
    const tree = parseSearchDraftTree(completeTree);
    const request = buildSearchDraftMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    const campaign = (
      request.mutateOperations[1] as { campaignOperation: { create: { status: string } } }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(request.mutateOperations.some((op) => "adGroupOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupCriterionOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "adGroupAdOperation" in op)).toBe(true);
    expect(request.mutateOperations.some((op) => "campaignCriterionOperation" in op)).toBe(true);
    const ad = (
      request.mutateOperations.find((op) => "adGroupAdOperation" in op) as {
        adGroupAdOperation: { create: { status: string } };
      }
    ).adGroupAdOperation.create;
    expect(ad.status).toBe("PAUSED");
  });

  it("rejects ENABLED status and apply without CREATE PAUSED", () => {
    expect(() => parseSearchDraftTree({ ...completeTree, status: "ENABLED" })).toThrow(/PAUSED/);
    expect(() => assertApplyConfirm(false, "")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "please")).toThrow(/CREATE PAUSED/);
    expect(() => assertApplyConfirm(false, "CREATE PAUSED")).not.toThrow();
    expect(() => assertApplyConfirm(true, "")).not.toThrow();
  });

  it("rejects incomplete RSA / missing language / unimplemented bidding apply", () => {
    expect(() =>
      parseSearchDraftTree({
        ...completeTree,
        adGroups: [
          {
            name: "Thin",
            defaultBidMicros: 1_000_000,
            keywords: [{ text: "x", matchType: "EXACT" }],
            ads: [{ headlines: ["Only one"], descriptions: ["Only one desc"], finalUrl: "https://adrunr.app" }],
          },
        ],
      }),
    ).toThrow(/headlines/);
    expect(() =>
      parseSearchDraftTree({
        ...completeTree,
        targets: [{ type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840" }],
      }),
    ).toThrow(/LANGUAGE/);
    expect(() => parseSearchDraftTree({ ...completeTree, biddingStrategy: "TARGET_ROAS" })).toThrow(
      /schema-ready but not applied/,
    );
  });

  it("allows incomplete writes so the wizard can persist mid-flow", () => {
    const written = parseSearchDraftWrite({
      customerId: "1234567890",
      name: "WIP",
      adGroups: [{ name: "Later", keywords: [] }],
    });
    expect(written.adGroups).toHaveLength(1);
    expect(written.adGroups[0].keywords).toEqual([]);
    expect(written.biddingStrategy).toBe("MANUAL_CPC");
  });

  it("extracts campaign resource names from mutate responses", () => {
    expect(
      extractResourceNames({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/1234567890/campaigns/99" } },
        ],
      }).campaign,
    ).toBe("customers/1234567890/campaigns/99");
  });

  it("ships a default tree that already validates", () => {
    const tree = defaultSearchDraftTree({ customerId: "1234567890" });
    expect(() => parseSearchDraftTree(tree)).not.toThrow();
    const request = buildSearchDraftMutate(parseSearchDraftTree(tree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as { campaignOperation: { create: { status: string } } }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
  });
});
