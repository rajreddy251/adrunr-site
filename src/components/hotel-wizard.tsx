"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { GEO_PRESETS } from "@/lib/hotel-draft";
import { hydrateHotelWizardFromDraft } from "@/lib/hotel-wizard-map";
import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import type { AdsAccountView, HotelDraftClientView } from "@/lib/types";

type WizardListing = {
  kind: "ALL_HOTELS" | "UNIT";
  valueText: string;
  hotelIdText: string;
  included: boolean;
};

type WizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  listings: WizardListing[];
};

type WizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

type WizardResult = {
  ok: boolean;
  dryRun?: boolean;
  applied?: boolean;
  status?: string;
  campaignOpId?: string;
  draft?: { id: string; statusDraft?: string; googleCampaignResourceName?: string | null };
  safety?: { note?: string };
  error?: string;
  hint?: string;
};

const STEPS = [
  { id: "T0", title: "Account" },
  { id: "T1", title: "Basics" },
  { id: "T2", title: "Listings" },
  { id: "T3", title: "Geo" },
  { id: "T4", title: "Bidding" },
  { id: "T5", title: "Review" },
  { id: "T6", title: "Result" },
] as const;

function dollarsToMicros(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000);
}

function emptyGroup(): WizardAdGroup {
  return {
    name: "Hotel listing group 1",
    defaultBidDollars: "1.00",
    listings: [{ kind: "ALL_HOTELS", valueText: "All hotels", hotelIdText: "", included: true }],
  };
}

export type HotelWizardHandle = {
  getCustomerId: () => string;
  getDraftId: () => string | null;
  persist: () => Promise<string | null>;
  applyDraft: (draft: HotelDraftClientView) => void;
};

export const HotelWizard = forwardRef<
  HotelWizardHandle,
  {
    accounts: AdsAccountView[];
    connected: boolean;
    onFinished: () => Promise<void> | void;
  }
