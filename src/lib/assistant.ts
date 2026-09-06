import {
  AUDIENCE_PRESETS,
  DEFAULT_LOGO_IMAGE,
  DEFAULT_MARKETING_IMAGE,
  DEFAULT_SQUARE_IMAGE,
  audienceCriterionForCustomer,
  parseDisplayDraftWrite,
  type DisplayDraftTree,
} from "./display-draft";
import {
  AUDIENCE_PRESETS as DEMAND_GEN_AUDIENCE_PRESETS,
  DEFAULT_LOGO_IMAGE as DEMAND_GEN_DEFAULT_LOGO_IMAGE,
  DEFAULT_MARKETING_IMAGE as DEMAND_GEN_DEFAULT_MARKETING_IMAGE,
  DEFAULT_SQUARE_IMAGE as DEMAND_GEN_DEFAULT_SQUARE_IMAGE,
  audienceCriterionForCustomer as demandGenAudienceCriterionForCustomer,
  parseDemandGenDraftWrite,
  type DemandGenDraftTree,
} from "./demand-gen-draft";
import {
  DEFAULT_LOGO_IMAGE as PMAX_DEFAULT_LOGO_IMAGE,
  DEFAULT_MARKETING_IMAGE as PMAX_DEFAULT_MARKETING_IMAGE,
  DEFAULT_SQUARE_IMAGE as PMAX_DEFAULT_SQUARE_IMAGE,
  SIGNAL_PRESETS,
  parsePmaxDraftWrite,
  type PmaxDraftTree,
} from "./pmax-draft";
import {
  GEO_PRESETS,
  LANGUAGE_PRESETS,
  parseSearchDraftWrite,
  type SearchDraftTree,
} from "./search-draft";
import {
  AUDIENCE_PRESETS as VIDEO_AUDIENCE_PRESETS,
  DEFAULT_COMPANION_BANNER as VIDEO_DEFAULT_COMPANION_BANNER,
  DEFAULT_YOUTUBE_VIDEO,
  audienceCriterionForCustomer as videoAudienceCriterionForCustomer,
  parseVideoDraftWrite,
  type VideoDraftTree,
} from "./video-draft";
import {
  DEFAULT_MERCHANT_CENTER_ID,
  parseShoppingDraftWrite,
  type ShoppingDraftTree,
} from "./shopping-draft";
import {
  DEFAULT_ANDROID_APP_ID,
  parseAppDraftWrite,
  type AppDraftTree,
} from "./app-draft";
import {
  DEFAULT_HOTEL_CENTER_ID,
  parseHotelDraftWrite,
  type HotelDraftTree,
} from "./hotel-draft";
import {
  DEFAULT_LOCAL_PLACE_ID,
  parseLocalDraftWrite,
  type LocalDraftTree,
} from "./local-draft";
import {
  DEFAULT_LSA_CATEGORY_ID,
  parseLocalServicesDraftWrite,
  type LocalServicesDraftTree,
} from "./local-services-draft";
import type { AssistantCampaignKind } from "./types";

export const ASSISTANT_CAMPAIGN_KINDS = [
  "SEARCH",
  "DISPLAY",
  "PMAX",
  "DEMAND_GEN",
  "VIDEO",
  "SHOPPING",
  "APP",
  "HOTEL",
  "LOCAL",
  "LOCAL_SERVICES",
] as const;

export function parseAssistantCampaignKind(value: unknown): AssistantCampaignKind {
  const raw = String(value ?? "SEARCH").toUpperCase();
  if ((ASSISTANT_CAMPAIGN_KINDS as readonly string[]).includes(raw)) {
    return raw as AssistantCampaignKind;
  }
  return "SEARCH";
}

export function assistantKindLabel(kind: AssistantCampaignKind): string {
  if (kind === "DISPLAY") return "Display";
  if (kind === "PMAX") return "Performance Max";
  if (kind === "DEMAND_GEN") return "Demand Gen";
  if (kind === "VIDEO") return "Video";
  if (kind === "SHOPPING") return "Shopping";
  if (kind === "APP") return "App";
  if (kind === "HOTEL") return "Hotel";
  if (kind === "LOCAL") return "Local";
  if (kind === "LOCAL_SERVICES") return "Local Services";
  return "Search";
}

export const ASSISTANT_FORBIDDEN_ACTIONS = [
  "validate",
  "apply",
  "enable",
  "go_live",
  "publish",
  "unpause",
] as const;

const FORBIDDEN_INTENT =
  /\b(validate(?:\s*only)?|validateonly|apply(?:\s+paused)?|create paused|enable|go[\s-]?live|publish\s+live|unpause|launch)\b/i;

const FORBIDDEN_PLAN_KEYS = [
  "validate",
  "apply",
  "enable",
  "go_live",
  "publish",
  "unpause",
  "validate_draft",
  "apply_draft",
  "enable_campaign",
];

export type AssistantQuestion = {
  id: string;
  question: string;
  field?: string;
  optional?: boolean;
};

export type AssistantMemoryWrite = {
  key: string;
  value: string;
  source: string;
};

export type AssistantTurnPlan = {
  update_draft_fields: Record<string, unknown> | null;
  ask_questions: AssistantQuestion[];
  memory: AssistantMemoryWrite[];
  assistant_message: string;
  refusedAction?: string | null;
};

export type AssistantContextCampaign = {
  name: string;
  type: string;
  status: string | null;
  budgetHint: string | null;
  settings: string | null;
  source: "external_entity" | "search_draft" | "display_draft" | "pmax_draft" | "demand_gen_draft" | "video_draft" | "shopping_draft" | "app_draft" | "hotel_draft" | "local_draft" | "local_services_draft";
};

export type AssistantContextPack = {
  kind: AssistantCampaignKind;
  org: { id: string; name: string; slug: string };
  client: { id: string; name: string; slug: string };
  accounts: Array<{
    id: string;
    externalId: string;
    displayName: string | null;
    status: string;
    isManager: boolean;
  }>;
  campaigns: AssistantContextCampaign[];
  draft: SearchDraftTree | DisplayDraftTree | PmaxDraftTree | DemandGenDraftTree | VideoDraftTree | ShoppingDraftTree | AppDraftTree | HotelDraftTree | LocalDraftTree | LocalServicesDraftTree | null;
  draftId: string | null;
  messages: Array<{ role: string; content: string }>;
  memory: AssistantMemoryWrite[];
};

export function detectForbiddenAssistantIntent(text: string): string | null {
  const match = text.match(FORBIDDEN_INTENT);
  if (!match) return null;
  const token = match[1].toLowerCase().replace(/\s+/g, "_");
  if (token.includes("validate") || token.includes("dry")) return "validate";
  if (token.includes("apply") || token.includes("create_paused") || token === "create_paused") {
    return "apply";
  }
  if (token.includes("enable") || token.includes("go") || token.includes("live") || token.includes("launch")) {
    return "enable";
  }
  if (token.includes("publish") || token.includes("unpause")) return "enable";
  return token;
}

export function stripForbiddenPlanActions(plan: AssistantTurnPlan): AssistantTurnPlan {
  const raw = plan.update_draft_fields;
  if (raw && typeof raw === "object") {
    const cleaned = { ...raw };
    for (const key of FORBIDDEN_PLAN_KEYS) {
      delete cleaned[key];
    }
    delete cleaned.status;
    delete cleaned.confirmPhrase;
    delete cleaned.dryRun;
    delete cleaned.validateOnly;
    plan = { ...plan, update_draft_fields: Object.keys(cleaned).length ? cleaned : null };
  }
  return plan;
}

export function parseAssistantTurnPlan(raw: unknown): AssistantTurnPlan {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields =
    row.update_draft_fields && typeof row.update_draft_fields === "object" && !Array.isArray(row.update_draft_fields)
      ? (row.update_draft_fields as Record<string, unknown>)
      : null;
  const questions: AssistantQuestion[] = [];
  if (Array.isArray(row.ask_questions)) {
    for (const item of row.ask_questions) {
      const q = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const question = String(q.question ?? "").trim();
      if (!question) continue;
      const parsed: AssistantQuestion = {
        id: String(q.id ?? q.field ?? "gap"),
        question,
        optional: Boolean(q.optional),
      };
      if (q.field) parsed.field = String(q.field);
      questions.push(parsed);
    }
  }
  const memory = Array.isArray(row.memory)
    ? row.memory
        .map((item) => {
          const fact = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          const key = String(fact.key ?? "").trim();
          const value = String(fact.value ?? "").trim();
          if (!key || !value) return null;
          return { key, value, source: String(fact.source ?? "chat") };
        })
        .filter((item): item is AssistantMemoryWrite => Boolean(item))
    : [];
  return stripForbiddenPlanActions({
    update_draft_fields: fields && Object.keys(fields).length ? fields : null,
    ask_questions: questions,
    memory,
    assistant_message: String(row.assistant_message ?? row.message ?? "").trim(),
    refusedAction: row.refusedAction == null ? null : String(row.refusedAction),
  });
}

export function mergeDraftPatch(current: SearchDraftTree, patch: unknown): SearchDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseSearchDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    adGroups: Array.isArray(raw.adGroups) && raw.adGroups.length > 0 ? raw.adGroups : current.adGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
  });
}

export function mergeDisplayDraftPatch(current: DisplayDraftTree, patch: unknown): DisplayDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseDisplayDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    adGroups: Array.isArray(raw.adGroups) && raw.adGroups.length > 0 ? raw.adGroups : current.adGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
    audiences: Array.isArray(raw.audiences) && raw.audiences.length > 0 ? raw.audiences : current.audiences,
  });
}

export function mergePmaxDraftPatch(current: PmaxDraftTree, patch: unknown): PmaxDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parsePmaxDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    assetGroups: Array.isArray(raw.assetGroups) && raw.assetGroups.length > 0 ? raw.assetGroups : current.assetGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
    signals: Array.isArray(raw.signals) && raw.signals.length > 0 ? raw.signals : current.signals,
  });
}

export function mergeDemandGenDraftPatch(current: DemandGenDraftTree, patch: unknown): DemandGenDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseDemandGenDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    adGroups: Array.isArray(raw.adGroups) && raw.adGroups.length > 0 ? raw.adGroups : current.adGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
    audiences: Array.isArray(raw.audiences) && raw.audiences.length > 0 ? raw.audiences : current.audiences,
  });
}

