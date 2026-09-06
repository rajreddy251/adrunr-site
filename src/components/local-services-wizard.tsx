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

import { GEO_PRESETS, LSA_CATEGORY_PRESETS } from "@/lib/local-services-draft";
import { hydrateLocalServicesWizardFromDraft } from "@/lib/local-services-wizard-map";
import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import type { AdsAccountView, LocalServicesDraftClientView } from "@/lib/types";

type WizardCategory = {
  kind: "PRIMARY" | "ADDITIONAL";
  categoryId: string;
  valueText: string;
  included: boolean;
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
  { id: "S0", title: "Account" },
  { id: "S1", title: "Basics" },
  { id: "S2", title: "Categories" },
  { id: "S3", title: "Geo" },
  { id: "S4", title: "Bidding" },
  { id: "S5", title: "Review" },
  { id: "S6", title: "Result" },
] as const;

function dollarsToMicros(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000);
}

export type LocalServicesWizardHandle = {
  getCustomerId: () => string;
  getDraftId: () => string | null;
  persist: () => Promise<string | null>;
  applyDraft: (draft: LocalServicesDraftClientView) => void;
};

export const LocalServicesWizard = forwardRef<
  LocalServicesWizardHandle,
  { accounts: AdsAccountView[]; connected: boolean; onFinished: () => Promise<void> | void }
