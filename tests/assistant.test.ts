import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectForbiddenAssistantIntent,
  diffDisplayDraftFields,
  diffDraftFields,
  diffPmaxDraftFields,
  extractBudgetMicros,
  extractUrlFromText,
  mergeDisplayDraftPatch,
  mergeDraftPatch,
  mergePmaxDraftPatch,
  mockAssistantTurn,
  parseAssistantTurnPlan,
  type AssistantContextPack,
} from "@/lib/assistant";
import { defaultDisplayDraftTree, parseDisplayDraftWrite } from "@/lib/display-draft";
import { hydrateDisplayWizardFromDraft } from "@/lib/display-wizard-map";
import { defaultPmaxDraftTree, parsePmaxDraftWrite } from "@/lib/pmax-draft";
import { hydratePmaxWizardFromDraft } from "@/lib/pmax-wizard-map";
import { defaultSearchDraftTree, parseSearchDraftWrite } from "@/lib/search-draft";
import { hydrateWizardFromDraft } from "@/lib/search-wizard-map";
import type { DisplayDraftClientView, PmaxDraftClientView, SearchDraftClientView } from "@/lib/types";

const emptyPack = (draft = defaultSearchDraftTree({ customerId: "1234567890" })): AssistantContextPack => ({
  kind: "SEARCH",
  org: { id: "org", name: "Adrunr", slug: "adrunr" },
  client: { id: "client-default", name: "Default client", slug: "default" },
  accounts: [{ id: "acc", externalId: "1234567890", displayName: "Demo", status: "ENABLED", isManager: false }],
  campaigns: [],
  draft,
  draftId: "draft-1",
  messages: [],
  memory: [],
});

const emptyDisplayPack = (
  draft = defaultDisplayDraftTree({ customerId: "1234567890" }),
): AssistantContextPack => ({
  kind: "DISPLAY",
  org: { id: "org", name: "Adrunr", slug: "adrunr" },
  client: { id: "client-default", name: "Default client", slug: "default" },
  accounts: [{ id: "acc", externalId: "1234567890", displayName: "Demo", status: "ENABLED", isManager: false }],
  campaigns: [],
  draft,
  draftId: "display-1",
  messages: [],
  memory: [],
});

