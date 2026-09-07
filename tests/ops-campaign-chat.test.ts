import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_CHAT_CHIP_LABEL,
  CAMPAIGN_CHAT_DID_NOT_APPLY,
  CAMPAIGN_CHAT_PANEL_WIDTH_PX,
  CAMPAIGN_CHAT_PROMPTS,
  CAMPAIGN_CHAT_PROPOSED_MARK,
  CAMPAIGN_CHAT_SUBTITLE,
  campaignChatScopeKey,
  chatProposalMarks,
  refusedActionBanner,
  searchDraftToChatProposal,
} from "@/lib/campaign-chat";
import { detectForbiddenAssistantIntent } from "@/lib/assistant";
import type { SearchDraftClientView } from "@/lib/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

const demoDraft: SearchDraftClientView = {
  id: "draft-1",
  customerId: "1234567890",
  externalAccountId: "acc-1",
  name: "Acme Hiking",
  dailyBudgetMicros: "25000000",
  biddingStrategy: "MANUAL_CPC",
  enhancedCpcEnabled: false,
  targetCpaMicros: null,
  targetRoasText: null,
  targetGoogleSearch: true,
  targetSearchNetwork: true,
  targetContentNetwork: false,
  targetPartnerSearchNetwork: false,
  startDate: null,
  endDate: null,
  statusDraft: "DRAFT",
  googleCampaignResourceName: null,
  campaignOpId: null,
  notesText: null,
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z",
  adGroups: [
    {
      id: "ag-1",
      name: "Ad group 1",
      defaultBidMicros: "1000000",
      sortOrder: 0,
      googleAdGroupResourceName: null,
      keywords: [{ id: "k1", text: "hiking boots", matchType: "PHRASE", bidMicros: null, isNegative: false, googleCriterionResourceName: null }],
      ads: [
        {
          id: "ad-1",
          headlines: ["Hike farther"],
          descriptions: ["Trail shoes"],
          finalUrl: "https://acmeboots.com/hiking",
          path1: null,
          path2: null,
          googleAdResourceName: null,
        },
      ],
    },
  ],
  targets: [
    {
      id: "t1",
      type: "GEO",
      valueText: "Canada",
      criterionText: "geoTargetConstants/2124",
      included: true,
    },
  ],
};

const focusSources = [
  "src/components/campaign-overview.tsx",
  "src/components/campaign-edit.tsx",
  "src/components/campaign-focus.tsx",
  "src/components/campaign-focus-frame.tsx",
  "src/components/campaign-chat.tsx",
  "src/components/search-assistant.tsx",
  "src/components/edit-panel.tsx",
];

