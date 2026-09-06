import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectForbiddenAssistantIntent,
  diffDisplayDraftFields,
  diffDraftFields,
  diffDemandGenDraftFields,
  diffPmaxDraftFields,
  diffShoppingDraftFields,
  diffVideoDraftFields,
  extractBudgetMicros,
  extractUrlFromText,
  mergeDemandGenDraftPatch,
  mergeDisplayDraftPatch,
  mergeDraftPatch,
  mergePmaxDraftPatch,
  mergeShoppingDraftPatch,
  mergeVideoDraftPatch,
  mockAssistantTurn,
  parseAssistantTurnPlan,
  type AssistantContextPack,
} from "@/lib/assistant";
import { defaultDemandGenDraftTree, parseDemandGenDraftWrite } from "@/lib/demand-gen-draft";
import { hydrateDemandGenWizardFromDraft } from "@/lib/demand-gen-wizard-map";
import { defaultDisplayDraftTree, parseDisplayDraftWrite } from "@/lib/display-draft";
import { hydrateDisplayWizardFromDraft } from "@/lib/display-wizard-map";
import { defaultPmaxDraftTree, parsePmaxDraftWrite } from "@/lib/pmax-draft";
import { hydratePmaxWizardFromDraft } from "@/lib/pmax-wizard-map";
import { defaultSearchDraftTree, parseSearchDraftWrite } from "@/lib/search-draft";
import { hydrateWizardFromDraft } from "@/lib/search-wizard-map";
import { defaultShoppingDraftTree, parseShoppingDraftWrite } from "@/lib/shopping-draft";
import { hydrateShoppingWizardFromDraft } from "@/lib/shopping-wizard-map";
import { defaultVideoDraftTree, parseVideoDraftWrite } from "@/lib/video-draft";
import { hydrateVideoWizardFromDraft } from "@/lib/video-wizard-map";
import type {
  DemandGenDraftClientView,
  DisplayDraftClientView,
  PmaxDraftClientView,
  SearchDraftClientView,
  ShoppingDraftClientView,
  VideoDraftClientView,
} from "@/lib/types";

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

const emptyDemandGenPack = (
  draft = defaultDemandGenDraftTree({ customerId: "1234567890" }),
): AssistantContextPack => ({
  kind: "DEMAND_GEN",
  org: { id: "org", name: "Adrunr", slug: "adrunr" },
  client: { id: "client-default", name: "Default client", slug: "default" },
  accounts: [{ id: "acc", externalId: "1234567890", displayName: "Demo", status: "ENABLED", isManager: false }],
  campaigns: [],
  draft,
  draftId: "demand-gen-1",
  messages: [],
  memory: [],
});

