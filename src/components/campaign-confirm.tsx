"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { CampaignFocusFrame } from "@/components/campaign-focus-frame";
import { useOpsSession } from "@/components/ops-session";
import { useCachedCampaign } from "@/components/use-cached-campaign";
import {
  campaignOverviewPath,
  isDeleteConfirmReady,
  isPauseConfirmReady,
  pauseDeletePrimaryEnabled,
  pauseDeletePrimaryLabel,
} from "@/lib/ops-campaign";
import {
  CAMPAIGN_DELETE_NOTE,
  CAMPAIGN_PAUSE_NOTE,
  CAMPAIGN_STATUS_COMING_SOON,
  CONFIRM_DELETE_PHRASE,
  CONFIRM_PAUSE_PHRASE,
} from "@/lib/safety";

export function CampaignConfirm({ kind }: { kind: "pause" | "delete" }) {
  const params = useParams<{ id: string }>();
  const campaignId = decodeURIComponent(params.id ?? "");
  const { selectedId, status } = useOpsSession();
  const { campaign, snapshot, error, loading } = useCachedCampaign(
    campaignId,
    selectedId,
    status.connected,
  );
  const [phrase, setPhrase] = useState("");

  const expected = kind === "pause" ? CONFIRM_PAUSE_PHRASE : CONFIRM_DELETE_PHRASE;
  const ready = kind === "pause" ? isPauseConfirmReady(phrase) : isDeleteConfirmReady(phrase);
  const primaryEnabled = pauseDeletePrimaryEnabled(ready);
  const phraseError = phrase.trim() && !ready ? `Type ${expected} exactly.` : undefined;
  const preview =
    kind === "pause"
      ? "Dry-run preview — would set this campaign to PAUSED. No live mutate in this slice. There is no enable path."
      : "Dry-run preview — would remove this campaign from serving. No live mutate in this slice. There is no enable path.";

  return (
    <div
      className="mx-auto w-full max-w-7xl"
      data-testid={kind === "pause" ? "ops-campaign-pause-confirm" : "ops-campaign-delete-confirm"}
    >
      <CampaignFocusFrame campaignId={campaignId} campaign={campaign} snapshot={snapshot} mode={kind}>
      {error ? <p className="text-sm text-coral-400">{error}</p> : null}

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h2 className="text-lg text-paper-50">{kind === "pause" ? "Confirm pause" : "Confirm delete"}</h2>
        <p className="mt-1 text-sm text-moss-400">
          {kind === "pause" ? CAMPAIGN_PAUSE_NOTE : CAMPAIGN_DELETE_NOTE}
        </p>
        <p className="mt-3 text-xs text-amber-400/90" data-testid="ops-campaign-confirm-preview">
          {preview}
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
        ) : null}

        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <label className="block text-sm text-moss-400">
            Confirm phrase
            <input
              data-testid="ops-campaign-confirm-phrase"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              className="input mt-1 font-mono"
              placeholder={expected}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(phraseError)}
            />
            {phraseError ? (
              <span data-testid="ops-campaign-confirm-error" className="mt-1 block text-xs text-coral-400">
                {phraseError}
              </span>
            ) : null}
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="ops-campaign-confirm-primary"
              disabled={!primaryEnabled}
              data-armed={ready ? "true" : "false"}
              className={kind === "pause" ? "ops-btn-amber" : "ops-btn-danger"}
            >
              {pauseDeletePrimaryLabel(ready)}
            </button>
            <Link href={campaignOverviewPath(campaignId)} className="ops-btn-secondary">
              Cancel
            </Link>
          </div>
        </form>

        {ready ? (
          <p data-testid="ops-campaign-confirm-gated" className="mt-3 text-sm text-amber-400">
            {CAMPAIGN_STATUS_COMING_SOON}. Pause and delete stay gated until a safe mutate ships. Adrunr
            will not enable later.
          </p>
        ) : (
          <p className="mt-3 font-mono text-xs text-moss-500">
            Type <span className="text-moss-300">{expected}</span> to arm the confirm. Lime is not Enable.
          </p>
        )}
      </section>
      </CampaignFocusFrame>
    </div>
  );
}