describe("assistant fill-first", () => {
  it("fills draft fields from a URL before asking optional gaps", () => {
    const plan = mockAssistantTurn({
      message: "https://acmeboots.com/hiking",
      pack: emptyPack(),
    });
    expect(plan.update_draft_fields).toBeTruthy();
    expect(String(plan.update_draft_fields?.name)).toMatch(/Acmeboots/i);
    const groups = plan.update_draft_fields?.adGroups as Array<{
      keywords: Array<{ text: string }>;
      ads: Array<{ finalUrl: string; headlines: string[] }>;
    }>;
    expect(groups[0].ads[0].finalUrl).toContain("acmeboots.com");
    expect(groups[0].keywords.length).toBeGreaterThan(0);
    expect(groups[0].ads[0].headlines.length).toBeGreaterThanOrEqual(3);
    expect(plan.ask_questions.every((question) => question.id !== "brief")).toBe(true);
    const required = plan.ask_questions.filter((question) => !question.optional);
    expect(required).toHaveLength(0);
    expect(plan.ask_questions.some((question) => question.optional && question.field === "dailyBudgetMicros")).toBe(
      true,
    );
    expect(plan.assistant_message.toLowerCase()).toMatch(/filled/);
  });

  it("uses brief + budget + geo without a pre-fill questionnaire", () => {
    const thin = defaultSearchDraftTree({ customerId: "1234567890" });
    thin.adGroups[0].ads = [];
    const plan = mockAssistantTurn({
      message: "We sell organic coffee in Canada, $25/day",
      pack: emptyPack(thin),
    });
    expect(plan.update_draft_fields?.dailyBudgetMicros).toBe(25_000_000);
    const targets = plan.update_draft_fields?.targets as Array<{ type: string; valueText: string }>;
    expect(targets.some((target) => target.type === "GEO" && target.valueText === "Canada")).toBe(true);
    expect(plan.ask_questions.some((question) => question.id === "landing_url")).toBe(true);
    expect(plan.ask_questions.some((question) => /campaign name/i.test(question.question))).toBe(false);
    expect(plan.ask_questions.length).toBeLessThanOrEqual(2);
  });

  it("refuses validate / apply / enable without emitting draft mutate actions", () => {
    expect(detectForbiddenAssistantIntent("please validate this draft")).toBe("validate");
    expect(detectForbiddenAssistantIntent("apply it now")).toBe("apply");
    expect(detectForbiddenAssistantIntent("type CREATE PAUSED for me")).toBe("apply");
    expect(detectForbiddenAssistantIntent("enable the campaign")).toBe("enable");
    expect(detectForbiddenAssistantIntent("go live")).toBe("enable");

    for (const message of ["Validate this", "Apply CREATE PAUSED", "enable and go live"]) {
      const plan = mockAssistantTurn({ message, pack: emptyPack() });
      expect(plan.update_draft_fields).toBeNull();
      expect(plan.refusedAction).toBeTruthy();
      expect(plan.assistant_message.toLowerCase()).toMatch(/cannot/);
    }
  });

  it("strips validate/apply keys from model JSON", () => {
    const plan = parseAssistantTurnPlan({
      update_draft_fields: { name: "Safe", validate: true, apply: true, confirmPhrase: "CREATE PAUSED" },
      ask_questions: [],
      assistant_message: "Filled name.",
    });
    expect(plan.update_draft_fields).toEqual({ name: "Safe" });
  });

  it("merges structured patches onto the existing Search draft tree", () => {
    const current = parseSearchDraftWrite({
      customerId: "1234567890",
      name: "Keep me",
      dailyBudgetMicros: 1_000_000,
      adGroups: [{ name: "Existing", keywords: [{ text: "keep", matchType: "PHRASE" }] }],
    });
    const merged = mergeDraftPatch(current, { name: "Patched name", dailyBudgetMicros: 5_000_000 });
    expect(merged.name).toBe("Patched name");
    expect(merged.dailyBudgetMicros).toBe(5_000_000);
    expect(merged.adGroups[0].name).toBe("Existing");
    expect(diffDraftFields(current, merged)).toEqual(["name", "dailyBudgetMicros"]);
  });

  it("hydrates wizard fields from a draft view", () => {
    const draft: SearchDraftClientView = {
      id: "d1",
      customerId: "1234567890",
      externalAccountId: "ea1",
      name: "Hydrated Search",
      dailyBudgetMicros: "25000000",
      biddingStrategy: "MANUAL_CPC",
      enhancedCpcEnabled: true,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      adGroups: [
        {
          id: "g1",
          name: "Coffee",
          defaultBidMicros: "2000000",
          sortOrder: 0,
          googleAdGroupResourceName: null,
          keywords: [
            {
              id: "k1",
              text: "organic coffee",
              matchType: "PHRASE",
              bidMicros: null,
              isNegative: false,
              googleCriterionResourceName: null,
            },
          ],
          ads: [
            {
              id: "a1",
              headlines: ["One", "Two", "Three"],
              descriptions: ["Desc one", "Desc two"],
              finalUrl: "https://example.com",
              path1: "coffee",
              path2: "paused",
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
    const state = hydrateWizardFromDraft(draft);
    expect(state.name).toBe("Hydrated Search");
    expect(state.budgetDollars).toBe("25.00");
    expect(state.groups[0].keywords[0].text).toBe("organic coffee");
    expect(state.targets[0].valueText).toBe("Canada");
  });

  it("parses landing URLs and dollar budgets from free text", () => {
    expect(extractUrlFromText("see https://adrunr.app/search please")).toBe("https://adrunr.app/search");
    expect(extractBudgetMicros("$12.50 / day")).toBe(12_500_000);
    expect(extractBudgetMicros("daily budget of 40 dollars")).toBe(40_000_000);
  });
});

describe("display assistant fill-first", () => {
  it("fills Display draft fields from a URL before asking optional gaps", () => {
    const plan = mockAssistantTurn({
      message: "https://acmeboots.com/hiking",
      pack: emptyDisplayPack(),
    });
    expect(plan.update_draft_fields).toBeTruthy();
    expect(String(plan.update_draft_fields?.name)).toMatch(/Acmeboots/i);
    const groups = plan.update_draft_fields?.adGroups as Array<{
      ads: Array<{ finalUrl: string; headlines: string[]; longHeadline: string; assets: Array<{ kind: string }> }>;
    }>;
    expect(groups[0].ads[0].finalUrl).toContain("acmeboots.com");
    expect(groups[0].ads[0].headlines.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].ads[0].longHeadline.length).toBeGreaterThan(0);
    expect(groups[0].ads[0].assets.some((asset) => asset.kind === "MARKETING_IMAGE")).toBe(true);
    expect(groups[0].ads[0].assets.some((asset) => asset.kind === "SQUARE_MARKETING_IMAGE")).toBe(true);
    const audiences = plan.update_draft_fields?.audiences as Array<{ kind: string }>;
    expect(audiences.some((audience) => audience.kind === "USER_LIST")).toBe(true);
    const required = plan.ask_questions.filter((question) => !question.optional);
    expect(required).toHaveLength(0);
    expect(plan.assistant_message.toLowerCase()).toMatch(/filled/);
  });

  it("refuses validate / apply / enable on Display without emitting draft mutate actions", () => {
    for (const message of ["Validate this", "Apply CREATE PAUSED", "enable and go live"]) {
      const plan = mockAssistantTurn({ message, pack: emptyDisplayPack() });
      expect(plan.update_draft_fields).toBeNull();
      expect(plan.refusedAction).toBeTruthy();
    }
  });

  it("merges structured patches onto the existing Display draft tree", () => {
    const current = parseDisplayDraftWrite({
      customerId: "1234567890",
      name: "Keep me",
      dailyBudgetMicros: 1_000_000,
      adGroups: [{ name: "Existing", ads: [] }],
    });
    const merged = mergeDisplayDraftPatch(current, { name: "Patched display", dailyBudgetMicros: 5_000_000 });
    expect(merged.name).toBe("Patched display");
    expect(merged.dailyBudgetMicros).toBe(5_000_000);
    expect(merged.adGroups[0].name).toBe("Existing");
    expect(diffDisplayDraftFields(current, merged)).toEqual(["name", "dailyBudgetMicros"]);
  });

  it("hydrates Display wizard fields from a draft view", () => {
    const draft: DisplayDraftClientView = {
      id: "d1",
      customerId: "1234567890",
      externalAccountId: "ea1",
      name: "Hydrated Display",
      dailyBudgetMicros: "25000000",
      biddingStrategy: "MANUAL_CPC",
      enhancedCpcEnabled: false,
      targetCpaMicros: null,
      targetRoasText: null,
      startDate: null,
      endDate: null,
      statusDraft: "DRAFT",
      googleCampaignResourceName: null,
      campaignOpId: null,
      notesText: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      adGroups: [
        {
          id: "g1",
          name: "Coffee",
          defaultBidMicros: "2000000",
          sortOrder: 0,
          googleAdGroupResourceName: null,
          ads: [
            {
              id: "a1",
              headlines: ["One", "Two"],
              longHeadline: "Long coffee headline",
              descriptions: ["Desc one"],
              businessName: "Acme",
              finalUrl: "https://example.com",
              googleAdResourceName: null,
              assets: [
                {
                  id: "as1",
                  kind: "MARKETING_IMAGE",
                  urlText: "https://placehold.co/1200x628/png",
                  assetResourceName: null,
                  sortOrder: 0,
                },
              ],
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
      audiences: [
        {
          id: "au1",
          kind: "USER_LIST",
          valueText: "Website visitors (remarketing)",
          criterionText: "customers/1234567890/userLists/111",
          included: true,
        },
      ],
    };
    const state = hydrateDisplayWizardFromDraft(draft);
    expect(state.name).toBe("Hydrated Display");
    expect(state.budgetDollars).toBe("25.00");
    expect(state.groups[0].ads[0].businessName).toBe("Acme");
    expect(state.targets[0].valueText).toBe("Canada");
    expect(state.audiences[0].kind).toBe("USER_LIST");
  });
});

const emptyPmaxPack = (
  draft = defaultPmaxDraftTree({ customerId: "1234567890" }),
): AssistantContextPack => ({
  kind: "PMAX",
  org: { id: "org", name: "Adrunr", slug: "adrunr" },
  client: { id: "client-default", name: "Default client", slug: "default" },
  accounts: [{ id: "acc", externalId: "1234567890", displayName: "Demo", status: "ENABLED", isManager: false }],
  campaigns: [],
  draft,
  draftId: "pmax-1",
  messages: [],
  memory: [],
});

describe("performance max assistant fill-first", () => {
  it("fills Performance Max draft fields from a URL before asking optional gaps", () => {
    const plan = mockAssistantTurn({
      message: "https://acmeboots.com/hiking",
      pack: emptyPmaxPack(),
    });
    expect(plan.update_draft_fields).toBeTruthy();
    expect(String(plan.update_draft_fields?.name)).toMatch(/Acmeboots/i);
    const groups = plan.update_draft_fields?.assetGroups as Array<{
      finalUrl: string;
      headlines: string[];
      longHeadlines: string[];
      assets: Array<{ kind: string }>;
    }>;
    expect(groups[0].finalUrl).toContain("acmeboots.com");
    expect(groups[0].headlines.length).toBeGreaterThanOrEqual(3);
    expect(groups[0].longHeadlines.length).toBeGreaterThan(0);
    expect(groups[0].assets.some((asset) => asset.kind === "MARKETING_IMAGE")).toBe(true);
    expect(groups[0].assets.some((asset) => asset.kind === "SQUARE_MARKETING_IMAGE")).toBe(true);
    const signals = plan.update_draft_fields?.signals as Array<{ kind: string }>;
    expect(signals.some((signal) => signal.kind === "SEARCH_THEME")).toBe(true);
    const required = plan.ask_questions.filter((question) => !question.optional);
    expect(required).toHaveLength(0);
    expect(plan.assistant_message.toLowerCase()).toMatch(/filled/);
  });

  it("refuses validate / apply / enable on Performance Max without emitting draft mutate actions", () => {
    for (const message of ["Validate this", "Apply CREATE PAUSED", "enable and go live"]) {
      const plan = mockAssistantTurn({ message, pack: emptyPmaxPack() });
      expect(plan.update_draft_fields).toBeNull();
      expect(plan.refusedAction).toBeTruthy();
    }
  });

  it("merges structured patches onto the existing Performance Max draft tree", () => {
    const current = parsePmaxDraftWrite({
      customerId: "1234567890",
      name: "Keep me",
      dailyBudgetMicros: 1_000_000,
      assetGroups: [{ name: "Existing", assets: [] }],
    });
    const merged = mergePmaxDraftPatch(current, { name: "Patched pmax", dailyBudgetMicros: 5_000_000 });
    expect(merged.name).toBe("Patched pmax");
    expect(merged.dailyBudgetMicros).toBe(5_000_000);
    expect(merged.assetGroups[0].name).toBe("Existing");
    expect(diffPmaxDraftFields(current, merged)).toEqual(["name", "dailyBudgetMicros"]);
  });

  it("hydrates Performance Max wizard fields from a draft view", () => {
    const draft: PmaxDraftClientView = {
      id: "d1",
      customerId: "1234567890",
      externalAccountId: "ea1",
      name: "Hydrated PMax",
      dailyBudgetMicros: "25000000",
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
      targetCpaMicros: null,
      targetRoasText: null,
      urlExpansionOptOut: false,
      brandGuidelinesEnabled: false,
      merchantCenterId: null,
      startDate: null,
      endDate: null,
      statusDraft: "DRAFT",
      googleCampaignResourceName: null,
      campaignOpId: null,
      notesText: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assetGroups: [
        {
          id: "g1",
          name: "Coffee",
          finalUrl: "https://example.com",
          headlines: ["One", "Two", "Three"],
          longHeadlines: ["Long coffee headline"],
          descriptions: ["Desc one", "Desc two"],
          businessName: "Acme",
          sortOrder: 0,
          googleAssetGroupResourceName: null,
          assets: [
            {
              id: "as1",
              kind: "MARKETING_IMAGE",
              urlText: "https://placehold.co/1200x628/png",
              assetResourceName: null,
              sortOrder: 0,
            },
          ],
          listings: [],
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
      signals: [
        {
          id: "s1",
          kind: "SEARCH_THEME",
          valueText: "organic coffee",
          criterionText: "organic coffee",
          included: true,
        },
      ],
    };
    const state = hydratePmaxWizardFromDraft(draft);
    expect(state.name).toBe("Hydrated PMax");
    expect(state.budgetDollars).toBe("25.00");
    expect(state.groups[0].businessName).toBe("Acme");
    expect(state.targets[0].valueText).toBe("Canada");
    expect(state.signals[0].kind).toBe("SEARCH_THEME");
  });
});

describe("assistant safety source locks", () => {
  it("does not call validate or apply endpoints from assistant server modules", () => {
    const ops = readFileSync(resolve(process.cwd(), "src/lib/assistant-ops.ts"), "utf8");
    const llm = readFileSync(resolve(process.cwd(), "src/lib/assistant-llm.ts"), "utf8");
    const turn = readFileSync(resolve(process.cwd(), "src/app/api/assistant/turn/route.ts"), "utf8");
    for (const source of [ops, llm, turn]) {
      expect(source).not.toMatch(/validateOrApplySearchDraft/);
      expect(source).not.toMatch(/validateOrApplyDisplayDraft/);
      expect(source).not.toMatch(/validateOrApplyPmaxDraft/);
      expect(source).not.toMatch(/\/api\/ads\/search\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/search\/drafts\/.+\/apply/);
      expect(source).not.toMatch(/\/api\/ads\/display\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/display\/drafts\/.+\/apply/);
      expect(source).not.toMatch(/\/api\/ads\/pmax\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/pmax\/drafts\/.+\/apply/);
    }
  });
});
