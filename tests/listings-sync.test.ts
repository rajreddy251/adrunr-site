import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertListingsSyncReadOnly,
  countListings,
  LISTINGS_SYNC_JOB_TYPE,
  mapLiveSearchRowsToCampaigns,
  parseListingsSyncInput,
} from "@/lib/listings";
import { mockListings } from "@/lib/mock-data";
import { LISTINGS_SYNC_READ_ONLY_NOTE } from "@/lib/safety";

describe("listings sync input", () => {
  it("defaults dry-run to true and requires a customer", () => {
    expect(parseListingsSyncInput({ customerId: "123-456-7890" })).toEqual({
      customerId: "1234567890",
      dryRun: true,
    });
    expect(parseListingsSyncInput({ customerId: "1234567890", dryRun: false })).toEqual({
      customerId: "1234567890",
      dryRun: false,
    });
    expect(() => parseListingsSyncInput({})).toThrow(/customerId/);
  });

  it("refuses enable, unpause, and mutate payloads", () => {
    expect(() =>
      parseListingsSyncInput({ customerId: "1234567890", enable: true }),
    ).toThrow(LISTINGS_SYNC_READ_ONLY_NOTE);
    expect(() =>
      parseListingsSyncInput({ customerId: "1234567890", unpause: true }),
    ).toThrow(/read-only/i);
    expect(() =>
      parseListingsSyncInput({
        customerId: "1234567890",
        mutateOperations: [{ campaignOperation: { update: { status: "ENABLED" } } }],
      }),
    ).toThrow(/read-only/i);
    expect(() =>
      assertListingsSyncReadOnly({ status: "ENABLED", apply: true }),
    ).toThrow(/read-only/i);
  });
});

describe("mock listings fixtures", () => {
  it("demos Search + Display trees without live Ads", () => {
    const campaigns = mockListings("1234567890");
    const counts = countListings(campaigns);
    expect(LISTINGS_SYNC_JOB_TYPE).toBe("sync_listings");
    expect(counts).toEqual({ campaigns: 2, adGroups: 2, ads: 2, keywords: 2 });
    expect(campaigns[0]?.advertisingChannelType).toBe("SEARCH");
    expect(campaigns[0]?.status).toBe("PAUSED");
    expect(campaigns[0]?.adGroups[0]?.keywords.some((row) => row.isNegative)).toBe(true);
    expect(campaigns[1]?.status).toBe("ENABLED");
    expect(campaigns[1]?.name).toMatch(/Display/);
  });
});

describe("live GAQL row mapping", () => {
  it("nests ad groups, ads, and keywords under campaigns", () => {
    const campaigns = mapLiveSearchRowsToCampaigns({
      campaignRows: [
        {
          campaign: {
            id: "100",
            resourceName: "customers/1/campaigns/100",
            name: "Live Search",
            status: "PAUSED",
            servingStatus: "PENDING",
            advertisingChannelType: "SEARCH",
            biddingStrategyType: "MANUAL_CPC",
          },
        },
      ],
      adGroupRows: [
        {
          adGroup: {
            id: "200",
            resourceName: "customers/1/adGroups/200",
            name: "AG",
            status: "PAUSED",
            type: "SEARCH_STANDARD",
            campaign: "customers/1/campaigns/100",
          },
        },
      ],
      adRows: [
        {
          adGroupAd: {
            resourceName: "customers/1/adGroupAds/200~300",
            status: "PAUSED",
            adGroup: "customers/1/adGroups/200",
            ad: {
              id: "300",
              type: "RESPONSIVE_SEARCH_AD",
              name: "RSA",
              finalUrls: ["https://adrunr.com"],
              responsiveSearchAd: {
                headlines: [{ text: "Hello" }, { text: "World" }],
                descriptions: [{ text: "Ops tools" }],
              },
            },
          },
        },
      ],
      keywordRows: [
        {
          adGroupCriterion: {
            criterionId: "400",
            resourceName: "customers/1/adGroupCriteria/200~400",
            status: "ENABLED",
            negative: false,
            adGroup: "customers/1/adGroups/200",
            keyword: { text: "adrunr", matchType: "EXACT" },
          },
        },
      ],
    });

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]?.adGroups[0]?.ads[0]?.headlinesText).toBe("Hello\nWorld");
    expect(campaigns[0]?.adGroups[0]?.ads[0]?.finalUrl).toBe("https://adrunr.com");
    expect(campaigns[0]?.adGroups[0]?.keywords[0]?.text).toBe("adrunr");
    expect(countListings(campaigns)).toEqual({ campaigns: 1, adGroups: 1, ads: 1, keywords: 1 });
  });
});

describe("listings sync source locks", () => {
  it("does not ship a mutate or enable path", () => {
    const sync = readFileSync(resolve(process.cwd(), "src/lib/listings-sync.ts"), "utf8");
    expect(sync).toContain('jobType: LISTINGS_SYNC_JOB_TYPE');
    expect(sync).toContain("readOnly: true");
    expect(sync).not.toContain("googleAds:mutate");
    expect(sync).not.toContain('status: "ENABLED"');
  });
});
