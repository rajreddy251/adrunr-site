"use client";

import { useParams } from "next/navigation";

import { CampaignFocusChrome } from "@/components/campaign-focus";
import { EditPanel } from "@/components/edit-panel";
import { useOpsSession } from "@/components/ops-session";
import { useCachedCampaign } from "@/components/use-cached-campaign";

export function CampaignEdit() {
  const params = useParams<{ id: string }>();
  const campaignId = decodeURIComponent(params.id ?? "");
  const { selectedId, status, refreshAudit } = useOpsSession();
  const { campaign, snapshot, error } = useCachedCampaign(campaignId, selectedId, status.connected);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6" data-testid="ops-campaign-edit">
      <CampaignFocusChrome campaignId={campaignId} campaign={campaign} snapshot={snapshot} mode="edit" />
      <EditPanel
        customerId={selectedId}
        connected={status.connected}
        onFinished={refreshAudit}
        campaignId={campaignId}
        campaign={campaign}
        snapshot={snapshot}
        sourceError={error}
      />
    </div>
  );
}
