import { describe, expect, it } from "vitest";

import {
  buildImportedDraftTree,
  parseCampaignImportInput,
  refuseEnableOnImport,
  resolveImportDraftKind,
} from "@/lib/campaign-import";
import { mockListings } from "@/lib/mock-data";
import { CAMPAIGN_IMPORT_NOTE } from "@/lib/safety";
import { parseSearchDraftWrite } from "@/lib/search-draft";
import { parseDisplayDraftWrite } from "@/lib/display-draft";

describe("campaign import input", () => {
  it("defaults dry-run to true and requires a cached campaign id", () => {
    expect(parseCampaignImportInput({ customerId: "123-456-7890", campaignExternalId: "1111111111" })).toEqual({
      customerId: "1234567890",
      syncedCampaignId: null,
      campaignExternalId: "1111111111",
      dryRun: true,
    });
    expect(
      parseCampaignImportInput({
        customerId: "1234567890",
        syncedCampaignId: "sync_1",
        dryRun: false,
      }),
    ).toEqual({
      customerId: "1234567890",
      syncedCampaignId: "sync_1",
      campaignExternalId: null,
      dryRun: false,
    });
    expect(() => parseCampaignImportInput({ customerId: "1234567890" })).toThrow(/syncedCampaignId/);
  });

  it("refuses enable, unpause, and mutate payloads", () => {
    expect(() =>
      parseCampaignImportInput({ customerId: "1234567890", campaignExternalId: "1", enable: true }),
    ).toThrow(CAMPAIGN_IMPORT_NOTE);
    expect(() =>
      refuseEnableOnImport({ customerId: "1234567890", unpause: true }),
    ).toThrow(/never enable/i);
    expect(() =>
      refuseEnableOnImport({
        customerId: "1234567890",
        mutateOperations: [{ campaignOperation: { update: { status: "ENABLED" } } }],
      }),
    ).toThrow(/never enable/i);
  });
});

describe("channel mapping", () => {
  it("maps Google advertising channel types onto create-type drafts", () => {
    expect(resolveImportDraftKind("SEARCH")).toBe("SEARCH");
    expect(resolveImportDraftKind("DISPLAY")).toBe("DISPLAY");
    expect(resolveImportDraftKind("PERFORMANCE_MAX")).toBe("PMAX");
    expect(resolveImportDraftKind("DEMAND_GEN")).toBe("DEMAND_GEN");
    expect(resolveImportDraftKind("VIDEO")).toBe("VIDEO");
    expect(resolveImportDraftKind("SHOPPING")).toBe("SHOPPING");
    expect(resolveImportDraftKind("MULTI_CHANNEL")).toBe("APP");
    expect(resolveImportDraftKind("HOTEL")).toBe("HOTEL");
    expect(resolveImportDraftKind("LOCAL")).toBe("LOCAL");
    expect(resolveImportDraftKind("LOCAL_SERVICES")).toBe("LOCAL_SERVICES");
    expect(() => resolveImportDraftKind("SMART")).toThrow(/Unsupported advertising channel/);
  });
});

describe("import mapping from mock listings", () => {
  it("maps Search cache into a PAUSED-path Search create tree that parses", () => {
    const search = mockListings("1234567890")[0]!;
    const mapped = buildImportedDraftTree({ customerId: "1234567890", campaign: search });
    expect(mapped.kind).toBe("SEARCH");
    expect(mapped.preview.applyPath).toBe("PAUSED");
    expect(mapped.preview.neverEnable).toBe(true);
    expect(mapped.preview.name).toMatch(/\(import\)$/);
    expect(mapped.tree.name).toMatch(/\(import\)$/);
    expect(String(mapped.tree.notesText)).toMatch(/PAUSED create path/);
    expect(mapped.preview.sourceStatus).toBe("PAUSED");
    const parsed = parseSearchDraftWrite(mapped.tree);
    expect(parsed.adGroups[0]?.keywords.some((row) => row.isNegative)).toBe(true);
    expect(parsed.adGroups[0]?.ads[0]?.headlines.length).toBeGreaterThanOrEqual(3);
  });

  it("maps an ENABLED Display snapshot without copying enable into the draft", () => {
    const display = mockListings("1234567890")[1]!;
    expect(display.status).toBe("ENABLED");
    const mapped = buildImportedDraftTree({
      customerId: "1234567890",
      campaign: display,
      dailyBudgetMicros: 40_000_000,
    });
    expect(mapped.kind).toBe("DISPLAY");
    expect(mapped.preview.sourceStatus).toBe("ENABLED");
    expect(mapped.preview.applyPath).toBe("PAUSED");
    expect(mapped.preview.warnings.join(" ")).toMatch(/ENABLED/);
    expect(mapped.preview.dailyBudgetMicros).toBe(40_000_000);
    const parsed = parseDisplayDraftWrite(mapped.tree);
    expect(parsed.name).toMatch(/Display/);
    expect(parsed.adGroups[0]?.ads[0]?.assets.length).toBeGreaterThan(0);
    expect(JSON.stringify(mapped.tree)).not.toMatch(/"status":"ENABLED"/);
  });
});
