import {
  CAMPAIGN_STATUS_COMING_SOON,
  CONFIRM_DELETE_PHRASE,
  CONFIRM_EDIT_PHRASE,
  CONFIRM_PAUSE_PHRASE,
} from "@/lib/safety";
import type { CampaignMetricSnapshotView, SyncedCampaignView } from "@/lib/types";

export const CAMPAIGN_OVERVIEW_NOTE =
  "Cached status is a snapshot. Overview never enables, unpauses, or goes live.";

/** Live Google Ads pause/delete mutate is not shipped. Confirm UX is gated. */
export const CAMPAIGN_PAUSE_DELETE_MUTATE_AVAILABLE = false;

export type CampaignFocusMode = "overview" | "edit" | "pause" | "delete";

export const CAMPAIGN_FOCUS_MODE_LABEL: Record<CampaignFocusMode, string> = {
  overview: "Overview",
  edit: "Safe edit",
  pause: "Pause",
  delete: "Delete",
};

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
  SEARCH: "Search",
  DISPLAY: "Display",
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Demand Gen",
  VIDEO: "Video",
  SHOPPING: "Shopping",
  MULTI_CHANNEL: "App",
  HOTEL: "Hotel",
  LOCAL: "Local",
  LOCAL_SERVICES: "Local Services",
};

export type CampaignEditFieldErrors = {
  proposedName?: string;
  proposedBudget?: string;
  proposedBid?: string;
  confirmPhrase?: string;
  change?: string;
};

export type CampaignEditFormValues = {
  proposedName: string;
  proposedBudget: string;
  proposedBid: string;
  geo: string;
  language: string;
  currentName: string;
  currentBudget: string;
  confirmPhrase?: string;
  dryRun?: boolean;
};

export function campaignOverviewPath(id: string): string {
  return `/ops/campaigns/${encodeURIComponent(id)}`;
}

export function campaignEditPath(id: string): string {
  return `/ops/campaigns/${encodeURIComponent(id)}/edit`;
}

export function campaignPausePath(id: string): string {
  return `/ops/campaigns/${encodeURIComponent(id)}/pause`;
}

export function campaignDeletePath(id: string): string {
  return `/ops/campaigns/${encodeURIComponent(id)}/delete`;
}

export function campaignFocusModeLabel(mode: CampaignFocusMode): string {
  return CAMPAIGN_FOCUS_MODE_LABEL[mode];
}

export function isConfirmPhraseMatch(value: string, expected: string): boolean {
  return value.trim() === expected;
}

export function isPauseConfirmReady(phrase: string): boolean {
  return isConfirmPhraseMatch(phrase, CONFIRM_PAUSE_PHRASE);
}

export function isDeleteConfirmReady(phrase: string): boolean {
  return isConfirmPhraseMatch(phrase, CONFIRM_DELETE_PHRASE);
}

export function pauseDeletePrimaryLabel(ready: boolean): string {
  return ready ? CAMPAIGN_STATUS_COMING_SOON : "Type the confirm phrase";
}

export function pauseDeletePrimaryEnabled(ready: boolean): boolean {
  return ready && CAMPAIGN_PAUSE_DELETE_MUTATE_AVAILABLE;
}

export function campaignFocusId(campaign: Pick<SyncedCampaignView, "id" | "externalId">): string {
  return campaign.externalId || campaign.id || "";
}

export function matchCachedCampaign(
  campaigns: SyncedCampaignView[],
  id: string,
): SyncedCampaignView | null {
  const needle = decodeURIComponent(id).trim();
  if (!needle) return null;
  return (
    campaigns.find((campaign) => campaign.externalId === needle || campaign.id === needle) ?? null
  );
}

export function matchCampaignSnapshot(
  snapshots: CampaignMetricSnapshotView[],
  campaign: Pick<SyncedCampaignView, "externalId"> | null,
): CampaignMetricSnapshotView | null {
  if (!campaign) return null;
  return snapshots.find((row) => row.externalCampaignId === campaign.externalId) ?? null;
}

export function channelTypeLabel(type: string | null | undefined): string {
  if (!type) return "Search";
  return CHANNEL_TYPE_LABELS[type] ?? type;
}

export function dollarsFromMicros(micros: string | null | undefined): string {
  if (!micros) return "";
  const n = Number(micros) / 1_000_000;
  return Number.isFinite(n) ? String(n) : "";
}

export function microsFromDollars(value: string): number | null {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n)) return null;
  return Math.round(n * 1_000_000);
}

function moneyFieldError(value: string, label: string): string | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n < 0.01) return `${label} must be at least 0.01.`;
  return undefined;
}

export function validateCampaignEditForm(values: CampaignEditFormValues): CampaignEditFieldErrors {
  const errors: CampaignEditFieldErrors = {};
  if (!values.proposedName.trim()) {
    errors.proposedName = "Campaign name is required.";
  }

  const budgetError = moneyFieldError(values.proposedBudget, "Daily budget");
  if (budgetError) errors.proposedBudget = budgetError;

  const bidError = moneyFieldError(values.proposedBid, "Ad group bid");
  if (bidError) errors.proposedBid = bidError;

  const nameChanged = values.proposedName.trim() !== values.currentName.trim();
  const budgetChanged =
    values.proposedBudget.trim() !== "" && values.proposedBudget.trim() !== values.currentBudget.trim();
  const bidChanged = values.proposedBid.trim() !== "";
  const targetingChanged = Boolean(values.geo || values.language);
  if (!nameChanged && !budgetChanged && !bidChanged && !targetingChanged) {
    errors.change = "Change name, budget, a bid, or a GEO/LANGUAGE target.";
  }

  if (values.dryRun === false) {
    const phrase = (values.confirmPhrase ?? "").trim();
    if (phrase && phrase !== CONFIRM_EDIT_PHRASE) {
      errors.confirmPhrase = `Type ${CONFIRM_EDIT_PHRASE} exactly.`;
    }
  }

  return errors;
}

export function isCampaignEditFormValid(errors: CampaignEditFieldErrors): boolean {
  return !errors.proposedName && !errors.proposedBudget && !errors.proposedBid && !errors.change;
}

export function isEditApplyReady(input: {
  connected: boolean;
  dryRun: boolean;
  confirmPhrase: string;
  errors: CampaignEditFieldErrors;
}): boolean {
  return (
    input.connected &&
    !input.dryRun &&
    input.confirmPhrase.trim() === CONFIRM_EDIT_PHRASE &&
    isCampaignEditFormValid(input.errors)
  );
}
