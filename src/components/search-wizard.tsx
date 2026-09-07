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

import { CAMPAIGN_CHAT_DID_NOT_APPLY, CAMPAIGN_CHAT_PROPOSED_MARK } from "@/lib/campaign-chat";
import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import {
  DESCRIPTION_MAX,
  GEO_PRESETS,
  HEADLINE_MAX,
  LANGUAGE_PRESETS,
  SEARCH_KEYWORD_MATCH_TYPES,
} from "@/lib/search-draft";
import { hydrateWizardFromDraft } from "@/lib/search-wizard-map";
import type { AdsAccountView, SearchDraftClientView } from "@/lib/types";

type WizardKeyword = {
  text: string;
  matchType: (typeof SEARCH_KEYWORD_MATCH_TYPES)[number];
  isNegative: boolean;
};

type WizardAd = {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1: string;
  path2: string;
};

type WizardAdGroup = {
  name: string;
  defaultBidDollars: string;
  keywords: WizardKeyword[];
  ads: WizardAd[];
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
  { id: "S0", title: "Account" },
  { id: "S1", title: "Basics" },
  { id: "S2", title: "Ad groups" },
  { id: "S3", title: "Keywords" },
  { id: "S4", title: "RSA" },
  { id: "S5", title: "Targeting" },
  { id: "S6", title: "Bidding" },
  { id: "S7", title: "Review" },
  { id: "S8", title: "Result" },
] as const;

function dollarsToMicros(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000);
}

function emptyAd(): WizardAd {
  return {
    headlines: ["Adrunr Search Ads", "Paused Campaign Tools", "Ops, Not Autopilot"],
    descriptions: [
      "Create Search campaigns as PAUSED. Dry-run is the default path.",
      "Validate the full tree before any Google Ads apply.",
    ],
    finalUrl: "https://adrunr.app",
    path1: "search",
    path2: "paused",
  };
}

function emptyGroup(index: number): WizardAdGroup {
  return {
    name: `Ad group ${index + 1}`,
    defaultBidDollars: "1.00",
    keywords: [{ text: "adrunr search", matchType: "PHRASE", isNegative: false }],
    ads: [emptyAd()],
  };
}

export type SearchWizardHandle = {
  getCustomerId: () => string;
  getDraftId: () => string | null;
  persist: () => Promise<string | null>;
  applyDraft: (
    draft: SearchDraftClientView,
    meta?: { patchedFields?: string[]; proposedByChat?: boolean },
  ) => void;
};

export const SearchWizard = forwardRef<
  SearchWizardHandle,
  {
    accounts: AdsAccountView[];
    connected: boolean;
    onFinished: () => Promise<void> | void;
  }
