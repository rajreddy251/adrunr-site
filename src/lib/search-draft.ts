import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";
import type { MutateRequest } from "./campaign";

export const SEARCH_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;
export const SEARCH_KEYWORD_MATCH_TYPES = ["BROAD", "PHRASE", "EXACT"] as const;
export const SEARCH_TARGET_TYPES = ["GEO", "LANGUAGE", "AUDIENCE", "SCHEDULE", "DEVICE"] as const;
export const SEARCH_BIDDING_STRATEGIES = [
  "MANUAL_CPC",
  "MAXIMIZE_CLICKS",
  "MAXIMIZE_CONVERSIONS",
  "TARGET_CPA",
  "TARGET_ROAS",
] as const;

export type SearchDraftStatusValue = (typeof SEARCH_DRAFT_STATUSES)[number];
export type SearchKeywordMatchTypeValue = (typeof SEARCH_KEYWORD_MATCH_TYPES)[number];
export type SearchTargetTypeValue = (typeof SEARCH_TARGET_TYPES)[number];
export type SearchBiddingStrategyValue = (typeof SEARCH_BIDDING_STRATEGIES)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;
export const HEADLINE_MIN = 3;
export const HEADLINE_MAX = 15;
export const HEADLINE_CHAR_MAX = 30;
export const DESCRIPTION_MIN = 2;
export const DESCRIPTION_MAX = 4;
export const DESCRIPTION_CHAR_MAX = 90;
export const PATH_CHAR_MAX = 15;

export const GEO_PRESETS = [
  { valueText: "United States", criterionText: "geoTargetConstants/2840" },
  { valueText: "Canada", criterionText: "geoTargetConstants/2124" },
  { valueText: "United Kingdom", criterionText: "geoTargetConstants/2826" },
  { valueText: "Australia", criterionText: "geoTargetConstants/2036" },
  { valueText: "India", criterionText: "geoTargetConstants/2356" },
] as const;

export const LANGUAGE_PRESETS = [
  { valueText: "English", criterionText: "languageConstants/1000" },
  { valueText: "Spanish", criterionText: "languageConstants/1003" },
  { valueText: "French", criterionText: "languageConstants/1002" },
  { valueText: "German", criterionText: "languageConstants/1001" },
  { valueText: "Portuguese", criterionText: "languageConstants/1014" },
] as const;

export type SearchKeywordInput = {
  text: string;
  matchType: SearchKeywordMatchTypeValue;
  bidMicros?: number | null;
  isNegative: boolean;
};

export type SearchAdInput = {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1?: string | null;
  path2?: string | null;
};

export type SearchAdGroupInput = {
  name: string;
  defaultBidMicros: number;
  sortOrder: number;
  keywords: SearchKeywordInput[];
  ads: SearchAdInput[];
};

export type SearchTargetInput = {
  type: SearchTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type SearchDraftTree = {
  customerId: string;
  externalAccountId?: string;
  name: string;
  dailyBudgetMicros: number;
  biddingStrategy: SearchBiddingStrategyValue;
  enhancedCpcEnabled: boolean;
  targetCpaMicros?: number | null;
  targetRoasText?: string | null;
  targetGoogleSearch: boolean;
  targetSearchNetwork: boolean;
  targetContentNetwork: boolean;
  targetPartnerSearchNetwork: boolean;
  startDate?: string | null;
  endDate?: string | null;
  notesText?: string | null;
  adGroups: SearchAdGroupInput[];
  targets: SearchTargetInput[];
};

function validationError(message: string, hint?: string): Error {
  return Object.assign(new Error(message), {
    status: 400,
    info: { kind: "validation", hint },
  });
}

export function encodeTextList(items: string[]): string {
  return JSON.stringify(items);
}

export function decodeTextList(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item));
  } catch {
    // fall through to newline-separated TEXT
  }
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function optionalString(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}

