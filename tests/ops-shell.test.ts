import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_TYPE_FILTERS,
  OPS_NAV,
  SHELL_SAFETY_STRIP,
} from "@/lib/ops-shell";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("Slice A ops IA shell", () => {
  it("ships hub vs campaigns plus relocated panel routes", () => {
    expect(existsSync(resolve(root, "src/app/ops/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/listings/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/metrics/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/import/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/reports/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/connect/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/components/ops-console.tsx"))).toBe(false);
    expect(OPS_NAV.map((item) => item.label)).toEqual([
      "Campaigns",
      "Listings",
      "Metrics",
      "Import",
      "Reports",
      "Connect",
    ]);
    expect(OPS_NAV.map((item) => item.href)).toEqual([
      "/ops/campaigns",
      "/ops/listings",
      "/ops/metrics",
      "/ops/import",
      "/ops/reports",
      "/ops/connect",
    ]);
  });

  it("keeps the v0.2 safety strip copy exact and always on the shell", () => {
    expect(SHELL_SAFETY_STRIP.headline).toBe(
      "Ops tools, not autopilot. No spend without an explicit confirm.",
    );
    expect(SHELL_SAFETY_STRIP.detail).toBe(
      "Dry-run / validateOnly first · Creates → CREATE PAUSED · Edits → EDIT SAFE · No in-app ENABLE.",
    );
    const shell = read("src/components/ops-shell.tsx");
    expect(shell).toContain("data-testid=\"ops-topbar\"");
    expect(shell).toContain("h-14");
    expect(shell).toContain("w-[220px]");
    expect(shell).toContain("SHELL_SAFETY_STRIP.headline");
    expect(shell).toContain("SHELL_SAFETY_STRIP.detail");
    expect(shell).not.toMatch(/>Enable</);
    expect(shell).not.toMatch(/go-live|unpause-to-spend/i);
  });

  it("keeps the hub free of create wizards, edit, and campaign chat", () => {
    const hub = read("src/components/ops-hub.tsx");
    const page = read("src/app/ops/page.tsx");
    expect(page).toContain("OpsHub");
    expect(hub).toContain("ops-hub-connect");
    expect(hub).toContain("ops-hub-customers");
    expect(hub).toContain("ops-hub-shortcuts");
    expect(hub).not.toContain("SearchWizard");
    expect(hub).not.toContain("EditPanel");
    expect(hub).not.toContain("SearchAssistant");
    expect(hub).not.toContain("SearchWorkspace");
    expect(hub).not.toContain("CampaignChat");
    expect(hub).not.toMatch(/>Enable</);
  });

  it("preserves create, edit, listings, metrics, import, reports, and connect on their routes", () => {
    const campaigns = read("src/components/ops-campaigns.tsx");
    expect(campaigns).toContain("SearchWorkspace");
    expect(campaigns).not.toContain("EditPanel");
    expect(campaigns).toContain("campaignOverviewPath");
    expect(campaigns).toContain("campaignEditPath");
    expect(campaigns).toContain("ops-campaigns-filter");
    expect(CAMPAIGN_TYPE_FILTERS.some((row) => row.value === "SEARCH")).toBe(true);
    expect(read("src/components/ops-listings.tsx")).toContain("ListingsPanel");
    expect(read("src/components/ops-metrics.tsx")).toContain("MetricsPanel");
    expect(read("src/components/ops-import.tsx")).toContain("ImportPanel");
    expect(read("src/components/ops-reports.tsx")).toContain("ReportsPanel");
    expect(read("src/components/ops-connect.tsx")).toContain("Google Ads connection");
    expect(read("src/components/listings-panel.tsx")).toContain("data-testid=\"ops-listings\"");
    expect(read("src/components/metrics-panel.tsx")).toContain("data-testid=\"ops-metrics\"");
    expect(read("src/components/import-panel.tsx")).toContain("data-testid=\"ops-import\"");
    expect(read("src/components/reports-panel.tsx")).toContain("data-testid=\"ops-reports\"");
    expect(read("src/components/edit-panel.tsx")).toContain("data-testid=\"ops-edit\"");
    expect(read("src/components/search-workspace.tsx")).toContain("ops-kind-search");
  });

  it("locks lime to dry-run / validate and keeps Pause / apply amber", () => {
    const css = read("src/app/globals.css");
    const tokens = read("tailwind.config.ts");
    expect(tokens).toContain("#0b0e0c");
    expect(tokens).toContain("#121714");
    expect(tokens).toContain("#1a211d");
    expect(tokens).toContain("#24302a");
    expect(tokens).toContain("#c8f542");
    expect(tokens).toContain("#a8d42a");
    expect(tokens).toContain("#f5b942");
    expect(tokens).toContain("#f26b4d");
    expect(tokens).toContain("#1A73E8");
    expect(css).toContain("background: #0b0e0c");
    expect(css).toContain("background: #121714");
    expect(css).toContain("border: 1px solid #2a332e");
    expect(css).toContain("#c8f542");
    expect(read("src/components/edit-panel.tsx")).toContain('dryRun ? "ops-btn-primary"');
    expect(read("src/components/edit-panel.tsx")).toContain("Validate (dry-run)");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-btn-amber");
    expect(read("src/components/campaign-focus.tsx")).toContain("ops-btn-amber");
    expect(read("src/components/campaign-focus.tsx")).toContain("Pause");
    expect(read("src/components/listings-panel.tsx")).toContain('dryRun ? "ops-btn-primary"');
    expect(read("src/components/metrics-panel.tsx")).toContain('dryRun ? "ops-btn-primary"');
    expect(read("src/components/import-panel.tsx")).toContain('dryRun ? "ops-btn-primary"');
    expect(read("src/components/reports-panel.tsx")).toContain("ops-btn-primary");
    expect(read("src/components/reports-panel.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/ops-hub.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/ops-campaigns.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/campaign-overview.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/campaign-focus.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/campaign-confirm.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/campaign-pause.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/campaign-delete.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/edit-panel.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/campaign-edit.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/app/ops/campaigns/[id]/pause/page.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/app/ops/campaigns/[id]/delete/page.tsx")).not.toMatch(/>\s*Enable\s*</);
  });
});
