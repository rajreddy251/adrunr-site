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

import { DEFAULT_LOCAL_PLACE_ID, GEO_PRESETS } from "@/lib/local-draft";
import { hydrateLocalWizardFromDraft } from "@/lib/local-wizard-map";
import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import type { AdsAccountView, LocalDraftClientView } from "@/lib/types";

type WizardLocation = {
  kind: "BUSINESS_PROFILE" | "PLACE_ID" | "ADDRESS";
  valueText: string;
  placeIdText: string;
  addressText: string;
  included: boolean;
};

type WizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  ads: Array<{ headlines: string[]; descriptions: string[]; finalUrl: string }>;
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
  campaignOpId?: string;
  draft?: { id: string; statusDraft?: string };
  safety?: { note?: string };
  error?: string;
  hint?: string;
};

const STEPS = [
  { id: "L0", title: "Account" },
  { id: "L1", title: "Basics" },
  { id: "L2", title: "Locations" },
  { id: "L3", title: "Creatives" },
  { id: "L4", title: "Geo" },
  { id: "L5", title: "Review" },
  { id: "L6", title: "Result" },
] as const;

function dollarsToMicros(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000);
}

function emptyGroup(): WizardAdGroup {
  return {
    name: "Store visits 1",
    defaultBidDollars: "1.00",
    ads: [
      {
        headlines: ["Visit the store", "Find us nearby", "Local pickup"],
        descriptions: [
          "Store-visit Local ads stay PAUSED until you apply from the form.",
          "Locations + geo — validate the full tree first.",
        ],
        finalUrl: "https://adrunr.app",
      },
    ],
  };
}

export type LocalWizardHandle = {
  getCustomerId: () => string;
  getDraftId: () => string | null;
  persist: () => Promise<string | null>;
  applyDraft: (draft: LocalDraftClientView) => void;
};

export const LocalWizard = forwardRef<
  LocalWizardHandle,
  { accounts: AdsAccountView[]; connected: boolean; onFinished: () => Promise<void> | void }