function optionalMicros(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseDate(value: unknown, label: string): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw validationError(`${label} must be YYYY-MM-DD.`, "Use an ISO date such as 2026-09-06.");
  }
  return raw;
}

function parseMatchType(value: unknown): SearchKeywordMatchTypeValue {
  const raw = String(value ?? "PHRASE").toUpperCase();
  if (!(SEARCH_KEYWORD_MATCH_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown keyword match type ${raw}.`, `Use ${SEARCH_KEYWORD_MATCH_TYPES.join(", ")}.`);
  }
  return raw as SearchKeywordMatchTypeValue;
}

function parseTargetType(value: unknown): SearchTargetTypeValue {
  const raw = String(value ?? "").toUpperCase();
  if (!(SEARCH_TARGET_TYPES as readonly string[]).includes(raw)) {
    throw validationError(`Unknown target type ${raw}.`, `Use ${SEARCH_TARGET_TYPES.join(", ")}.`);
  }
  return raw as SearchTargetTypeValue;
}

function parseBiddingStrategy(value: unknown): SearchBiddingStrategyValue {
  const raw = String(value ?? "MANUAL_CPC").toUpperCase();
  if (!(SEARCH_BIDDING_STRATEGIES as readonly string[]).includes(raw)) {
    throw validationError(
      `Unknown bidding strategy ${raw}.`,
      `MVP applies MANUAL_CPC. Schema also stores ${SEARCH_BIDDING_STRATEGIES.join(", ")}.`,
    );
  }
  return raw as SearchBiddingStrategyValue;
}

function parseHeadlines(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < HEADLINE_MIN || items.length > HEADLINE_MAX) {
    throw validationError(
      `Responsive search ads need ${HEADLINE_MIN}–${HEADLINE_MAX} headlines.`,
      `Each headline is at most ${HEADLINE_CHAR_MAX} characters.`,
    );
  }
  for (const headline of items) {
    if (headline.length > HEADLINE_CHAR_MAX) {
      throw validationError(`Headline exceeds ${HEADLINE_CHAR_MAX} characters: "${headline.slice(0, 24)}…"`);
    }
  }
  return items;
}

function parseDescriptions(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(raw));
  if (items.length < DESCRIPTION_MIN || items.length > DESCRIPTION_MAX) {
    throw validationError(
      `Responsive search ads need ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} descriptions.`,
      `Each description is at most ${DESCRIPTION_CHAR_MAX} characters.`,
    );
  }
  for (const description of items) {
    if (description.length > DESCRIPTION_CHAR_MAX) {
      throw validationError(`Description exceeds ${DESCRIPTION_CHAR_MAX} characters.`);
    }
  }
  return items;
}

function parsePath(value: unknown, label: string): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  if (raw.includes("/") || raw.length > PATH_CHAR_MAX) {
    throw validationError(`${label} must be at most ${PATH_CHAR_MAX} characters and cannot contain "/".`);
  }
  return raw;
}

function parseFinalUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw validationError("finalUrl is required for each RSA.");
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("protocol");
    }
  } catch {
    throw validationError("finalUrl must be an http(s) URL.");
  }
  return raw;
}

function parseKeyword(raw: unknown): SearchKeywordInput {
  const row = asRecord(raw);
  const text = String(row.text ?? "").trim();
  if (!text) throw validationError("Keyword text is required.");
  const bidMicros = optionalMicros(row.bidMicros);
  const isNegative = Boolean(row.isNegative);
  if (bidMicros != null && bidMicros < MIN_BID_MICROS) {
    throw validationError(`Keyword bidMicros must be >= ${MIN_BID_MICROS}.`);
  }
  return {
    text,
    matchType: parseMatchType(row.matchType),
    bidMicros,
    isNegative,
  };
}

function parseAd(raw: unknown): SearchAdInput {
  const row = asRecord(raw);
  return {
    headlines: parseHeadlines(row.headlines ?? row.headlinesText),
    descriptions: parseDescriptions(row.descriptions ?? row.descriptionsText),
    finalUrl: parseFinalUrl(row.finalUrl),
    path1: parsePath(row.path1, "path1"),
    path2: parsePath(row.path2, "path2"),
  };
}

function parseAdGroup(raw: unknown, index: number): SearchAdGroupInput {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  const defaultBidMicros = Number(row.defaultBidMicros);
  if (!name) throw validationError(`Ad group ${index + 1} needs a name.`);
  if (!Number.isFinite(defaultBidMicros) || defaultBidMicros < MIN_BID_MICROS) {
    throw validationError(`Ad group "${name}" defaultBidMicros must be >= ${MIN_BID_MICROS}.`);
  }
  const keywords = Array.isArray(row.keywords) ? row.keywords.map(parseKeyword) : [];
  const ads = Array.isArray(row.ads) ? row.ads.map(parseAd) : [];
  if (keywords.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one keyword.`);
  }
  if (ads.length === 0) {
    throw validationError(`Ad group "${name}" needs at least one responsive search ad.`);
  }
  return {
    name,
    defaultBidMicros: Math.trunc(defaultBidMicros),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    keywords,
    ads,
  };
}

