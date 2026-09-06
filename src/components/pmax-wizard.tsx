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

import {
  DEFAULT_LOGO_IMAGE,
  DEFAULT_MARKETING_IMAGE,
  DEFAULT_SQUARE_IMAGE,
  GEO_PRESETS,
  PMAX_DESCRIPTION_MAX,
  PMAX_HEADLINE_MAX,
  PMAX_LONG_HEADLINE_MAX,
  SIGNAL_PRESETS,
} from "@/lib/pmax-draft";
import { hydratePmaxWizardFromDraft } from "@/lib/pmax-wizard-map";
import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import type { AdsAccountView, PmaxDraftClientView } from "@/lib/types";

type WizardAsset = {
  kind:
    | "MARKETING_IMAGE"
    | "SQUARE_MARKETING_IMAGE"
    | "PORTRAIT_MARKETING_IMAGE"
    | "LOGO"
    | "LANDSCAPE_LOGO"
    | "YOUTUBE_VIDEO";
  urlText: string;
};

type WizardListing = {
  kind: "ALL_PRODUCTS";
  valueText: string;
  dimensionText: string;
  included: boolean;
};

type WizardAssetGroup = {
  name: string;
  finalUrl: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  businessName: string;
  assets: WizardAsset[];
  listings: WizardListing[];
};

type WizardTarget = {
  type: "GEO" | "LANGUAGE";
  valueText: string;
  criterionText: string;
  included: boolean;
};

type WizardSignal = {
  kind: "SEARCH_THEME";
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
  { id: "P0", title: "Account" },
  { id: "P1", title: "Basics" },
  { id: "P2", title: "Asset group" },
  { id: "P3", title: "Signals / geo" },
  { id: "P4", title: "Bidding" },
  { id: "P5", title: "Review" },
  { id: "P6", title: "Result" },
] as const;

function dollarsToMicros(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000);
}

function emptyGroup(index: number): WizardAssetGroup {
  return {
    name: `Performance Max asset group ${index + 1}`,
    finalUrl: "https://adrunr.app",
    headlines: ["Adrunr Performance Max", "Paused Campaign Tools", "Ops, Not Autopilot"],
    longHeadlines: ["Create Performance Max campaigns as PAUSED. Dry-run is the default path."],
    descriptions: [
      "Asset groups and search-theme signals stay on this draft.",
      "Validate the full tree before any Google Ads apply.",
    ],
    businessName: "Adrunr",
    assets: [
      { kind: "MARKETING_IMAGE", urlText: DEFAULT_MARKETING_IMAGE },
      { kind: "SQUARE_MARKETING_IMAGE", urlText: DEFAULT_SQUARE_IMAGE },
      { kind: "LOGO", urlText: DEFAULT_LOGO_IMAGE },
    ],
    listings: [],
  };
}

export type PmaxWizardHandle = {
  getCustomerId: () => string;
  getDraftId: () => string | null;
  persist: () => Promise<string | null>;
  applyDraft: (draft: PmaxDraftClientView) => void;
};

export const PmaxWizard = forwardRef<
  PmaxWizardHandle,
  {
    accounts: AdsAccountView[];
    connected: boolean;
    onFinished: () => Promise<void> | void;
  }