>(function SearchWizard({ accounts, connected, onFinished }, ref) {
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
  const [name, setName] = useState("Adrunr paused search");
  const [budgetDollars, setBudgetDollars] = useState("1.00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groups, setGroups] = useState<WizardAdGroup[]>([emptyGroup(0)]);
  const [targets, setTargets] = useState<WizardTarget[]>([
    { type: "GEO", valueText: "United States", criterionText: "geoTargetConstants/2840", included: true },
    { type: "LANGUAGE", valueText: "English", criterionText: "languageConstants/1000", included: true },
  ]);
  const [enhancedCpc, setEnhancedCpc] = useState(false);
  const [chatMarks, setChatMarks] = useState<string[]>([]);

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
      enhancedCpcEnabled: enhancedCpc,
      startDate: startDate || null,
      endDate: endDate || null,
      status: "PAUSED",
      adGroups: groups.map((group, index) => ({
        name: group.name,
        defaultBidMicros: dollarsToMicros(group.defaultBidDollars),
        sortOrder: index,
        keywords: group.keywords,
        ads: group.ads,
      })),
      targets,
    };
  }

  function applyDraft(
    draft: SearchDraftClientView,
    meta?: { patchedFields?: string[]; proposedByChat?: boolean },
  ) {
    const next = hydrateWizardFromDraft(draft);
    setDraftId(next.draftId);
    setCustomerId(next.customerId);
    setName(next.name);
    setBudgetDollars(next.budgetDollars);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setGroups(next.groups);
    setTargets(next.targets.length ? next.targets : targets);
    setEnhancedCpc(next.enhancedCpc);
    setChatMarks(meta?.proposedByChat ? (meta.patchedFields?.length ? meta.patchedFields : ["name"]) : []);
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
    [customerId, draftId, name, budgetDollars, startDate, endDate, groups, targets, enhancedCpc],
  );

  async function persistDraft(): Promise<string | null> {
    const body = payload();
    const res = await fetch(draftId ? `/api/ads/search/drafts/${draftId}` : "/api/ads/search/drafts", {
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
    const res = await fetch(`/api/ads/search/drafts/${id}/${kind}`, {
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
    setStep(8);
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
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
      <h2 className="text-lg text-white">Search campaign wizard (PAUSED)</h2>
      <p className="mt-1 text-sm text-moss-400">
        Schema v1.7 drafts in Neon. The assistant can fill fields; Validate is a full-tree{" "}
        <code className="font-mono text-moss-300">validateOnly</code> dry-run. Apply still creates
        PAUSED only — there is no enable path.
      </p>

      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Wizard steps">
        {STEPS.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                if (index <= step || (index === 8 && result)) setStep(index);
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
      {chatMarks.length ? (
        <p data-testid="wizard-chat-proposed" className="mt-4 text-sm text-lime-400">
          {CAMPAIGN_CHAT_PROPOSED_MARK} — {CAMPAIGN_CHAT_DID_NOT_APPLY}
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
        {step === 2 ? <AdGroupsStep groups={groups} onChange={setGroups} /> : null}
        {step === 3 ? <KeywordsStep groups={groups} onChange={setGroups} /> : null}
        {step === 4 ? <AdsStep groups={groups} onChange={setGroups} /> : null}
        {step === 5 ? <TargetingStep targets={targets} onChange={setTargets} /> : null}
        {step === 6 ? (
          <BiddingStep
            groups={groups}
            enhancedCpc={enhancedCpc}
            onEnhancedCpc={setEnhancedCpc}
            onChange={setGroups}
          />
        ) : null}
        {step === 7 ? (
          <ReviewStep
            customerId={customerId}
            selected={selected}
            name={name}
            budgetDollars={budgetDollars}
            groups={groups}
            targets={targets}
            enhancedCpc={enhancedCpc}
            startDate={startDate}
            endDate={endDate}
            confirmPhrase={confirmPhrase}
            confirmRef={confirmRef}
            onConfirm={setConfirmPhrase}
          />
        ) : null}
        {step === 8 ? <ResultStep result={result} draftId={draftId} /> : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {step > 0 && step < 8 ? (
          <button
            type="button"
            onClick={() => setStep((current) => current - 1)}
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-moss-300 hover:border-moss-400"
          >
            Back
          </button>
        ) : null}
        {step < 7 ? (
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={!connected || busy || (step === 0 && (!selected || Boolean(selected.warning)))}
            className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save and continue"}
          </button>
        ) : null}
        {step === 7 ? (
          <>
            <button
              type="button"
              data-testid="wizard-validate"
              onClick={() => void runAction("validate")}
              disabled={!connected || busy}
              className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
            >
              {busy ? "Working…" : "Validate (dry-run)"}
            </button>
            <button
              type="button"
              data-testid="wizard-apply"
              onClick={() => void runAction("apply")}
              disabled={!connected || busy}
              className="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-400 hover:bg-amber-400/10 disabled:opacity-40"
            >
              {busy ? "Applying PAUSED…" : "Create PAUSED"}
            </button>
          </>
        ) : null}
        {step === 8 ? (
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
      <legend className="text-sm text-white">S0 · Select customer</legend>
      <div className="mt-3 space-y-2">
        {accounts.map((account) => (
          <label key={account.customerId} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="radio"
              name="wizard-customer"
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
        <input
          value={name}
          onChange={(event) => onName(event.target.value)}
          className="input"
        />
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

function AdGroupsStep({
  groups,
  onChange,
}: {
  groups: WizardAdGroup[];
  onChange: (groups: WizardAdGroup[]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-moss-400">S2 · At least one ad group. Default CPC bid is used for Manual CPC.</p>
      {groups.map((group, index) => (
        <div key={`g-${index}`} className="grid gap-3 rounded-xl border border-ink-700 bg-ink-950 p-4 md:grid-cols-2">
          <Field label="Ad group name">
            <input
              value={group.name}
              onChange={(event) => {
                const next = [...groups];
                next[index] = { ...group, name: event.target.value };
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
                next[index] = { ...group, defaultBidDollars: event.target.value };
                onChange(next);
              }}
              inputMode="decimal"
              className="input font-mono"
            />
          </Field>
          {groups.length > 1 ? (
            <button
              type="button"
              className="text-left text-xs text-coral-400"
              onClick={() => onChange(groups.filter((_, i) => i !== index))}
            >
              Remove ad group
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="font-mono text-xs text-lime-400 hover:underline"
        onClick={() => onChange([...groups, emptyGroup(groups.length)])}
      >
        Add ad group
      </button>
    </div>
  );
}

function KeywordsStep({
  groups,
  onChange,
}: {
  groups: WizardAdGroup[];
  onChange: (groups: WizardAdGroup[]) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-moss-400">S3 · Keywords per ad group. Negative keywords skip bids.</p>
      {groups.map((group, groupIndex) => (
        <div key={`kw-${groupIndex}`} className="rounded-xl border border-ink-700 bg-ink-950 p-4">
          <p className="text-sm text-white">{group.name}</p>
          <div className="mt-3 space-y-2">
            {group.keywords.map((keyword, keywordIndex) => (
              <div key={`kw-${groupIndex}-${keywordIndex}`} className="grid gap-2 md:grid-cols-[1fr_8rem_auto_auto]">
                <input
                  value={keyword.text}
                  onChange={(event) => {
                    const next = [...groups];
                    const keywords = [...group.keywords];
                    keywords[keywordIndex] = { ...keyword, text: event.target.value };
                    next[groupIndex] = { ...group, keywords };
                    onChange(next);
                  }}
                  className="input"
                  placeholder="keyword"
                />
                <select
                  value={keyword.matchType}
                  onChange={(event) => {
                    const next = [...groups];
                    const keywords = [...group.keywords];
                    keywords[keywordIndex] = {
                      ...keyword,
                      matchType: event.target.value as WizardKeyword["matchType"],
                    };
                    next[groupIndex] = { ...group, keywords };
                    onChange(next);
                  }}
                  className="input"
                >
                  {SEARCH_KEYWORD_MATCH_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-moss-400">
                  <input
                    type="checkbox"
                    className="accent-lime-400"
                    checked={keyword.isNegative}
                    onChange={(event) => {
                      const next = [...groups];
                      const keywords = [...group.keywords];
                      keywords[keywordIndex] = { ...keyword, isNegative: event.target.checked };
                      next[groupIndex] = { ...group, keywords };
                      onChange(next);
                    }}
                  />
                  Negative
                </label>
                <button
                  type="button"
                  className="text-xs text-coral-400"
                  onClick={() => {
                    const next = [...groups];
                    next[groupIndex] = {
                      ...group,
                      keywords: group.keywords.filter((_, i) => i !== keywordIndex),
                    };
                    onChange(next);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 font-mono text-xs text-lime-400 hover:underline"
            onClick={() => {
              const next = [...groups];
              next[groupIndex] = {
                ...group,
                keywords: [...group.keywords, { text: "", matchType: "PHRASE", isNegative: false }],
              };
              onChange(next);
            }}
          >
            Add keyword
          </button>
        </div>
      ))}
    </div>
  );
}

function AdsStep({
  groups,
  onChange,
}: {
  groups: WizardAdGroup[];
  onChange: (groups: WizardAdGroup[]) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-moss-400">
        S4 · Responsive search ads. {HEADLINE_MAX} headlines max, {DESCRIPTION_MAX} descriptions max.
      </p>
      {groups.map((group, groupIndex) =>
        group.ads.map((ad, adIndex) => (
          <div key={`ad-${groupIndex}-${adIndex}`} className="space-y-3 rounded-xl border border-ink-700 bg-ink-950 p-4">
            <p className="text-sm text-white">
              {group.name} · RSA {adIndex + 1}
            </p>
            <Field label="Final URL">
              <input
                value={ad.finalUrl}
                onChange={(event) => updateAd(groups, onChange, groupIndex, adIndex, { finalUrl: event.target.value })}
                className="input font-mono"
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Path 1">
                <input
                  value={ad.path1}
                  onChange={(event) => updateAd(groups, onChange, groupIndex, adIndex, { path1: event.target.value })}
                  className="input font-mono"
                />
              </Field>
              <Field label="Path 2">
                <input
                  value={ad.path2}
                  onChange={(event) => updateAd(groups, onChange, groupIndex, adIndex, { path2: event.target.value })}
                  className="input font-mono"
                />
              </Field>
            </div>
            <ListEditor
              label="Headlines"
              values={ad.headlines}
              max={HEADLINE_MAX}
              onChange={(headlines) => updateAd(groups, onChange, groupIndex, adIndex, { headlines })}
            />
            <ListEditor
              label="Descriptions"
              values={ad.descriptions}
              max={DESCRIPTION_MAX}
              onChange={(descriptions) => updateAd(groups, onChange, groupIndex, adIndex, { descriptions })}
            />
          </div>
        )),
      )}
    </div>
  );
}

function updateAd(
  groups: WizardAdGroup[],
  onChange: (groups: WizardAdGroup[]) => void,
  groupIndex: number,
  adIndex: number,
  patch: Partial<WizardAd>,
) {
  const next = [...groups];
  const ads = [...next[groupIndex].ads];
  ads[adIndex] = { ...ads[adIndex], ...patch };
  next[groupIndex] = { ...next[groupIndex], ads };
  onChange(next);
}

function TargetingStep({
  targets,
  onChange,
}: {
  targets: WizardTarget[];
  onChange: (targets: WizardTarget[]) => void;
}) {
  const geos = targets.filter((target) => target.type === "GEO");
  const languages = targets.filter((target) => target.type === "LANGUAGE");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <fieldset>
        <legend className="text-sm text-white">S5 · Geo (MVP)</legend>
        <p className="mt-1 text-xs text-moss-500">Audiences / schedule / device stay schema-ready.</p>
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
                    onChange(
                      event.target.checked
                        ? [...others, { type: "GEO", ...preset, included: true }]
                        : others,
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
        <legend className="text-sm text-white">Languages</legend>
        <div className="mt-3 space-y-2">
          {LANGUAGE_PRESETS.map((preset) => {
            const checked = languages.some(
              (target) => target.criterionText === preset.criterionText && target.included,
            );
            return (
              <label key={preset.criterionText} className="flex items-center gap-2 text-sm text-moss-300">
                <input
                  type="checkbox"
                  className="accent-lime-400"
                  checked={checked}
                  onChange={(event) => {
                    const others = targets.filter(
                      (target) => !(target.type === "LANGUAGE" && target.criterionText === preset.criterionText),
                    );
                    onChange(
                      event.target.checked
                        ? [...others, { type: "LANGUAGE", ...preset, included: true }]
                        : others,
                    );
                  }}
                />
                {preset.valueText}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function BiddingStep({
  groups,
  enhancedCpc,
  onEnhancedCpc,
  onChange,
}: {
  groups: WizardAdGroup[];
  enhancedCpc: boolean;
  onEnhancedCpc: (value: boolean) => void;
  onChange: (groups: WizardAdGroup[]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-moss-400">
        S6 · Manual CPC is the Phase 2 MVP. Maximize conversions / tROAS remain schema-ready and are
        not applied.
      </p>
      <label className="flex items-center gap-2 text-sm text-moss-300">
        <input
          type="checkbox"
          className="accent-lime-400"
          checked={enhancedCpc}
          onChange={(event) => onEnhancedCpc(event.target.checked)}
        />
        Enhanced CPC (still Manual CPC, campaign stays PAUSED)
      </label>
      {groups.map((group, index) => (
        <Field key={`bid-${index}`} label={`${group.name} default CPC (USD)`}>
          <input
            value={group.defaultBidDollars}
            onChange={(event) => {
              const next = [...groups];
              next[index] = { ...group, defaultBidDollars: event.target.value };
              onChange(next);
            }}
            inputMode="decimal"
            className="input font-mono"
          />
        </Field>
      ))}
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
  enhancedCpc,
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
  groups: WizardAdGroup[];
  targets: WizardTarget[];
  enhancedCpc: boolean;
  startDate: string;
  endDate: string;
  confirmPhrase: string;
  confirmRef: RefObject<HTMLInputElement | null>;
  onConfirm: (value: string) => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-moss-400">
        S7 · Review, then validate (preferred) or type {CONFIRM_PAUSED_PHRASE} to apply PAUSED.
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
            {name} · ${budgetDollars}/day · PAUSED · Manual CPC
            {enhancedCpc ? " + eCPC" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Dates</dt>
          <dd className="font-mono text-moss-300">
            {startDate || "unset"} → {endDate || "unset"}
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Targeting</dt>
          <dd className="text-moss-300">
            {targets.map((target) => `${target.type}:${target.valueText}`).join(", ") || "none"}
          </dd>
        </div>
      </dl>
      <ul className="space-y-2 text-moss-300">
        {groups.map((group) => (
          <li key={group.name} className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2">
            <span className="text-white">{group.name}</span> · bid ${group.defaultBidDollars} ·{" "}
            {group.keywords.length} keywords · {group.ads.length} RSA
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="text-amber-400">
          Type {CONFIRM_PAUSED_PHRASE} only if you are applying. Validate does not need this.
        </span>
        <input
          ref={confirmRef}
          data-testid="wizard-confirm"
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
    return <p className="text-sm text-moss-500">S8 · Run validate or Create PAUSED from review to see a result.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-white">
        S8 · {result.ok ? (result.applied ? "Applied PAUSED" : "Validated") : "Failed"}{" "}
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
