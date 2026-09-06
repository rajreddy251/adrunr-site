export const SAFETY_COPY = {
  headline: "Ops tools, not autopilot. No spend without an explicit confirm.",
  bullets: [
    "Developer token is Test Account access until Basic Access is approved. Production MCC reads can fail or be limited.",
    "New Search, Display, Performance Max, Demand Gen, Video, Shopping, App, Hotel, Local, and Local Services campaigns are created PAUSED. Dry-run (validateOnly) is the default and preferred path.",
    "No enable/go-live action. A paused campaign with a budget still cannot spend until separately enabled outside this app.",
    "Listings sync is read-only. It pulls campaign / ad group / ad / keyword snapshots into Neon and never enables, unpauses, or mutates live Ads status.",
    "Metrics sync is read-only. It pulls campaign budget and spend snapshots into Neon and never enables, unpauses, mutates status, or spends.",
    "Safe campaign edit is validateOnly first. Apply requires typing EDIT SAFE. Name, budget, bids, and targeting-safe fields only. Status ENABLED / enable / unpause / go-live are refused.",
    "Import copies a cached Google campaign into an Adrunr create-type draft. Dry-run preview is the default. Import never enables, unpauses, or applies live Ads — imported drafts stay on the PAUSED create path.",
  ],
} as const;

export const LISTINGS_SYNC_READ_ONLY_NOTE =
  "Listings sync is read-only. Adrunr will not enable, unpause, or mutate live Ads status.";

export const METRICS_SYNC_READ_ONLY_NOTE =
  "Metrics sync is read-only. Adrunr will not enable, unpause, mutate live Ads status, or spend.";

export const CAMPAIGN_EDIT_NOTE =
  "Safe campaign edit never enables, unpauses, or goes live. Name, budget, bids, and targeting-safe fields only.";

export const CAMPAIGN_IMPORT_NOTE =
  "Import writes create-type drafts only. Adrunr never enables, unpauses, or goes live from import.";

export const CONFIRM_PAUSED_PHRASE = "CREATE PAUSED";

export const CONFIRM_EDIT_PHRASE = "EDIT SAFE";

export type CampaignStatus = "PAUSED" | "ENABLED" | "REMOVED";

export function assertPausedOnly(status: string | undefined): "PAUSED" {
  if (status && status !== "PAUSED") {
    throw new Error(
      `Refusing status ${status}. Adrunr only creates PAUSED campaigns and has no enable path.`,
    );
  }
  return "PAUSED";
}

export function assertEditDoesNotEnable(status: string | undefined): void {
  if (status) {
    assertPausedOnly(status);
    throw new Error(
      "Campaign edits never set status. Status ENABLED / enable / unpause / go-live are refused.",
    );
  }
}

export function resolveDryRun(dryRun: unknown): boolean {
  if (dryRun === false || dryRun === "false" || dryRun === 0) {
    return false;
  }
  return true;
}
