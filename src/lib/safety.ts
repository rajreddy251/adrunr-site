export const SHELL_SAFETY_STRIP = {
  headline: "Ops tools, not autopilot. No spend without an explicit confirm.",
  detail:
    "Dry-run / validateOnly first · Creates → CREATE PAUSED · Edits → EDIT SAFE · No in-app ENABLE.",
} as const;

export const SAFETY_COPY = {
  headline: SHELL_SAFETY_STRIP.headline,
  bullets: [
    "Developer token is Test Account access until Basic Access is approved. Production MCC reads can fail or be limited.",
    "New Search, Display, Performance Max, Demand Gen, Video, Shopping, App, Hotel, Local, and Local Services campaigns are created PAUSED. Dry-run (validateOnly) is the default and preferred path.",
    "No enable/go-live action. A paused campaign with a budget still cannot spend until separately enabled outside this app.",
    "Listings sync is read-only. It pulls campaign / ad group / ad / keyword snapshots into Neon and never enables, unpauses, or mutates live Ads status.",
    "Metrics sync is read-only. It pulls campaign budget and spend snapshots into Neon and never enables, unpauses, mutates status, or spends.",
    "Safe campaign edit is validateOnly first. Apply requires typing EDIT SAFE. Name, budget, bids, and targeting-safe fields only. Status ENABLED / enable / unpause / go-live are refused.",
    "Import copies a cached Google campaign into an Adrunr create-type draft. Dry-run preview is the default. Import never enables, unpauses, or applies live Ads — imported drafts stay on the PAUSED create path.",
    "Performance reports are read-only. They roll up cached CampaignMetricSnapshot rows or a googleAds:search and never enable, unpause, mutate live Ads, or spend. Cached ENABLED is a snapshot only.",
    "Pause and Delete confirms require typing PAUSE CAMPAIGN or DELETE CAMPAIGN. Live mutate is gated (Coming soon — use Google Ads). Adrunr will not enable later. Re-enable only in Google Ads.",
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

export const CAMPAIGN_REPORTS_NOTE =
  "Performance reports are read-only. Adrunr will not enable, unpause, mutate live Ads status, or spend.";

export const CAMPAIGN_PAUSE_NOTE =
  "Adrunr will not enable later. Re-enable only in Google Ads.";

export const CAMPAIGN_DELETE_NOTE =
  "Deleting stops this campaign from serving. Adrunr cannot undo it, restore it, or enable spend.";

export const CAMPAIGN_STATUS_COMING_SOON = "Coming soon — use Google Ads";

export const REPORT_ENABLE_REFUSAL_KEYS = [
  "enable",
  "unpause",
  "goLive",
  "go_live",
  "golive",
  "servingStatus",
  "campaignStatus",
  "mutateOperations",
  "mutate",
  "spend",
] as const;

export const CONFIRM_PAUSED_PHRASE = "CREATE PAUSED";

export const CONFIRM_EDIT_PHRASE = "EDIT SAFE";

export const CONFIRM_PAUSE_PHRASE = "PAUSE CAMPAIGN";

export const CONFIRM_DELETE_PHRASE = "DELETE CAMPAIGN";

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

export function refuseEnableOnReport(body: unknown): void {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  for (const key of REPORT_ENABLE_REFUSAL_KEYS) {
    const value = raw[key];
    if (
      value === true ||
      (typeof value === "string" && value.trim() !== "") ||
      (Array.isArray(value) && value.length > 0) ||
      (value && typeof value === "object")
    ) {
      throw Object.assign(new Error(CAMPAIGN_REPORTS_NOTE), {
        status: 400,
        info: {
          kind: "report_read_only",
          hint: `Remove ${key}. Reports only roll up cached metrics or googleAds:search.`,
        },
      });
    }
  }
  const status = String(raw.status ?? "").toUpperCase();
  if (status === "ENABLED" && (raw.apply === true || raw.persistStatus === true || raw.goLive === true)) {
    throw Object.assign(new Error(CAMPAIGN_REPORTS_NOTE), {
      status: 400,
      info: {
        kind: "report_read_only",
        hint: "Cached ENABLED is a snapshot only. Reports never apply status.",
      },
    });
  }
}