>(function LocalWizard({ accounts, connected, onFinished }, ref) {
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<WizardResult | null>(null);
  const selectable = useMemo(() => accounts.filter((account) => !account.manager), [accounts]);
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("Adrunr paused Local");
  const [budgetDollars, setBudgetDollars] = useState("1.00");
  const [goal, setGoal] = useState<"STORE_VISITS" | "STORE_SALES">("STORE_VISITS");
  const [businessName, setBusinessName] = useState("Adrunr Local");
  const [finalUrl, setFinalUrl] = useState("https://adrunr.app");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [locations, setLocations] = useState<WizardLocation[]>([
    {
      kind: "PLACE_ID",
      valueText: "Adrunr store",
      placeIdText: DEFAULT_LOCAL_PLACE_ID,
      addressText: "1 Market St, San Francisco, CA",
      included: true,
    },
  ]);
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
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
      goal,
      businessName,
      finalUrl,
      startDate: startDate || null,
      endDate: endDate || null,
      status: "PAUSED",
      locations,
      adGroups: groups.map((group, index) => ({
        name: group.name,
        defaultBidMicros: dollarsToMicros(group.defaultBidDollars),
        sortOrder: index,
        ads: group.ads,
      })),
      targets,
    };
  }

  function applyDraft(draft: LocalDraftClientView) {
    const next = hydrateLocalWizardFromDraft(draft);
    setDraftId(next.draftId);
    setCustomerId(next.customerId);
    setName(next.name);
    setBudgetDollars(next.budgetDollars);
    setGoal(next.goal);
    setBusinessName(next.businessName);
    setFinalUrl(next.finalUrl);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setLocations(next.locations);
    setGroups(next.groups);
    setTargets(next.targets.length ? next.targets : targets);
    setStep((current) => (current === 0 ? 1 : current));
    setError(null);
  }

  useImperativeHandle(
    ref,
    () => ({ getCustomerId: () => customerId, getDraftId: () => draftId, persist: persistDraft, applyDraft }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerId, draftId, name, budgetDollars, goal, businessName, finalUrl, startDate, endDate, locations, groups, targets],
  );

  async function persistDraft(): Promise<string | null> {
    const res = await fetch(draftId ? `/api/ads/local/drafts/${draftId}` : "/api/ads/local/drafts", {
      method: draftId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
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
    const res = await fetch(`/api/ads/local/drafts/${id}/${kind}`, {
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
    setStep(6);
    setBusy(false);
    await onFinished();
  }

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="local-wizard">
      <h2 className="text-lg text-white">Local wizard (PAUSED)</h2>
      <p className="mt-1 text-sm text-moss-400">
        Schema v1.11 drafts in Neon. Store locations + local ads as TEXT children. Validate is
        validateOnly. Apply creates PAUSED only — no enable path.
      </p>
      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Local wizard steps">
        {STEPS.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                if (index <= step || (index === 6 && result)) setStep(index);
              }}
              className={`rounded-full px-3 py-1 font-mono text-xs ${
                index === step ? "bg-lime-400 text-ink-950" : index < step ? "border border-lime-400/40 text-lime-400" : "border border-ink-700 text-moss-500"
              }`}
            >
              {item.id} {item.title}
            </button>
          </li>
        ))}
      </ol>
      {error ? <p className="mt-4 text-sm text-coral-400" role="alert">{error}</p> : null}
      <div className="mt-5">
        {step === 0 ? (
          <AccountStep accounts={selectable} customerId={customerId} onSelect={setCustomerId} connected={connected} name="local-wizard-customer" label="L0 · Select customer" />
        ) : null}
        {step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Campaign name"><input value={name} onChange={(event) => setName(event.target.value)} className="input" /></Field>
            <Field label="Daily budget (USD)"><input value={budgetDollars} onChange={(event) => setBudgetDollars(event.target.value)} inputMode="decimal" className="input font-mono" /></Field>
            <Field label="Goal">
              <select value={goal} onChange={(event) => setGoal(event.target.value as "STORE_VISITS" | "STORE_SALES")} className="input">
                <option value="STORE_VISITS">STORE_VISITS</option>
                <option value="STORE_SALES">STORE_SALES (stored)</option>
              </select>
            </Field>
            <Field label="Business name"><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="input" /></Field>
            <Field label="Final URL"><input value={finalUrl} onChange={(event) => setFinalUrl(event.target.value)} className="input" /></Field>
            <Field label="Start date"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="input" /></Field>
            <Field label="End date"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="input" /></Field>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-moss-400">L2 · At least one included store location (Place ID, Business Profile, or address).</p>
            {locations.map((item, index) => (
              <div key={`loc-${index}`} className="grid gap-3 rounded-xl border border-ink-700 bg-ink-950 p-4 md:grid-cols-2">
                <Field label="Kind">
                  <select
                    value={item.kind}
                    onChange={(event) => {
                      const next = [...locations];
                      next[index] = { ...item, kind: event.target.value as WizardLocation["kind"] };
                      setLocations(next);
                    }}
                    className="input"
                  >
                    <option value="PLACE_ID">PLACE_ID</option>
                    <option value="BUSINESS_PROFILE">BUSINESS_PROFILE</option>
                    <option value="ADDRESS">ADDRESS</option>
                  </select>
                </Field>
                <Field label="Name"><input value={item.valueText} onChange={(event) => { const next = [...locations]; next[index] = { ...item, valueText: event.target.value }; setLocations(next); }} className="input" /></Field>
                <Field label="Place ID"><input value={item.placeIdText} onChange={(event) => { const next = [...locations]; next[index] = { ...item, placeIdText: event.target.value }; setLocations(next); }} className="input font-mono" /></Field>
                <Field label="Address"><input value={item.addressText} onChange={(event) => { const next = [...locations]; next[index] = { ...item, addressText: event.target.value }; setLocations(next); }} className="input" /></Field>
              </div>
            ))}
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-4">
            <p className="text-sm text-moss-400">L3 · Local ad headlines and descriptions. Campaign stays PAUSED.</p>
            {groups.map((group, groupIndex) => (
              <div key={`g-${groupIndex}`} className="space-y-3 rounded-xl border border-ink-700 bg-ink-950 p-4">
                <Field label="Ad group name">
                  <input value={group.name} onChange={(event) => { const next = [...groups]; next[groupIndex] = { ...group, name: event.target.value }; setGroups(next); }} className="input" />
                </Field>
                <Field label="Headlines (newline)">
                  <textarea
                    value={group.ads[0]?.headlines.join("\n") ?? ""}
                    onChange={(event) => {
                      const next = [...groups];
                      const ads = [...group.ads];
                      ads[0] = { ...ads[0], headlines: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean), descriptions: ads[0]?.descriptions ?? [], finalUrl: ads[0]?.finalUrl ?? finalUrl };
                      next[groupIndex] = { ...group, ads };
                      setGroups(next);
                    }}
                    rows={3}
                    className="input"
                  />
                </Field>
                <Field label="Descriptions (newline)">
                  <textarea
                    value={group.ads[0]?.descriptions.join("\n") ?? ""}
                    onChange={(event) => {
                      const next = [...groups];
                      const ads = [...group.ads];
                      ads[0] = { ...ads[0], headlines: ads[0]?.headlines ?? [], descriptions: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean), finalUrl: ads[0]?.finalUrl ?? finalUrl };
                      next[groupIndex] = { ...group, ads };
                      setGroups(next);
                    }}
                    rows={2}
                    className="input"
                  />
                </Field>
              </div>
            ))}
          </div>
        ) : null}
        {step === 4 ? <GeoStep targets={targets} onTargets={setTargets} label="L4 · Geo (MVP)" /> : null}
        {step === 5 ? (
          <div className="space-y-4 text-sm">
            <p className="text-moss-400">L5 · Review, then validate or type {CONFIRM_PAUSED_PHRASE} to apply PAUSED.</p>
            <p className="text-white">{name} · ${budgetDollars}/day · {goal} · MAXIMIZE_CONVERSIONS · PAUSED</p>
            <p className="text-moss-300">{locations.length} location · {groups[0]?.ads[0]?.headlines.length ?? 0} headlines</p>
            <label className="block">
              <span className="text-amber-400">Type {CONFIRM_PAUSED_PHRASE} only if you are applying.</span>
              <input ref={confirmRef} data-testid="local-wizard-confirm" value={confirmPhrase} onChange={(event) => setConfirmPhrase(event.target.value)} className="input mt-1 font-mono" />
            </label>
          </div>
        ) : null}
        {step === 6 ? (
          <div className="space-y-3">
            <p className="text-sm text-white">L6 · {result?.ok ? (result.applied ? "Applied PAUSED" : "Validated") : result ? "Failed" : "No result yet"}</p>
            {result?.safety?.note ? <p className="text-sm text-amber-400">{result.safety.note}</p> : null}
            {draftId ? <p className="font-mono text-xs text-moss-500">Draft {draftId}</p> : null}
            {result ? <pre className="max-h-80 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-4 font-mono text-xs text-moss-300">{JSON.stringify(result, null, 2)}</pre> : null}
          </div>
        ) : null}
      </div>
      <WizardNav step={step} busy={busy} connected={connected} selected={selected} onBack={() => setStep((current) => current - 1)} onNext={() => void goNext()} onValidate={() => void runAction("validate")} onApply={() => void runAction("apply")} onReset={(event) => { event.preventDefault(); setStep(0); setDraftId(null); setResult(null); setConfirmPhrase(""); setError(null); }} validateTestId="local-wizard-validate" applyTestId="local-wizard-apply" />
    </section>
  );
});