function parseTarget(raw: unknown): SearchTargetInput {
  const row = asRecord(raw);
  const type = parseTargetType(row.type);
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) {
    throw validationError("Each target needs valueText and criterionText.");
  }
  return {
    type,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

function parseKeywordLoose(raw: unknown): SearchKeywordInput | null {
  const row = asRecord(raw);
  const text = String(row.text ?? "").trim();
  if (!text) return null;
  return {
    text,
    matchType: (SEARCH_KEYWORD_MATCH_TYPES as readonly string[]).includes(
      String(row.matchType ?? "PHRASE").toUpperCase(),
    )
      ? (String(row.matchType ?? "PHRASE").toUpperCase() as SearchKeywordMatchTypeValue)
      : "PHRASE",
    bidMicros: optionalMicros(row.bidMicros),
    isNegative: Boolean(row.isNegative),
  };
}

function parseAdLoose(raw: unknown): SearchAdInput {
  const row = asRecord(raw);
  const headlines = Array.isArray(row.headlines)
    ? row.headlines.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.headlinesText ?? row.headlines));
  const descriptions = Array.isArray(row.descriptions)
    ? row.descriptions.map((item) => String(item).trim()).filter(Boolean)
    : decodeTextList(optionalString(row.descriptionsText ?? row.descriptions));
  return {
    headlines,
    descriptions,
    finalUrl: optionalString(row.finalUrl) ?? "",
    path1: optionalString(row.path1),
    path2: optionalString(row.path2),
  };
}

function parseAdGroupLoose(raw: unknown, index: number): SearchAdGroupInput | null {
  const row = asRecord(raw);
  const name = String(row.name ?? "").trim();
  if (!name) return null;
  const defaultBidMicros = Number(row.defaultBidMicros);
  return {
    name,
    defaultBidMicros:
      Number.isFinite(defaultBidMicros) && defaultBidMicros >= MIN_BID_MICROS
        ? Math.trunc(defaultBidMicros)
        : 1_000_000,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : index,
    keywords: Array.isArray(row.keywords)
      ? row.keywords.map(parseKeywordLoose).filter((item): item is SearchKeywordInput => Boolean(item))
      : [],
    ads: Array.isArray(row.ads) ? row.ads.map(parseAdLoose) : [],
  };
}

function parseTargetLoose(raw: unknown): SearchTargetInput | null {
  const row = asRecord(raw);
  const typeRaw = String(row.type ?? "").toUpperCase();
  if (!(SEARCH_TARGET_TYPES as readonly string[]).includes(typeRaw)) return null;
  const valueText = String(row.valueText ?? row.value ?? "").trim();
  const criterionText = String(row.criterionText ?? row.criterion ?? "").trim();
  if (!valueText || !criterionText) return null;
  return {
    type: typeRaw as SearchTargetTypeValue,
    valueText,
    criterionText,
    included: row.included === false || row.exclude === true ? false : true,
  };
}