>(function PmaxWizard({ accounts, connected, onFinished }, ref) {
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
  const [name, setName] = useState("Adrunr paused Performance Max");
  const [budgetDollars, setBudgetDollars] = useState("1.00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groups, setGroups] = useState<WizardAssetGroup[]>([emptyGroup(0)]);
  const [targets, setTargets] = useState<WizardTarget[]>([
    { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
  ]);
  const [signals, setSignals] = useState<WizardSignal[]>([
    {
      kind: "SEARCH_THEME",
      valueText: SIGNAL_PRESETS[0].valueText,
      criterionText: SIGNAL_PRESETS[0].criterionText,
      included: true,
    },
  ]);
  const [merchantCenterId, setMerchantCenterId] = useState("");
  const [includeAllProducts, setIncludeAllProducts] = useState(false);
  const [urlExpansionOptOut, setUrlExpansionOptOut] = useState(false);

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
      urlExpansionOptOut,
      merchantCenterId: merchantCenterId || null,
      startDate: startDate || null,
      endDate: endDate || null,
      status: "PAUSED",
      assetGroups: groups.map((group, index) => ({
        ...group,
        sortOrder: index,
        listings:
          includeAllProducts && merchantCenterId
            ? [
                {
                  kind: "ALL_PRODUCTS" as const,
                  valueText: "All products",
                  dimensionText: "",
                  included: true,
                },
              ]
            : group.listings,
      })),
      targets,
      signals,
    };
  }

  function applyDraft(draft: PmaxDraftClientView) {
    const next = hydratePmaxWizardFromDraft(draft);
    setDraftId(next.draftId);
    setCustomerId(next.customerId);
    setName(next.name);
    setBudgetDollars(next.budgetDollars);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setGroups(
      next.groups.map((group) => ({
        ...group,
        listings: group.listings
          .filter((listing) => listing.kind === "ALL_PRODUCTS")
          .map((listing) => ({
            kind: "ALL_PRODUCTS" as const,
            valueText: listing.valueText,
            dimensionText: listing.dimensionText,
            included: listing.included,
          })),
      })),
    );
    setTargets(next.targets.length ? next.targets : targets);
    setSignals(
      next.signals
        .filter((signal) => signal.kind === "SEARCH_THEME")
        .map((signal) => ({
          kind: "SEARCH_THEME" as const,
          valueText: signal.valueText,
          criterionText: signal.criterionText,
          included: signal.included,
        })),
    );
    setMerchantCenterId(next.merchantCenterId);
    setIncludeAllProducts(next.groups.some((group) => group.listings.some((listing) => listing.kind === "ALL_PRODUCTS")));
    setUrlExpansionOptOut(next.urlExpansionOptOut);
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
      startDate,
      endDate,
      groups,
      targets,
      signals,
      merchantCenterId,
      includeAllProducts,
      urlExpansionOptOut,
    ],
  );

  async function persistDraft(): Promise<string | null> {
    const body = payload();
    const res = await fetch(draftId ? `/api/ads/pmax/drafts/${draftId}` : "/api/ads/pmax/drafts", {
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
    const res = await fetch(`/api/ads/pmax/drafts/${id}/${kind}`, {
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
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="pmax-wizard">
      <h2 className="text-lg text-white">Performance Max wizard (PAUSED)</h2>
      <p className="mt-1 text-sm text-moss-400">
        Schema v1.6 drafts in Neon. Asset groups + search-theme signals. Listings are stored for
        Merchant Center PMax only — Sync listings is not a product feature. Validate is a full-tree{" "}
        <code className="font-mono text-moss-300">validateOnly</code> dry-run. Apply still creates
        PAUSED only — there is no enable path.
      </p>

      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Performance Max wizard steps">
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
            startDate={startDate}
            endDate={endDate}
            onName={setName}
            onBudget={setBudgetDollars}
            onStart={setStartDate}
            onEnd={setEndDate}
          />
        ) : null}
        {step === 2 ? <AssetGroupStep groups={groups} onChange={setGroups} /> : null}
        {step === 3 ? (
          <SignalsGeoStep
            targets={targets}
            signals={signals}
            merchantCenterId={merchantCenterId}
            includeAllProducts={includeAllProducts}
            onTargets={setTargets}
            onSignals={setSignals}
            onMerchantCenterId={setMerchantCenterId}
            onIncludeAllProducts={setIncludeAllProducts}
          />
        ) : null}
        {step === 4 ? (
          <BiddingStep urlExpansionOptOut={urlExpansionOptOut} onUrlExpansionOptOut={setUrlExpansionOptOut} />
        ) : null}
        {step === 5 ? (
          <ReviewStep
            customerId={customerId}
            selected={selected}
            name={name}
            budgetDollars={budgetDollars}
            groups={groups}
            targets={targets}
            signals={signals}
            merchantCenterId={merchantCenterId}
            includeAllProducts={includeAllProducts}
            urlExpansionOptOut={urlExpansionOptOut}
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
              data-testid="pmax-wizard-validate"
              onClick={() => void runAction("validate")}
              disabled={!connected || busy}
              className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
            >
              {busy ? "Working…" : "Validate (dry-run)"}
            </button>
            <button
              type="button"
              data-testid="pmax-wizard-apply"
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
      <legend className="text-sm text-white">P0 · Select customer</legend>
      <div className="mt-3 space-y-2">
        {accounts.map((account) => (
          <label key={account.customerId} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="radio"
              name="pmax-wizard-customer"
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
  startDate,
  endDate,
  onName,
  onBudget,
  onStart,
  onEnd,
}: {
  name: string;
  budgetDollars: string;
  startDate: string;
  endDate: string;
  onName: (value: string) => void;
  onBudget: (value: string) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
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
      <Field label="Start date (optional)">
        <input type="date" value={startDate} onChange={(event) => onStart(event.target.value)} className="input" />
      </Field>
      <Field label="End date (optional)">
        <input type="date" value={endDate} onChange={(event) => onEnd(event.target.value)} className="input" />
      </Field>
    </div>
  );
}

function AssetGroupStep({
  groups,
  onChange,
}: {
  groups: WizardAssetGroup[];
  onChange: (groups: WizardAssetGroup[]) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-moss-400">
        P2 · Asset group + text/image assets. {PMAX_HEADLINE_MAX} headlines max,{" "}
        {PMAX_LONG_HEADLINE_MAX} long headlines, {PMAX_DESCRIPTION_MAX} descriptions.
      </p>
      {groups.map((group, groupIndex) => (
        <div key={`pg-${groupIndex}`} className="space-y-4 rounded-xl border border-ink-700 bg-ink-950 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Asset group name">
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
            <Field label="Final URL">
              <input
                value={group.finalUrl}
                onChange={(event) => updateGroup(groups, onChange, groupIndex, { finalUrl: event.target.value })}
                className="input font-mono"
              />
            </Field>
          </div>
          <Field label="Business name">
            <input
              value={group.businessName}
              onChange={(event) => updateGroup(groups, onChange, groupIndex, { businessName: event.target.value })}
              className="input"
            />
          </Field>
          <ListEditor
            label="Headlines"
            values={group.headlines}
            max={PMAX_HEADLINE_MAX}
            onChange={(headlines) => updateGroup(groups, onChange, groupIndex, { headlines })}
          />
          <ListEditor
            label="Long headlines"
            values={group.longHeadlines}
            max={PMAX_LONG_HEADLINE_MAX}
            onChange={(longHeadlines) => updateGroup(groups, onChange, groupIndex, { longHeadlines })}
          />
          <ListEditor
            label="Descriptions"
            values={group.descriptions}
            max={PMAX_DESCRIPTION_MAX}
            onChange={(descriptions) => updateGroup(groups, onChange, groupIndex, { descriptions })}
          />
          <div className="space-y-2">
            <p className="text-xs text-moss-500">Assets (URLs stored as TEXT)</p>
            {group.assets.map((asset, assetIndex) => (
              <div key={`passet-${assetIndex}`} className="grid gap-2 md:grid-cols-[12rem_1fr]">
                <select
                  value={asset.kind}
                  onChange={(event) => {
                    const assets = [...group.assets];
                    assets[assetIndex] = {
                      ...asset,
                      kind: event.target.value as WizardAsset["kind"],
                    };
                    updateGroup(groups, onChange, groupIndex, { assets });
                  }}
                  className="input"
                >
                  <option value="MARKETING_IMAGE">Landscape</option>
                  <option value="SQUARE_MARKETING_IMAGE">Square</option>
                  <option value="PORTRAIT_MARKETING_IMAGE">Portrait</option>
                  <option value="LOGO">Logo</option>
                  <option value="LANDSCAPE_LOGO">Landscape logo</option>
                  <option value="YOUTUBE_VIDEO">YouTube</option>
                </select>
                <input
                  value={asset.urlText}
                  onChange={(event) => {
                    const assets = [...group.assets];
                    assets[assetIndex] = { ...asset, urlText: event.target.value };
                    updateGroup(groups, onChange, groupIndex, { assets });
                  }}
                  className="input font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function updateGroup(
  groups: WizardAssetGroup[],
  onChange: (groups: WizardAssetGroup[]) => void,
  groupIndex: number,
  patch: Partial<WizardAssetGroup>,
) {
  const next = [...groups];
  next[groupIndex] = { ...next[groupIndex], ...patch };
  onChange(next);
}

function SignalsGeoStep({
  targets,
  signals,
  merchantCenterId,
  includeAllProducts,
  onTargets,
  onSignals,
  onMerchantCenterId,
  onIncludeAllProducts,
}: {
  targets: WizardTarget[];
  signals: WizardSignal[];
  merchantCenterId: string;
  includeAllProducts: boolean;
  onTargets: (targets: WizardTarget[]) => void;
  onSignals: (signals: WizardSignal[]) => void;
  onMerchantCenterId: (value: string) => void;
  onIncludeAllProducts: (value: boolean) => void;
}) {
  const geos = targets.filter((target) => target.type === "GEO");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <fieldset>
        <legend className="text-sm text-white">P3 · Geo (MVP)</legend>
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
                    onTargets(
                      event.target.checked ? [...others, { type: "GEO", ...preset, included: true }] : others,
                    );
                  }}
                />
                {preset.valueText}
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm text-white">Audience signals</legend>
        <p className="mt-1 text-xs text-moss-500">
          SEARCH_THEME is applied. USER_LIST / CUSTOM stay stored for later.
        </p>
        <div className="mt-3 space-y-2">
          {SIGNAL_PRESETS.map((preset) => {
            const checked = signals.some(
              (signal) => signal.criterionText === preset.criterionText && signal.included,
            );
            return (
              <label key={preset.criterionText} className="flex items-center gap-2 text-sm text-moss-300">
                <input
                  type="checkbox"
                  className="accent-lime-400"
                  checked={checked}
                  onChange={(event) => {
                    const others = signals.filter((signal) => signal.criterionText !== preset.criterionText);
                    onSignals(
                      event.target.checked
                        ? [
                            ...others,
                            {
                              kind: "SEARCH_THEME",
                              valueText: preset.valueText,
                              criterionText: preset.criterionText,
                              included: true,
                            },
                          ]
                        : others,
                    );
                  }}
                />
                {preset.valueText}
              </label>
            );
          })}
        </div>
        <Field label="Custom search theme">
          <input
            value={signals.find((signal) => !SIGNAL_PRESETS.some((preset) => preset.criterionText === signal.criterionText))?.valueText ?? ""}
            onChange={(event) => {
              const custom = event.target.value.trim();
              const presets = signals.filter((signal) =>
                SIGNAL_PRESETS.some((preset) => preset.criterionText === signal.criterionText),
              );
              onSignals(
                custom
                  ? [...presets, { kind: "SEARCH_THEME", valueText: custom, criterionText: custom, included: true }]
                  : presets,
              );
            }}
            className="input"
            placeholder="Optional extra theme"
          />
        </Field>
      </fieldset>
      <fieldset className="md:col-span-2">
        <legend className="text-sm text-white">Listings (optional, not a Sync product)</legend>
        <p className="mt-1 text-xs text-moss-500">
          ALL_PRODUCTS applies only when a Merchant Center id is set. Sync listings is out of scope.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Merchant Center id (optional)">
            <input
              value={merchantCenterId}
              onChange={(event) => onMerchantCenterId(event.target.value)}
              className="input font-mono"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-moss-300">
            <input
              type="checkbox"
              className="accent-lime-400"
              checked={includeAllProducts}
              onChange={(event) => onIncludeAllProducts(event.target.checked)}
            />
            Store ALL_PRODUCTS listing group
          </label>
        </div>
      </fieldset>
    </div>
  );
}

function BiddingStep({
  urlExpansionOptOut,
  onUrlExpansionOptOut,
}: {
  urlExpansionOptOut: boolean;
  onUrlExpansionOptOut: (value: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-moss-400">
        P4 · Maximize conversions is the Performance Max MVP. tCPA / tROAS / max conversion value
        remain schema-ready and are not applied. Manual CPC is not a PMax strategy.
      </p>
      <label className="flex items-center gap-2 text-sm text-moss-300">
        <input
          type="checkbox"
          className="accent-lime-400"
          checked={urlExpansionOptOut}
          onChange={(event) => onUrlExpansionOptOut(event.target.checked)}
        />
        Opt out of final URL expansion (campaign stays PAUSED)
      </label>
    </div>
  );
}

function ReviewStep({
  customerId,
  selected,
  name,
  budgetDollars,
  groups,
  targets,
  signals,
  merchantCenterId,
  includeAllProducts,
  urlExpansionOptOut,
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
  groups: WizardAssetGroup[];
  targets: WizardTarget[];
  signals: WizardSignal[];
  merchantCenterId: string;
  includeAllProducts: boolean;
  urlExpansionOptOut: boolean;
  startDate: string;
  endDate: string;
  confirmPhrase: string;
  confirmRef: RefObject<HTMLInputElement | null>;
  onConfirm: (value: string) => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-moss-400">
        P5 · Review, then validate (preferred) or type {CONFIRM_PAUSED_PHRASE} to apply PAUSED.
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
            {name} · ${budgetDollars}/day · PAUSED · Performance Max · Maximize conversions
            {urlExpansionOptOut ? " · URL expansion off" : ""}
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
        <div>
          <dt className="text-moss-500">Signals</dt>
          <dd className="text-moss-300">
            {signals.map((signal) => signal.valueText).join(", ") || "none"}
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Listings</dt>
          <dd className="text-moss-300">
            {includeAllProducts && merchantCenterId
              ? `ALL_PRODUCTS · MC ${merchantCenterId}`
              : "none (non-retail or stored only)"}
          </dd>
        </div>
      </dl>
      <ul className="space-y-2 text-moss-300">
        {groups.map((group) => (
          <li key={group.name} className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2">
            <span className="text-white">{group.name}</span> · {group.headlines.length} headlines ·{" "}
            {group.assets.length} assets · {group.finalUrl}
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="text-amber-400">
          Type {CONFIRM_PAUSED_PHRASE} only if you are applying. Validate does not need this.
        </span>
        <input
          ref={confirmRef}
          data-testid="pmax-wizard-confirm"
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
    return <p className="text-sm text-moss-500">P6 · Run validate or Create PAUSED from review to see a result.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-white">
        P6 · {result.ok ? (result.applied ? "Applied PAUSED" : "Validated") : "Failed"}{" "}
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

function ListEditor({
  label,
  values,
  max,
  onChange,
}: {
  label: string;
  values: string[];
  max: number;
  onChange: (values: string[]) => void;
}) {
  return (
    <div>
      <p className="text-xs text-moss-500">{label}</p>
      <div className="mt-2 space-y-2">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="flex gap-2">
            <input
              value={value}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
              className="input"
            />
            <button
              type="button"
              className="text-xs text-coral-400"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {values.length < max ? (
        <button
          type="button"
          className="mt-2 font-mono text-xs text-lime-400 hover:underline"
          onClick={() => onChange([...values, ""])}
        >
          Add {label.toLowerCase().replace(/s$/, "")}
        </button>
      ) : null}
    </div>
  );
}
