import { dollarsFromMicros } from "@/lib/ops-campaign";
import { GEO_PRESETS, LANGUAGE_PRESETS } from "@/lib/search-draft";
import type { SearchDraftClientView } from "@/lib/types";

export const CAMPAIGN_CHAT_SUBTITLE =
  "Chat cannot Validate, Apply, Create PAUSED, or Enable.";

export const CAMPAIGN_CHAT_DID_NOT_APPLY = "Chat proposed fills. It did not apply.";

export const CAMPAIGN_CHAT_PROPOSED_MARK = "Proposed by chat";

export const CAMPAIGN_CHAT_CHIP_LABEL = "Chat with this campaign";

export const CAMPAIGN_CHAT_PANEL_WIDTH_PX = 380;

export const CAMPAIGN_CHAT_PROMPTS = [
  {
    id: "url",
    label: "Fill from URL",
    text: "Fill this Search campaign from https://example.com/landing",
  },
  {
    id: "rsa",
    label: "RSA headlines",
    text: "Propose RSA headlines and descriptions from the landing page.",
  },
  {
    id: "budget",
    label: "Budget / geo",
    text: "Propose a daily budget and geo targeting. Do not apply.",
  },
  {
    id: "keywords",
    label: "Keywords",
    text: "Propose keywords for the first ad group. Do not apply.",
  },
  {
    id: "gaps",
    label: "Summarize gaps",
    text: "Summarize remaining gaps. Do not validate or apply.",
  },
] as const;

export type CampaignChatProposal = {
  id: string;
  proposedName?: string;
  proposedBudget?: string;
  proposedBid?: string;
  geo?: string;
  language?: string;
  patchedFields: string[];
};

export function campaignChatScopeKey(input: {
  campaignId?: string | null;
  draftId?: string | null;
  customerId?: string | null;
  kind?: string | null;
}): string {
  const kind = (input.kind ?? "SEARCH").trim() || "SEARCH";
  const customerId = (input.customerId ?? "").trim();
  const subject = (input.campaignId ?? "").trim() || (input.draftId ?? "").trim();
  return `${kind}:${customerId}:${subject}`;
}

export function refusedActionBanner(action: string | null | undefined): string | null {
  if (!action) return null;
  const label =
    action === "validate"
      ? "Validate"
      : action === "apply"
        ? "Apply"
        : action === "enable"
          ? "Enable"
          : action === "pause"
            ? "Pause"
            : action === "delete"
              ? "Delete"
              : action;
  return `Refused: ${label}. Use the form CTAs.`;
}

function matchPreset(
  presets: ReadonlyArray<{ valueText: string; criterionText: string }>,
  target: { valueText?: string; criterionText?: string } | undefined,
): string | undefined {
  if (!target) return undefined;
  return presets.find(
    (row) =>
      row.criterionText === target.criterionText ||
      row.valueText.toLowerCase() === (target.valueText ?? "").toLowerCase(),
  )?.criterionText;
}

export function searchDraftToChatProposal(
  draft: SearchDraftClientView,
  patchedFields: string[],
): CampaignChatProposal {
  const fields = patchedFields.length
    ? patchedFields
    : ["name", "dailyBudgetMicros", "adGroups", "targets"];
  const geoTarget = draft.targets.find((row) => row.type === "GEO");
  const languageTarget = draft.targets.find((row) => row.type === "LANGUAGE");
  const bidMicros = draft.adGroups[0]?.defaultBidMicros;
  return {
    id: `${draft.id}:${fields.join(",")}:${draft.updatedAt}`,
    proposedName: fields.includes("name") ? draft.name : undefined,
    proposedBudget: fields.includes("dailyBudgetMicros")
      ? dollarsFromMicros(draft.dailyBudgetMicros)
      : undefined,
    proposedBid:
      fields.includes("adGroups") && bidMicros ? dollarsFromMicros(bidMicros) : undefined,
    geo: fields.includes("targets") ? matchPreset(GEO_PRESETS, geoTarget) : undefined,
    language: fields.includes("targets") ? matchPreset(LANGUAGE_PRESETS, languageTarget) : undefined,
    patchedFields: fields,
  };
}

export function chatProposalMarks(proposal: CampaignChatProposal): string[] {
  const marks: string[] = [];
  if (proposal.proposedName) marks.push("proposedName");
  if (proposal.proposedBudget) marks.push("proposedBudget");
  if (proposal.proposedBid) marks.push("proposedBid");
  if (proposal.geo) marks.push("geo");
  if (proposal.language) marks.push("language");
  return marks;
}