/** Persist wizard progress. Incomplete trees are allowed; validate/apply use parseSearchDraftTree. */
export function parseSearchDraftWrite(body: unknown): SearchDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim() || "Untitled search draft";
  const dailyBudgetMicros = Number(raw.dailyBudgetMicros);
  if (!customerId && !optionalString(raw.externalAccountId)) {
    throw validationError("customerId or externalAccountId is required.", "Pick a Google Ads customer.");
  }
  if (raw.status) {
    try {
      assertPausedOnly(String(raw.status));
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        status: 400,
        info: { kind: "validation", hint: "Adrunr only creates PAUSED campaigns." },
      });
    }
  }
  const biddingStrategy = parseBiddingStrategy(raw.biddingStrategy);
  return {
    customerId,
    externalAccountId: optionalString(raw.externalAccountId) ?? undefined,
    name,
    dailyBudgetMicros:
      Number.isFinite(dailyBudgetMicros) && dailyBudgetMicros >= MIN_BUDGET_MICROS
        ? Math.trunc(dailyBudgetMicros)
        : 1_000_000,
    biddingStrategy,
    enhancedCpcEnabled: Boolean(raw.enhancedCpcEnabled),
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText ?? raw.targetRoas),
    targetGoogleSearch: raw.targetGoogleSearch === false ? false : true,
    targetSearchNetwork: raw.targetSearchNetwork === false ? false : true,
    targetContentNetwork: Boolean(raw.targetContentNetwork),
    targetPartnerSearchNetwork: Boolean(raw.targetPartnerSearchNetwork),
    startDate: parseDate(raw.startDate, "startDate"),
    endDate: parseDate(raw.endDate, "endDate"),
    notesText: optionalString(raw.notesText),
    adGroups: Array.isArray(raw.adGroups)
      ? raw.adGroups
          .map(parseAdGroupLoose)
          .filter((item): item is SearchAdGroupInput => Boolean(item))
      : [],
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(parseTargetLoose).filter((item): item is SearchTargetInput => Boolean(item))
      : [],
  };
}

export function parseSearchDraftTree(body: unknown): SearchDraftTree {
  const raw = asRecord(body);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim();
  const dailyBudgetMicros = Number(raw.dailyBudgetMicros);

  if (!customerId && !optionalString(raw.externalAccountId)) {
    throw validationError("customerId or externalAccountId is required.", "Pick a Google Ads customer.");
  }
  if (!name) throw validationError("Campaign name is required.");
  if (!Number.isFinite(dailyBudgetMicros) || dailyBudgetMicros < MIN_BUDGET_MICROS) {
    throw validationError(
      `dailyBudgetMicros must be an integer >= ${MIN_BUDGET_MICROS} (API requires a budget; campaign stays PAUSED).`,
    );
  }
  if (raw.status) {
    try {
      assertPausedOnly(String(raw.status));
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        status: 400,
        info: { kind: "validation", hint: "Adrunr only creates PAUSED campaigns." },
      });
    }
  }

  const biddingStrategy = parseBiddingStrategy(raw.biddingStrategy);
  if (biddingStrategy !== "MANUAL_CPC") {
    throw validationError(
      `${biddingStrategy} is schema-ready but not applied in Phase 2.`,
      "Use MANUAL_CPC. tROAS / tCPA stay stored for later phases.",
    );
  }

  const adGroups = Array.isArray(raw.adGroups) ? raw.adGroups.map(parseAdGroup) : [];
  if (adGroups.length === 0) {
    throw validationError("At least one ad group is required.");
  }

  const targets = Array.isArray(raw.targets) ? raw.targets.map(parseTarget) : [];
  const languages = targets.filter((target) => target.type === "LANGUAGE");
  if (languages.length === 0) {
    throw validationError("At least one LANGUAGE target is required.", "English (languageConstants/1000) is the usual default.");
  }

  const startDate = parseDate(raw.startDate, "startDate");
  const endDate = parseDate(raw.endDate, "endDate");
  if (startDate && endDate && endDate < startDate) {
    throw validationError("endDate must be on or after startDate.");
  }

  return {
    customerId,
    externalAccountId: optionalString(raw.externalAccountId) ?? undefined,
    name,
    dailyBudgetMicros: Math.trunc(dailyBudgetMicros),
    biddingStrategy,
    enhancedCpcEnabled: Boolean(raw.enhancedCpcEnabled),
    targetCpaMicros: optionalMicros(raw.targetCpaMicros),
    targetRoasText: optionalString(raw.targetRoasText ?? raw.targetRoas),
    targetGoogleSearch: raw.targetGoogleSearch === false ? false : true,
    targetSearchNetwork: raw.targetSearchNetwork === false ? false : true,
    targetContentNetwork: Boolean(raw.targetContentNetwork),
    targetPartnerSearchNetwork: Boolean(raw.targetPartnerSearchNetwork),
    startDate,
    endDate,
    notesText: optionalString(raw.notesText),
    adGroups,
    targets,
  };
}