export function mergeVideoDraftPatch(current: VideoDraftTree, patch: unknown): VideoDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseVideoDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    adGroups: Array.isArray(raw.adGroups) && raw.adGroups.length > 0 ? raw.adGroups : current.adGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
    audiences: Array.isArray(raw.audiences) && raw.audiences.length > 0 ? raw.audiences : current.audiences,
  });
}

export function mergeShoppingDraftPatch(current: ShoppingDraftTree, patch: unknown): ShoppingDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseShoppingDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    adGroups: Array.isArray(raw.adGroups) && raw.adGroups.length > 0 ? raw.adGroups : current.adGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
  });
}

export function mergeAppDraftPatch(current: AppDraftTree, patch: unknown): AppDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseAppDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    platforms: Array.isArray(raw.platforms) && raw.platforms.length > 0 ? raw.platforms : current.platforms,
    adGroups: Array.isArray(raw.adGroups) && raw.adGroups.length > 0 ? raw.adGroups : current.adGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
  });
}

export function mergeHotelDraftPatch(current: HotelDraftTree, patch: unknown): HotelDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseHotelDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    adGroups: Array.isArray(raw.adGroups) && raw.adGroups.length > 0 ? raw.adGroups : current.adGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
  });
}

export function mergeLocalDraftPatch(current: LocalDraftTree, patch: unknown): LocalDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseLocalDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    locations: Array.isArray(raw.locations) && raw.locations.length > 0 ? raw.locations : current.locations,
    adGroups: Array.isArray(raw.adGroups) && raw.adGroups.length > 0 ? raw.adGroups : current.adGroups,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
  });
}

export function mergeLocalServicesDraftPatch(current: LocalServicesDraftTree, patch: unknown): LocalServicesDraftTree {
  const raw = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  return parseLocalServicesDraftWrite({
    ...current,
    ...raw,
    customerId: raw.customerId ?? current.customerId,
    externalAccountId: raw.externalAccountId ?? current.externalAccountId,
    categories: Array.isArray(raw.categories) && raw.categories.length > 0 ? raw.categories : current.categories,
    targets: Array.isArray(raw.targets) && raw.targets.length > 0 ? raw.targets : current.targets,
  });
}

export function diffDraftFields(before: SearchDraftTree, after: SearchDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof SearchDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "enhancedCpcEnabled",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.adGroups) !== JSON.stringify(after.adGroups)) fields.push("adGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  return fields;
}

export function diffDisplayDraftFields(before: DisplayDraftTree, after: DisplayDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof DisplayDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "enhancedCpcEnabled",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.adGroups) !== JSON.stringify(after.adGroups)) fields.push("adGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  if (JSON.stringify(before.audiences) !== JSON.stringify(after.audiences)) fields.push("audiences");
  return fields;
}

export function diffPmaxDraftFields(before: PmaxDraftTree, after: PmaxDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof PmaxDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "urlExpansionOptOut",
    "merchantCenterId",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.assetGroups) !== JSON.stringify(after.assetGroups)) fields.push("assetGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  if (JSON.stringify(before.signals) !== JSON.stringify(after.signals)) fields.push("signals");
  return fields;
}

export function diffDemandGenDraftFields(before: DemandGenDraftTree, after: DemandGenDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof DemandGenDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "youtubeInStream",
    "youtubeInFeed",
    "youtubeShorts",
    "discover",
    "gmail",
    "display",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.adGroups) !== JSON.stringify(after.adGroups)) fields.push("adGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  if (JSON.stringify(before.audiences) !== JSON.stringify(after.audiences)) fields.push("audiences");
  return fields;
}

export function diffVideoDraftFields(before: VideoDraftTree, after: VideoDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof VideoDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "inStream",
    "bumper",
    "inFeed",
    "shorts",
    "outstream",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.adGroups) !== JSON.stringify(after.adGroups)) fields.push("adGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  if (JSON.stringify(before.audiences) !== JSON.stringify(after.audiences)) fields.push("audiences");
  return fields;
}

export function diffShoppingDraftFields(before: ShoppingDraftTree, after: ShoppingDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof ShoppingDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "merchantCenterId",
    "salesCountry",
    "campaignPriority",
    "enableLocal",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.adGroups) !== JSON.stringify(after.adGroups)) fields.push("adGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  return fields;
}

export function diffAppDraftFields(before: AppDraftTree, after: AppDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof AppDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "goal",
    "targetCpaMicros",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.platforms) !== JSON.stringify(after.platforms)) fields.push("platforms");
  if (JSON.stringify(before.adGroups) !== JSON.stringify(after.adGroups)) fields.push("adGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  return fields;
}

export function diffHotelDraftFields(before: HotelDraftTree, after: HotelDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof HotelDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "hotelCenterId",
    "percentCpcCeilingMicros",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.adGroups) !== JSON.stringify(after.adGroups)) fields.push("adGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  return fields;
}

export function diffLocalDraftFields(before: LocalDraftTree, after: LocalDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof LocalDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "goal",
    "businessName",
    "finalUrl",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.locations) !== JSON.stringify(after.locations)) fields.push("locations");
  if (JSON.stringify(before.adGroups) !== JSON.stringify(after.adGroups)) fields.push("adGroups");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  return fields;
}

export function diffLocalServicesDraftFields(before: LocalServicesDraftTree, after: LocalServicesDraftTree): string[] {
  const fields: string[] = [];
  const keys: Array<keyof LocalServicesDraftTree> = [
    "name",
    "dailyBudgetMicros",
    "biddingStrategy",
    "maxLeadBidMicros",
    "businessName",
    "googleGuaranteed",
    "startDate",
    "endDate",
    "notesText",
  ];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(String(key));
    }
  }
  if (JSON.stringify(before.categories) !== JSON.stringify(after.categories)) fields.push("categories");
  if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) fields.push("targets");
  return fields;
}

export function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[.,;]+$/, ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function extractBudgetMicros(text: string): number | null {
  const match = text.match(/\$\s?(\d+(?:\.\d{1,2})?)\s*(?:\/\s*day|per day|daily)?/i)
    ?? text.match(/(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)\s*(?:\/\s*day|per day|daily)?/i)
    ?? text.match(/daily budget(?: of)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const dollars = Number(match[1]);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 1_000_000);
}

function titleCase(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function brandFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const root = host.split(".")[0];
    return root ? titleCase(root) : null;
  } catch {
    return null;
  }
}

function pathTheme(url: string | null): string | null {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last || last.length < 3) return null;
    return titleCase(decodeURIComponent(last).replace(/\.(html|php|aspx)$/i, ""));
  } catch {
    return null;
  }
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd();
}

function resolveGeo(text: string, memory: AssistantMemoryWrite[]): (typeof GEO_PRESETS)[number] | null {
  const hay = `${text} ${memory.map((item) => item.value).join(" ")}`.toLowerCase();
  for (const preset of GEO_PRESETS) {
    if (hay.includes(preset.valueText.toLowerCase())) return preset;
  }
  if (/\b(uk|britain|england)\b/.test(hay)) return GEO_PRESETS.find((item) => item.valueText === "United Kingdom") ?? null;
  if (/\busa\b|\bu\.s\./.test(hay)) return GEO_PRESETS[0];
  return null;
}

function resolveLanguage(text: string): (typeof LANGUAGE_PRESETS)[number] {
  const hay = text.toLowerCase();
  for (const preset of LANGUAGE_PRESETS) {
    if (hay.includes(preset.valueText.toLowerCase())) return preset;
  }
  return LANGUAGE_PRESETS[0];
}

function inferBrand(text: string, url: string | null, memory: AssistantMemoryWrite[]): string | null {
  const remembered = memory.find((item) => item.key === "brand")?.value;
  if (remembered) return remembered;
  if (url) return brandFromUrl(url);
  const named = text.match(/(?:for|brand|client|company)\s+([A-Z][\w&]+(?:\s+[A-Z][\w&]+){0,2})/);
  if (named) return named[1].trim();
  const selling = text.match(/(?:we|i)\s+(?:sell|make|offer|run)\s+(.{3,40}?)(?:\s+in\s+|\s+at\s+|[,.]|$)/i);
  if (selling) return titleCase(selling[1].replace(/\b(organic|premium|local|online)\s+/gi, "").trim());
  return null;
}

function keywordSet(brand: string | null, theme: string | null, brief: string): string[] {
  const words = brief
    .replace(/https?:\/\/\S+/g, "")
    .split(/[^a-z0-9+]+/i)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2 && !["the", "and", "for", "with", "our", "you", "http", "https", "www", "com"].includes(word));
  const unique = new Set<string>();
  if (brand && theme) unique.add(`${brand.toLowerCase()} ${theme.toLowerCase()}`);
  if (theme) unique.add(theme.toLowerCase());
  if (brand) unique.add(brand.toLowerCase());
  for (const word of words.slice(0, 8)) unique.add(word);
  const list = [...unique].slice(0, 8);
  return list.length ? list : ["search ads"];
}

function buildRsa(brand: string, theme: string | null, url: string, brief: string) {
  const topic = theme ?? brand;
  const headlines = [
    clip(`${brand} Search Ads`, 30),
    clip(`${topic} — Paused Draft`, 30),
    clip("Ops, Not Autopilot", 30),
    clip(`${brand} Google Search`, 30),
    clip("Validate Before You Apply", 30),
  ].filter((item, index, all) => all.indexOf(item) === index);
  const descriptions = [
    clip(
      brief.replace(/https?:\/\/\S+/g, "").trim() ||
        `Search ads for ${brand}. Draft stays PAUSED until you validate or apply from the form.`,
      90,
    ),
    clip("Filled from your brief. Review the wizard, then Validate (dry-run) — chat cannot apply.", 90),
  ];
  let path1: string | null = null;
  let path2: string | null = null;
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    path1 = parts[0] ? clip(parts[0].replace(/[^a-z0-9-]/gi, ""), 15) : "search";
    path2 = parts[1] ? clip(parts[1].replace(/[^a-z0-9-]/gi, ""), 15) : "paused";
  } catch {
    path1 = "search";
    path2 = "paused";
  }
  return { headlines: headlines.slice(0, 8), descriptions, finalUrl: url, path1, path2 };
}

function draftLooksEmpty(draft: SearchDraftTree | null): boolean {
  if (!draft) return true;
  const defaultish = /untitled|adrunr paused search/i.test(draft.name);
  const defaultKw = draft.adGroups.every((group) =>
    group.keywords.every((keyword) => /adrunr search/i.test(keyword.text) || !keyword.text),
  );
  return defaultish || defaultKw;
}