>(function HotelWizard({ accounts, connected, onFinished }, ref) {
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<WizardResult | null>(null);

  const selectable = useMemo(() => accounts.filter((account) => !account.manager), [accounts]);
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("Adrunr paused Hotel");
  const [budgetDollars, setBudgetDollars] = useState("1.00");
  const [hotelCenterId, setHotelCenterId] = useState("123456789");
  const [percentCpcCeilingDollars, setPercentCpcCeilingDollars] = useState("2.00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groups, setGroups] = useState<WizardAdGroup[]>([emptyGroup()]);
  const [targets, setTargets] = useState<WizardTarget[]>([
    { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
  ]);

  useEffect(() => {
    if (customerId) return;
    const next = selectable.find((account) => !account.warning)?.customerId;
    if (next) setCustomerId(next);
  }, [customerId, selectable]);

  const selected = accounts.find((account) => account.customerId === customerId) ?? null;

  function payload() {
    return {
      customerId,
      name,
      dailyBudgetMicros: dollarsToMicros(budgetDollars),
      biddingStrategy: "PERCENT_CPC",
      hotelCenterId,
      percentCpcCeilingMicros: dollarsToMicros(percentCpcCeilingDollars),
      startDate: startDate || null,
      endDate: endDate || null,
      status: "PAUSED",
      adGroups: groups.map((group, index) => ({
        name: group.name,
        defaultBidMicros: dollarsToMicros(group.defaultBidDollars),
        sortOrder: index,
        listings: group.listings,
      })),
      targets,
    };
  }

  function applyDraft(draft: HotelDraftClientView) {
    const next = hydrateHotelWizardFromDraft(draft);
    setDraftId(next.draftId);
    setCustomerId(next.customerId);
    setName(next.name);
    setBudgetDollars(next.budgetDollars);
    setHotelCenterId(next.hotelCenterId);
    setPercentCpcCeilingDollars(next.percentCpcCeilingDollars);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setGroups(next.groups);
    setTargets(next.targets.length ? next.targets : targets);
    setStep((current) => (current === 0 ? 1 : current));
    setError(null);
  }

  useImperativeHandle(
    ref,
    () => ({
      getCustomerId: () => customerId,
      getDraftId: () => draftId,
      persist: persistDraft,
      applyDraft,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerId, draftId, name, budgetDollars, hotelCenterId, percentCpcCeilingDollars, startDate, endDate, groups, targets],
  );

  async function persistDraft(): Promise<string | null> {
    const body = payload();
    const res = await fetch(draftId ? `/api/ads/hotel/drafts/${draftId}` : "/api/ads/hotel/drafts", {
      method: draftId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; draft?: { id: string }; error?: string; hint?: string };
    if (!json.ok || !json.draft) {
      setError([json.error, json.hint].filter(Boolean).join(" — ") || "Could not save draft.");
      return null;
    }
    setDraftId(json.draft.id);
    setError(null);
    return json.draft.id;
  }

  async function goNext() {
    if (step === 0 && (!customerId || selected?.warning)) {
      setError("Select an enabled client account. Mutations on 485-651-7690 are blocked.");
      return;
    }
    setBusy(true);
    const id = await persistDraft();
    setBusy(false);
    if (!id) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function runAction(kind: "validate" | "apply") {
    const typedPhrase = (confirmRef.current?.value ?? confirmPhrase).trim();
    if (kind === "apply" && typedPhrase !== CONFIRM_PAUSED_PHRASE) {
      setError(`Type ${CONFIRM_PAUSED_PHRASE} to apply a PAUSED campaign. Validate is preferred.`);
      return;
    }
    setBusy(true);
    setError(null);
    const id = draftId ?? (await persistDraft());
    if (!id) {
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/ads/hotel/drafts/${id}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmPhrase: kind === "apply" ? typedPhrase : undefined, status: "PAUSED" }),
    });
    const json = (await res.json()) as WizardResult;
    setResult(json);
    if (!json.ok) {
      setError([json.error, json.hint].filter(Boolean).join(" — ") || "Request failed.");
      setBusy(false);
      return;
    }
    setError(null);
    setStep(6);
    setBusy(false);
    await onFinished();
  }

  function startOver(event: FormEvent) {
    event.preventDefault();
    setStep(0);
    setDraftId(null);
    setResult(null);
    setConfirmPhrase("");
    setError(null);
  }

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="hotel-wizard">
      <h2 className="text-lg text-white">Hotel wizard (PAUSED)</h2>
      <p className="mt-1 text-sm text-moss-400">
        Schema v1.11 drafts in Neon. Hotel Center + ALL_HOTELS listings as TEXT children.
        Validate is a full-tree <code className="font-mono text-moss-300">validateOnly</code> dry-run.
        Apply still creates PAUSED only — there is no enable path.
      </p>

      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Hotel wizard steps">
        {STEPS.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                if (index <= step || (index === 6 && result)) setStep(index);
              }}
              className={`rounded-full px-3 py-1 font-mono text-xs ${
                index === step
                  ? "bg-lime-400 text-ink-950"
                  : index < step
                    ? "border border-lime-400/40 text-lime-400"
                    : "border border-ink-700 text-moss-500"
              }`}
            >
              {item.id} {item.title}
            </button>
          </li>
        ))}
      </ol>

      {error ? (
        <p className="mt-4 text-sm text-coral-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        {step === 0 ? (
          <AccountStep accounts={selectable} customerId={customerId} onSelect={setCustomerId} connected={connected} />
        ) : null}
        {step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Campaign name">
              <input value={name} onChange={(event) => setName(event.target.value)} className="input" />
            </Field>
            <Field label="Daily budget (USD — campaign stays PAUSED)">
              <input value={budgetDollars} onChange={(event) => setBudgetDollars(event.target.value)} inputMode="decimal" className="input font-mono" />
            </Field>
            <Field label="Hotel Center id">
              <input value={hotelCenterId} onChange={(event) => setHotelCenterId(event.target.value)} className="input font-mono" />
            </Field>
            <Field label="Percent CPC ceiling (USD)">
              <input value={percentCpcCeilingDollars} onChange={(event) => setPercentCpcCeilingDollars(event.target.value)} inputMode="decimal" className="input font-mono" />
            </Field>
            <Field label="Start date (optional)">
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="input" />
            </Field>
            <Field label="End date (optional)">
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="input" />
            </Field>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-5">
            <p className="text-sm text-moss-400">
              T2 · Ad group + ALL_HOTELS listing. UNIT hotel ids stay schema-ready and are not applied in Hotel MVP.
            </p>
            {groups.map((group, groupIndex) => (
              <div key={`hotel-${groupIndex}`} className="space-y-4 rounded-xl border border-ink-700 bg-ink-950 p-4">
                <Field label="Ad group name">
                  <input
                    value={group.name}
                    onChange={(event) => {
                      const next = [...groups];
                      next[groupIndex] = { ...group, name: event.target.value };
                      setGroups(next);
                    }}
                    className="input"
                  />
                </Field>
                {group.listings.map((item, itemIndex) => (
                  <div key={`listing-${itemIndex}`} className="grid gap-2 md:grid-cols-[10rem_1fr]">
                    <select
                      value={item.kind}
                      onChange={(event) => {
                        const listings = [...group.listings];
                        listings[itemIndex] = { ...item, kind: event.target.value as WizardListing["kind"] };
                        const next = [...groups];
                        next[groupIndex] = { ...group, listings };
                        setGroups(next);
                      }}
                      className="input"
                    >
                      <option value="ALL_HOTELS">ALL_HOTELS</option>
                      <option value="UNIT">UNIT (stored)</option>
                    </select>
                    <input
                      value={item.valueText}
                      onChange={(event) => {
                        const listings = [...group.listings];
                        listings[itemIndex] = { ...item, valueText: event.target.value };
                        const next = [...groups];
                        next[groupIndex] = { ...group, listings };
                        setGroups(next);
                      }}
                      className="input"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {step === 3 ? <GeoStep targets={targets} onTargets={setTargets} /> : null}
        {step === 4 ? (
          <p className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white">
            T4 · Bidding · PERCENT_CPC · campaign stays PAUSED. Commission / Manual CPC / tROAS stay stored.
          </p>
        ) : null}
        {step === 5 ? (
          <div className="space-y-4 text-sm">
            <p className="text-moss-400">
              T5 · Review, then validate (preferred) or type {CONFIRM_PAUSED_PHRASE} to apply PAUSED.
            </p>
            <p className="text-white">
              {name} · ${budgetDollars}/day · Hotel Center {hotelCenterId} · PAUSED · PERCENT_CPC
            </p>
            <p className="text-moss-300">
              Geo: {targets.map((target) => target.valueText).join(", ") || "none"}
            </p>
            <label className="block">
              <span className="text-amber-400">
                Type {CONFIRM_PAUSED_PHRASE} only if you are applying. Validate does not need this.
              </span>
              <input
                ref={confirmRef}
                data-testid="hotel-wizard-confirm"
                value={confirmPhrase}
                onChange={(event) => setConfirmPhrase(event.target.value)}
                className="input mt-1 font-mono"
              />
            </label>
          </div>
        ) : null}
        {step === 6 ? (
          <div className="space-y-3">
            <p className="text-sm text-white">
              T6 · {result?.ok ? (result.applied ? "Applied PAUSED" : "Validated") : result ? "Failed" : "No result yet"}
            </p>
            {result?.safety?.note ? <p className="text-sm text-amber-400">{result.safety.note}</p> : null}
            {draftId ? <p className="font-mono text-xs text-moss-500">Draft {draftId}</p> : null}
            {result ? (
              <pre className="max-h-80 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-4 font-mono text-xs text-moss-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {step > 0 && step < 6 ? (
          <button type="button" onClick={() => setStep((current) => current - 1)} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300 hover:border-moss-400">
            Back
          </button>
        ) : null}
        {step < 5 ? (
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={!connected || busy || (step === 0 && (!selected || Boolean(selected.warning)))}
            className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save and continue"}
          </button>
        ) : null}
        {step === 5 ? (
          <>
            <button type="button" data-testid="hotel-wizard-validate" onClick={() => void runAction("validate")} disabled={!connected || busy} className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40">
              {busy ? "Working…" : "Validate (dry-run)"}
            </button>
            <button type="button" data-testid="hotel-wizard-apply" onClick={() => void runAction("apply")} disabled={!connected || busy} className="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-400 hover:bg-amber-400/10 disabled:opacity-40">
              {busy ? "Applying PAUSED…" : "Create PAUSED"}
            </button>
          </>
        ) : null}
        {step === 6 ? (
          <button type="button" onClick={startOver} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300">
            New draft
          </button>
        ) : null}
      </div>
    </section>
  );
});

function AccountStep({
  accounts,
  customerId,
  onSelect,
  connected,
}: {
  accounts: AdsAccountView[];
  customerId: string;
  onSelect: (id: string) => void;
  connected: boolean;
}) {
  if (!connected) return <p className="text-sm text-moss-500">Connect Google Ads (or ADRUNR_MOCK=1) to pick a customer.</p>;
  if (accounts.length === 0) return <p className="text-sm text-moss-500">No client accounts listed yet. Refresh Accessible customers above.</p>;
  return (
    <fieldset>
      <legend className="text-sm text-white">T0 · Select customer</legend>
      <div className="mt-3 space-y-2">
        {accounts.map((account) => (
          <label key={account.customerId} className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="radio" name="hotel-wizard-customer" className="mt-1 accent-lime-400" checked={customerId === account.customerId} disabled={Boolean(account.warning)} onChange={() => onSelect(account.customerId)} />
            <span>
              <span className="text-white">{account.descriptiveName}</span>{" "}
              <span className="font-mono text-moss-400">{account.formattedId}</span>
              {account.warning ? <span className="mt-1 block text-xs text-amber-400">{account.warning}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function GeoStep({
  targets,
  onTargets,
}: {
  targets: WizardTarget[];
  onTargets: (targets: WizardTarget[]) => void;
}) {
  const geos = targets.filter((target) => target.type === "GEO");
  return (
    <fieldset>
      <legend className="text-sm text-white">T3 · Geo (MVP)</legend>
      <div className="mt-3 space-y-2">
        {GEO_PRESETS.map((preset) => {
          const checked = geos.some((target) => target.criterionText === preset.criterionText && target.included);
          return (
            <label key={preset.criterionText} className="flex items-center gap-2 text-sm text-moss-300">
              <input
                type="checkbox"
                className="accent-lime-400"
                checked={checked}
                onChange={(event) => {
                  const others = targets.filter((target) => !(target.type === "GEO" && target.criterionText === preset.criterionText));
                  onTargets(event.target.checked ? [...others, { type: "GEO", ...preset, included: true }] : others);
                }}
              />
              {preset.valueText}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-moss-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