export function assertApplyConfirm(dryRun: unknown, confirmPhrase: unknown): void {
  if (!resolveDryRun(dryRun) && String(confirmPhrase ?? "") !== CONFIRM_PAUSED_PHRASE) {
    throw validationError(
      `Type ${CONFIRM_PAUSED_PHRASE} to apply a PAUSED campaign. Dry-run is preferred.`,
      "POST apply / dryRun:false requires confirmPhrase exactly CREATE PAUSED. Validate does not.",
    );
  }
}

export function buildSearchDraftMutate(tree: SearchDraftTree, validateOnly: boolean): MutateRequest {
  const customerId = digitsOnly(tree.customerId);
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  const campaignResourceName = `customers/${customerId}/campaigns/-2`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mutateOperations: Array<Record<string, unknown>> = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResourceName,
          name: `${tree.name} budget ${stamp}`,
          amountMicros: String(tree.dailyBudgetMicros),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResourceName,
          name: tree.name,
          status: "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: budgetResourceName,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          manualCpc: { enhancedCpcEnabled: tree.enhancedCpcEnabled },
          networkSettings: {
            targetGoogleSearch: tree.targetGoogleSearch,
            targetSearchNetwork: tree.targetSearchNetwork,
            targetContentNetwork: tree.targetContentNetwork,
            targetPartnerSearchNetwork: tree.targetPartnerSearchNetwork,
          },
          ...(tree.startDate ? { startDate: tree.startDate.replace(/-/g, "") } : {}),
          ...(tree.endDate ? { endDate: tree.endDate.replace(/-/g, "") } : {}),
        },
      },
    },
  ];

  for (const target of tree.targets) {
    if (target.type === "AUDIENCE" || target.type === "SCHEDULE" || target.type === "DEVICE") {
      continue;
    }
    const criterion: Record<string, unknown> = {
      campaign: campaignResourceName,
      negative: !target.included,
    };
    if (target.type === "GEO") {
      criterion.location = { geoTargetConstant: target.criterionText };
    } else if (target.type === "LANGUAGE") {
      criterion.language = { languageConstant: target.criterionText };
      delete criterion.negative;
    }
    mutateOperations.push({ campaignCriterionOperation: { create: criterion } });
  }

  let nextTemp = -3;
  for (const group of tree.adGroups) {
    const adGroupResourceName = `customers/${customerId}/adGroups/${nextTemp}`;
    nextTemp -= 1;
    mutateOperations.push({
      adGroupOperation: {
        create: {
          resourceName: adGroupResourceName,
          name: group.name,
          campaign: campaignResourceName,
          status: "ENABLED",
          type: "SEARCH_STANDARD",
          cpcBidMicros: String(group.defaultBidMicros),
        },
      },
    });

    for (const keyword of group.keywords) {
      mutateOperations.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "ENABLED",
            negative: keyword.isNegative,
            keyword: { text: keyword.text, matchType: keyword.matchType },
            ...(keyword.bidMicros && !keyword.isNegative
              ? { cpcBidMicros: String(keyword.bidMicros) }
              : {}),
          },
        },
      });
    }

    for (const ad of group.ads) {
      mutateOperations.push({
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResourceName,
            status: "PAUSED",
            ad: {
              finalUrls: [ad.finalUrl],
              responsiveSearchAd: {
                headlines: ad.headlines.map((text) => ({ text })),
                descriptions: ad.descriptions.map((text) => ({ text })),
                ...(ad.path1 ? { path1: ad.path1 } : {}),
                ...(ad.path2 ? { path2: ad.path2 } : {}),
              },
            },
          },
        },
      });
    }
  }

  return {
    customerId,
    validateOnly,
    responseContentType: "MUTABLE_RESOURCE",
    mutateOperations,
  };
}

