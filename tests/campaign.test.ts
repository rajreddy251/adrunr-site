import { describe, expect, it } from "vitest";

import { buildPausedSearchCampaignMutate, parseCampaignInput } from "@/lib/campaign";
import { assertPausedOnly, resolveDryRun } from "@/lib/safety";

describe("paused campaign payload", () => {
  it("defaults dry-run to true and always sets PAUSED", () => {
    const input = parseCampaignInput({
      customerId: "123-456-7890",
      name: "Ops search",
      dailyBudgetMicros: 1_000_000,
    });
    const request = buildPausedSearchCampaignMutate(input);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");

    const campaign = (
      request.mutateOperations[1] as {
        campaignOperation: { create: { status: string; advertisingChannelType: string } };
      }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
    expect(campaign.advertisingChannelType).toBe("SEARCH");
  });

  it("allows apply only as paused when dryRun is false", () => {
    const request = buildPausedSearchCampaignMutate({
      customerId: "1234567890",
      name: "Apply paused",
      dailyBudgetMicros: 2_000_000,
      dryRun: false,
    });
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as { campaignOperation: { create: { status: string } } }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
  });

  it("rejects an ENABLED status before mutate", () => {
    expect(() =>
      parseCampaignInput({
        customerId: "1234567890",
        name: "Nope",
        dailyBudgetMicros: 1_000_000,
        status: "ENABLED",
      }),
    ).toThrow(/PAUSED/);
  });

  it("treats omitted dryRun as true", () => {
    expect(resolveDryRun(undefined)).toBe(true);
    expect(resolveDryRun(null)).toBe(true);
    expect(resolveDryRun(false)).toBe(false);
  });

  it("never lets assertPausedOnly through ENABLED", () => {
    expect(assertPausedOnly(undefined)).toBe("PAUSED");
    expect(() => assertPausedOnly("ENABLED")).toThrow(/enable path/);
  });

  it("rejects apply without CREATE PAUSED confirm phrase", () => {
    expect(() =>
      parseCampaignInput({
        customerId: "1234567890",
        name: "Apply paused",
        dailyBudgetMicros: 1_000_000,
        dryRun: false,
      }),
    ).toThrow(/CREATE PAUSED/);
    expect(() =>
      parseCampaignInput({
        customerId: "1234567890",
        name: "Apply paused",
        dailyBudgetMicros: 1_000_000,
        dryRun: false,
        confirmPhrase: "please",
      }),
    ).toThrow(/CREATE PAUSED/);
  });

  it("accepts apply when confirm phrase matches and still stays PAUSED", () => {
    const input = parseCampaignInput({
      customerId: "1234567890",
      name: "Apply paused",
      dailyBudgetMicros: 1_000_000,
      dryRun: false,
      confirmPhrase: "CREATE PAUSED",
    });
    const request = buildPausedSearchCampaignMutate(input);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[1] as { campaignOperation: { create: { status: string } } }
    ).campaignOperation.create;
    expect(campaign.status).toBe("PAUSED");
  });

  it("does not require a confirm phrase for dry-run", () => {
    expect(() =>
      parseCampaignInput({
        customerId: "1234567890",
        name: "Dry run",
        dailyBudgetMicros: 1_000_000,
        dryRun: true,
      }),
    ).not.toThrow();
  });
});
