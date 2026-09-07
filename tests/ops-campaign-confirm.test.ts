import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_PAUSE_DELETE_MUTATE_AVAILABLE,
  campaignDeletePath,
  campaignEditPath,
  campaignFocusModeLabel,
  campaignOverviewPath,
  campaignPausePath,
  isDeleteConfirmReady,
  isPauseConfirmReady,
  pauseDeletePrimaryEnabled,
  pauseDeletePrimaryLabel,
} from "@/lib/ops-campaign";
import {
  CAMPAIGN_DELETE_NOTE,
  CAMPAIGN_PAUSE_NOTE,
  CAMPAIGN_STATUS_COMING_SOON,
  CONFIRM_DELETE_PHRASE,
  CONFIRM_EDIT_PHRASE,
  CONFIRM_PAUSE_PHRASE,
  CONFIRM_PAUSED_PHRASE,
} from "@/lib/safety";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

const confirmSources = [
  "src/components/campaign-confirm.tsx",
  "src/components/campaign-pause.tsx",
  "src/components/campaign-delete.tsx",
  "src/components/campaign-focus.tsx",
  "src/app/ops/campaigns/[id]/pause/page.tsx",
  "src/app/ops/campaigns/[id]/delete/page.tsx",
];

describe("Slice C Pause / Delete confirms", () => {
  it("ships pause and delete confirm routes from Overview", () => {
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/pause/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/delete/page.tsx"))).toBe(true);
    expect(read("src/app/ops/campaigns/[id]/pause/page.tsx")).toContain("CampaignPause");
    expect(read("src/app/ops/campaigns/[id]/delete/page.tsx")).toContain("CampaignDelete");
    expect(campaignPausePath("1111111111")).toBe("/ops/campaigns/1111111111/pause");
    expect(campaignDeletePath("1111111111")).toBe("/ops/campaigns/1111111111/delete");
    expect(read("src/components/campaign-focus.tsx")).toContain("campaignPausePath");
    expect(read("src/components/campaign-focus.tsx")).toContain("campaignDeletePath");
    expect(read("src/components/campaign-focus.tsx")).toContain("ops-campaign-pause");
    expect(read("src/components/campaign-focus.tsx")).toContain("ops-campaign-delete");
    expect(read("src/components/campaign-focus.tsx")).not.toContain("CAMPAIGN_PAUSE_STUB_NOTE");
    expect(read("src/components/campaign-focus.tsx")).not.toContain("CAMPAIGN_DELETE_STUB_NOTE");
    expect(read("src/components/campaign-confirm.tsx")).toContain("ops-campaign-confirm-phrase");
    expect(read("src/components/campaign-confirm.tsx")).toContain("ops-btn-amber");
    expect(read("src/components/campaign-confirm.tsx")).toContain("ops-btn-danger");
    expect(read("src/app/globals.css")).toContain('.ops-btn-danger[data-armed="true"]');
  });

  it("gates Pause and Delete on exact typed phrases and never enables", () => {
    expect(CONFIRM_PAUSE_PHRASE).toBe("PAUSE CAMPAIGN");
    expect(CONFIRM_DELETE_PHRASE).toBe("DELETE CAMPAIGN");
    expect(CAMPAIGN_PAUSE_NOTE).toMatch(/will not enable later/i);
    expect(CAMPAIGN_PAUSE_NOTE).toMatch(/Re-enable only in Google Ads/);
    expect(CAMPAIGN_DELETE_NOTE).toMatch(/cannot undo|cannot restore|enable spend/i);
    expect(CAMPAIGN_STATUS_COMING_SOON).toBe("Coming soon — use Google Ads");
    expect(CAMPAIGN_PAUSE_DELETE_MUTATE_AVAILABLE).toBe(false);

    expect(isPauseConfirmReady("")).toBe(false);
    expect(isPauseConfirmReady("pause campaign")).toBe(false);
    expect(isPauseConfirmReady("PAUSE CAMPAIGN ")).toBe(true);
    expect(isDeleteConfirmReady("DELETE")).toBe(false);
    expect(isDeleteConfirmReady("DELETE CAMPAIGN")).toBe(true);

    expect(pauseDeletePrimaryEnabled(false)).toBe(false);
    expect(pauseDeletePrimaryEnabled(true)).toBe(false);
    expect(pauseDeletePrimaryLabel(false)).toBe("Type the confirm phrase");
    expect(pauseDeletePrimaryLabel(true)).toBe(CAMPAIGN_STATUS_COMING_SOON);

    const confirm = read("src/components/campaign-confirm.tsx");
    expect(confirm).toContain("CONFIRM_PAUSE_PHRASE");
    expect(confirm).toContain("CONFIRM_DELETE_PHRASE");
    expect(confirm).toContain("pauseDeletePrimaryEnabled");
    expect(confirm).toContain("CAMPAIGN_STATUS_COMING_SOON");
    expect(confirm).toContain("will not enable later");
    expect(confirm).toContain("Dry-run preview");
    expect(confirm).not.toMatch(/status:\s*"ENABLED"/);
    expect(confirm).not.toMatch(/googleAds:mutate|mutateGoogleAds/);
  });

  it("never shows an Enable CTA on confirm scenes", () => {
    for (const rel of confirmSources) {
      expect(read(rel)).not.toMatch(/>\s*Enable\s*</);
      expect(read(rel)).not.toMatch(/go-live|unpause-to-spend/i);
    }
    expect(read("src/components/campaign-confirm.tsx")).toContain("Lime is not Enable");
    expect(read("src/lib/ops-campaign.ts")).not.toContain("status: \"ENABLED\"");
  });

  it("leaves Slice A/B routes and prior Ads surfaces intact", () => {
    expect(existsSync(resolve(root, "src/app/ops/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/edit/page.tsx"))).toBe(true);
    expect(campaignOverviewPath("1111111111")).toBe("/ops/campaigns/1111111111");
    expect(campaignEditPath("1111111111")).toBe("/ops/campaigns/1111111111/edit");
    expect(campaignFocusModeLabel("overview")).toBe("Overview");
    expect(campaignFocusModeLabel("edit")).toBe("Safe edit");
    expect(campaignFocusModeLabel("pause")).toBe("Pause");
    expect(campaignFocusModeLabel("delete")).toBe("Delete");
    expect(CONFIRM_PAUSED_PHRASE).toBe("CREATE PAUSED");
    expect(CONFIRM_EDIT_PHRASE).toBe("EDIT SAFE");
    expect(read("src/components/ops-campaigns.tsx")).toContain("SearchWorkspace");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-confirm");
    expect(read("src/components/listings-panel.tsx")).toContain("data-testid=\"ops-listings\"");
    expect(read("src/components/metrics-panel.tsx")).toContain("data-testid=\"ops-metrics\"");
    expect(read("src/components/import-panel.tsx")).toContain("data-testid=\"ops-import\"");
    expect(read("src/components/reports-panel.tsx")).toContain("data-testid=\"ops-reports\"");
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
  });
});
