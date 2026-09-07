import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  campaignEditPath,
  campaignOverviewPath,
  channelTypeLabel,
  isEditApplyReady,
  matchCachedCampaign,
  validateCampaignEditForm,
} from "@/lib/ops-campaign";
import { CONFIRM_EDIT_PHRASE } from "@/lib/safety";
import type { SyncedCampaignView } from "@/lib/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

const demoSearch: SyncedCampaignView = {
  id: "sc_demo",
  externalId: "1111111111",
  resourceName: "customers/1234567890/campaigns/1111111111",
  name: "Demo Search — Brand",
  advertisingChannelType: "SEARCH",
  status: "PAUSED",
  servingStatus: "PENDING",
  biddingStrategyType: "MANUAL_CPC",
  lastSyncedAt: null,
  adGroups: [],
};

describe("Slice B Search Campaign Overview + Safe edit", () => {
  it("ships overview and edit routes and relocates edit off the campaigns dump", () => {
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/edit/page.tsx"))).toBe(true);
    expect(read("src/app/ops/campaigns/[id]/page.tsx")).toContain("CampaignOverview");
    expect(read("src/app/ops/campaigns/[id]/edit/page.tsx")).toContain("CampaignEdit");
    expect(campaignOverviewPath("1111111111")).toBe("/ops/campaigns/1111111111");
    expect(campaignEditPath("1111111111")).toBe("/ops/campaigns/1111111111/edit");
    expect(read("src/components/ops-campaigns.tsx")).not.toContain("EditPanel");
    expect(read("src/components/ops-campaigns.tsx")).not.toContain('data-testid="ops-campaigns-edit"');
    expect(read("src/components/campaign-edit.tsx")).toContain("EditPanel");
    expect(read("src/components/edit-panel.tsx")).toContain("data-testid=\"ops-edit\"");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-name");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-budget");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-bid");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-geo");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-language");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-confirm");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-validate");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-apply");
  });

  it("resolves a campaign from listings cache by known id and labels Search", () => {
    expect(matchCachedCampaign([demoSearch], "1111111111")?.name).toBe("Demo Search — Brand");
    expect(matchCachedCampaign([demoSearch], "sc_demo")?.externalId).toBe("1111111111");
    expect(matchCachedCampaign([demoSearch], "missing")).toBeNull();
    expect(channelTypeLabel("SEARCH")).toBe("Search");
    expect(channelTypeLabel(null)).toBe("Search");
    expect(read("src/components/campaign-overview.tsx")).toContain("ops-campaign-overview");
    expect(read("src/components/campaign-focus.tsx")).toContain("Campaign {mode === \"overview\" ? \"Overview\" : \"Safe edit\"}");
    expect(read("src/components/campaign-focus.tsx")).toContain("Status snapshot");
    expect(read("src/components/campaign-focus.tsx")).toContain("ops-campaign-pause");
    expect(read("src/components/campaign-focus.tsx")).toContain("ops-campaign-delete");
    expect(read("src/components/campaign-focus.tsx")).toContain("Open chat");
    expect(read("src/components/campaign-focus.tsx")).toContain("Coming soon");
  });

  it("never shows an Enable CTA and keeps Pause amber", () => {
    for (const rel of [
      "src/components/campaign-overview.tsx",
      "src/components/campaign-edit.tsx",
      "src/components/campaign-focus.tsx",
      "src/components/edit-panel.tsx",
      "src/app/ops/campaigns/[id]/page.tsx",
      "src/app/ops/campaigns/[id]/edit/page.tsx",
    ]) {
      expect(read(rel)).not.toMatch(/>\s*Enable\s*</);
      expect(read(rel)).not.toMatch(/go-live|unpause-to-spend/i);
    }
    expect(read("src/components/campaign-focus.tsx")).toContain("ops-btn-amber");
    expect(read("src/components/campaign-focus.tsx")).toContain("Pause");
    expect(read("src/components/edit-panel.tsx")).toContain("never enable");
  });

  it("locks Apply behind valid fields, EDIT SAFE, and dry-run off", () => {
    const unchanged = validateCampaignEditForm({
      proposedName: "Demo Search — Brand",
      proposedBudget: "25",
      proposedBid: "",
      geo: "",
      language: "",
      currentName: "Demo Search — Brand",
      currentBudget: "25",
      confirmPhrase: "",
      dryRun: true,
    });
    expect(unchanged.change).toMatch(/Change name/);

    const renamed = validateCampaignEditForm({
      proposedName: "Demo Search — Brand (ops)",
      proposedBudget: "25",
      proposedBid: "",
      geo: "",
      language: "",
      currentName: "Demo Search — Brand",
      currentBudget: "25",
      confirmPhrase: "nope",
      dryRun: false,
    });
    expect(renamed.change).toBeUndefined();
    expect(renamed.confirmPhrase).toMatch(/EDIT SAFE/);
    expect(renamed.proposedName).toBeUndefined();

    const invalidBudget = validateCampaignEditForm({
      proposedName: "Demo Search — Brand",
      proposedBudget: "abc",
      proposedBid: "",
      geo: "",
      language: "",
      currentName: "Demo Search — Brand",
      currentBudget: "25",
    });
    expect(invalidBudget.proposedBudget).toMatch(/number/);

    expect(
      isEditApplyReady({
        connected: true,
        dryRun: true,
        confirmPhrase: CONFIRM_EDIT_PHRASE,
        errors: renamed,
      }),
    ).toBe(false);
    expect(
      isEditApplyReady({
        connected: true,
        dryRun: false,
        confirmPhrase: "CREATE PAUSED",
        errors: { change: undefined },
      }),
    ).toBe(false);
    expect(
      isEditApplyReady({
        connected: true,
        dryRun: false,
        confirmPhrase: CONFIRM_EDIT_PHRASE,
        errors: {},
      }),
    ).toBe(true);

    const edit = read("src/components/edit-panel.tsx");
    expect(edit).toContain("useState(true)");
    expect(edit).toContain("CONFIRM_EDIT_PHRASE");
    expect(edit).toContain("isEditApplyReady");
    expect(edit).toContain('dryRun ? "ops-btn-primary"');
    expect(edit).toContain("text-coral-400");
    expect(edit).toContain("setError([json.error, json.hint]");
    expect(edit).not.toContain("setProposedName(\"\")");
  });

  it("leaves prior Ads APIs and panel routes intact", () => {
    expect(existsSync(resolve(root, "src/app/api/ads/edits/drafts/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ads/edits/drafts/[id]/validate/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ads/edits/drafts/[id]/apply/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ads/listings/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ads/metrics/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ads/imports/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ads/reports/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/listings/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/metrics/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/import/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/reports/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/connect/page.tsx"))).toBe(true);
    expect(read("src/app/api/ads/edits/drafts/[id]/apply/route.ts")).toContain("dryRun: false");
    expect(read("src/app/api/ads/edits/drafts/[id]/validate/route.ts")).toContain("dryRun: true");
    expect(read("src/components/ops-listings.tsx")).toContain("ListingsPanel");
    expect(read("src/components/ops-metrics.tsx")).toContain("MetricsPanel");
    expect(read("src/components/search-workspace.tsx")).toContain("ops-kind-search");
  });
});
