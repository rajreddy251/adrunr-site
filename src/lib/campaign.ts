import { assertPausedOnly, CONFIRM_PAUSED_PHRASE, resolveDryRun } from "./safety";
import { digitsOnly } from "./ids";

export const CAMPAIGN_OP_KINDS = [
  "SEARCH_CREATE",
  "PMAX_CREATE",
  "DISPLAY_CREATE",
  "META_CAMPAIGN_CREATE",
  "TIKTOK_CAMPAIGN_CREATE",
  "LINKEDIN_CAMPAIGN_CREATE",
  "GENERIC_MUTATE",
] as const;

export type CampaignOpKindValue = (typeof CAMPAIGN_OP_KINDS)[number];

export const IMPLEMENTED_CAMPAIGN_OP_KINDS = ["SEARCH_CREATE", "DISPLAY_CREATE"] as const;

export type CampaignCreateInput = {
  customerId: string;
  name: string;
  dailyBudgetMicros: number;
  dryRun?: unknown;
  confirmPhrase?: string;
  kind?: CampaignOpKindValue;
};

export function resolveCampaignOpKind(kind: unknown): CampaignOpKindValue {
  const value = kind == null || kind === "" ? "SEARCH_CREATE" : String(kind);
  if (!(CAMPAIGN_OP_KINDS as readonly string[]).includes(value)) {
    throw Object.assign(new Error(`Unknown campaign op kind ${value}.`), {
      status: 400,
      info: { kind: "validation", hint: `Supported kinds: ${CAMPAIGN_OP_KINDS.join(", ")}.` },
    });
  }
  if (value === "DISPLAY_CREATE") {
    throw Object.assign(
      new Error("DISPLAY_CREATE uses the Display draft APIs, not the Phase 1 Search shell."),
      {
        status: 400,
        info: {
          kind: "validation",
          hint: "POST /api/ads/display/drafts then validate / apply. POST /api/ads/campaigns stays SEARCH_CREATE.",
        },
      },
    );
  }
  if (value !== "SEARCH_CREATE") {
    throw Object.assign(
      new Error(
        `${value} is schema-ready but not implemented. Google Search and Display create are the live paths.`,
      ),
      {
        status: 400,
        info: {
          kind: "validation",
          hint: "Use SEARCH_CREATE on /api/ads/campaigns, or the Display wizard drafts. Other CampaignOpKind values are stubs.",
        },
      },
    );
  }
  return "SEARCH_CREATE";
}

export type MutateRequest = {
  customerId: string;
  validateOnly: boolean;
  responseContentType: "MUTABLE_RESOURCE";
  mutateOperations: Array<Record<string, unknown>>;
};

const MIN_BUDGET_MICROS = 10_000; // $0.01 — required field; campaign stays PAUSED

export function parseCampaignInput(body: unknown): CampaignCreateInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const name = String(raw.name ?? "").trim();
  const dailyBudgetMicros = Number(raw.dailyBudgetMicros);

  if (!customerId) {
    throw Object.assign(new Error("customerId is required."), {
      status: 400,
      info: { kind: "validation", hint: "Pass a 10-digit Google Ads customer id." },
    });
  }
  if (!name) {
    throw Object.assign(new Error("Campaign name is required."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  if (!Number.isFinite(dailyBudgetMicros) || dailyBudgetMicros < MIN_BUDGET_MICROS) {
    throw Object.assign(
      new Error(
        `dailyBudgetMicros must be an integer >= ${MIN_BUDGET_MICROS} (API requires a budget; campaign stays PAUSED).`,
      ),
      { status: 400, info: { kind: "validation" } },
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

  const input: CampaignCreateInput = {
    customerId,
    name,
    dailyBudgetMicros: Math.trunc(dailyBudgetMicros),
    dryRun: raw.dryRun,
    confirmPhrase: raw.confirmPhrase === undefined ? undefined : String(raw.confirmPhrase),
    kind: resolveCampaignOpKind(raw.kind),
  };

  if (!resolveDryRun(input.dryRun) && input.confirmPhrase !== CONFIRM_PAUSED_PHRASE) {
    throw Object.assign(
      new Error(`Type ${CONFIRM_PAUSED_PHRASE} to apply a PAUSED campaign. Dry-run is preferred.`),
      {
        status: 400,
        info: {
          kind: "validation",
          hint: "POST dryRun:false requires confirmPhrase exactly CREATE PAUSED. Dry-run does not.",
        },
      },
    );
  }

  return input;
}

export function buildPausedSearchCampaignMutate(input: CampaignCreateInput): MutateRequest {
  const customerId = digitsOnly(input.customerId);
  const dryRun = resolveDryRun(input.dryRun);
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return {
    customerId,
    validateOnly: dryRun,
    responseContentType: "MUTABLE_RESOURCE",
    mutateOperations: [
      {
        campaignBudgetOperation: {
          create: {
            resourceName: budgetResourceName,
            name: `${input.name} budget ${stamp}`,
            amountMicros: String(input.dailyBudgetMicros),
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      },
      {
        campaignOperation: {
          create: {
            name: input.name,
            status: "PAUSED",
            advertisingChannelType: "SEARCH",
            campaignBudget: budgetResourceName,
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            manualCpc: { enhancedCpcEnabled: false },
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
              targetContentNetwork: false,
              targetPartnerSearchNetwork: false,
            },
          },
        },
      },
    ],
  };
}