describe("demand gen assistant fill-first", () => {
  it("fills Demand Gen draft fields from a URL before asking optional gaps", () => {
    const plan = mockAssistantTurn({
      message: "https://acmeboots.com/hiking",
      pack: emptyDemandGenPack(),
    });
    expect(plan.update_draft_fields).toBeTruthy();
    expect(String(plan.update_draft_fields?.name)).toMatch(/Acmeboots/i);
    const groups = plan.update_draft_fields?.adGroups as Array<{
      ads: Array<{ finalUrl: string; headlines: string[]; assets: Array<{ kind: string }> }>;
    }>;
    expect(groups[0].ads[0].finalUrl).toContain("acmeboots.com");
    expect(groups[0].ads[0].headlines.length).toBeGreaterThanOrEqual(3);
    expect(groups[0].ads[0].assets.some((asset) => asset.kind === "MARKETING_IMAGE")).toBe(true);
    expect(groups[0].ads[0].assets.some((asset) => asset.kind === "SQUARE_MARKETING_IMAGE")).toBe(true);
    const audiences = plan.update_draft_fields?.audiences as Array<{ kind: string }>;
    expect(audiences.some((audience) => audience.kind === "USER_LIST")).toBe(true);
    const required = plan.ask_questions.filter((question) => !question.optional);
    expect(required).toHaveLength(0);
    expect(plan.assistant_message.toLowerCase()).toMatch(/filled/);
  });

  it("refuses validate / apply / enable on Demand Gen without emitting draft mutate actions", () => {
    for (const message of ["Validate this", "Apply CREATE PAUSED", "enable and go live"]) {
      const plan = mockAssistantTurn({ message, pack: emptyDemandGenPack() });
      expect(plan.update_draft_fields).toBeNull();
      expect(plan.refusedAction).toBeTruthy();
    }
  });

  it("merges structured patches onto the existing Demand Gen draft tree", () => {
    const current = parseDemandGenDraftWrite({
      customerId: "1234567890",
      name: "Keep me",
      dailyBudgetMicros: 1_000_000,
      adGroups: [{ name: "Existing", ads: [] }],
    });
    const merged = mergeDemandGenDraftPatch(current, { name: "Patched demand gen", dailyBudgetMicros: 5_000_000 });
    expect(merged.name).toBe("Patched demand gen");
    expect(merged.dailyBudgetMicros).toBe(5_000_000);
    expect(merged.adGroups[0].name).toBe("Existing");
    expect(diffDemandGenDraftFields(current, merged)).toEqual(["name", "dailyBudgetMicros"]);
  });

  it("hydrates Demand Gen wizard fields from a draft view", () => {
    const draft: DemandGenDraftClientView = {
      id: "d1",
      customerId: "1234567890",
      externalAccountId: "ea1",
      name: "Hydrated Demand Gen",
      dailyBudgetMicros: "25000000",
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
      targetCpaMicros: null,
      targetRoasText: null,
      youtubeInStream: true,
      youtubeInFeed: true,
      youtubeShorts: false,
      discover: true,
      gmail: true,
      display: true,
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
              headlines: ["One", "Two", "Three"],
              descriptions: ["Desc one"],
              businessName: "Acme",
              finalUrl: "https://example.com",
              callToActionText: "LEARN_MORE",
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
          valueText: "Website visitors (Demand Gen audience)",
          criterionText: "customers/1234567890/userLists/111",
          included: true,
        },
      ],
    };
    const state = hydrateDemandGenWizardFromDraft(draft);
    expect(state.name).toBe("Hydrated Demand Gen");
    expect(state.budgetDollars).toBe("25.00");
    expect(state.groups[0].ads[0].businessName).toBe("Acme");
    expect(state.targets[0].valueText).toBe("Canada");
    expect(state.audiences[0].kind).toBe("USER_LIST");
    expect(state.youtubeShorts).toBe(false);
  });
});

const emptyVideoPack = (
  draft = defaultVideoDraftTree({ customerId: "1234567890" }),
): AssistantContextPack => ({
  kind: "VIDEO",
  org: { id: "org", name: "Adrunr", slug: "adrunr" },
  client: { id: "client-default", name: "Default client", slug: "default" },
  accounts: [{ id: "acc", externalId: "1234567890", displayName: "Demo", status: "ENABLED", isManager: false }],
  campaigns: [],
  draft,
  draftId: "video-1",
  messages: [],
  memory: [],
});