function AccountStep({ accounts, customerId, onSelect, connected, name, label }: { accounts: AdsAccountView[]; customerId: string; onSelect: (id: string) => void; connected: boolean; name: string; label: string }) {
  if (!connected) return <p className="text-sm text-moss-500">Connect Google Ads (or ADRUNR_MOCK=1) to pick a customer.</p>;
  if (accounts.length === 0) return <p className="text-sm text-moss-500">No client accounts listed yet.</p>;
  return (
    <fieldset>
      <legend className="text-sm text-white">{label}</legend>
      <div className="mt-3 space-y-2">
        {accounts.map((account) => (
          <label key={account.customerId} className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="radio" name={name} className="mt-1 accent-lime-400" checked={customerId === account.customerId} disabled={Boolean(account.warning)} onChange={() => onSelect(account.customerId)} />
            <span><span className="text-white">{account.descriptiveName}</span> <span className="font-mono text-moss-400">{account.formattedId}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function GeoStep({ targets, onTargets, label }: { targets: WizardTarget[]; onTargets: (targets: WizardTarget[]) => void; label: string }) {
  const geos = targets.filter((target) => target.type === "GEO");
  return (
    <fieldset>
      <legend className="text-sm text-white">{label}</legend>
      <div className="mt-3 space-y-2">
        {GEO_PRESETS.map((preset) => {
          const checked = geos.some((target) => target.criterionText === preset.criterionText && target.included);
          return (
            <label key={preset.criterionText} className="flex items-center gap-2 text-sm text-moss-300">
              <input type="checkbox" className="accent-lime-400" checked={checked} onChange={(event) => {
                const others = targets.filter((target) => !(target.type === "GEO" && target.criterionText === preset.criterionText));
                onTargets(event.target.checked ? [...others, { type: "GEO", ...preset, included: true }] : others);
              }} />
              {preset.valueText}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function WizardNav({
  step, busy, connected, selected, onBack, onNext, onValidate, onApply, onReset, validateTestId, applyTestId,
}: {
  step: number; busy: boolean; connected: boolean; selected: AdsAccountView | null;
  onBack: () => void; onNext: () => void; onValidate: () => void; onApply: () => void; onReset: (event: FormEvent) => void;
  validateTestId: string; applyTestId: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {step > 0 && step < 6 ? <button type="button" onClick={onBack} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300">Back</button> : null}
      {step < 5 ? <button type="button" onClick={onNext} disabled={!connected || busy || (step === 0 && (!selected || Boolean(selected.warning)))} className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 disabled:opacity-40">{busy ? "Saving…" : "Save and continue"}</button> : null}
      {step === 5 ? (
        <>
          <button type="button" data-testid={validateTestId} onClick={onValidate} disabled={!connected || busy} className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 disabled:opacity-40">{busy ? "Working…" : "Validate (dry-run)"}</button>
          <button type="button" data-testid={applyTestId} onClick={onApply} disabled={!connected || busy} className="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-400 disabled:opacity-40">{busy ? "Applying PAUSED…" : "Create PAUSED"}</button>
        </>
      ) : null}
      {step === 6 ? <button type="button" onClick={onReset} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300">New draft</button> : null}
    </div>
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
