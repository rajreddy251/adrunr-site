import type { MutateRequest } from "./campaign";
import { digitsOnly } from "./ids";
import {
  assertEditDoesNotEnable,
  assertPausedOnly,
  CAMPAIGN_EDIT_NOTE,
  CONFIRM_EDIT_PHRASE,
  resolveDryRun,
} from "./safety";

export const CAMPAIGN_EDIT_FIELD_KINDS = ["NAME", "BUDGET", "BID", "TARGETING"] as const;
export const CAMPAIGN_EDIT_TARGET_TYPES = ["GEO", "LANGUAGE"] as const;
export const CAMPAIGN_EDIT_DRAFT_STATUSES = ["DRAFT", "VALIDATED", "APPLIED", "FAILED"] as const;

export type CampaignEditFieldKindValue = (typeof CAMPAIGN_EDIT_FIELD_KINDS)[number];
export type CampaignEditTargetTypeValue = (typeof CAMPAIGN_EDIT_TARGET_TYPES)[number];

export const MIN_BUDGET_MICROS = 10_000;
export const MIN_BID_MICROS = 10_000;

export const ENABLE_REFUSAL_KEYS = [
  "enable",
  "unpause",
  "goLive",
  "go_live",
  "golive",
  "servingStatus",
  "campaignStatus",
] as const;

export type CampaignEditBidInput = {
  adGroupExternalId: string;
  googleAdGroupResourceName?: string | null;
  adGroupName?: string | null;
  currentBidMicros?: number | null;
  proposedBidMicros: number;
};

export type CampaignEditTargetInput = {
  type: CampaignEditTargetTypeValue;
  valueText: string;
  criterionText: string;
  included: boolean;
};

export type CampaignEditTree = {
  customerId: string;
  syncedCampaignId?: string | null;
  campaignExternalId: string;
  googleCampaignResourceName?: string | null;
  budgetResourceName?: string | null;
  advertisingChannelType?: string | null;
  currentName: string;
  proposedName?: string | null;
  currentDailyBudgetMicros?: number | null;
  proposedDailyBudgetMicros?: number | null;
  notesText?: string | null;
  bids: CampaignEditBidInput[];
  targets: CampaignEditTargetInput[];
  dryRun?: unknown;
  confirmPhrase?: string;
};

function validationError(message: string, hint?: string): Error {
  return Object.assign(new Error(message), {
    status: 400,
    info: { kind: "validation", hint },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("Expected an object payload.");
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return text || null;
}

function optionalMicros(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(n)) {
    throw validationError("Micros values must be finite integers.");
  }
  return Math.trunc(n);
}

function walkForStatus(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForStatus(item, `${path}[${index}]`, found));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const next = path ? `${path}.${key}` : key;
    if (key === "status" || key === "servingStatus" || key === "campaignStatus") {
      found.push(`${next}=${String(inner)}`);
    }
    walkForStatus(inner, next, found);
  }
}

export function refuseEnableOnEdit(body: unknown): void {
  const raw = asRecord(body ?? {});
  for (const key of ENABLE_REFUSAL_KEYS) {
    const value = raw[key];
    if (
      value === true ||
      (typeof value === "string" && value.trim() !== "") ||
      (Array.isArray(value) && value.length > 0) ||
      (value && typeof value === "object")
    ) {
      throw Object.assign(new Error(CAMPAIGN_EDIT_NOTE), {
        status: 400,
        info: {
          kind: "edit_enable_refused",
          hint: `Remove ${key}. Campaign edits never enable, unpause, or go live.`,
        },
      });
    }
  }

  if (raw.status != null && raw.status !== "") {
    try {
      assertPausedOnly(String(raw.status));
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        status: 400,
        info: { kind: "edit_enable_refused", hint: "Campaign edits refuse status ENABLED." },
      });
    }
    assertEditDoesNotEnable(String(raw.status));
  }

  const statuses: string[] = [];
  walkForStatus(raw.mutateOperations ?? raw.campaignOperation ?? null, "", statuses);
  if (statuses.some((entry) => /ENABLED/i.test(entry))) {
    throw Object.assign(new Error("Refusing ENABLE on edit. Campaign edits never set status ENABLED."), {
      status: 400,
      info: { kind: "edit_enable_refused", hint: CAMPAIGN_EDIT_NOTE },
    });
  }
}