describe("video assistant fill-first", () => {
  it("fills Video draft fields from a URL before asking optional gaps", () => {
    const plan = mockAssistantTurn({
      message: "https://acmeboots.com/hiking",
      pack: emptyVideoPack(),
    });
    expect(plan.update_draft_fields).toBeTruthy();
    expect(String(plan.update_draft_fields?.name)).toMatch(/Acmeboots/i);
    const groups = plan.update_draft_fields?.adGroups as Array<{
      ads: Array<{ finalUrl: string; headlines: string[]; assets: Array<{ kind: string }> }>;
    }>;
    expect(groups[0].ads[0].finalUrl).toContain("acmeboots.com");
    expect(groups[0].ads[0].headlines.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].ads[0].assets.some((asset) => asset.kind === "YOUTUBE_VIDEO")).toBe(true);
    const audiences = plan.update_draft_fields?.audiences as Array<{ kind: string }>;
    expect(audiences.some((audience) => audience.kind === "USER_LIST")).toBe(true);
    const required = plan.ask_questions.filter((question) => !question.optional);
    expect(required).toHaveLength(0);
    expect(plan.assistant_message.toLowerCase()).toMatch(/filled/);
  });

  it("refuses validate / apply / enable on Video without emitting draft mutate actions", () => {
    for (const message of ["Validate this", "Apply CREATE PAUSED", "enable and go live"]) {
      const plan = mockAssistantTurn({ message, pack: emptyVideoPack() });
      expect(plan.update_draft_fields).toBeNull();
      expect(plan.refusedAction).toBeTruthy();
    }
  });

  it("merges structured patches onto the existing Video draft tree", () => {
    const current = parseVideoDraftWrite({
      customerId: "1234567890",
      name: "Keep me",
      dailyBudgetMicros: 1_000_000,
      adGroups: [{ name: "Existing", ads: [] }],
    });
    const merged = mergeVideoDraftPatch(current, { name: "Patched video", dailyBudgetMicros: 5_000_000 });
    expect(merged.name).toBe("Patched video");
    expect(merged.dailyBudgetMicros).toBe(5_000_000);
    expect(merged.adGroups[0].name).toBe("Existing");
    expect(diffVideoDraftFields(current, merged)).toEqual(["name", "dailyBudgetMicros"]);
  });

  it("hydrates Video wizard fields from a draft view", () => {
    const draft: VideoDraftClientView = {
      id: "d1",
      customerId: "1234567890",
      externalAccountId: "ea1",
      name: "Hydrated Video",
      dailyBudgetMicros: "25000000",
      biddingStrategy: "MANUAL_CPV",
      maxCpvMicros: null,
      targetCpmMicros: null,
      targetCpaMicros: null,
      inStream: true,
      bumper: false,
      inFeed: true,
      shorts: false,
      outstream: false,
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
              descriptions: ["Desc one"],
              longHeadline: "Long headline",
              finalUrl: "https://example.com",
              callToActionText: "LEARN_MORE",
              googleAdResourceName: null,
              assets: [
                {
                  id: "as1",
                  kind: "YOUTUBE_VIDEO",
                  urlText: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
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
          valueText: "Website visitors (Video audience)",
          criterionText: "customers/1234567890/userLists/111",
          included: true,
        },
      ],
    };
    const state = hydrateVideoWizardFromDraft(draft);
    expect(state.name).toBe("Hydrated Video");
    expect(state.budgetDollars).toBe("25.00");
    expect(state.groups[0].ads[0].longHeadline).toBe("Long headline");
    expect(state.targets[0].valueText).toBe("Canada");
    expect(state.audiences[0].kind).toBe("USER_LIST");
    expect(state.shorts).toBe(false);
  });
});

const emptyShoppingPack = (
  draft = defaultShoppingDraftTree({ customerId: "1234567890" }),
): AssistantContextPack => ({
  kind: "SHOPPING",
  org: { id: "org", name: "Adrunr", slug: "adrunr" },
  client: { id: "client-default", name: "Default client", slug: "default" },
  accounts: [{ id: "acc", externalId: "1234567890", displayName: "Demo", status: "ENABLED", isManager: false }],
  campaigns: [],
  draft,
  draftId: "shopping-1",
  messages: [],
  memory: [],
});