type AnyDraft = SearchDraftTree | DisplayDraftTree | PmaxDraftTree | DemandGenDraftTree | VideoDraftTree | ShoppingDraftTree | AppDraftTree | HotelDraftTree | LocalDraftTree | LocalServicesDraftTree | null;

function isSearchDraft(draft: AnyDraft): draft is SearchDraftTree {
  return Boolean(draft && Array.isArray((draft as SearchDraftTree).adGroups?.[0]?.keywords));
}

function isVideoDraft(draft: AnyDraft): draft is VideoDraftTree {
  return Boolean(
    draft &&
      typeof (draft as VideoDraftTree).inStream === "boolean" &&
      typeof (draft as VideoDraftTree).bumper === "boolean",
  );
}

function isShoppingDraft(draft: AnyDraft): draft is ShoppingDraftTree {
  return Boolean(
    draft &&
      typeof (draft as ShoppingDraftTree).salesCountry === "string" &&
      typeof (draft as ShoppingDraftTree).campaignPriority === "string" &&
      typeof (draft as ShoppingDraftTree).enableLocal === "boolean" &&
      !Array.isArray((draft as PmaxDraftTree).assetGroups),
  );
}

function isAppDraft(draft: AnyDraft): draft is AppDraftTree {
  return Boolean(
    draft &&
      Array.isArray((draft as AppDraftTree).platforms) &&
      typeof (draft as AppDraftTree).goal === "string" &&
      !Array.isArray((draft as ShoppingDraftTree).adGroups?.[0]?.productGroups) &&
      !Array.isArray((draft as PmaxDraftTree).assetGroups),
  );
}

function isHotelDraft(draft: AnyDraft): draft is HotelDraftTree {
  return Boolean(
    draft &&
      (typeof (draft as HotelDraftTree).hotelCenterId === "string" ||
        (draft as HotelDraftTree).hotelCenterId === null) &&
      Array.isArray((draft as HotelDraftTree).adGroups?.[0]?.listings),
  );
}

function isLocalDraft(draft: AnyDraft): draft is LocalDraftTree {
  return Boolean(
    draft &&
      Array.isArray((draft as LocalDraftTree).locations) &&
      typeof (draft as LocalDraftTree).goal === "string" &&
      ((draft as LocalDraftTree).goal === "STORE_VISITS" || (draft as LocalDraftTree).goal === "STORE_SALES"),
  );
}

function isLocalServicesDraft(draft: AnyDraft): draft is LocalServicesDraftTree {
  return Boolean(
    draft &&
      Array.isArray((draft as LocalServicesDraftTree).categories) &&
      typeof (draft as LocalServicesDraftTree).googleGuaranteed === "boolean" &&
      !Array.isArray((draft as LocalDraftTree).locations),
  );
}

function isDemandGenDraft(draft: AnyDraft): draft is DemandGenDraftTree {
  return Boolean(draft && typeof (draft as DemandGenDraftTree).youtubeInStream === "boolean");
}

function isDisplayDraft(draft: AnyDraft): draft is DisplayDraftTree {
  return Boolean(
    draft &&
      Array.isArray((draft as DisplayDraftTree).audiences) &&
      !isDemandGenDraft(draft) &&
      !isVideoDraft(draft) &&
      !Array.isArray((draft as PmaxDraftTree).assetGroups),
  );
}

function isPmaxDraft(draft: AnyDraft): draft is PmaxDraftTree {
  return Boolean(draft && Array.isArray((draft as PmaxDraftTree).assetGroups));
}

function displayDraftLooksEmpty(draft: DisplayDraftTree | null): boolean {
  if (!draft) return true;
  const defaultish = /untitled|adrunr paused display/i.test(draft.name);
  const defaultAd = draft.adGroups.every((group) =>
    group.ads.every((ad) => /adrunr\.app/i.test(ad.finalUrl) || !ad.finalUrl),
  );
  return defaultish || defaultAd;
}

function buildDisplayCreative(brand: string, theme: string | null, url: string, brief: string) {
  const topic = theme ?? brand;
  const headlines = [
    clip(`${brand} Display Ads`, 30),
    clip(`${topic} — Paused Draft`, 30),
    clip("Ops, Not Autopilot", 30),
    clip(`${brand} Remarketing`, 30),
    clip("Validate Before Apply", 30),
  ].filter((item, index, all) => all.indexOf(item) === index);
  const longHeadline = clip(
    brief.replace(/https?:\/\/\S+/g, "").trim() ||
      `Display ads for ${brand}. Draft stays PAUSED until you validate or apply from the form.`,
    90,
  );
  const descriptions = [
    clip(`Remarketing is a Display audience — not a separate campaign type.`, 90),
    clip("Filled from your brief. Review the wizard, then Validate (dry-run) — chat cannot apply.", 90),
  ];
  return {
    headlines: headlines.slice(0, 5),
    longHeadline,
    descriptions,
    businessName: clip(brand, 25),
    finalUrl: url,
    assets: [
      { kind: "MARKETING_IMAGE" as const, urlText: DEFAULT_MARKETING_IMAGE, sortOrder: 0 },
      { kind: "SQUARE_MARKETING_IMAGE" as const, urlText: DEFAULT_SQUARE_IMAGE, sortOrder: 1 },
      { kind: "LOGO" as const, urlText: DEFAULT_LOGO_IMAGE, sortOrder: 2 },
    ],
  };
}

export function mockAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const forbidden = detectForbiddenAssistantIntent(input.message);
  if (forbidden) {
    return {
      update_draft_fields: null,
      ask_questions: [],
      memory: [],
      refusedAction: forbidden,
      assistant_message:
        forbidden === "validate"
          ? "I cannot Validate from chat. Use Validate (dry-run) on the wizard review step — that is validateOnly only."
          : forbidden === "apply"
            ? "I cannot Apply from chat. Create PAUSED lives on the form and requires typing CREATE PAUSED. There is no enable path."
            : "I cannot enable, publish, or go live. Adrunr only drafts PAUSED campaigns; spend requires an action outside this app.",
    };
  }

  if (input.pack.kind === "DISPLAY") {
    return mockDisplayAssistantTurn(input);
  }
  if (input.pack.kind === "PMAX") {
    return mockPmaxAssistantTurn(input);
  }
  if (input.pack.kind === "DEMAND_GEN") {
    return mockDemandGenAssistantTurn(input);
  }
  if (input.pack.kind === "VIDEO") {
    return mockVideoAssistantTurn(input);
  }
  if (input.pack.kind === "SHOPPING") {
    return mockShoppingAssistantTurn(input);
  }
  if (input.pack.kind === "APP") {
    return mockAppAssistantTurn(input);
  }
  if (input.pack.kind === "HOTEL") {
    return mockHotelAssistantTurn(input);
  }
  if (input.pack.kind === "LOCAL") {
    return mockLocalAssistantTurn(input);
  }
  if (input.pack.kind === "LOCAL_SERVICES") {
    return mockLocalServicesAssistantTurn(input);
  }

  const searchDraft = isSearchDraft(input.pack.draft) ? input.pack.draft : null;
  const url =
    extractUrlFromText(input.message) ??
    input.pack.memory.find((item) => item.key === "landing_url")?.value ??
    searchDraft?.adGroups[0]?.ads[0]?.finalUrl ??
    null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const theme = pathTheme(url);
  const geo = resolveGeo(input.message, input.pack.memory);
  const language = resolveLanguage(input.message);
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];
  const patch: Record<string, unknown> = {};

  if (brand) {
    patch.name = `${brand}${theme ? ` ${theme}` : ""} Search`;
    memory.push({ key: "brand", value: brand, source: url ? "url" : "brief" });
  }
  if (budgetMicros) {
    patch.dailyBudgetMicros = budgetMicros;
    memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "brief" });
  }
  if (url && url.startsWith("http")) {
    memory.push({ key: "landing_url", value: url, source: "url" });
  }
  if (geo) {
    memory.push({ key: "geo", value: geo.valueText, source: "brief" });
  }

  const canFillTree = Boolean(brand || url || (input.message.trim().length > 12 && draftLooksEmpty(searchDraft)));
  if (canFillTree) {
    const displayBrand = brand ?? "Search";
    const keywords = keywordSet(brand, theme, input.message);
    const finalUrl = url && url.startsWith("http") ? url : "https://adrunr.app";
    const rsa = buildRsa(displayBrand, theme, finalUrl, input.message);
    patch.adGroups = [
      {
        name: theme ? `${displayBrand} · ${theme}` : `${displayBrand} ad group`,
        defaultBidMicros: searchDraft?.adGroups[0]?.defaultBidMicros ?? 1_000_000,
        sortOrder: 0,
        keywords: keywords.map((text) => ({ text, matchType: "PHRASE", isNegative: false })),
        ads: [rsa],
      },
    ];
    patch.targets = [
      {
        type: "GEO",
        ...(geo ?? GEO_PRESETS[0]),
        included: true,
      },
      {
        type: "LANGUAGE",
        ...language,
        included: true,
      },
    ];
    patch.notesText = input.message.trim().slice(0, 500);
    patch.biddingStrategy = "MANUAL_CPC";
  }

  if (!url && !searchDraft?.adGroups[0]?.ads[0]?.finalUrl) {
    questions.push({
      id: "landing_url",
      question: "What landing page URL should the RSA use?",
      field: "finalUrl",
    });
  }
  if (!budgetMicros && !input.pack.memory.find((item) => item.key === "daily_budget_micros")) {
    questions.push({
      id: "daily_budget",
      question: "Optional: what daily budget (USD) should I set? I left the current draft budget as a starting point.",
      field: "dailyBudgetMicros",
      optional: true,
    });
  }
  if (!brand && !canFillTree) {
    questions.push({
      id: "brief",
      question: "Paste a landing URL or a short brief (product + geo) and I will fill the draft first.",
      field: "notesText",
    });
  }

  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Search draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        Array.isArray(patch.adGroups) ? "ad group / keywords / RSA" : null,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
        `language ${language.valueText}`,
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) {
    const required = questions.filter((item) => !item.optional);
    const optional = questions.filter((item) => item.optional);
    if (required.length) {
      messageParts.push(required.map((item) => item.question).join(" "));
    }
    if (optional.length) {
      messageParts.push(optional.map((item) => item.question).join(" "));
    }
  }

  return {
    update_draft_fields: filled.length ? patch : null,
    ask_questions: questions,
    memory,
    assistant_message: messageParts.join(" "),
  };
}

function mockDisplayAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const forbidden = detectForbiddenAssistantIntent(input.message);
  if (forbidden) {
    return {
      update_draft_fields: null,
      ask_questions: [],
      memory: [],
      refusedAction: forbidden,
      assistant_message:
        forbidden === "validate"
          ? "I cannot Validate from chat. Use Validate (dry-run) on the wizard review step — that is validateOnly only."
          : forbidden === "apply"
            ? "I cannot Apply from chat. Create PAUSED lives on the form and requires typing CREATE PAUSED. There is no enable path."
            : "I cannot enable, publish, or go live. Adrunr only drafts PAUSED campaigns; spend requires an action outside this app.",
    };
  }

  const displayDraft = isDisplayDraft(input.pack.draft) ? input.pack.draft : null;
  const url =
    extractUrlFromText(input.message) ??
    input.pack.memory.find((item) => item.key === "landing_url")?.value ??
    displayDraft?.adGroups[0]?.ads[0]?.finalUrl ??
    null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const theme = pathTheme(url);
  const geo = resolveGeo(input.message, input.pack.memory);
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];
  const patch: Record<string, unknown> = {};

  if (brand) {
    patch.name = `${brand}${theme ? ` ${theme}` : ""} Display`;
    memory.push({ key: "brand", value: brand, source: url ? "url" : "brief" });
  }
  if (budgetMicros) {
    patch.dailyBudgetMicros = budgetMicros;
    memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "brief" });
  }
  if (url && url.startsWith("http")) {
    memory.push({ key: "landing_url", value: url, source: "url" });
  }
  if (geo) {
    memory.push({ key: "geo", value: geo.valueText, source: "brief" });
  }

  const canFillTree = Boolean(
    brand || url || (input.message.trim().length > 12 && displayDraftLooksEmpty(displayDraft)),
  );
  if (canFillTree) {
    const displayBrand = brand ?? "Display";
    const finalUrl = url && url.startsWith("http") ? url : "https://adrunr.app";
    const creative = buildDisplayCreative(displayBrand, theme, finalUrl, input.message);
    patch.adGroups = [
      {
        name: theme ? `${displayBrand} · ${theme}` : `${displayBrand} display group`,
        defaultBidMicros: displayDraft?.adGroups[0]?.defaultBidMicros ?? 1_000_000,
        sortOrder: 0,
        ads: [creative],
      },
    ];
    patch.targets = [
      {
        type: "GEO",
        ...(geo ?? GEO_PRESETS[0]),
        included: true,
      },
    ];
    const customerId = displayDraft?.customerId || input.pack.accounts[0]?.externalId || "0000000000";
    const remarketing = AUDIENCE_PRESETS[0];
    patch.audiences = [
      {
        kind: remarketing.kind,
        valueText: remarketing.valueText,
        criterionText: audienceCriterionForCustomer(customerId, remarketing.listSuffix),
        included: true,
      },
    ];
    patch.notesText = input.message.trim().slice(0, 500);
    patch.biddingStrategy = "MANUAL_CPC";
  }

  if (!url && !displayDraft?.adGroups[0]?.ads[0]?.finalUrl) {
    questions.push({
      id: "landing_url",
      question: "What landing page URL should the Display ad use?",
      field: "finalUrl",
    });
  }
  if (!budgetMicros && !input.pack.memory.find((item) => item.key === "daily_budget_micros")) {
    questions.push({
      id: "daily_budget",
      question: "Optional: what daily budget (USD) should I set? I left the current draft budget as a starting point.",
      field: "dailyBudgetMicros",
      optional: true,
    });
  }
  if (!brand && !canFillTree) {
    questions.push({
      id: "brief",
      question: "Paste a landing URL or a short brief (product + geo) and I will fill the Display draft first.",
      field: "notesText",
    });
  }

  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Display draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        Array.isArray(patch.adGroups) ? "ad group / responsive display ad / assets" : null,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
        "remarketing audience (Display, not a separate campaign type)",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) {
    const required = questions.filter((item) => !item.optional);
    const optional = questions.filter((item) => item.optional);
    if (required.length) {
      messageParts.push(required.map((item) => item.question).join(" "));
    }
    if (optional.length) {
      messageParts.push(optional.map((item) => item.question).join(" "));
    }
  }

  return {
    update_draft_fields: filled.length ? patch : null,
    ask_questions: questions,
    memory,
    assistant_message: messageParts.join(" "),
  };
}

function pmaxDraftLooksEmpty(draft: PmaxDraftTree | null): boolean {
  if (!draft) return true;
  const defaultish = /untitled|adrunr paused performance max/i.test(draft.name);
  const defaultAd = draft.assetGroups.every((group) => /adrunr\.app/i.test(group.finalUrl) || !group.finalUrl);
  return defaultish || defaultAd;
}

function buildPmaxCreative(brand: string, theme: string | null, url: string, brief: string) {
  const topic = theme ?? brand;
  const headlines = [
    clip(`${brand} Performance Max`, 30),
    clip(`${topic} — Paused Draft`, 30),
    clip("Ops, Not Autopilot", 30),
    clip(`${brand} Asset Group`, 30),
    clip("Validate Before Apply", 30),
  ].filter((item, index, all) => all.indexOf(item) === index);
  const longHeadlines = [
    clip(
      brief.replace(/https?:\/\/\S+/g, "").trim() ||
        `Performance Max for ${brand}. Draft stays PAUSED until you validate or apply from the form.`,
      90,
    ),
  ];
  const descriptions = [
    clip("Asset groups and search-theme signals — not a listing sync product.", 90),
    clip("Filled from your brief. Review the wizard, then Validate (dry-run) — chat cannot apply.", 90),
  ];
  return {
    name: theme ? `${brand} · ${theme}` : `${brand} asset group`,
    finalUrl: url,
    headlines: headlines.slice(0, 15),
    longHeadlines,
    descriptions,
    businessName: clip(brand, 25),
    sortOrder: 0,
    assets: [
      { kind: "MARKETING_IMAGE" as const, urlText: PMAX_DEFAULT_MARKETING_IMAGE, sortOrder: 0 },
      { kind: "SQUARE_MARKETING_IMAGE" as const, urlText: PMAX_DEFAULT_SQUARE_IMAGE, sortOrder: 1 },
      { kind: "LOGO" as const, urlText: PMAX_DEFAULT_LOGO_IMAGE, sortOrder: 2 },
    ],
    listings: [] as Array<{ kind: "ALL_PRODUCTS"; valueText: string; dimensionText: string; included: boolean }>,
  };
}

function mockPmaxAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const forbidden = detectForbiddenAssistantIntent(input.message);
  if (forbidden) {
    return {
      update_draft_fields: null,
      ask_questions: [],
      memory: [],
      refusedAction: forbidden,
      assistant_message:
        forbidden === "validate"
          ? "I cannot Validate from chat. Use Validate (dry-run) on the wizard review step — that is validateOnly only."
          : forbidden === "apply"
            ? "I cannot Apply from chat. Create PAUSED lives on the form and requires typing CREATE PAUSED. There is no enable path."
            : "I cannot enable, publish, or go live. Adrunr only drafts PAUSED campaigns; spend requires an action outside this app.",
    };
  }

  const pmaxDraft = isPmaxDraft(input.pack.draft) ? input.pack.draft : null;
  const url =
    extractUrlFromText(input.message) ??
    input.pack.memory.find((item) => item.key === "landing_url")?.value ??
    pmaxDraft?.assetGroups[0]?.finalUrl ??
    null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const theme = pathTheme(url);
  const geo = resolveGeo(input.message, input.pack.memory);
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];
  const patch: Record<string, unknown> = {};

  if (brand) {
    patch.name = `${brand}${theme ? ` ${theme}` : ""} Performance Max`;
    memory.push({ key: "brand", value: brand, source: url ? "url" : "brief" });
  }
  if (budgetMicros) {
    patch.dailyBudgetMicros = budgetMicros;
    memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "brief" });
  }
  if (url && url.startsWith("http")) {
    memory.push({ key: "landing_url", value: url, source: "url" });
  }
  if (geo) {
    memory.push({ key: "geo", value: geo.valueText, source: "brief" });
  }

  const canFillTree = Boolean(
    brand || url || (input.message.trim().length > 12 && pmaxDraftLooksEmpty(pmaxDraft)),
  );
  if (canFillTree) {
    const pmaxBrand = brand ?? "Performance Max";
    const finalUrl = url && url.startsWith("http") ? url : "https://adrunr.app";
    const creative = buildPmaxCreative(pmaxBrand, theme, finalUrl, input.message);
    patch.assetGroups = [creative];
    patch.targets = [
      {
        type: "GEO",
        ...(geo ?? GEO_PRESETS[0]),
        included: true,
      },
    ];
    const themeText = theme ?? SIGNAL_PRESETS[0].valueText;
    patch.signals = [
      {
        kind: "SEARCH_THEME",
        valueText: themeText,
        criterionText: themeText.slice(0, 80),
        included: true,
      },
    ];
    patch.notesText = input.message.trim().slice(0, 500);
    patch.biddingStrategy = "MAXIMIZE_CONVERSIONS";
  }

  if (!url && !pmaxDraft?.assetGroups[0]?.finalUrl) {
    questions.push({
      id: "landing_url",
      question: "What landing page URL should the Performance Max asset group use?",
      field: "finalUrl",
    });
  }
  if (!budgetMicros && !input.pack.memory.find((item) => item.key === "daily_budget_micros")) {
    questions.push({
      id: "daily_budget",
      question: "Optional: what daily budget (USD) should I set? I left the current draft budget as a starting point.",
      field: "dailyBudgetMicros",
      optional: true,
    });
  }
  if (!brand && !canFillTree) {
    questions.push({
      id: "brief",
      question: "Paste a landing URL or a short brief (product + geo) and I will fill the Performance Max draft first.",
      field: "notesText",
    });
  }

  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Performance Max draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        Array.isArray(patch.assetGroups) ? "asset group / headlines / images / search-theme signal" : null,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) {
    const required = questions.filter((item) => !item.optional);
    const optional = questions.filter((item) => item.optional);
    if (required.length) {
      messageParts.push(required.map((item) => item.question).join(" "));
    }
    if (optional.length) {
      messageParts.push(optional.map((item) => item.question).join(" "));
    }
  }

  return {
    update_draft_fields: filled.length ? patch : null,
    ask_questions: questions,
    memory,
    assistant_message: messageParts.join(" "),
  };
}

