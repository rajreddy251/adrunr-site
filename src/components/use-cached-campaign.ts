"use client";

import { useCallback, useEffect, useState } from "react";

import { matchCachedCampaign, matchCampaignSnapshot } from "@/lib/ops-campaign";
import type { CampaignMetricSnapshotView, SyncedCampaignView } from "@/lib/types";

type ListingsResponse = {
  ok: boolean;
  campaigns?: SyncedCampaignView[];
  error?: string;
  hint?: string;
};

type MetricsResponse = {
  ok: boolean;
  snapshots?: CampaignMetricSnapshotView[];
};

export function useCachedCampaign(campaignId: string, customerId: string, connected: boolean) {
  const [campaigns, setCampaigns] = useState<SyncedCampaignView[]>([]);
  const [snapshots, setSnapshots] = useState<CampaignMetricSnapshotView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connected || !customerId) {
      setCampaigns([]);
      setSnapshots([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const [listingsRes, metricsRes] = await Promise.all([
        fetch(`/api/ads/listings?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
        fetch(`/api/ads/metrics?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
      ]);
      const listings = (await listingsRes.json()) as ListingsResponse;
      const metrics = (await metricsRes.json()) as MetricsResponse;
      if (!listings.ok) {
        setError([listings.error, listings.hint].filter(Boolean).join(" — ") || "Unable to load cached campaigns.");
        setCampaigns([]);
        setSnapshots([]);
        return;
      }
      setError(null);
      setCampaigns(listings.campaigns ?? []);
      setSnapshots(metrics.snapshots ?? []);
    } catch {
      setError("Unable to load cached campaigns.");
      setCampaigns([]);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [connected, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const campaign = matchCachedCampaign(campaigns, campaignId);
  const snapshot = matchCampaignSnapshot(snapshots, campaign);

  return { campaign, snapshot, campaigns, snapshots, error, loading, reload: load };
}
