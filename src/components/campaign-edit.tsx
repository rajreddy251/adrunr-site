"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { CampaignFocusFrame } from "@/components/campaign-focus-frame";
import { EditPanel } from "@/components/edit-panel";
import { useOpsSession } from "@/components/ops-session";
import { useCachedCampaign } from "@/components/use-cached-campaign";
import type { CampaignChatProposal } from "@/lib/campaign-chat";

export function CampaignEdit() {
  const params = useParams<{ id: string }>();
  const campaignId = decodeURIComponent(params.id ?? "");
  const { selectedId, status, refreshAudit } = useOpsSession();
  const { campaign, snapshot, error } = useCachedCampaign(campaignId, selectedId, status.connected);
  const [proposal, setProposal] = useState<CampaignChatProposal | null>(null);

  return (
    <div className="mx-auto w-full max-w-7xl" data-testid="ops-campaign-edit">
      <CampaignFocusFrame
        campaignId={campaignId}
        campaign={campaign}
        snapshot={snapshot}
        mode="edit"
        onPropose={setProposal}
      >
        <EditPanel
          customerId={selectedId}
          connected={status.connected}
          onFinished={refreshAudit}
          campaignId={campaignId}
          campaign={campaign}
          snapshot={snapshot}
          sourceError={error}
          chatProposal={proposal}
        />
      </CampaignFocusFrame>
    </div>
  );
}