export function assertNoStatusInMutate(operations: Array<Record<string, unknown>>): void {
  const found: string[] = [];
  walkForStatus(operations, "mutateOperations", found);
  if (found.length) {
    throw validationError(
      "Campaign edit mutate must not include status fields.",
      `${CAMPAIGN_EDIT_NOTE} Found: ${found.join(", ")}.`,
    );
  }
  const text = JSON.stringify(operations);
  if (/"status"\s*:/.test(text)) {
    throw validationError("Campaign edit mutate must not include status.", CAMPAIGN_EDIT_NOTE);
  }
}

export function deriveEditFieldKinds(tree: CampaignEditTree): CampaignEditFieldKindValue[] {
  const kinds = new Set<CampaignEditFieldKindValue>();
  if (tree.proposedName && tree.proposedName !== tree.currentName) kinds.add("NAME");
  if (
    tree.proposedDailyBudgetMicros != null &&
    tree.proposedDailyBudgetMicros !== tree.currentDailyBudgetMicros
  ) {
    kinds.add("BUDGET");
  }
  if (tree.bids.length) kinds.add("BID");
  if (tree.targets.length) kinds.add("TARGETING");
  return [...kinds];
}

function parseBid(raw: unknown): CampaignEditBidInput {
  const row = asRecord(raw);
  refuseEnableOnEdit(row);
  const adGroupExternalId = String(row.adGroupExternalId ?? "").trim();
  if (!adGroupExternalId) throw validationError("adGroupExternalId is required for bid edits.");
  const proposedBidMicros = optionalMicros(row.proposedBidMicros);
  if (proposedBidMicros == null || proposedBidMicros < MIN_BID_MICROS) {
    throw validationError(`proposedBidMicros must be an integer >= ${MIN_BID_MICROS}.`);
  }
  return {
    adGroupExternalId,
    googleAdGroupResourceName: optionalString(row.googleAdGroupResourceName),
    adGroupName: optionalString(row.adGroupName),
    currentBidMicros: optionalMicros(row.currentBidMicros),
    proposedBidMicros,
  };
}

function parseTarget(raw: unknown): CampaignEditTargetInput {
  const row = asRecord(raw);
  refuseEnableOnEdit(row);
  const type = String(row.type ?? "").toUpperCase();
  if (!(CAMPAIGN_EDIT_TARGET_TYPES as readonly string[]).includes(type)) {
    throw validationError(
      `Targeting type ${type || "(empty)"} is not allowed on edit.`,
      "Only GEO and LANGUAGE are targeting-safe. Audience / device / schedule stay out of scope.",
    );
  }
  const valueText = String(row.valueText ?? "").trim();
  const criterionText = String(row.criterionText ?? "").trim();
  if (!valueText || !criterionText) {
    throw validationError("Targeting valueText and criterionText are required.");
  }
  return {
    type: type as CampaignEditTargetTypeValue,
    valueText,
    criterionText,
    included: row.included === false ? false : true,
  };
}

export function parseCampaignEditTree(body: unknown): CampaignEditTree {
  const raw = asRecord(body ?? {});
  refuseEnableOnEdit(raw);
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const campaignExternalId = String(raw.campaignExternalId ?? "").trim();
  const currentName = String(raw.currentName ?? raw.name ?? "").trim();
  if (!customerId) {
    throw validationError("customerId is required.", "Pass a 10-digit Google Ads customer id.");
  }
  if (!campaignExternalId) {
    throw validationError("campaignExternalId is required.", "Select a synced or cached campaign.");
  }
  if (!currentName) {
    throw validationError("currentName is required.");
  }

  const proposedDailyBudgetMicros = optionalMicros(raw.proposedDailyBudgetMicros);
  if (proposedDailyBudgetMicros != null && proposedDailyBudgetMicros < MIN_BUDGET_MICROS) {
    throw validationError(
      `proposedDailyBudgetMicros must be an integer >= ${MIN_BUDGET_MICROS} (campaign status is not changed).`,
    );
  }

  const bids = Array.isArray(raw.bids) ? raw.bids.map(parseBid) : [];
  const targets = Array.isArray(raw.targets) ? raw.targets.map(parseTarget) : [];

  const tree: CampaignEditTree = {
    customerId,
    syncedCampaignId: optionalString(raw.syncedCampaignId),
    campaignExternalId,
    googleCampaignResourceName: optionalString(raw.googleCampaignResourceName),
    budgetResourceName: optionalString(raw.budgetResourceName),
    advertisingChannelType: optionalString(raw.advertisingChannelType),
    currentName,
    proposedName: optionalString(raw.proposedName),
    currentDailyBudgetMicros: optionalMicros(raw.currentDailyBudgetMicros),
    proposedDailyBudgetMicros,
    notesText: optionalString(raw.notesText),
    bids,
    targets,
    dryRun: raw.dryRun,
    confirmPhrase: raw.confirmPhrase === undefined ? undefined : String(raw.confirmPhrase),
  };

  return tree;
}

