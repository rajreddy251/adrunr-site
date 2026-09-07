"use client";

import { useState, type ReactNode } from "react";

import { CampaignChat } from "@/components/campaign-chat";
import { CampaignFocusChrome } from "@/components/campaign-focus";
import { useOpsSession } from "@/components/ops-session";
import type { CampaignChatProposal } from "@/lib/campaign-chat";
import type { CampaignFocusMode } from "@/lib/ops-campaign";
import type { CampaignMetricSnapshotView, SyncedCampaignView } from "@/lib/types";

export function CampaignFocusFrame({
  campaignId,
  campaign,
  snapshot,
  mode,
  children,
  onPropose,
}: {
  campaignId: string;
  campaign: SyncedCampaignView | null;
  snapshot: CampaignMetricSnapshotView | null;
  mode: CampaignFocusMode;
  children: ReactNode;
  onPropose?: (proposal: CampaignChatProposal) => void;
}) {
  const { selectedId, status } = useOpsSession();
  const [chatOpen, setChatOpen] = useState(mode === "overview" || mode === "edit");
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div
      className="flex flex-col gap-6 xl:flex-row xl:items-start"
      data-testid="ops-campaign-focus-frame"
    >
      <div className="min-w-0 flex-1 space-y-6">
        <CampaignFocusChrome
          campaignId={campaignId}
          campaign={campaign}
          snapshot={snapshot}
          mode={mode}
          chatOpen={chatOpen}
          onChatToggle={() => setChatOpen((open) => !open)}
        />
        {toast ? (
          <p
            data-testid="ops-campaign-chat-toast"
            className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-400"
          >
            {toast}
          </p>
        ) : null}
        {children}
      </div>
      <CampaignChat
        campaignId={campaignId}
        customerId={selectedId}
        connected={status.connected}
        open={chatOpen}
        onOpenChange={setChatOpen}
        onPropose={onPropose}
        onToast={setToast}
      />
    </div>
  );
}
