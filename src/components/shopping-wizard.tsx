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
  type RefObject,
} from "react";

import { GEO_PRESETS, SALES_COUNTRY_PRESETS } from "@/lib/shopping-draft";
import { hydrateShoppingWizardFromDraft } from "@/lib/shopping-wizard-map";
import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import type { AdsAccountView, ShoppingDraftClientView } from "@/lib/types";

type WizardProductGroup = {
  kind: "ALL_PRODUCTS" | "UNIT" | "SUBDIVISION";
  valueText: string;
  dimensionText: string;
  included: boolean;
};

type WizardListing = {
  kind: "ALL_PRODUCTS" | "UNIT";
  valueText: string;
  dimensionText: string;
  included: boolean;
};

type WizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  productGroups: WizardProductGroup[];
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
  request?: unknown;
  response?: unknown;
};

const STEPS = [
  { id: "H0", title: "Account" },
  { id: "H1", title: "Basics" },
  { id: "H2", title: "Product groups" },
  { id: "H3", title: "Geo" },
  { id: "H4", title: "Bidding" },
  { id: "H5", title: "Review" },
  { id: "H6", title: "Result" },
] as const;

function dollarsToMicros(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000);
}

function emptyGroup(index: number): WizardAdGroup {
  return {
    name: `Shopping product group ${index + 1}`,
    defaultBidDollars: "1.00",
    productGroups: [{ kind: "ALL_PRODUCTS", valueText: "All products", dimensionText: "", included: true }],
    listings: [],
  };
}

export type ShoppingWizardHandle = {
  getCustomerId: () => string;
  getDraftId: () => string | null;
  persist: () => Promise<string | null>;
  applyDraft: (draft: ShoppingDraftClientView) => void;
};

export const ShoppingWizard = forwardRef<
  ShoppingWizardHandle,
  {
    accounts: AdsAccountView[];
    connected: boolean;
    onFinished: () => Promise<void> | void;
  }