function demandGenDraftLooksEmpty(draft: DemandGenDraftTree | null): boolean {
  if (!draft) return true;
  const defaultish = /untitled|adrunr paused demand gen/i.test(draft.name);
  const defaultAd = draft.adGroups.every((group) =>
    group.ads.every((ad) => /adrunr\.app/i.test(ad.finalUrl) || !ad.finalUrl),
  );
  return defaultish || defaultAd;
}

function buildDemandGenCreative(brand: string, theme: string | null, url: string, brief: string) {
  const topic = theme ?? brand;
  const headlines = [
    clip(`${brand} Demand Gen`, 40),
    clip(`${topic} — Paused Draft`, 40),
    clip("Ops, Not Autopilot", 40),
    clip(`${brand} YouTube + Discover`, 40),
    clip("Validate Before Apply", 40),
  ].filter((item, index, all) => all.indexOf(item) === index);
  const descriptions = [
    clip(
      brief.replace(/https?:\/\/\S+/g, "").trim() ||
        `Demand Gen ads for ${brand}. Draft stays PAUSED until you validate or apply from the form.`,
      90,
    ),
    clip("Filled from your brief. Review the wizard, then Validate (dry-run) — chat cannot apply.", 90),
  ];
  return {
    headlines: headlines.slice(0, 5),
    descriptions,
    businessName: clip(brand, 25),
    finalUrl: url,
    callToActionText: "LEARN_MORE",
    assets: [
      { kind: "MARKETING_IMAGE" as const, urlText: DEMAND_GEN_DEFAULT_MARKETING_IMAGE, sortOrder: 0 },
      { kind: "SQUARE_MARKETING_IMAGE" as const, urlText: DEMAND_GEN_DEFAULT_SQUARE_IMAGE, sortOrder: 1 },
      { kind: "LOGO" as const, urlText: DEMAND_GEN_DEFAULT_LOGO_IMAGE, sortOrder: 2 },
    ],
  };
}

function mockDemandGenAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const forbidden = detectForbiddenAssistantIntent(input.message);
  if (forbidden) {
    return {
      update_draft_fields: null,
      ask_questions: [],
      memory: [],
      refusedAction: forbidden,
      assistant_message:
        forbidden === "validate"
          ? "I cannot Validate from chat. Use Validate (dry-run) on the wizard review step — that is validateOnly only."
          : forbidden === "apply"
            ? "I cannot Apply from chat. Create PAUSED lives on the form and requires typing CREATE PAUSED. There is no enable path."
            : "I cannot enable, publish, or go live. Adrunr only drafts PAUSED campaigns; spend requires an action outside this app.",
    };
  }

  const demandGenDraft = isDemandGenDraft(input.pack.draft) ? input.pack.draft : null;
  const url =
    extractUrlFromText(input.message) ??
    input.pack.memory.find((item) => item.key === "landing_url")?.value ??
    demandGenDraft?.adGroups[0]?.ads[0]?.finalUrl ??
    null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const theme = pathTheme(url);
  const geo = resolveGeo(input.message, input.pack.memory);
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];
  const patch: Record<string, unknown> = {};

  if (brand) {
    patch.name = `${brand}${theme ? ` ${theme}` : ""} Demand Gen`;
    memory.push({ key: "brand", value: brand, source: url ? "url" : "brief" });
  }
  if (budgetMicros) {
    patch.dailyBudgetMicros = budgetMicros;
    memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "brief" });
  }
  if (url && url.startsWith("http")) {
    memory.push({ key: "landing_url", value: url, source: "url" });
  }
  if (geo) {
    memory.push({ key: "geo", value: geo.valueText, source: "brief" });
  }

  const canFillTree = Boolean(
    brand || url || (input.message.trim().length > 12 && demandGenDraftLooksEmpty(demandGenDraft)),
  );
  if (canFillTree) {
    const demandBrand = brand ?? "Demand Gen";
    const finalUrl = url && url.startsWith("http") ? url : "https://adrunr.app";
    const creative = buildDemandGenCreative(demandBrand, theme, finalUrl, input.message);
    patch.adGroups = [
      {
        name: theme ? `${demandBrand} · ${theme}` : `${demandBrand} demand gen group`,
        defaultBidMicros: demandGenDraft?.adGroups[0]?.defaultBidMicros ?? 1_000_000,
        sortOrder: 0,
        ads: [creative],
      },
    ];
    patch.targets = [
      {
        type: "GEO",
        ...(geo ?? GEO_PRESETS[0]),
        included: true,
      },
    ];
    const customerId = demandGenDraft?.customerId || input.pack.accounts[0]?.externalId || "0000000000";
    const audience = DEMAND_GEN_AUDIENCE_PRESETS[0];
    patch.audiences = [
      {
        kind: audience.kind,
        valueText: audience.valueText,
        criterionText: demandGenAudienceCriterionForCustomer(customerId, audience.listSuffix),
        included: true,
      },
    ];
    patch.notesText = input.message.trim().slice(0, 500);
    patch.biddingStrategy = "MAXIMIZE_CONVERSIONS";
  }

  if (!url && !demandGenDraft?.adGroups[0]?.ads[0]?.finalUrl) {
    questions.push({
      id: "landing_url",
      question: "What landing page URL should the Demand Gen ad use?",
      field: "finalUrl",
    });
  }
  if (!budgetMicros && !input.pack.memory.find((item) => item.key === "daily_budget_micros")) {
    questions.push({
      id: "daily_budget",
      question: "Optional: what daily budget (USD) should I set? I left the current draft budget as a starting point.",
      field: "dailyBudgetMicros",
      optional: true,
    });
  }
  if (!brand && !canFillTree) {
    questions.push({
      id: "brief",
      question: "Paste a landing URL or a short brief (product + geo) and I will fill the Demand Gen draft first.",
      field: "notesText",
    });
  }

  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Demand Gen draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        Array.isArray(patch.adGroups) ? "ad group / Demand Gen multi-asset ad / assets" : null,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
        "USER_LIST audience (Demand Gen, not a separate campaign type)",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) {
    const required = questions.filter((item) => !item.optional);
    const optional = questions.filter((item) => item.optional);
    if (required.length) {
      messageParts.push(required.map((item) => item.question).join(" "));
    }
    if (optional.length) {
      messageParts.push(optional.map((item) => item.question).join(" "));
    }
  }

  return {
    update_draft_fields: filled.length ? patch : null,
    ask_questions: questions,
    memory,
    assistant_message: messageParts.join(" "),
  };
}

function videoDraftLooksEmpty(draft: VideoDraftTree | null): boolean {
  if (!draft) return true;
  const defaultish = /untitled|adrunr paused video/i.test(draft.name);
  const defaultAd = draft.adGroups.every((group) =>
    group.ads.every((ad) => /adrunr\.app/i.test(ad.finalUrl) || !ad.finalUrl),
  );
  return defaultish || defaultAd;
}

function buildVideoCreative(brand: string, theme: string | null, url: string, brief: string) {
  const topic = theme ?? brand;
  const headlines = [
    clip(`${brand} Video Ads`, 30),
    clip(`${topic} — Paused`, 30),
    clip("Ops, Not Autopilot", 30),
    clip(`${brand} YouTube`, 30),
    clip("Validate Before Apply", 30),
  ].filter((item, index, all) => all.indexOf(item) === index);
  const descriptions = [
    clip(
      brief.replace(/https?:\/\/\S+/g, "").trim() ||
        `Video ads for ${brand}. Draft stays PAUSED until you validate or apply from the form.`,
      90,
    ),
    clip("Filled from your brief. Review the wizard, then Validate (dry-run) — chat cannot apply.", 90),
  ];
  return {
    headlines: headlines.slice(0, 5),
    descriptions,
    longHeadline: clip(`${brand} YouTube in-stream, in-feed, and Shorts — created PAUSED only.`, 90),
    finalUrl: url,
    callToActionText: "LEARN_MORE",
    assets: [
      { kind: "YOUTUBE_VIDEO" as const, urlText: DEFAULT_YOUTUBE_VIDEO, sortOrder: 0 },
      { kind: "COMPANION_BANNER" as const, urlText: VIDEO_DEFAULT_COMPANION_BANNER, sortOrder: 1 },
    ],
  };
}

function mockVideoAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const forbidden = detectForbiddenAssistantIntent(input.message);
  if (forbidden) {
    return {
      update_draft_fields: null,
      ask_questions: [],
      memory: [],
      refusedAction: forbidden,
      assistant_message:
        forbidden === "validate"
          ? "I cannot Validate from chat. Use Validate (dry-run) on the wizard review step — that is validateOnly only."
          : forbidden === "apply"
            ? "I cannot Apply from chat. Create PAUSED lives on the form and requires typing CREATE PAUSED. There is no enable path."
            : "I cannot enable, publish, or go live. Adrunr only drafts PAUSED campaigns; spend requires an action outside this app.",
    };
  }

  const videoDraft = isVideoDraft(input.pack.draft) ? input.pack.draft : null;
  const url =
    extractUrlFromText(input.message) ??
    input.pack.memory.find((item) => item.key === "landing_url")?.value ??
    videoDraft?.adGroups[0]?.ads[0]?.finalUrl ??
    null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const theme = pathTheme(url);
  const geo = resolveGeo(input.message, input.pack.memory);
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];
  const patch: Record<string, unknown> = {};

  if (brand) {
    patch.name = `${brand}${theme ? ` ${theme}` : ""} Video`;
    memory.push({ key: "brand", value: brand, source: url ? "url" : "brief" });
  }
  if (budgetMicros) {
    patch.dailyBudgetMicros = budgetMicros;
    memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "brief" });
  }
  if (url && url.startsWith("http")) {
    memory.push({ key: "landing_url", value: url, source: "url" });
  }
  if (geo) {
    memory.push({ key: "geo", value: geo.valueText, source: "brief" });
  }

  const canFillTree = Boolean(
    brand || url || (input.message.trim().length > 12 && videoDraftLooksEmpty(videoDraft)),
  );
  if (canFillTree) {
    const videoBrand = brand ?? "Video";
    const finalUrl = url && url.startsWith("http") ? url : "https://adrunr.app";
    const creative = buildVideoCreative(videoBrand, theme, finalUrl, input.message);
    patch.adGroups = [
      {
        name: theme ? `${videoBrand} · ${theme}` : `${videoBrand} video group`,
        defaultBidMicros: videoDraft?.adGroups[0]?.defaultBidMicros ?? 1_000_000,
        sortOrder: 0,
        ads: [creative],
      },
    ];
    patch.targets = [
      {
        type: "GEO",
        ...(geo ?? GEO_PRESETS[0]),
        included: true,
      },
    ];
    const customerId = videoDraft?.customerId || input.pack.accounts[0]?.externalId || "0000000000";
    const audience = VIDEO_AUDIENCE_PRESETS[0];
    patch.audiences = [
      {
        kind: audience.kind,
        valueText: audience.valueText,
        criterionText: videoAudienceCriterionForCustomer(customerId, audience.listSuffix),
        included: true,
      },
    ];
    patch.notesText = input.message.trim().slice(0, 500);
    patch.biddingStrategy = "MANUAL_CPV";
  }

  if (!url && !videoDraft?.adGroups[0]?.ads[0]?.finalUrl) {
    questions.push({
      id: "landing_url",
      question: "What landing page URL should the Video ad use?",
      field: "finalUrl",
    });
  }
  if (!budgetMicros && !input.pack.memory.find((item) => item.key === "daily_budget_micros")) {
    questions.push({
      id: "daily_budget",
      question: "Optional: what daily budget (USD) should I set? I left the current draft budget as a starting point.",
      field: "dailyBudgetMicros",
      optional: true,
    });
  }
  if (!brand && !canFillTree) {
    questions.push({
      id: "brief",
      question: "Paste a landing URL or a short brief (product + geo) and I will fill the Video draft first.",
      field: "notesText",
    });
  }

  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Video draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        Array.isArray(patch.adGroups) ? "ad group / video responsive ad / YouTube asset" : null,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
        "USER_LIST audience (Video, not a separate campaign type)",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) {
    const required = questions.filter((item) => !item.optional);
    const optional = questions.filter((item) => item.optional);
    if (required.length) {
      messageParts.push(required.map((item) => item.question).join(" "));
    }
    if (optional.length) {
      messageParts.push(optional.map((item) => item.question).join(" "));
    }
  }

  return {
    update_draft_fields: filled.length ? patch : null,
    ask_questions: questions,
    memory,
    assistant_message: messageParts.join(" "),
  };
}