>(function LocalServicesWizard({ accounts, connected, onFinished }, ref) {
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<WizardResult | null>(null);
  const selectable = useMemo(() => accounts.filter((account) => !account.manager), [accounts]);
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("Adrunr paused Local Services");
  const [budgetDollars, setBudgetDollars] = useState("1.00");
  const [maxLeadBidDollars, setMaxLeadBidDollars] = useState("2.00");
  const [businessName, setBusinessName] = useState("Adrunr Local Services");
  const [licenseText, setLicenseText] = useState("");
  const [insuranceText, setInsuranceText] = useState("");
  const [googleGuaranteed, setGoogleGuaranteed] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [categories, setCategories] = useState<WizardCategory[]>([
    { kind: "PRIMARY", categoryId: "xcat:home_services:plumber", valueText: "Plumber", included: true },
  ]);
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
      biddingStrategy: "MANUAL_CPC",
      maxLeadBidMicros: dollarsToMicros(maxLeadBidDollars),
      businessName,
      licenseText: licenseText || null,
      insuranceText: insuranceText || null,
      googleGuaranteed,
      startDate: startDate || null,
      endDate: endDate || null,
      status: "PAUSED",
      categories,
      targets,
    };
  }

  function applyDraft(draft: LocalServicesDraftClientView) {
    const next = hydrateLocalServicesWizardFromDraft(draft);
    setDraftId(next.draftId);
    setCustomerId(next.customerId);
    setName(next.name);
    setBudgetDollars(next.budgetDollars);
    setMaxLeadBidDollars(next.maxLeadBidDollars);
    setBusinessName(next.businessName);
    setLicenseText(next.licenseText);
    setInsuranceText(next.insuranceText);
    setGoogleGuaranteed(next.googleGuaranteed);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setCategories(next.categories);
    setTargets(next.targets.length ? next.targets : targets);
    setStep((current) => (current === 0 ? 1 : current));
    setError(null);
  }

  useImperativeHandle(
    ref,
    () => ({ getCustomerId: () => customerId, getDraftId: () => draftId, persist: persistDraft, applyDraft }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerId, draftId, name, budgetDollars, maxLeadBidDollars, businessName, licenseText, insuranceText, googleGuaranteed, startDate, endDate, categories, targets],
  );

  async function persistDraft(): Promise<string | null> {
    const res = await fetch(draftId ? `/api/ads/local-services/drafts/${draftId}` : "/api/ads/local-services/drafts", {
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
    const res = await fetch(`/api/ads/local-services/drafts/${id}/${kind}`, {
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
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="local-services-wizard">
      <h2 className="text-lg text-white">Local Services (LSA) wizard (PAUSED)</h2>
      <p className="mt-1 text-sm text-moss-400">
        Schema v1.11 drafts in Neon. Service categories + geo as TEXT children. Lead ads apply PAUSED
        only — no enable path. License / insurance stay stored.
      </p>
      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Local Services wizard steps">
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
          !connected ? (
            <p className="text-sm text-moss-500">Connect Google Ads (or ADRUNR_MOCK=1) to pick a customer.</p>
          ) : (
            <fieldset>
              <legend className="text-sm text-white">S0 · Select customer</legend>
              <div className="mt-3 space-y-2">
                {selectable.map((account) => (
                  <label key={account.customerId} className="flex cursor-pointer items-start gap-3 text-sm">
                    <input type="radio" name="lsa-wizard-customer" className="mt-1 accent-lime-400" checked={customerId === account.customerId} disabled={Boolean(account.warning)} onChange={() => setCustomerId(account.customerId)} />
                    <span><span className="text-white">{account.descriptiveName}</span> <span className="font-mono text-moss-400">{account.formattedId}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )
        ) : null}
        {step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Campaign name"><input value={name} onChange={(event) => setName(event.target.value)} className="input" /></Field>
            <Field label="Daily budget (USD)"><input value={budgetDollars} onChange={(event) => setBudgetDollars(event.target.value)} inputMode="decimal" className="input font-mono" /></Field>
            <Field label="Max bid per lead (USD)"><input value={maxLeadBidDollars} onChange={(event) => setMaxLeadBidDollars(event.target.value)} inputMode="decimal" className="input font-mono" /></Field>
            <Field label="Business name"><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="input" /></Field>
            <Field label="License (stored)"><input value={licenseText} onChange={(event) => setLicenseText(event.target.value)} className="input" /></Field>
            <Field label="Insurance (stored)"><input value={insuranceText} onChange={(event) => setInsuranceText(event.target.value)} className="input" /></Field>
            <label className="flex items-center gap-2 text-sm text-moss-300">
              <input type="checkbox" className="accent-lime-400" checked={googleGuaranteed} onChange={(event) => setGoogleGuaranteed(event.target.checked)} />
              Google Guaranteed (stored)
            </label>
            <Field label="Start date"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="input" /></Field>
            <Field label="End date"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="input" /></Field>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-moss-400">S2 · PRIMARY service category. ADDITIONAL categories stay stored.</p>
            {categories.map((item, index) => (
              <div key={`cat-${index}`} className="grid gap-3 rounded-xl border border-ink-700 bg-ink-950 p-4 md:grid-cols-2">
                <Field label="Kind">
                  <select value={item.kind} onChange={(event) => { const next = [...categories]; next[index] = { ...item, kind: event.target.value as WizardCategory["kind"] }; setCategories(next); }} className="input">
                    <option value="PRIMARY">PRIMARY</option>
                    <option value="ADDITIONAL">ADDITIONAL (stored)</option>
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    value={item.categoryId}
                    onChange={(event) => {
                      const preset = LSA_CATEGORY_PRESETS.find((row) => row.categoryId === event.target.value);
                      const next = [...categories];
                      next[index] = { ...item, categoryId: event.target.value, valueText: preset?.valueText ?? item.valueText };
                      setCategories(next);
                    }}
                    className="input"
                  >
                    {LSA_CATEGORY_PRESETS.map((preset) => (
                      <option key={preset.categoryId} value={preset.categoryId}>{preset.valueText}</option>
                    ))}
                  </select>
                </Field>
              </div>
            ))}
          </div>
        ) : null}
        {step === 3 ? (
          <fieldset>
            <legend className="text-sm text-white">S3 · Geo (MVP)</legend>
            <div className="mt-3 space-y-2">
              {GEO_PRESETS.map((preset) => {
                const checked = targets.some((target) => target.type === "GEO" && target.criterionText === preset.criterionText && target.included);
                return (
                  <label key={preset.criterionText} className="flex items-center gap-2 text-sm text-moss-300">
                    <input type="checkbox" className="accent-lime-400" checked={checked} onChange={(event) => {
                      const others = targets.filter((target) => !(target.type === "GEO" && target.criterionText === preset.criterionText));
                      setTargets(event.target.checked ? [...others, { type: "GEO", ...preset, included: true }] : others);
                    }} />
                    {preset.valueText}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        {step === 4 ? (
          <p className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white">
            S4 · Bidding · MANUAL_CPC (max bid per lead ${maxLeadBidDollars}) · campaign stays PAUSED.
          </p>
        ) : null}
        {step === 5 ? (
          <div className="space-y-4 text-sm">
            <p className="text-moss-400">S5 · Review, then validate or type {CONFIRM_PAUSED_PHRASE} to apply PAUSED.</p>
            <p className="text-white">{name} · ${budgetDollars}/day · {categories[0]?.valueText} · MANUAL_CPC · PAUSED</p>
            <label className="block">
              <span className="text-amber-400">Type {CONFIRM_PAUSED_PHRASE} only if you are applying.</span>
              <input ref={confirmRef} data-testid="local-services-wizard-confirm" value={confirmPhrase} onChange={(event) => setConfirmPhrase(event.target.value)} className="input mt-1 font-mono" />
            </label>
          </div>
        ) : null}
        {step === 6 ? (
          <div className="space-y-3">
            <p className="text-sm text-white">S6 · {result?.ok ? (result.applied ? "Applied PAUSED" : "Validated") : result ? "Failed" : "No result yet"}</p>
            {result?.safety?.note ? <p className="text-sm text-amber-400">{result.safety.note}</p> : null}
            {draftId ? <p className="font-mono text-xs text-moss-500">Draft {draftId}</p> : null}
            {result ? <pre className="max-h-80 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-4 font-mono text-xs text-moss-300">{JSON.stringify(result, null, 2)}</pre> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {step > 0 && step < 6 ? <button type="button" onClick={() => setStep((current) => current - 1)} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300">Back</button> : null}
        {step < 5 ? <button type="button" onClick={() => void goNext()} disabled={!connected || busy || (step === 0 && (!selected || Boolean(selected.warning)))} className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 disabled:opacity-40">{busy ? "Saving…" : "Save and continue"}</button> : null}
        {step === 5 ? (
          <>
            <button type="button" data-testid="local-services-wizard-validate" onClick={() => void runAction("validate")} disabled={!connected || busy} className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 disabled:opacity-40">{busy ? "Working…" : "Validate (dry-run)"}</button>
            <button type="button" data-testid="local-services-wizard-apply" onClick={() => void runAction("apply")} disabled={!connected || busy} className="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-400 disabled:opacity-40">{busy ? "Applying PAUSED…" : "Create PAUSED"}</button>
          </>
        ) : null}
        {step === 6 ? <button type="button" onClick={(event: FormEvent) => { event.preventDefault(); setStep(0); setDraftId(null); setResult(null); setConfirmPhrase(""); setError(null); }} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300">New draft</button> : null}
      </div>
    </section>
  );
});

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-moss-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
