"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { CampaignFocusFrame } from "@/components/campaign-focus-frame";
import { useOpsSession } from "@/components/ops-session";
import { useCachedCampaign } from "@/components/use-cached-campaign";
import { formatMoneyMicros } from "@/lib/metrics";
import { channelTypeLabel } from "@/lib/ops-campaign";

export function CampaignOverview() {
  const params = useParams<{ id: string }>();
  const campaignId = decodeURIComponent(params.id ?? "");
  const { selectedId, status } = useOpsSession();
  const { campaign, snapshot, error, loading } = useCachedCampaign(
    campaignId,
    selectedId,
    status.connected,
  );

  return (
    <div className="mx-auto w-full max-w-7xl" data-testid="ops-campaign-overview">
      <CampaignFocusFrame campaignId={campaignId} campaign={campaign} snapshot={snapshot} mode="overview">
        {error ? <p className="text-sm text-coral-400">{error}</p> : null}

        <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-campaign-snapshot">
          <h2 className="text-lg text-paper-50">Campaign snapshot</h2>
          <p className="mt-1 text-sm text-moss-400">
            Workspace home for one campaign from the listings cache. Sync from{" "}
            <Link href="/ops/listings" className="text-lime-400 hover:underline">
              Listings
            </Link>{" "}
            and{" "}
            <Link href="/ops/metrics" className="text-lime-400 hover:underline">
              Metrics
            </Link>{" "}
            if this id is missing.
          </p>

          {!selectedId ? (
            <p className="mt-4 text-sm text-moss-500">
              Select a customer in the top bar, then open a campaign from the{" "}
              <Link href="/ops/campaigns" className="text-lime-400 hover:underline">
                list
              </Link>
              .
            </p>
          ) : loading ? (
            <p className="mt-4 text-sm text-moss-500">Loading cached campaign…</p>
          ) : !campaign ? (
            <p className="mt-4 text-sm text-moss-500">
              Known id <span className="font-mono text-moss-300">{campaignId}</span> is not in the listings
              cache for this customer. Preview or cache listings, then return.
            </p>
          ) : (
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-moss-500">Name</dt>
                <dd className="text-paper-50">{campaign.name}</dd>
              </div>
              <div>
                <dt className="text-moss-500">Type</dt>
                <dd className="font-mono text-moss-300">
                  {channelTypeLabel(campaign.advertisingChannelType)}
                </dd>
              </div>
              <div>
                <dt className="text-moss-500">Cached status</dt>
                <dd className="font-mono text-moss-300">{campaign.status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-moss-500">Serving</dt>
                <dd className="font-mono text-moss-300">{campaign.servingStatus ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-moss-500">Bidding</dt>
                <dd className="font-mono text-moss-300">{campaign.biddingStrategyType ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-moss-500">Ad groups</dt>
                <dd className="font-mono text-moss-300">{campaign.adGroups.length}</dd>
              </div>
              <div>
                <dt className="text-moss-500">Daily budget</dt>
                <dd className="font-mono text-moss-300">
                  {formatMoneyMicros(snapshot?.budgetAmountMicros, snapshot?.currencyCode ?? "USD")}
                </dd>
              </div>
              <div>
                <dt className="text-moss-500">Spend / clicks / impressions</dt>
                <dd className="font-mono text-moss-300">
                  {formatMoneyMicros(snapshot?.costMicros, snapshot?.currencyCode ?? "USD")} ·{" "}
                  {snapshot?.clicks ?? "—"} · {snapshot?.impressions ?? "—"}
                </dd>
              </div>
            </dl>
          )}
        </section>
      </CampaignFocusFrame>
    </div>
  );
}