describe("shopping assistant fill-first", () => {
  it("fills Shopping draft fields from a URL before asking optional gaps", () => {
    const plan = mockAssistantTurn({
      message: "https://acmeboots.com/hiking",
      pack: emptyShoppingPack(),
    });
    expect(plan.update_draft_fields).toBeTruthy();
    expect(String(plan.update_draft_fields?.name)).toMatch(/Acmeboots/i);
    const groups = plan.update_draft_fields?.adGroups as Array<{
      productGroups: Array<{ kind: string; valueText: string }>;
    }>;
    expect(groups[0].productGroups[0].kind).toBe("ALL_PRODUCTS");
    expect(plan.update_draft_fields?.merchantCenterId).toBeTruthy();
    const required = plan.ask_questions.filter((question) => !question.optional);
    expect(required).toHaveLength(0);
    expect(plan.assistant_message.toLowerCase()).toMatch(/filled/);
  });

  it("refuses validate / apply / enable on Shopping without emitting draft mutate actions", () => {
    for (const message of ["Validate this", "Apply CREATE PAUSED", "enable and go live"]) {
      const plan = mockAssistantTurn({ message, pack: emptyShoppingPack() });
      expect(plan.update_draft_fields).toBeNull();
      expect(plan.refusedAction).toBeTruthy();
    }
  });

  it("merges structured patches onto the existing Shopping draft tree", () => {
    const current = parseShoppingDraftWrite({
      customerId: "1234567890",
      name: "Keep me",
      dailyBudgetMicros: 1_000_000,
      merchantCenterId: "123456789",
      adGroups: [{ name: "Existing", productGroups: [] }],
    });
    const merged = mergeShoppingDraftPatch(current, { name: "Patched shopping", dailyBudgetMicros: 5_000_000 });
    expect(merged.name).toBe("Patched shopping");
    expect(merged.dailyBudgetMicros).toBe(5_000_000);
    expect(merged.adGroups[0].name).toBe("Existing");
    expect(diffShoppingDraftFields(current, merged)).toEqual(["name", "dailyBudgetMicros"]);
  });

  it("hydrates Shopping wizard fields from a draft view", () => {
    const draft: ShoppingDraftClientView = {
      id: "d1",
      customerId: "1234567890",
      externalAccountId: "ea1",
      name: "Hydrated Shopping",
      dailyBudgetMicros: "25000000",
      biddingStrategy: "MANUAL_CPC",
      merchantCenterId: "987654321",
      salesCountry: "CA",
      campaignPriority: "MEDIUM",
      enableLocal: true,
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
          productGroups: [
            {
              id: "pg1",
              kind: "ALL_PRODUCTS",
              valueText: "All products",
              dimensionText: "",
              included: true,
              sortOrder: 0,
              googleListingGroupResourceName: null,
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
    };
    const state = hydrateShoppingWizardFromDraft(draft);
    expect(state.name).toBe("Hydrated Shopping");
    expect(state.budgetDollars).toBe("25.00");
    expect(state.merchantCenterId).toBe("987654321");
    expect(state.salesCountry).toBe("CA");
    expect(state.campaignPriority).toBe("MEDIUM");
    expect(state.enableLocal).toBe(true);
    expect(state.groups[0].productGroups[0].kind).toBe("ALL_PRODUCTS");
    expect(state.targets[0].valueText).toBe("Canada");
  });
});

describe("assistant safety source locks", () => {
  it("does not call validate or apply endpoints from assistant server modules", () => {
    const ops = readFileSync(resolve(process.cwd(), "src/lib/assistant-ops.ts"), "utf8");
    const llm = readFileSync(resolve(process.cwd(), "src/lib/assistant-llm.ts"), "utf8");
    const turn = readFileSync(resolve(process.cwd(), "src/app/api/assistant/turn/route.ts"), "utf8");
    const threads = readFileSync(resolve(process.cwd(), "src/app/api/assistant/threads/route.ts"), "utf8");
    expect(turn).toContain("parseAssistantCampaignKind");
    expect(threads).toContain("parseAssistantCampaignKind");
    for (const source of [ops, llm, turn]) {
      expect(source).not.toMatch(/validateOrApplySearchDraft/);
      expect(source).not.toMatch(/validateOrApplyDisplayDraft/);
      expect(source).not.toMatch(/validateOrApplyPmaxDraft/);
      expect(source).not.toMatch(/validateOrApplyDemandGenDraft/);
      expect(source).not.toMatch(/validateOrApplyVideoDraft/);
      expect(source).not.toMatch(/validateOrApplyShoppingDraft/);
      expect(source).not.toMatch(/\/api\/ads\/search\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/search\/drafts\/.+\/apply/);
      expect(source).not.toMatch(/\/api\/ads\/display\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/display\/drafts\/.+\/apply/);
      expect(source).not.toMatch(/\/api\/ads\/pmax\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/pmax\/drafts\/.+\/apply/);
      expect(source).not.toMatch(/\/api\/ads\/demand-gen\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/demand-gen\/drafts\/.+\/apply/);
      expect(source).not.toMatch(/\/api\/ads\/video\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/video\/drafts\/.+\/apply/);
      expect(source).not.toMatch(/\/api\/ads\/shopping\/drafts\/.+\/validate/);
      expect(source).not.toMatch(/\/api\/ads\/shopping\/drafts\/.+\/apply/);
    }
  });
});
