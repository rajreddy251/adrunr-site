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
  GEO_PRESETS,
  LANGUAGE_PRESETS,
  parseSearchDraftWrite,
  type SearchDraftTree,
} from "./search-draft";
import type { AssistantCampaignKind } from "./types";

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
  source: "external_entity" | "search_draft" | "display_draft";
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
  draft: SearchDraftTree | DisplayDraftTree | null;
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

function isSearchDraft(draft: SearchDraftTree | DisplayDraftTree | null): draft is SearchDraftTree {
  return Boolean(draft && Array.isArray((draft as SearchDraftTree).adGroups?.[0]?.keywords));
}

function isDisplayDraft(draft: SearchDraftTree | DisplayDraftTree | null): draft is DisplayDraftTree {
  return Boolean(draft && Array.isArray((draft as DisplayDraftTree).audiences));
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

export function assistantSystemPrompt(kind: AssistantCampaignKind = "SEARCH"): string {
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