describe("Slice D Campaign Chat", () => {
  it("binds campaign chat to focus routes and the Search create wizard", () => {
    expect(existsSync(resolve(root, "src/components/campaign-chat.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/components/campaign-focus-frame.tsx"))).toBe(true);
    expect(read("src/components/campaign-overview.tsx")).toContain("CampaignFocusFrame");
    expect(read("src/components/campaign-edit.tsx")).toContain("CampaignFocusFrame");
    expect(read("src/components/campaign-edit.tsx")).toContain("chatProposal");
    expect(read("src/components/search-workspace.tsx")).toContain("SearchAssistant");
    expect(read("src/components/search-workspace.tsx")).toContain('kind="SEARCH"');
    expect(read("src/components/campaign-chat.tsx")).toContain('kind="SEARCH"');
    expect(read("src/components/campaign-chat.tsx")).toContain('variant="campaign"');
    expect(read("src/components/search-assistant.tsx")).toContain("/api/assistant/turn");
    expect(read("src/components/search-assistant.tsx")).toContain("customerId");
    expect(read("src/components/search-assistant.tsx")).toContain("kind");
  });

  it("replaces the Coming soon chat stub with a 380px panel and collapse chip", () => {
    expect(read("src/components/campaign-focus.tsx")).not.toContain("Coming soon");
    expect(read("src/lib/ops-campaign.ts")).not.toContain("CAMPAIGN_CHAT_STUB_NOTE");
    expect(read("src/components/campaign-focus.tsx")).toContain("Open chat");
    expect(read("src/components/campaign-focus.tsx")).toContain("Hide chat");
    expect(read("src/components/campaign-chat.tsx")).toContain("ops-campaign-chat-panel");
    expect(read("src/components/campaign-chat.tsx")).toContain("ops-campaign-chat-chip");
    expect(CAMPAIGN_CHAT_CHIP_LABEL).toBe("Chat with this campaign");
    expect(CAMPAIGN_CHAT_PANEL_WIDTH_PX).toBe(380);
    expect(read("src/app/globals.css")).toContain("width: 380px");
    expect(read("src/components/campaign-chat.tsx")).toContain("CAMPAIGN_CHAT_PANEL_WIDTH_PX");
  });

  it("scopes threads to campaign or draft + customer + SEARCH and never leaks fills", () => {
    expect(campaignChatScopeKey({ campaignId: "111", customerId: "123", kind: "SEARCH" })).toBe(
      "SEARCH:123:111",
    );
    expect(campaignChatScopeKey({ draftId: "draft-1", customerId: "123", kind: "SEARCH" })).toBe(
      "SEARCH:123:draft-1",
    );
    expect(campaignChatScopeKey({ campaignId: "111", customerId: "123" })).not.toBe(
      campaignChatScopeKey({ campaignId: "222", customerId: "123" }),
    );
    expect(read("src/components/search-assistant.tsx")).toContain("campaignChatScopeKey");
    expect(read("src/components/search-assistant.tsx")).toContain("setThread(null)");
    expect(read("src/components/campaign-chat.tsx")).toContain("campaignId");
    expect(read("src/components/campaign-chat.tsx")).toContain("customerId");
  });

  it("proposes fills into the form and toasts that chat did not apply", () => {
    const proposal = searchDraftToChatProposal(demoDraft, ["name", "dailyBudgetMicros", "targets", "adGroups"]);
    expect(proposal.proposedName).toBe("Acme Hiking");
    expect(proposal.proposedBudget).toBe("25");
    expect(proposal.geo).toBe("geoTargetConstants/2124");
    expect(chatProposalMarks(proposal)).toEqual([
      "proposedName",
      "proposedBudget",
      "proposedBid",
      "geo",
    ]);
    expect(CAMPAIGN_CHAT_DID_NOT_APPLY).toMatch(/did not apply/i);
    expect(CAMPAIGN_CHAT_PROPOSED_MARK).toBe("Proposed by chat");
    expect(read("src/components/edit-panel.tsx")).toContain("CAMPAIGN_CHAT_PROPOSED_MARK");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-chat-mark-name");
    expect(read("src/components/search-wizard.tsx")).toContain("CAMPAIGN_CHAT_PROPOSED_MARK");
    expect(read("src/components/search-assistant.tsx")).toContain("CAMPAIGN_CHAT_DID_NOT_APPLY");
    expect(read("src/components/edit-panel.tsx")).toContain("Validate (dry-run)");
    expect(read("src/components/edit-panel.tsx")).toContain("EDIT SAFE");
  });

  it("hard-refuses Validate, Apply, Create PAUSED, Enable, Pause, and Delete", () => {
    expect(CAMPAIGN_CHAT_SUBTITLE).toBe("Chat cannot Validate, Apply, Create PAUSED, or Enable.");
    expect(refusedActionBanner("validate")).toBe("Refused: Validate. Use the form CTAs.");
    expect(refusedActionBanner("apply")).toBe("Refused: Apply. Use the form CTAs.");
    expect(refusedActionBanner("enable")).toBe("Refused: Enable. Use the form CTAs.");
    expect(refusedActionBanner("pause")).toBe("Refused: Pause. Use the form CTAs.");
    expect(refusedActionBanner("delete")).toBe("Refused: Delete. Use the form CTAs.");
    expect(detectForbiddenAssistantIntent("Validate this")).toBe("validate");
    expect(detectForbiddenAssistantIntent("Apply CREATE PAUSED")).toBe("apply");
    expect(detectForbiddenAssistantIntent("Enable it")).toBe("enable");
    expect(detectForbiddenAssistantIntent("Pause this campaign")).toBe("pause");
    expect(detectForbiddenAssistantIntent("Delete this campaign")).toBe("delete");
    expect(read("src/components/search-assistant.tsx")).toContain("ops-campaign-chat-refused");
    expect(read("src/components/search-assistant.tsx")).toContain("CAMPAIGN_CHAT_SUBTITLE");
    expect(read("src/components/search-assistant.tsx")).not.toMatch(/>\s*Enable\s*</);
    expect(read("src/components/campaign-chat.tsx")).not.toMatch(/>\s*Enable\s*</);
  });

  it("ships suggested prompts and lime Send / bubble treatment", () => {
    expect(CAMPAIGN_CHAT_PROMPTS.map((row) => row.id)).toEqual([
      "url",
      "rsa",
      "budget",
      "keywords",
      "gaps",
    ]);
    expect(read("src/components/search-assistant.tsx")).toContain("ops-campaign-chat-prompt-");
    expect(read("src/components/search-assistant.tsx")).toContain("ops-btn-primary");
    expect(read("src/components/search-assistant.tsx")).toContain('{busy ? "Sending…" : "Send"}');
    expect(read("src/components/search-assistant.tsx")).toContain("ops-chat-bubble-assistant");
    expect(read("src/components/search-assistant.tsx")).toContain("ops-chat-bubble-user");
    expect(read("src/app/globals.css")).toContain("ops-chat-bubble-assistant");
    expect(read("src/app/globals.css")).toContain("rgba(200, 245, 66");
    expect(read("src/app/globals.css")).toContain("#2a332e");
  });

  it("never shows Enable and keeps chat off the hub, list, and shell utilities", () => {
    for (const rel of focusSources) {
      expect(read(rel)).not.toMatch(/>\s*Enable\s*</);
      expect(read(rel)).not.toMatch(/go-live|unpause-to-spend/i);
    }
    expect(read("src/components/ops-hub.tsx")).not.toContain("CampaignChat");
    expect(read("src/components/ops-hub.tsx")).not.toContain("SearchAssistant");
    expect(read("src/components/ops-shell.tsx")).not.toContain("CampaignChat");
    expect(read("src/components/ops-shell.tsx")).not.toContain("SearchAssistant");
    expect(read("src/components/ops-campaigns.tsx")).not.toContain("CampaignChat");
    expect(read("src/components/ops-listings.tsx")).not.toContain("CampaignChat");
    expect(read("src/components/ops-metrics.tsx")).not.toContain("CampaignChat");
    expect(read("src/components/ops-import.tsx")).not.toContain("CampaignChat");
    expect(read("src/components/ops-reports.tsx")).not.toContain("CampaignChat");
    expect(read("src/components/ops-connect.tsx")).not.toContain("CampaignChat");
  });

  it("leaves Slice A/B/C surfaces and assistant APIs intact", () => {
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/edit/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/pause/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/campaigns/[id]/delete/page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/assistant/turn/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/assistant/threads/route.ts"))).toBe(true);
    expect(read("src/components/campaign-focus.tsx")).toContain("campaignPausePath");
    expect(read("src/components/campaign-focus.tsx")).toContain("campaignDeletePath");
    expect(read("src/components/ops-campaigns.tsx")).toContain("SearchWorkspace");
    expect(read("src/components/edit-panel.tsx")).toContain("ops-edit-apply");
    expect(read("src/app/api/assistant/turn/route.ts")).toContain("runAssistantTurn");
    expect(existsSync(resolve(root, "prisma/schema.prisma"))).toBe(true);
  });
});