function extractMerchantId(text: string, memory: AssistantMemoryWrite[]): string | null {
  const remembered = memory.find((item) => item.key === "merchant_center_id")?.value;
  if (remembered && /^\d+$/.test(digitsOnlySafe(remembered))) return digitsOnlySafe(remembered);
  const labeled = text.match(/merchant(?:\s*center)?(?:\s*id)?[:\s#]+(\d{3,})/i);
  if (labeled) return labeled[1];
  return null;
}

function digitsOnlySafe(value: string): string {
  return value.replace(/\D/g, "");
}

function shoppingDraftLooksEmpty(draft: ShoppingDraftTree | null): boolean {
  if (!draft) return true;
  return /untitled|adrunr paused shopping/i.test(draft.name);
}

function mockShoppingAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const shoppingDraft = isShoppingDraft(input.pack.draft) ? input.pack.draft : null;
  const url =
    extractUrlFromText(input.message) ??
    input.pack.memory.find((item) => item.key === "landing_url")?.value ??
    null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const theme = pathTheme(url);
  const geo = resolveGeo(input.message, input.pack.memory);
  const merchantCenterId =
    extractMerchantId(input.message, input.pack.memory) ??
    shoppingDraft?.merchantCenterId ??
    DEFAULT_MERCHANT_CENTER_ID;
  const salesCountry = geo?.valueText === "Canada" ? "CA" : geo?.valueText === "United Kingdom" ? "GB" : "US";

  const patch: Record<string, unknown> = {};
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];

  if (url) memory.push({ key: "landing_url", value: url, source: "chat" });
  if (brand) memory.push({ key: "brand", value: brand, source: "chat" });
  if (budgetMicros) memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "chat" });
  if (geo) memory.push({ key: "geo", value: geo.valueText, source: "chat" });
  memory.push({ key: "merchant_center_id", value: merchantCenterId, source: "chat" });

  if (brand) {
    patch.name = `${brand}${theme ? ` ${theme}` : ""} Shopping`;
  }
  if (budgetMicros) patch.dailyBudgetMicros = budgetMicros;
  patch.biddingStrategy = "MANUAL_CPC";
  patch.merchantCenterId = merchantCenterId;
  patch.salesCountry = shoppingDraft?.salesCountry && shoppingDraft.salesCountry !== "US" ? shoppingDraft.salesCountry : salesCountry;
  patch.campaignPriority = shoppingDraft?.campaignPriority ?? "LOW";
  patch.enableLocal = shoppingDraft?.enableLocal ?? false;

  const canFillTree = Boolean(
    brand || url || (input.message.trim().length > 12 && shoppingDraftLooksEmpty(shoppingDraft)),
  );
  if (canFillTree) {
    const shoppingBrand = brand ?? "Shopping";
    patch.adGroups = [
      {
        name: theme ? `${shoppingBrand} · ${theme}` : `${shoppingBrand} product group`,
        defaultBidMicros: shoppingDraft?.adGroups[0]?.defaultBidMicros ?? 1_000_000,
        sortOrder: 0,
        productGroups: [
          {
            kind: "ALL_PRODUCTS",
            valueText: "All products",
            dimensionText: "",
            included: true,
            sortOrder: 0,
          },
        ],
        listings: [],
      },
    ];
  }
  if (geo || !shoppingDraft?.targets.length) {
    patch.targets = [
      geo ?? {
        type: "GEO",
        valueText: "United States",
        criterionText: "geoTargetConstants/2840",
        included: true,
      },
    ];
  }

  if (!extractMerchantId(input.message, input.pack.memory) && !shoppingDraft?.merchantCenterId) {
    questions.push({
      id: "merchant_center_id",
      question: "Optional: confirm the Merchant Center id. I used a demo id so the draft can validate — replace it before a live apply.",
      field: "merchantCenterId",
      optional: true,
    });
  }
  if (!budgetMicros) {
    questions.push({
      id: "daily_budget",
      question: "Optional: what daily budget (USD) should I set? I left the current draft budget as a starting point.",
      field: "dailyBudgetMicros",
      optional: true,
    });
  }
  if (!brand && !canFillTree) {
    questions.push({
      id: "brief",
      question: "Paste a landing URL or a short brief (product + geo) and I will fill the Shopping draft first.",
      field: "notesText",
    });
  }

  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Shopping draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        Array.isArray(patch.adGroups) ? "ad group / ALL_PRODUCTS product group" : null,
        `Merchant Center ${merchantCenterId}`,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) {
    const required = questions.filter((item) => !item.optional);
    const optional = questions.filter((item) => item.optional);
    if (required.length) {
      messageParts.push(required.map((item) => item.question).join(" "));
    }
    if (optional.length) {
      messageParts.push(optional.map((item) => item.question).join(" "));
    }
  }

  return {
    update_draft_fields: filled.length ? patch : null,
    ask_questions: questions,
    memory,
    assistant_message: messageParts.join(" "),
  };
}

function extractAppId(text: string, memory: AssistantMemoryWrite[]): string | null {
  const remembered = memory.find((item) => item.key === "android_app_id")?.value;
  if (remembered && /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(remembered)) {
    return remembered;
  }
  const labeled = text.match(
    /(?:android|package|app(?:\s*id)?|play)[:\s]+([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)/i,
  );
  if (labeled) return labeled[1];
  const bare = text.match(/\b([a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,})\b/i);
  if (bare && !/\.(com|net|org|io|app)$/i.test(bare[1])) return bare[1];
  return null;
}

function extractIosAppId(text: string, memory: AssistantMemoryWrite[]): string | null {
  const remembered = memory.find((item) => item.key === "ios_app_id")?.value;
  if (remembered && /^\d{6,}$/.test(remembered.replace(/\D/g, ""))) return remembered.replace(/\D/g, "");
  const labeled = text.match(/(?:ios|iphone|app\s*store)(?:\s*id)?[:\s#]+(\d{6,})/i);
  return labeled ? labeled[1] : null;
}

function appDraftLooksEmpty(draft: AppDraftTree | null): boolean {
  if (!draft) return true;
  return /untitled|adrunr paused app/i.test(draft.name);
}

function mockAppAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const appDraft = isAppDraft(input.pack.draft) ? input.pack.draft : null;
  const url =
    extractUrlFromText(input.message) ??
    input.pack.memory.find((item) => item.key === "landing_url" || item.key === "app_store_url")?.value ??
    null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const theme = pathTheme(url);
  const geo = resolveGeo(input.message, input.pack.memory);
  const androidAppId = extractAppId(input.message, input.pack.memory) ?? appDraft?.platforms.find((item) => item.platform === "ANDROID")?.appId ?? DEFAULT_ANDROID_APP_ID;
  const iosAppId = extractIosAppId(input.message, input.pack.memory);
  const wantsIos = /\bios\b|\biphone\b|\bapp store\b/i.test(input.message);

  const patch: Record<string, unknown> = {};
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];

  if (url) memory.push({ key: "landing_url", value: url, source: "chat" });
  if (brand) memory.push({ key: "brand", value: brand, source: "chat" });
  if (budgetMicros) memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "chat" });
  if (geo) memory.push({ key: "geo", value: geo.valueText, source: "chat" });
  memory.push({ key: "android_app_id", value: androidAppId, source: "chat" });
  if (iosAppId) memory.push({ key: "ios_app_id", value: iosAppId, source: "chat" });

  if (brand) {
    patch.name = `${brand}${theme ? ` ${theme}` : ""} App`;
  }
  if (budgetMicros) patch.dailyBudgetMicros = budgetMicros;
  patch.biddingStrategy = "TARGET_CPA";
  patch.goal = "INSTALLS";
  patch.targetCpaMicros = appDraft?.targetCpaMicros ?? 2_000_000;

  const platforms: AppDraftTree["platforms"] = [
    {
      platform: "ANDROID",
      appId: androidAppId,
      included: true,
      sortOrder: 0,
    },
  ];
  if (iosAppId || wantsIos || appDraft?.platforms.some((item) => item.platform === "IOS" && item.included)) {
    platforms.push({
      platform: "IOS",
      appId: iosAppId ?? appDraft?.platforms.find((item) => item.platform === "IOS")?.appId ?? "123456789",
      included: Boolean(iosAppId || wantsIos),
      sortOrder: 1,
    });
  }
  patch.platforms = platforms;

  const canFillTree = Boolean(
    brand || url || androidAppId || (input.message.trim().length > 12 && appDraftLooksEmpty(appDraft)),
  );
  if (canFillTree) {
    const appBrand = brand ?? "App";
    patch.adGroups = [
      {
        name: theme ? `${appBrand} · ${theme}` : `${appBrand} installs`,
        defaultBidMicros: appDraft?.adGroups[0]?.defaultBidMicros ?? 1_000_000,
        sortOrder: 0,
        ads: [
          {
            headlines: [
              clip(`Install ${appBrand}`, 30),
              clip(`Download ${appBrand}`, 30),
              clip("Get the app", 30),
            ],
            descriptions: [
              clip(
                `Install ${appBrand} on Android or iOS. Draft stays PAUSED until you validate or apply from the form.`,
                90,
              ),
              clip("Filled from your brief. Chat cannot Validate or Create PAUSED.", 90),
            ],
            assets: appDraft?.adGroups[0]?.ads[0]?.assets ?? [
              { kind: "MARKETING_IMAGE", urlText: "https://placehold.co/1200x628/png?text=App", sortOrder: 0 },
            ],
          },
        ],
      },
    ];
  }
  if (geo || !appDraft?.targets.length) {
    patch.targets = [
      geo ?? {
        type: "GEO",
        valueText: "United States",
        criterionText: "geoTargetConstants/2840",
        included: true,
      },
    ];
  }

  if (!extractAppId(input.message, input.pack.memory) && !appDraft?.platforms.some((item) => item.platform === "ANDROID" && item.appId)) {
    questions.push({
      id: "android_app_id",
      question: "Optional: confirm the Android package name. I used a demo id so the draft can validate — replace it before a live apply.",
      field: "platforms",
      optional: true,
    });
  }
  if (!budgetMicros) {
    questions.push({
      id: "daily_budget",
      question: "Optional: what daily budget (USD) should I set? I left the current draft budget as a starting point.",
      field: "dailyBudgetMicros",
      optional: true,
    });
  }
  if (!brand && !canFillTree) {
    questions.push({
      id: "brief",
      question: "Paste a store URL or a short brief (app + geo) and I will fill the App draft first.",
      field: "notesText",
    });
  }

  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the App draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        Array.isArray(patch.adGroups) ? "ad group / install headlines" : null,
        `Android ${androidAppId}`,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
        "goal INSTALLS",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) {
    const required = questions.filter((item) => !item.optional);
    const optional = questions.filter((item) => item.optional);
    if (required.length) {
      messageParts.push(required.map((item) => item.question).join(" "));
    }
    if (optional.length) {
      messageParts.push(optional.map((item) => item.question).join(" "));
    }
  }

  return {
    update_draft_fields: filled.length ? patch : null,
    ask_questions: questions,
    memory,
    assistant_message: messageParts.join(" "),
  };
}

function mockHotelAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const hotelDraft = isHotelDraft(input.pack.draft) ? input.pack.draft : null;
  const url = extractUrlFromText(input.message) ?? input.pack.memory.find((item) => item.key === "landing_url")?.value ?? null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const geo = resolveGeo(input.message, input.pack.memory);
  const hotelCenterId =
    input.message.match(/hotel(?:\s*center)?[:\s#]+(\d{6,})/i)?.[1] ??
    input.pack.memory.find((item) => item.key === "hotel_center_id")?.value ??
    hotelDraft?.hotelCenterId ??
    DEFAULT_HOTEL_CENTER_ID;
  const patch: Record<string, unknown> = {};
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];
  if (url) memory.push({ key: "landing_url", value: url, source: "chat" });
  if (brand) memory.push({ key: "brand", value: brand, source: "chat" });
  if (budgetMicros) memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "chat" });
  if (geo) memory.push({ key: "geo", value: geo.valueText, source: "chat" });
  memory.push({ key: "hotel_center_id", value: hotelCenterId, source: "chat" });
  if (brand) patch.name = `${brand} Hotel`;
  if (budgetMicros) patch.dailyBudgetMicros = budgetMicros;
  patch.biddingStrategy = "PERCENT_CPC";
  patch.hotelCenterId = hotelCenterId;
  patch.percentCpcCeilingMicros = hotelDraft?.percentCpcCeilingMicros ?? 2_000_000;
  const canFill = Boolean(brand || url || input.message.trim().length > 12);
  if (canFill) {
    patch.adGroups = [
      {
        name: brand ? `${brand} hotels` : "Hotel listing group 1",
        defaultBidMicros: hotelDraft?.adGroups[0]?.defaultBidMicros ?? 1_000_000,
        sortOrder: 0,
        listings: [{ kind: "ALL_HOTELS", valueText: "All hotels", hotelIdText: "", included: true, sortOrder: 0 }],
      },
    ];
  }
  if (geo || !hotelDraft?.targets.length) {
    patch.targets = [geo ?? { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true }];
  }
  if (!budgetMicros) {
    questions.push({ id: "daily_budget", question: "Optional: what daily budget (USD) should I set?", field: "dailyBudgetMicros", optional: true });
  }
  if (!brand && !canFill) {
    questions.push({ id: "brief", question: "Paste a hotel URL or a short brief (property + geo) and I will fill the Hotel draft first.", field: "notesText" });
  }
  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Hotel draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        `Hotel Center ${hotelCenterId}`,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) messageParts.push(questions.map((item) => item.question).join(" "));
  return { update_draft_fields: filled.length ? patch : null, ask_questions: questions, memory, assistant_message: messageParts.join(" ") };
}

function mockLocalAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const localDraft = isLocalDraft(input.pack.draft) ? input.pack.draft : null;
  const url = extractUrlFromText(input.message) ?? input.pack.memory.find((item) => item.key === "landing_url")?.value ?? localDraft?.finalUrl ?? null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const geo = resolveGeo(input.message, input.pack.memory);
  const patch: Record<string, unknown> = {};
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];
  if (url) memory.push({ key: "landing_url", value: url, source: "chat" });
  if (brand) memory.push({ key: "brand", value: brand, source: "chat" });
  if (budgetMicros) memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "chat" });
  if (geo) memory.push({ key: "geo", value: geo.valueText, source: "chat" });
  if (brand) patch.name = `${brand} Local`;
  if (budgetMicros) patch.dailyBudgetMicros = budgetMicros;
  patch.biddingStrategy = "MAXIMIZE_CONVERSIONS";
  patch.goal = "STORE_VISITS";
  patch.businessName = brand ?? localDraft?.businessName ?? "Adrunr Local";
  if (url) patch.finalUrl = url;
  const canFill = Boolean(brand || url || input.message.trim().length > 12);
  if (canFill) {
    patch.locations = localDraft?.locations.length
      ? localDraft.locations
      : [{ kind: "PLACE_ID", valueText: brand ?? "Adrunr store", placeIdText: DEFAULT_LOCAL_PLACE_ID, addressText: "1 Market St, San Francisco, CA", included: true, sortOrder: 0 }];
    patch.adGroups = [
      {
        name: brand ? `${brand} store visits` : "Store visits 1",
        defaultBidMicros: localDraft?.adGroups[0]?.defaultBidMicros ?? 1_000_000,
        sortOrder: 0,
        ads: [
          {
            headlines: [clip(`Visit ${brand ?? "us"}`, 30), "Find us nearby", "Local pickup"],
            descriptions: [
              clip(`Store-visit ads for ${brand ?? "your shop"} stay PAUSED until you apply from the form.`, 90),
              "Filled from your brief. Chat cannot Validate or Create PAUSED.",
            ],
            finalUrl: url && url.startsWith("http") ? url : "https://adrunr.app",
          },
        ],
      },
    ];
  }
  if (geo || !localDraft?.targets.length) {
    patch.targets = [geo ?? { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true }];
  }
  if (!budgetMicros) {
    questions.push({ id: "daily_budget", question: "Optional: what daily budget (USD) should I set?", field: "dailyBudgetMicros", optional: true });
  }
  if (!brand && !canFill) {
    questions.push({ id: "brief", question: "Paste a store URL or a short brief (business + geo) and I will fill the Local draft first.", field: "notesText" });
  }
  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Local draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        "goal STORE_VISITS",
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) messageParts.push(questions.map((item) => item.question).join(" "));
  return { update_draft_fields: filled.length ? patch : null, ask_questions: questions, memory, assistant_message: messageParts.join(" ") };
}

function mockLocalServicesAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): AssistantTurnPlan {
  const lsaDraft = isLocalServicesDraft(input.pack.draft) ? input.pack.draft : null;
  const url = extractUrlFromText(input.message) ?? input.pack.memory.find((item) => item.key === "landing_url")?.value ?? null;
  const budgetMicros =
    extractBudgetMicros(input.message) ??
    (input.pack.memory.find((item) => item.key === "daily_budget_micros")
      ? Number(input.pack.memory.find((item) => item.key === "daily_budget_micros")?.value)
      : null);
  const brand = inferBrand(input.message, url, input.pack.memory);
  const geo = resolveGeo(input.message, input.pack.memory);
  const hay = input.message.toLowerCase();
  const category =
    /\bplumb/.test(hay)
      ? { categoryId: "xcat:home_services:plumber", valueText: "Plumber" }
      : /\belectric/.test(hay)
        ? { categoryId: "xcat:home_services:electrician", valueText: "Electrician" }
        : /\bhvac|heating|cooling/.test(hay)
          ? { categoryId: "xcat:home_services:hvac", valueText: "HVAC" }
          : lsaDraft?.categories[0]
            ? { categoryId: lsaDraft.categories[0].categoryId, valueText: lsaDraft.categories[0].valueText }
            : { categoryId: DEFAULT_LSA_CATEGORY_ID, valueText: "Plumber" };
  const patch: Record<string, unknown> = {};
  const questions: AssistantQuestion[] = [];
  const memory: AssistantMemoryWrite[] = [];
  if (url) memory.push({ key: "landing_url", value: url, source: "chat" });
  if (brand) memory.push({ key: "brand", value: brand, source: "chat" });
  if (budgetMicros) memory.push({ key: "daily_budget_micros", value: String(budgetMicros), source: "chat" });
  if (geo) memory.push({ key: "geo", value: geo.valueText, source: "chat" });
  memory.push({ key: "lsa_category", value: category.valueText, source: "chat" });
  if (brand) patch.name = `${brand} Local Services`;
  if (budgetMicros) patch.dailyBudgetMicros = budgetMicros;
  patch.biddingStrategy = "MANUAL_CPC";
  patch.maxLeadBidMicros = lsaDraft?.maxLeadBidMicros ?? 2_000_000;
  patch.businessName = brand ?? lsaDraft?.businessName ?? "Adrunr Local Services";
  patch.googleGuaranteed = lsaDraft?.googleGuaranteed ?? false;
  const canFill = Boolean(brand || url || input.message.trim().length > 12);
  if (canFill) {
    patch.categories = [{ kind: "PRIMARY", categoryId: category.categoryId, valueText: category.valueText, included: true, sortOrder: 0 }];
  }
  if (geo || !lsaDraft?.targets.length) {
    patch.targets = [geo ?? { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true }];
  }
  if (!budgetMicros) {
    questions.push({ id: "daily_budget", question: "Optional: what daily budget (USD) should I set?", field: "dailyBudgetMicros", optional: true });
  }
  if (!brand && !canFill) {
    questions.push({ id: "brief", question: "Paste a service URL or a short brief (trade + geo) and I will fill the Local Services draft first.", field: "notesText" });
  }
  const filled = Object.keys(patch);
  const messageParts: string[] = [];
  if (filled.length) {
    messageParts.push(
      `Filled the Local Services draft from your ${url ? "URL" : "brief"}: ${[
        patch.name ? `name “${patch.name}”` : null,
        budgetMicros ? `budget $${(budgetMicros / 1_000_000).toFixed(2)}/day` : null,
        `category ${category.valueText}`,
        geo ? `geo ${geo.valueText}` : "geo United States (default)",
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
    messageParts.push("The form is the source of truth — edit anything before you Validate or Create PAUSED there.");
  } else if (!questions.length) {
    messageParts.push("I have what I need on the draft. Tweak the form if you want polish; I will not block on it.");
  }
  if (questions.length) messageParts.push(questions.map((item) => item.question).join(" "));
  return { update_draft_fields: filled.length ? patch : null, ask_questions: questions, memory, assistant_message: messageParts.join(" ") };
}

export function assistantSystemPrompt(kind: AssistantCampaignKind = "SEARCH"): string {
  if (kind === "LOCAL_SERVICES") {
    return [
      "You are the Adrunr Local Services (LSA) wizard assistant.",
      "Fill or suggest Local Services campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (MANUAL_CPC), maxLeadBidMicros, businessName, licenseText, insuranceText, googleGuaranteed, startDate, endDate, notesText, categories[], targets[].",
      "categories: { kind: PRIMARY, categoryId, valueText, included }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "MVP apply uses MANUAL_CPC + PRIMARY category. ADDITIONAL categories stay stored.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  if (kind === "LOCAL") {
    return [
      "You are the Adrunr Local wizard assistant.",
      "Fill or suggest Local campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (MAXIMIZE_CONVERSIONS), goal (STORE_VISITS), businessName, finalUrl, startDate, endDate, notesText, locations[], adGroups[], targets[].",
      "locations: { kind: PLACE_ID|BUSINESS_PROFILE|ADDRESS, valueText, placeIdText, addressText, included }.",
      "adGroups: { name, defaultBidMicros, sortOrder, ads:[{headlines,descriptions,finalUrl}] }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "MVP apply uses MAXIMIZE_CONVERSIONS + STORE_VISITS. Store sales stay stored.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  if (kind === "HOTEL") {
    return [
      "You are the Adrunr Hotel wizard assistant.",
      "Fill or suggest Hotel campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "Hotel uses Hotel Center + ALL_HOTELS listings, not RSA creatives.",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (PERCENT_CPC), hotelCenterId, percentCpcCeilingMicros, startDate, endDate, notesText, adGroups[], targets[].",
      "adGroups: { name, defaultBidMicros, sortOrder, listings:[{kind,valueText,hotelIdText,included}] }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "MVP apply uses PERCENT_CPC + Hotel Center + ALL_HOTELS. UNIT listings stay stored.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  if (kind === "APP") {
    return [
      "You are the Adrunr App wizard assistant.",
      "Fill or suggest App campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "App campaigns focus on mobile installs / downloads. Platforms are ANDROID (package name) and iOS (App Store id).",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (TARGET_CPA), goal (INSTALLS), targetCpaMicros, startDate, endDate, notesText, platforms[], adGroups[], targets[].",
      "platforms: { platform: ANDROID|IOS, appId, included }.",
      "adGroups: { name, defaultBidMicros, sortOrder, ads:[{headlines,descriptions,assets:[{kind,urlText}]}] }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "MVP apply uses TARGET_CPA + INSTALLS and the first included Android (or iOS) app id. In-app actions stay stored.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  if (kind === "SHOPPING") {
    return [
      "You are the Adrunr Shopping wizard assistant.",
      "Fill or suggest Shopping campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "Shopping uses Merchant Center + product groups / listings, not RSA creatives.",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (MANUAL_CPC), merchantCenterId, salesCountry, campaignPriority, enableLocal, startDate, endDate, notesText, adGroups[], targets[].",
      "adGroups: { name, defaultBidMicros, sortOrder, productGroups:[{kind,valueText,dimensionText,included}], listings:[] }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "MVP apply uses ALL_PRODUCTS product groups and MANUAL_CPC. UNIT / SUBDIVISION and tROAS stay stored, not applied.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  if (kind === "VIDEO") {
    return [
      "You are the Adrunr Video wizard assistant.",
      "Fill or suggest Video campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "Video audiences are USER_LIST on this campaign, not a separate campaign type.",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (MANUAL_CPV), inStream, bumper, inFeed, shorts, outstream, startDate, endDate, notesText, adGroups[], targets[], audiences[].",
      "adGroups: { name, defaultBidMicros, sortOrder, ads:[{headlines,descriptions,longHeadline,finalUrl,callToActionText,assets:[{kind,urlText}]}] }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "audiences: { kind: USER_LIST, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "Headlines <= 30 chars (1-5). Descriptions <= 90 chars (1-5). Long headline <= 90.",
      "Assets: at least one YOUTUBE_VIDEO URL or 11-character video id.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  if (kind === "DEMAND_GEN") {
    return [
      "You are the Adrunr Demand Gen wizard assistant.",
      "Fill or suggest Demand Gen campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "Demand Gen audiences are USER_LIST on this campaign, not a separate campaign type.",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (MAXIMIZE_CONVERSIONS), youtubeInStream, youtubeInFeed, youtubeShorts, discover, gmail, display, startDate, endDate, notesText, adGroups[], targets[], audiences[].",
      "adGroups: { name, defaultBidMicros, sortOrder, ads:[{headlines,descriptions,businessName,finalUrl,callToActionText,assets:[{kind,urlText}]}] }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "audiences: { kind: USER_LIST, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "Headlines <= 40 chars (3-5). Descriptions <= 90 chars (1-5). Business name <= 25.",
      "Assets: at least one MARKETING_IMAGE and one SQUARE_MARKETING_IMAGE URL.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  if (kind === "PMAX") {
    return [
      "You are the Adrunr Performance Max wizard assistant.",
      "Fill or suggest Performance Max campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (MAXIMIZE_CONVERSIONS), urlExpansionOptOut, merchantCenterId, startDate, endDate, notesText, assetGroups[], targets[], signals[].",
      "assetGroups: { name, finalUrl, headlines, longHeadlines, descriptions, businessName, sortOrder, assets:[{kind,urlText}], listings:[] }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "signals: { kind: SEARCH_THEME, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "Headlines <= 30 chars (3-15). Long headlines <= 90 (1-5). Descriptions <= 90 chars (2-5). Business name <= 25.",
      "Assets: at least one MARKETING_IMAGE and one SQUARE_MARKETING_IMAGE URL.",
      "Listings are optional storage only unless merchantCenterId is set. Do not invent a listing sync product.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  if (kind === "DISPLAY") {
    return [
      "You are the Adrunr Display wizard assistant.",
      "Fill or suggest Display campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
      "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
      "Soft optional suggestions are OK. Do not block on polish.",
      "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
      "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
      "Never instruct the system to call validate or apply endpoints.",
      "Remarketing is a Display audience (USER_LIST), not a separate campaign type.",
      "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
      "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (MANUAL_CPC), enhancedCpcEnabled, startDate, endDate, notesText, adGroups[], targets[], audiences[].",
      "adGroups: { name, defaultBidMicros, sortOrder, ads:[{headlines,longHeadline,descriptions,businessName,finalUrl,assets:[{kind,urlText}]}] }.",
      "targets: { type: GEO, valueText, criterionText, included }.",
      "audiences: { kind: USER_LIST, valueText, criterionText, included }.",
      "Use geoTargetConstants/2840 for United States when unspecified.",
      "Headlines <= 30 chars (1-5). Long headline <= 90. Descriptions <= 90 chars (1-5). Business name <= 25.",
      "Assets: at least one MARKETING_IMAGE and one SQUARE_MARKETING_IMAGE URL.",
      "Scope is this organization + this client only. Never mention other clients.",
    ].join(" ");
  }
  return [
    "You are the Adrunr Search wizard assistant.",
    "Fill or suggest Search campaign draft fields FIRST from the URL, brief, client history, existing campaigns, and current draft.",
    "Ask clarifying questions ONLY for gaps you cannot resolve. Never run a full questionnaire before filling.",
    "Soft optional suggestions are OK. Do not block on polish.",
    "You CANNOT validate, apply, enable, publish, or go live. Those stay on the form.",
    "Validate is validateOnly. Apply is PAUSED + CREATE PAUSED confirm. There is no enable path.",
    "Never instruct the system to call validate or apply endpoints.",
    "Return JSON only: { update_draft_fields, ask_questions, memory, assistant_message }.",
    "update_draft_fields may include name, dailyBudgetMicros, biddingStrategy (MANUAL_CPC), enhancedCpcEnabled, startDate, endDate, notesText, adGroups[], targets[].",
    "adGroups: { name, defaultBidMicros, sortOrder, keywords:[{text,matchType,isNegative}], ads:[{headlines,descriptions,finalUrl,path1,path2}] }.",
    "targets: { type: GEO|LANGUAGE, valueText, criterionText, included }.",
    "Use geoTargetConstants/2840 for United States and languageConstants/1000 for English when unspecified.",
    "Headlines <= 30 chars (3-15). Descriptions <= 90 chars (2-4).",
    "Scope is this organization + this client only. Never mention other clients.",
  ].join(" ");
}