>(function ShoppingWizard({ accounts, connected, onFinished }, ref) {
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<WizardResult | null>(null);

  const selectable = useMemo(
    () => accounts.filter((account) => !account.manager),
    [accounts],
  );
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("Adrunr paused Shopping");
  const [budgetDollars, setBudgetDollars] = useState("1.00");
  const [merchantCenterId, setMerchantCenterId] = useState("123456789");
  const [salesCountry, setSalesCountry] = useState("US");
  const [campaignPriority, setCampaignPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("LOW");
  const [enableLocal, setEnableLocal] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groups, setGroups] = useState<WizardAdGroup[]>([emptyGroup(0)]);
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
      merchantCenterId,
      salesCountry,
      campaignPriority,
      enableLocal,
      startDate: startDate || null,
      endDate: endDate || null,
      status: "PAUSED",
      adGroups: groups.map((group, index) => ({
        name: group.name,
        defaultBidMicros: dollarsToMicros(group.defaultBidDollars),
        sortOrder: index,
        productGroups: group.productGroups,
        listings: group.listings,
      })),
      targets,
    };
  }

  function applyDraft(draft: ShoppingDraftClientView) {
    const next = hydrateShoppingWizardFromDraft(draft);
    setDraftId(next.draftId);
    setCustomerId(next.customerId);
    setName(next.name);
    setBudgetDollars(next.budgetDollars);
    setMerchantCenterId(next.merchantCenterId);
    setSalesCountry(next.salesCountry);
    setCampaignPriority(next.campaignPriority);
    setEnableLocal(next.enableLocal);
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
    // persistDraft closes over current wizard fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      customerId,
      draftId,
      name,
      budgetDollars,
      merchantCenterId,
      salesCountry,
      campaignPriority,
      enableLocal,
      startDate,
      endDate,
      groups,
      targets,
    ],
  );

  async function persistDraft(): Promise<string | null> {
    const body = payload();
    const res = await fetch(draftId ? `/api/ads/shopping/drafts/${draftId}` : "/api/ads/shopping/drafts", {
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
    const res = await fetch(`/api/ads/shopping/drafts/${id}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirmPhrase: kind === "apply" ? typedPhrase : undefined,
        status: "PAUSED",
      }),
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
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="shopping-wizard">
      <h2 className="text-lg text-white">Shopping wizard (PAUSED)</h2>
      <p className="mt-1 text-sm text-moss-400">
        Schema v1.9 drafts in Neon. Merchant Center + product groups / listings as TEXT children.
        Validate is a full-tree <code className="font-mono text-moss-300">validateOnly</code> dry-run.
        Apply still creates PAUSED only — there is no enable path.
      </p>

      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Shopping wizard steps">
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
          <AccountStep
            accounts={selectable}
            customerId={customerId}
            onSelect={setCustomerId}
            connected={connected}
          />
        ) : null}
        {step === 1 ? (
          <BasicsStep
            name={name}
            budgetDollars={budgetDollars}
            merchantCenterId={merchantCenterId}
            salesCountry={salesCountry}
            campaignPriority={campaignPriority}
            enableLocal={enableLocal}
            startDate={startDate}
            endDate={endDate}
            onName={setName}
            onBudget={setBudgetDollars}
            onMerchant={setMerchantCenterId}
            onCountry={setSalesCountry}
            onPriority={setCampaignPriority}
            onLocal={setEnableLocal}
            onStart={setStartDate}
            onEnd={setEndDate}
          />
        ) : null}
        {step === 2 ? <ProductGroupsStep groups={groups} onChange={setGroups} /> : null}
        {step === 3 ? <GeoStep targets={targets} onTargets={setTargets} /> : null}
        {step === 4 ? <BiddingStep /> : null}
        {step === 5 ? (
          <ReviewStep
            customerId={customerId}
            selected={selected}
            name={name}
            budgetDollars={budgetDollars}
            merchantCenterId={merchantCenterId}
            salesCountry={salesCountry}
            campaignPriority={campaignPriority}
            enableLocal={enableLocal}
            groups={groups}
            targets={targets}
            startDate={startDate}
            endDate={endDate}
            confirmPhrase={confirmPhrase}
            confirmRef={confirmRef}
            onConfirm={setConfirmPhrase}
          />
        ) : null}
        {step === 6 ? <ResultStep result={result} draftId={draftId} /> : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {step > 0 && step < 6 ? (
          <button
            type="button"
            onClick={() => setStep((current) => current - 1)}
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300 hover:border-moss-400"
          >
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
            <button
              type="button"
              data-testid="shopping-wizard-validate"
              onClick={() => void runAction("validate")}
              disabled={!connected || busy}
              className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
            >
              {busy ? "Working…" : "Validate (dry-run)"}
            </button>
            <button
              type="button"
              data-testid="shopping-wizard-apply"
              onClick={() => void runAction("apply")}
              disabled={!connected || busy}
              className="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-400 hover:bg-amber-400/10 disabled:opacity-40"
            >
              {busy ? "Applying PAUSED…" : "Create PAUSED"}
            </button>
          </>
        ) : null}
        {step === 6 ? (
          <button
            type="button"
            onClick={startOver}
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300"
          >
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
  if (!connected) {
    return <p className="text-sm text-moss-500">Connect Google Ads (or ADRUNR_MOCK=1) to pick a customer.</p>;
  }
  if (accounts.length === 0) {
    return <p className="text-sm text-moss-500">No client accounts listed yet. Refresh Accessible customers above.</p>;
  }
  return (
    <fieldset>
      <legend className="text-sm text-white">H0 · Select customer</legend>
      <div className="mt-3 space-y-2">
        {accounts.map((account) => (
          <label key={account.customerId} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="radio"
              name="shopping-wizard-customer"
              className="mt-1 accent-lime-400"
              checked={customerId === account.customerId}
              disabled={Boolean(account.warning)}
              onChange={() => onSelect(account.customerId)}
            />
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

function BasicsStep({
  name,
  budgetDollars,
  merchantCenterId,
  salesCountry,
  campaignPriority,
  enableLocal,
  startDate,
  endDate,
  onName,
  onBudget,
  onMerchant,
  onCountry,
  onPriority,
  onLocal,
  onStart,
  onEnd,
}: {
  name: string;
  budgetDollars: string;
  merchantCenterId: string;
  salesCountry: string;
  campaignPriority: "LOW" | "MEDIUM" | "HIGH";
  enableLocal: boolean;
  startDate: string;
  endDate: string;
  onName: (value: string) => void;
  onBudget: (value: string) => void;
  onMerchant: (value: string) => void;
  onCountry: (value: string) => void;
  onPriority: (value: "LOW" | "MEDIUM" | "HIGH") => void;
  onLocal: (value: boolean) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Campaign name">
          <input value={name} onChange={(event) => onName(event.target.value)} className="input" />
        </Field>
        <Field label="Daily budget (USD — campaign stays PAUSED)">
          <input
            value={budgetDollars}
            onChange={(event) => onBudget(event.target.value)}
            inputMode="decimal"
            className="input font-mono"
          />
        </Field>
        <Field label="Merchant Center id">
          <input
            value={merchantCenterId}
            onChange={(event) => onMerchant(event.target.value)}
            className="input font-mono"
          />
        </Field>
        <Field label="Sales country / feed label">
          <select value={salesCountry} onChange={(event) => onCountry(event.target.value)} className="input">
            {SALES_COUNTRY_PRESETS.map((preset) => (
              <option key={preset.salesCountry} value={preset.salesCountry}>
                {preset.valueText} ({preset.salesCountry})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Campaign priority">
          <select
            value={campaignPriority}
            onChange={(event) => onPriority(event.target.value as "LOW" | "MEDIUM" | "HIGH")}
            className="input"
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </Field>
        <Field label="Start date (optional)">
          <input type="date" value={startDate} onChange={(event) => onStart(event.target.value)} className="input" />
        </Field>
        <Field label="End date (optional)">
          <input type="date" value={endDate} onChange={(event) => onEnd(event.target.value)} className="input" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-moss-300">
        <input
          type="checkbox"
          className="accent-lime-400"
          checked={enableLocal}
          onChange={(event) => onLocal(event.target.checked)}
        />
        Enable local inventory ads
      </label>
    </div>
  );
}

function ProductGroupsStep({
  groups,
  onChange,
}: {
  groups: WizardAdGroup[];
  onChange: (groups: WizardAdGroup[]) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-moss-400">
        H2 · Ad group + ALL_PRODUCTS product group. UNIT / SUBDIVISION listings stay schema-ready
        and are not applied in Shopping MVP.
      </p>
      {groups.map((group, groupIndex) => (
        <div key={`shop-${groupIndex}`} className="space-y-4 rounded-xl border border-ink-700 bg-ink-950 p-4">
          <Field label="Ad group name">
            <input
              value={group.name}
              onChange={(event) => {
                const next = [...groups];
                next[groupIndex] = { ...group, name: event.target.value };
                onChange(next);
              }}
              className="input"
            />
          </Field>
          <Field label="Default CPC bid (USD)">
            <input
              value={group.defaultBidDollars}
              onChange={(event) => {
                const next = [...groups];
                next[groupIndex] = { ...group, defaultBidDollars: event.target.value };
                onChange(next);
              }}
              inputMode="decimal"
              className="input font-mono"
            />
          </Field>
          {group.productGroups.map((item, itemIndex) => (
            <div key={`pg-${itemIndex}`} className="grid gap-2 md:grid-cols-[10rem_1fr]">
              <select
                value={item.kind}
                onChange={(event) => {
                  const productGroups = [...group.productGroups];
                  productGroups[itemIndex] = {
                    ...item,
                    kind: event.target.value as WizardProductGroup["kind"],
                  };
                  const next = [...groups];
                  next[groupIndex] = { ...group, productGroups };
                  onChange(next);
                }}
                className="input"
              >
                <option value="ALL_PRODUCTS">ALL_PRODUCTS</option>
                <option value="UNIT">UNIT (stored)</option>
                <option value="SUBDIVISION">SUBDIVISION (stored)</option>
              </select>
              <input
                value={item.valueText}
                onChange={(event) => {
                  const productGroups = [...group.productGroups];
                  productGroups[itemIndex] = { ...item, valueText: event.target.value };
                  const next = [...groups];
                  next[groupIndex] = { ...group, productGroups };
                  onChange(next);
                }}
                className="input"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
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
      <legend className="text-sm text-white">H3 · Geo (MVP)</legend>
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
                  const others = targets.filter(
                    (target) => !(target.type === "GEO" && target.criterionText === preset.criterionText),
                  );
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

function BiddingStep() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-moss-400">
        H4 · Manual CPC is the Shopping MVP. Maximize conversion value / tROAS remain
        schema-ready and are not applied.
      </p>
      <p className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white">
        Bidding · MANUAL_CPC · campaign stays PAUSED
      </p>
    </div>
  );
}

function ReviewStep({
  customerId,
  selected,
  name,
  budgetDollars,
  merchantCenterId,
  salesCountry,
  campaignPriority,
  enableLocal,
  groups,
  targets,
  startDate,
  endDate,
  confirmPhrase,
  confirmRef,
  onConfirm,
}: {
  customerId: string;
  selected: AdsAccountView | null;
  name: string;
  budgetDollars: string;
  merchantCenterId: string;
  salesCountry: string;
  campaignPriority: string;
  enableLocal: boolean;
  groups: WizardAdGroup[];
  targets: WizardTarget[];
  startDate: string;
  endDate: string;
  confirmPhrase: string;
  confirmRef: RefObject<HTMLInputElement | null>;
  onConfirm: (value: string) => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-moss-400">
        H5 · Review, then validate (preferred) or type {CONFIRM_PAUSED_PHRASE} to apply PAUSED.
      </p>
      <dl className="grid gap-3 md:grid-cols-2">
        <div>
          <dt className="text-moss-500">Account</dt>
          <dd className="font-mono text-moss-300">
            {selected?.descriptiveName ?? customerId} {selected?.formattedId}
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Campaign</dt>
          <dd className="text-white">
            {name} · ${budgetDollars}/day · PAUSED · Shopping · Manual CPC
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Merchant Center</dt>
          <dd className="font-mono text-moss-300">
            {merchantCenterId || "unset"} · {salesCountry} · {campaignPriority}
            {enableLocal ? " · local" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Dates</dt>
          <dd className="font-mono text-moss-300">
            {startDate || "unset"} → {endDate || "unset"}
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Geo</dt>
          <dd className="text-moss-300">
            {targets.map((target) => `${target.type}:${target.valueText}`).join(", ") || "none"}
          </dd>
        </div>
      </dl>
      <ul className="space-y-2 text-moss-300">
        {groups.map((group) => (
          <li key={group.name} className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2">
            <span className="text-white">{group.name}</span> · {group.productGroups.length} product group ·{" "}
            {group.listings.length} listing
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="text-amber-400">
          Type {CONFIRM_PAUSED_PHRASE} only if you are applying. Validate does not need this.
        </span>
        <input
          ref={confirmRef}
          data-testid="shopping-wizard-confirm"
          value={confirmPhrase}
          onChange={(event) => onConfirm(event.target.value)}
          className="input mt-1 font-mono"
        />
      </label>
    </div>
  );
}

function ResultStep({ result, draftId }: { result: WizardResult | null; draftId: string | null }) {
  if (!result) {
    return <p className="text-sm text-moss-500">H6 · Run validate or Create PAUSED from review to see a result.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-white">
        H6 · {result.ok ? (result.applied ? "Applied PAUSED" : "Validated") : "Failed"}{" "}
        {result.draft?.statusDraft ? `· draft ${result.draft.statusDraft}` : ""}
      </p>
      {result.safety?.note ? <p className="text-sm text-amber-400">{result.safety.note}</p> : null}
      {draftId ? (
        <p className="font-mono text-xs text-moss-500">
          Draft {draftId}
          {result.campaignOpId ? ` · op ${result.campaignOpId}` : ""}
        </p>
      ) : null}
      <pre className="max-h-80 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-4 font-mono text-xs text-moss-300">
        {JSON.stringify(result, null, 2)}
      </pre>
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
