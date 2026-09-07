"use client";

import Link from "next/link";
import { useState } from "react";

import {
  CAMPAIGN_CHAT_STUB_NOTE,
  CAMPAIGN_OVERVIEW_NOTE,
  campaignDeletePath,
  campaignEditPath,
  campaignFocusId,
  campaignFocusModeLabel,
  campaignOverviewPath,
  campaignPausePath,
  channelTypeLabel,
  type CampaignFocusMode,
} from "@/lib/ops-campaign";
import { formatMoneyMicros } from "@/lib/metrics";
import type { CampaignMetricSnapshotView, SyncedCampaignView } from "@/lib/types";

export function CampaignFocusChrome({
  campaignId,
  campaign,
  snapshot,
  mode,
}: {
  campaignId: string;
  campaign: SyncedCampaignView | null;
  snapshot: CampaignMetricSnapshotView | null;
  mode: CampaignFocusMode;
}) {
  const [stub, setStub] = useState<string | null>(null);
  const name = campaign?.name ?? `Campaign ${campaignId}`;
  const typeLabel = channelTypeLabel(campaign?.advertisingChannelType ?? "SEARCH");
  const status = campaign?.status ?? "Not in listings cache";
  const focusId = campaign ? campaignFocusId(campaign) : campaignId;
  const cachedEnabled = campaign?.status === "ENABLED";
  const modeLabel = campaignFocusModeLabel(mode);

  return (
    <section data-testid="ops-campaign-focus" className="ops-focus-chrome rounded-2xl border bg-ink-900 p-5">
      <nav className="font-mono text-xs text-moss-500" aria-label="Campaign workspace">
        <Link href="/ops/campaigns" className="text-lime-400 hover:underline">
          Campaigns
        </Link>
        <span className="mx-2">/</span>
        <Link href={campaignOverviewPath(focusId)} className="text-moss-300 hover:text-paper-50">
          {name}
        </Link>
        {mode !== "overview" ? (
          <>
            <span className="mx-2">/</span>
            <span className="text-paper-50">{modeLabel}</span>
          </>
        ) : null}
      </nav>

      <header data-testid="ops-campaign-header" className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-lime-400">
            {typeLabel} Campaign {modeLabel}
          </p>
          <h1 className="mt-1 text-2xl font-medium text-paper-50">{name}</h1>
          <p className="mt-1 font-mono text-xs text-moss-500">{focusId}</p>
        </div>
        <div data-testid="ops-campaign-status" className="text-right">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-moss-500">Status snapshot</p>
          <p className="mt-1 font-mono text-sm text-paper-50">{status}</p>
          {campaign?.servingStatus ? (
            <p className="mt-1 font-mono text-xs text-moss-400">{campaign.servingStatus}</p>
          ) : null}
          {cachedEnabled ? (
            <p className="mt-1 text-xs text-amber-400">Cached ENABLED is a snapshot only.</p>
          ) : null}
        </div>
      </header>

      <p className="mt-3 text-xs text-amber-400/90">{CAMPAIGN_OVERVIEW_NOTE}</p>

      <div data-testid="ops-campaign-actions" className="mt-4 flex flex-wrap gap-3">
        {mode === "overview" ? (
          <Link href={campaignEditPath(focusId)} data-testid="ops-campaign-edit-link" className="ops-btn-secondary">
            Edit
          </Link>
        ) : (
          <Link href={campaignOverviewPath(focusId)} data-testid="ops-campaign-overview-link" className="ops-btn-secondary">
            Overview
          </Link>
        )}
        <Link href={campaignPausePath(focusId)} data-testid="ops-campaign-pause" className="ops-btn-amber">
          Pause
        </Link>
        <Link href={campaignDeletePath(focusId)} data-testid="ops-campaign-delete" className="ops-btn-danger">
          Delete
        </Link>
        <button
          type="button"
          data-testid="ops-campaign-chat"
          className="ops-btn-secondary"
          onClick={() => setStub(CAMPAIGN_CHAT_STUB_NOTE)}
        >
          Open chat
        </button>
      </div>
      {stub ? (
        <p data-testid="ops-campaign-stub" className="mt-3 text-sm text-amber-400">
          Coming soon — {stub}
        </p>
      ) : null}

      {campaign ? (
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-moss-500">Type</dt>
            <dd className="font-mono text-moss-300">{typeLabel}</dd>
          </div>
          <div>
            <dt className="text-moss-500">Daily budget</dt>
            <dd className="font-mono text-moss-300">{formatMoneyMicros(snapshot?.budgetAmountMicros)}</dd>
          </div>
          <div>
            <dt className="text-moss-500">Spend snapshot</dt>
            <dd className="font-mono text-moss-300">{formatMoneyMicros(snapshot?.costMicros)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