export function assertEditApplyConfirm(dryRun: unknown, confirmPhrase: unknown): void {
  if (!resolveDryRun(dryRun) && String(confirmPhrase ?? "") !== CONFIRM_EDIT_PHRASE) {
    throw validationError(
      `Type ${CONFIRM_EDIT_PHRASE} to apply a safe campaign edit. Dry-run is preferred.`,
      "POST apply / dryRun:false requires confirmPhrase exactly EDIT SAFE. Validate does not.",
    );
  }
}

export function campaignResourceName(customerId: string, campaignExternalId: string): string {
  return `customers/${digitsOnly(customerId)}/campaigns/${campaignExternalId}`;
}

export function buildCampaignEditMutate(tree: CampaignEditTree, validateOnly: boolean): MutateRequest {
  refuseEnableOnEdit(tree as unknown as Record<string, unknown>);
  const customerId = digitsOnly(tree.customerId);
  const resourceName =
    tree.googleCampaignResourceName || campaignResourceName(customerId, tree.campaignExternalId);
  const mutateOperations: Array<Record<string, unknown>> = [];

  const campaignUpdate: Record<string, unknown> = { resourceName };
  if (tree.proposedName && tree.proposedName !== tree.currentName) {
    campaignUpdate.name = tree.proposedName;
  }
  if (Object.keys(campaignUpdate).length > 1) {
    mutateOperations.push({ campaignOperation: { update: campaignUpdate } });
  }

  if (
    tree.proposedDailyBudgetMicros != null &&
    tree.proposedDailyBudgetMicros !== tree.currentDailyBudgetMicros
  ) {
    if (!tree.budgetResourceName) {
      throw validationError(
        "budgetResourceName is required to edit budget.",
        "Sync metrics first so the cached budget resource name is available.",
      );
    }
    mutateOperations.push({
      campaignBudgetOperation: {
        update: {
          resourceName: tree.budgetResourceName,
          amountMicros: String(tree.proposedDailyBudgetMicros),
        },
      },
    });
  }

  for (const bid of tree.bids) {
    const adGroupResource =
      bid.googleAdGroupResourceName || `customers/${customerId}/adGroups/${bid.adGroupExternalId}`;
    mutateOperations.push({
      adGroupOperation: {
        update: {
          resourceName: adGroupResource,
          cpcBidMicros: String(bid.proposedBidMicros),
        },
      },
    });
  }

  for (const target of tree.targets) {
    const criterion: Record<string, unknown> = {
      campaign: resourceName,
      negative: !target.included,
    };
    if (target.type === "GEO") {
      criterion.location = { geoTargetConstant: target.criterionText };
    } else {
      criterion.language = { languageConstant: target.criterionText };
      delete criterion.negative;
    }
    mutateOperations.push({ campaignCriterionOperation: { create: criterion } });
  }

  if (mutateOperations.length === 0) {
    throw validationError(
      "No safe edit fields to apply.",
      "Change name, budget, a bid, or a GEO/LANGUAGE target. Status cannot be edited.",
    );
  }

  assertNoStatusInMutate(mutateOperations);

  return {
    customerId,
    validateOnly,
    responseContentType: "MUTABLE_RESOURCE",
    mutateOperations,
  };
}