export function extractResourceNames(response: unknown): {
  campaign?: string;
  adGroups: string[];
  criteria: string[];
  ads: string[];
} {
  const body = asRecord(response);
  const ops = Array.isArray(body.mutateOperationResponses)
    ? (body.mutateOperationResponses as Array<Record<string, unknown>>)
    : [];
  const adGroups: string[] = [];
  const criteria: string[] = [];
  const ads: string[] = [];
  let campaign: string | undefined;
  for (const op of ops) {
    const campaignResult = asRecord(op.campaignResult);
    if (typeof campaignResult.resourceName === "string") campaign = campaignResult.resourceName;
    const adGroupResult = asRecord(op.adGroupResult);
    if (typeof adGroupResult.resourceName === "string") adGroups.push(adGroupResult.resourceName);
    const criterionResult = asRecord(op.adGroupCriterionResult);
    if (typeof criterionResult.resourceName === "string") criteria.push(criterionResult.resourceName);
    const adResult = asRecord(op.adGroupAdResult);
    if (typeof adResult.resourceName === "string") ads.push(adResult.resourceName);
  }
  return { campaign, adGroups, criteria, ads };
}

export function defaultSearchDraftTree(partial?: Partial<SearchDraftTree>): SearchDraftTree {
  return {
    customerId: partial?.customerId ?? "",
    externalAccountId: partial?.externalAccountId,
    name: partial?.name ?? "Adrunr paused search",
    dailyBudgetMicros: partial?.dailyBudgetMicros ?? 1_000_000,
    biddingStrategy: "MANUAL_CPC",
    enhancedCpcEnabled: false,
    targetGoogleSearch: true,
    targetSearchNetwork: true,
    targetContentNetwork: false,
    targetPartnerSearchNetwork: false,
    startDate: partial?.startDate ?? null,
    endDate: partial?.endDate ?? null,
    adGroups: partial?.adGroups ?? [
      {
        name: "Ad group 1",
        defaultBidMicros: 1_000_000,
        sortOrder: 0,
        keywords: [{ text: "adrunr search", matchType: "PHRASE", isNegative: false }],
        ads: [
          {
            headlines: ["Adrunr Search Ads", "Paused Campaign Tools", "Ops, Not Autopilot"],
            descriptions: [
              "Create Search campaigns as PAUSED. Dry-run is the default path.",
              "Validate the full tree before any Google Ads apply.",
            ],
            finalUrl: "https://adrunr.app",
            path1: "search",
            path2: "paused",
          },
        ],
      },
    ],
    targets: partial?.targets ?? [
      { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
      { type: "LANGUAGE", valueText: "English", criterionText: "languageConstants/1000", included: true },
    ],
  };
}
