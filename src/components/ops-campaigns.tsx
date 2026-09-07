"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useOpsSession } from "@/components/ops-session";
import { SearchWorkspace } from "@/components/search-workspace";
import { campaignEditPath, campaignFocusId, campaignOverviewPath, channelTypeLabel } from "@/lib/ops-campaign";
import { CAMPAIGN_TYPE_FILTERS } from "@/lib/ops-shell";
import { searchCreatePath } from "@/lib/search-create";
import type { SyncedCampaignView } from "@/lib/types";

type ListingsResponse = {
  ok: boolean;
  campaigns?: SyncedCampaignView[];
  error?: string;
  hint?: string;
};

export function OpsCampaigns() {
  const { selectedId, status, accounts, refreshAudit } = useOpsSession();
  const [campaigns, setCampaigns] = useState<SyncedCampaignView[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    if (!status.connected || !selectedId) {
      setCampaigns([]);
      return;
    }
    const res = await fetch(`/api/ads/listings?customerId=${encodeURIComponent(selectedId)}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as ListingsResponse;
    if (!json.ok) {
      setError([json.error, json.hint].filter(Boolean).join(" — ") || "Unable to load campaigns.");
      setCampaigns([]);
      return;
    }
    setError(null);
    setCampaigns(json.campaigns ?? []);
  }, [selectedId, status.connected]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const filtered = useMemo(() => {
    if (!typeFilter) return campaigns;
    return campaigns.filter((campaign) => (campaign.advertisingChannelType ?? "") === typeFilter);
  }, [campaigns, typeFilter]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-medium text-paper-50">Campaigns</h1>
        <p className="mt-1 text-sm text-moss-400">
          All cached campaign types for the selected customer. Open a row for Search Campaign Overview
          and Safe edit. Filter is a stub over the listings cache — sync from{" "}
          <Link href="/ops/listings" className="text-lime-400 hover:underline">
            Listings
          </Link>{" "}
          first. Create Search lives on{" "}
          <Link href={searchCreatePath()} className="text-lime-400 hover:underline">
            /ops/campaigns/new/search
          </Link>
          . Other create types stay below.
        </p>
      </header>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-campaigns-list">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg text-paper-50">Campaign list</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={searchCreatePath()}
              data-testid="ops-campaigns-create-search"
              className="ops-btn-primary"
            >
              Create campaign → Search
            </Link>
            <label className="flex items-center gap-2 font-mono text-xs text-moss-400">
              Type
              <select
                data-testid="ops-campaigns-filter"
                className="input h-8 w-48 py-1 text-xs"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                {CAMPAIGN_TYPE_FILTERS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-coral-400">{error}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="ops-table w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Type</th>
                <th>Status</th>
                <th>Children</th>
                <th>Workspace</th>
              </tr>
            </thead>
            <tbody>
              {!selectedId ? (
                <tr>
                  <td colSpan={5} className="py-6 text-moss-500">
                    Select a customer in the top bar or on the{" "}
                    <Link href="/ops" className="text-lime-400 hover:underline">
                      hub
                    </Link>
                    .
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-moss-500">
                    {status.connected
                      ? "No cached campaigns for this filter. Preview or cache listings, then return."
                      : "Connect Google Ads to list campaigns."}
                  </td>
                </tr>
              ) : (
                filtered.map((campaign) => {
                  const focusId = campaignFocusId(campaign);
                  return (
                    <tr key={campaign.externalId}>
                      <td className="py-3">
                        <Link
                          href={campaignOverviewPath(focusId)}
                          className="block text-paper-50 hover:text-lime-400"
                        >
                          {campaign.name}
                        </Link>
                        <span className="mt-1 block font-mono text-xs text-moss-500">{campaign.externalId}</span>
                      </td>
                      <td className="py-3 font-mono text-xs text-moss-300">
                        {campaign.advertisingChannelType
                          ? channelTypeLabel(campaign.advertisingChannelType)
                          : "—"}
                      </td>
                      <td className="py-3 font-mono text-xs">{campaign.status ?? "—"}</td>
                      <td className="py-3 text-xs text-moss-400">{campaign.adGroups.length} groups</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-3 text-xs">
                          <Link
                            href={campaignOverviewPath(focusId)}
                            className="text-lime-400 hover:underline"
                            data-testid={`ops-campaigns-open-${campaign.externalId}`}
                          >
                            Overview
                          </Link>
                          <Link
                            href={campaignEditPath(focusId)}
                            className="text-moss-300 hover:text-paper-50 hover:underline"
                            data-testid={`ops-campaigns-edit-${campaign.externalId}`}
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-campaigns-create">
        <summary className="cursor-pointer text-lg text-paper-50">
          Other create types
          <span className="ml-2 font-mono text-xs text-moss-500">
            Search create lives on /ops/campaigns/new/search
          </span>
        </summary>
        <div className="mt-4">
          <SearchWorkspace accounts={accounts} connected={status.connected} onFinished={refreshAudit} />
        </div>
      </details>
    </div>
  );
}
