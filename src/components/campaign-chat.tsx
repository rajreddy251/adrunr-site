"use client";

import { SearchAssistant } from "@/components/search-assistant";
import {
  CAMPAIGN_CHAT_CHIP_LABEL,
  CAMPAIGN_CHAT_PANEL_WIDTH_PX,
  searchDraftToChatProposal,
  type CampaignChatProposal,
} from "@/lib/campaign-chat";
import type { SearchDraftClientView } from "@/lib/types";

export function CampaignChat({
  campaignId,
  customerId,
  connected,
  open,
  onOpenChange,
  onPropose,
  onToast,
}: {
  campaignId: string;
  customerId: string;
  connected: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPropose?: (proposal: CampaignChatProposal) => void;
  onToast?: (message: string) => void;
}) {
  if (!open) {
    return (
      <div className="xl:sticky xl:top-4">
        <button
          type="button"
          data-testid="ops-campaign-chat-chip"
          className="rounded-full border border-lime-400/40 bg-lime-400/10 px-4 py-2 font-mono text-xs text-lime-400 hover:bg-lime-400/15"
          onClick={() => onOpenChange(true)}
        >
          {CAMPAIGN_CHAT_CHIP_LABEL}
        </button>
      </div>
    );
  }

  return (
    <aside
      data-testid="ops-campaign-chat-panel"
      className="ops-chat-panel xl:sticky xl:top-4"
      style={{ width: "100%", maxWidth: CAMPAIGN_CHAT_PANEL_WIDTH_PX }}
    >
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          data-testid="ops-campaign-chat-collapse"
          className="font-mono text-xs text-moss-500 hover:text-paper-50"
          onClick={() => onOpenChange(false)}
        >
          Hide chat
        </button>
      </div>
      <SearchAssistant
        variant="campaign"
        kind="SEARCH"
        connected={connected}
        customerId={customerId}
        campaignId={campaignId}
        onPropose={(draft: SearchDraftClientView, patchedFields: string[]) => {
          onPropose?.(searchDraftToChatProposal(draft, patchedFields));
        }}
        onToast={onToast}
      />
    </aside>
  );
}
