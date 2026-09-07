import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { importWizardHint } from "@/lib/campaign-import";
import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import {
  isSearchCreateApplyReady,
  SEARCH_CREATE_NOTE,
  SEARCH_CREATE_PATH,
  SEARCH_CREATE_STEPS,
  searchCreateChatVisible,
  searchCreatePath,
  validateSearchCreateForm,
} from "@/lib/search-create";
import type { WizardAdGroup, WizardTarget } from "@/lib/search-wizard-map";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

const validGroups: WizardAdGroup[] = [
  {
    name: "Ad group 1",
    defaultBidDollars: "1.00",
    keywords: [{ text: "adrunr search", matchType: "PHRASE", isNegative: false }],
    ads: [
      {
        headlines: ["One headline here", "Second headline", "Third headline"],
        descriptions: ["First description for the RSA.", "Second description for the RSA."],
        finalUrl: "https://adrunr.app",
        path1: "search",
        path2: "paused",
      },
    ],
  },
];

const validTargets: WizardTarget[] = [
  { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
  { type: "LANGUAGE", valueText: "English", criterionText: "languageConstants/1000", included: true },
];

describe("Slice E Search create route", () => {
  it("ships /ops/campaigns/new/search and keeps the wizard off hub/list dumps", () => {
    expect(existsSync(resolve(root, "src/app/ops/campaigns/new/search/page.tsx"))).toBe(true);
    expect(read("src/app/ops/campaigns/new/search/page.tsx")).toContain("SearchCreate");
    expect(searchCreatePath()).toBe(SEARCH_CREATE_PATH);
    expect(searchCreatePath("draft-1")).toBe("/ops/campaigns/new/search?draftId=draft-1");
    expect(SEARCH_CREATE_STEPS.map((row) => row.id)).toEqual([
      "S0",
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
    ]);
    expect(read("src/components/ops-campaigns.tsx")).toContain("Create campaign → Search");
    expect(read("src/components/ops-campaigns.tsx")).toContain("searchCreatePath");
    expect(read("src/components/ops-campaigns.tsx")).not.toContain("SearchWizard");
    expect(read("src/components/ops-hub.tsx")).not.toContain("SearchWizard");
    expect(read("src/components/ops-hub.tsx")).not.toContain("SearchWorkspace");
    expect(read("src/lib/ops-shell.ts")).toContain("/ops/campaigns/new/search");
    expect(read("src/components/search-workspace.tsx")).toContain("searchCreatePath");
    expect(read("src/components/search-workspace.tsx")).not.toContain("SearchWizard");
    expect(read("src/components/import-panel.tsx")).toContain("Open Search draft");
    expect(importWizardHint("SEARCH")).toContain("/ops/campaigns/new/search");
  });

  it("keeps every S0–S8 field and locks Create PAUSED behind phrase + dry-run off + valid draft", () => {
    const wizard = read("src/components/search-wizard.tsx");
    expect(wizard).toContain("S0");
    expect(wizard).toContain("Campaign name");
    expect(wizard).toContain("Daily budget");
    expect(wizard).toContain("Ad group name");
    expect(wizard).toContain("keyword");
    expect(wizard).toContain("Responsive search ads");
    expect(wizard).toContain("GEO");
    expect(wizard).toContain("Manual CPC");
    expect(wizard).toContain("CREATE PAUSED");
    expect(wizard).toContain("Validate (dry-run)");
    expect(wizard).toContain("useState(true)");
    expect(wizard).toContain("ops-search-create-dry-run");
    expect(wizard).toContain('dryRun ? "ops-btn-primary"');
    expect(wizard).toContain("isSearchCreateApplyReady");
    expect(wizard).toContain("text-coral-400");
    expect(wizard).not.toContain("setName(\"\")");

    const empty = validateSearchCreateForm({
      customerId: "",
      name: "",
      budgetDollars: "abc",
      groups: [],
      targets: [],
      dryRun: true,
    });
    expect(empty.customerId).toMatch(/Select/);
    expect(empty.name).toMatch(/required/);
    expect(empty.budgetDollars).toMatch(/number/);

    const valid = validateSearchCreateForm({
      customerId: "1234567890",
      name: "Adrunr paused search",
      budgetDollars: "1.00",
      groups: validGroups,
      targets: validTargets,
      confirmPhrase: "nope",
      dryRun: false,
    });
    expect(valid.name).toBeUndefined();
    expect(valid.confirmPhrase).toMatch(/CREATE PAUSED/);

    expect(
      isSearchCreateApplyReady({
        connected: true,
        dryRun: true,
        confirmPhrase: CONFIRM_PAUSED_PHRASE,
        errors: {},
      }),
    ).toBe(false);
    expect(
      isSearchCreateApplyReady({
        connected: true,
        dryRun: false,
        confirmPhrase: "CREATE PAUSED",
        errors: {},
      }),
    ).toBe(true);
    expect(SEARCH_CREATE_NOTE).toMatch(/No Enable/);
  });

  it("reuses Slice D campaign chat on S1–S7 scoped to draftId + SEARCH", () => {
    expect(searchCreateChatVisible(0)).toBe(false);
    expect(searchCreateChatVisible(1)).toBe(true);
    expect(searchCreateChatVisible(7)).toBe(true);
    expect(searchCreateChatVisible(8)).toBe(false);
    const create = read("src/components/search-create.tsx");
    expect(create).toContain("CampaignChat");
    expect(create).toContain("draftId");
    expect(create).toContain("searchCreateChatVisible");
    expect(read("src/components/campaign-chat.tsx")).toContain("draftId");
    expect(read("src/components/campaign-chat.tsx")).toContain("wizard");
    expect(read("src/components/search-create.tsx")).toContain("ops-focus-chrome");
    expect(read("src/components/search-create.tsx")).toContain("ops-search-create-steps");
    expect(read("src/components/search-assistant.tsx")).toContain("CAMPAIGN_CHAT_SUBTITLE");
  });

  it("never shows Enable and leaves Slice A–D plus other create types intact", () => {
    for (const rel of [
      "src/components/search-create.tsx",
      "src/components/search-wizard.tsx",
      "src/app/ops/campaigns/new/search/page.tsx",
      "src/components/ops-campaigns.tsx",
      "src/components/ops-hub.tsx",
    ]) {
      expect(read(rel)).not.toMatch(/>\s*Enable\s*</);
      expect(read(rel)).not.toMatch(/go-live|unpause-to-spend/i);
    }
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/edit/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/pause/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/delete/page.tsx"))).toBe(true);
    expect(read("src/components/ops-campaigns.tsx")).toContain("SearchWorkspace");
    expect(read("src/components/search-workspace.tsx")).toContain("ops-kind-display");
    expect(read("src/components/campaign-focus.tsx")).toContain("campaignPausePath");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-apply");
    expect(existsSync(resolve(root, "src/app/api/ads/search/drafts/[id]/validate/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ads/search/drafts/[id]/apply/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "prisma/schema.prisma"))).toBe(true);
  });
});
