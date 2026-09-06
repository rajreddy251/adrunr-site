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

import { DEFAULT_ANDROID_APP_ID, DEFAULT_IOS_APP_ID, GEO_PRESETS } from "@/lib/app-draft";
import { hydrateAppWizardFromDraft } from "@/lib/app-wizard-map";
import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import type { AdsAccountView, AppDraftClientView } from "@/lib/types";

type WizardPlatform = {
  platform: "ANDROID" | "IOS";
  appId: string;
  included: boolean;
};

type WizardAd = {
  headlines: string[];
  descriptions: string[];
  assets: Array<{ kind: "MARKETING_IMAGE" | "SQUARE_MARKETING_IMAGE" | "YOUTUBE_VIDEO" | "HTML5"; urlText: string }>;
};

type WizardAdGroup = {
  name: string;
  defaultBidDollars: string;
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
  { id: "A0", title: "Account" },
  { id: "A1", title: "Basics" },
  { id: "A2", title: "App" },
  { id: "A3", title: "Creatives" },
  { id: "A4", title: "Geo" },
  { id: "A5", title: "Review" },
  { id: "A6", title: "Result" },
] as const;

function dollarsToMicros(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000);
}

function emptyGroup(): WizardAdGroup {
  return {
    name: "App installs 1",
    defaultBidDollars: "1.00",
    ads: [
      {
        headlines: ["Install Adrunr", "Download the app", "Get it now"],
        descriptions: [
          "Mobile installs stay PAUSED until you apply from the form.",
          "Android / iOS downloads — validate the full tree first.",
        ],
        assets: [{ kind: "MARKETING_IMAGE", urlText: "https://placehold.co/1200x628/png?text=App" }],
      },
    ],
  };
}

export type AppWizardHandle = {
  getCustomerId: () => string;
  getDraftId: () => string | null;
  persist: () => Promise<string | null>;
  applyDraft: (draft: AppDraftClientView) => void;
};

export const AppWizard = forwardRef<
  AppWizardHandle,
  {
    accounts: AdsAccountView[];
    connected: boolean;
    onFinished: () => Promise<void> | void;
  }
>(function AppWizard({ accounts, connected, onFinished }, ref) {
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<WizardResult | null>(null);

  const selectable = useMemo(() => accounts.filter((account) => !account.manager), [accounts]);
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("Adrunr paused App");
  const [budgetDollars, setBudgetDollars] = useState("1.00");
  const [goal, setGoal] = useState<"INSTALLS" | "IN_APP_ACTIONS">("INSTALLS");
  const [targetCpaDollars, setTargetCpaDollars] = useState("2.00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [platforms, setPlatforms] = useState<WizardPlatform[]>([
    { platform: "ANDROID", appId: DEFAULT_ANDROID_APP_ID, included: true },
    { platform: "IOS", appId: DEFAULT_IOS_APP_ID, included: false },
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
      biddingStrategy: "TARGET_CPA",
      goal,
      targetCpaMicros: dollarsToMicros(targetCpaDollars),
      startDate: startDate || null,
      endDate: endDate || null,
      status: "PAUSED",
      platforms,
      adGroups: groups.map((group, index) => ({
        name: group.name,
        defaultBidMicros: dollarsToMicros(group.defaultBidDollars),
        sortOrder: index,
        ads: group.ads,
      })),
      targets,
    };
  }

  function applyDraft(draft: AppDraftClientView) {
    const next = hydrateAppWizardFromDraft(draft);
    setDraftId(next.draftId);
    setCustomerId(next.customerId);
    setName(next.name);
    setBudgetDollars(next.budgetDollars);
    setGoal(next.goal);
    setTargetCpaDollars(next.targetCpaDollars);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setPlatforms(next.platforms.length ? next.platforms : platforms);
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
    [customerId, draftId, name, budgetDollars, goal, targetCpaDollars, startDate, endDate, platforms, groups, targets],
  );

  async function persistDraft(): Promise<string | null> {
    const body = payload();
    const res = await fetch(draftId ? `/api/ads/app/drafts/${draftId}` : "/api/ads/app/drafts", {
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
    const res = await fetch(`/api/ads/app/drafts/${id}/${kind}`, {
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
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="app-wizard">
      <h2 className="text-lg text-white">App wizard (PAUSED)</h2>
      <p className="mt-1 text-sm text-moss-400">
        Schema v1.10 drafts in Neon. App id + Android / iOS platforms + install / download goal as TEXT
        children. Validate is a full-tree <code className="font-mono text-moss-300">validateOnly</code> dry-run.
        Apply still creates PAUSED only — there is no enable path.
      </p>

      <ol className="mt-4 flex flex-wrap gap-2" aria-label="App wizard steps">
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
          <BasicsStep
            name={name}
            budgetDollars={budgetDollars}
            goal={goal}
            targetCpaDollars={targetCpaDollars}
            startDate={startDate}
            endDate={endDate}
            onName={setName}
            onBudget={setBudgetDollars}
            onGoal={setGoal}
            onCpa={setTargetCpaDollars}
            onStart={setStartDate}
            onEnd={setEndDate}
          />
        ) : null}
        {step === 2 ? <PlatformsStep platforms={platforms} onChange={setPlatforms} /> : null}
        {step === 3 ? <CreativesStep groups={groups} onChange={setGroups} /> : null}
        {step === 4 ? <GeoStep targets={targets} onTargets={setTargets} /> : null}
        {step === 5 ? (
          <ReviewStep
            customerId={customerId}
            selected={selected}
            name={name}
            budgetDollars={budgetDollars}
            goal={goal}
            targetCpaDollars={targetCpaDollars}
            platforms={platforms}
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
              data-testid="app-wizard-validate"
              onClick={() => void runAction("validate")}
              disabled={!connected || busy}
              className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
            >
              {busy ? "Working…" : "Validate (dry-run)"}
            </button>
            <button
              type="button"
              data-testid="app-wizard-apply"
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
      <legend className="text-sm text-white">A0 · Select customer</legend>
      <div className="mt-3 space-y-2">
        {accounts.map((account) => (
          <label key={account.customerId} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="radio"
              name="app-wizard-customer"
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
  goal,
  targetCpaDollars,
  startDate,
  endDate,
  onName,
  onBudget,
  onGoal,
  onCpa,
  onStart,
  onEnd,
}: {
  name: string;
  budgetDollars: string;
  goal: "INSTALLS" | "IN_APP_ACTIONS";
  targetCpaDollars: string;
  startDate: string;
  endDate: string;
  onName: (value: string) => void;
  onBudget: (value: string) => void;
  onGoal: (value: "INSTALLS" | "IN_APP_ACTIONS") => void;
  onCpa: (value: string) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-moss-400">
        A1 · Install / download campaigns use TARGET_CPA. In-app actions stay schema-ready and are not
        applied in App MVP.
      </p>
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
        <Field label="Goal">
          <select
            value={goal}
            onChange={(event) => onGoal(event.target.value as "INSTALLS" | "IN_APP_ACTIONS")}
            className="input"
          >
            <option value="INSTALLS">INSTALLS (downloads)</option>
            <option value="IN_APP_ACTIONS">IN_APP_ACTIONS (stored)</option>
          </select>
        </Field>
        <Field label="Target CPA / CPI (USD)">
          <input
            value={targetCpaDollars}
            onChange={(event) => onCpa(event.target.value)}
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
    </div>
  );
}

function PlatformsStep({
  platforms,
  onChange,
}: {
  platforms: WizardPlatform[];
  onChange: (platforms: WizardPlatform[]) => void;
}) {
  function upsert(platform: "ANDROID" | "IOS", patch: Partial<WizardPlatform>) {
    const existing = platforms.find((item) => item.platform === platform);
    const next = existing
      ? platforms.map((item) => (item.platform === platform ? { ...item, ...patch } : item))
      : [
          ...platforms,
          {
            platform,
            appId: platform === "ANDROID" ? DEFAULT_ANDROID_APP_ID : DEFAULT_IOS_APP_ID,
            included: true,
            ...patch,
          },
        ];
    onChange(next);
  }
  const android = platforms.find((item) => item.platform === "ANDROID");
  const ios = platforms.find((item) => item.platform === "IOS");
  return (
    <div className="space-y-5">
      <p className="text-sm text-moss-400">
        A2 · Platforms + app ids. Apply uses the first included Android package (or iOS App Store id).
        Dual-store rows stay stored.
      </p>
      <label className="flex items-center gap-2 text-sm text-moss-300">
        <input
          type="checkbox"
          className="accent-lime-400"
          checked={Boolean(android?.included)}
          onChange={(event) => upsert("ANDROID", { included: event.target.checked })}
        />
        Android (Google Play)
      </label>
      <Field label="Android package name">
        <input
          value={android?.appId ?? ""}
          onChange={(event) => upsert("ANDROID", { appId: event.target.value, included: android?.included ?? true })}
          className="input font-mono"
          placeholder={DEFAULT_ANDROID_APP_ID}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-moss-300">
        <input
          type="checkbox"
          className="accent-lime-400"
          checked={Boolean(ios?.included)}
          onChange={(event) => upsert("IOS", { included: event.target.checked })}
        />
        iOS (App Store)
      </label>
      <Field label="iOS App Store id">
        <input
          value={ios?.appId ?? ""}
          onChange={(event) => upsert("IOS", { appId: event.target.value, included: ios?.included ?? true })}
          className="input font-mono"
          placeholder={DEFAULT_IOS_APP_ID}
        />
      </Field>
    </div>
  );
}

function CreativesStep({
  groups,
  onChange,
}: {
  groups: WizardAdGroup[];
  onChange: (groups: WizardAdGroup[]) => void;
}) {
  const group = groups[0] ?? emptyGroup();
  const ad = group.ads[0] ?? emptyGroup().ads[0];
  return (
    <div className="space-y-5">
      <p className="text-sm text-moss-400">
        A3 · App ad headlines / descriptions. Images stay stored; HTML5 is schema-ready and not applied.
      </p>
      <Field label="Ad group name">
        <input
          value={group.name}
          onChange={(event) => onChange([{ ...group, name: event.target.value, ads: [ad] }])}
          className="input"
        />
      </Field>
      <Field label="Headlines (one per line, ≤ 30 chars)">
        <textarea
          value={ad.headlines.join("\n")}
          onChange={(event) =>
            onChange([
              {
                ...group,
                ads: [{ ...ad, headlines: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }],
              },
            ])
          }
          rows={4}
          className="input font-mono"
        />
      </Field>
      <Field label="Descriptions (one per line, ≤ 90 chars)">
        <textarea
          value={ad.descriptions.join("\n")}
          onChange={(event) =>
            onChange([
              {
                ...group,
                ads: [
                  {
                    ...ad,
                    descriptions: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
                  },
                ],
              },
            ])
          }
          rows={3}
          className="input font-mono"
        />
      </Field>
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
      <legend className="text-sm text-white">A4 · Geo (MVP)</legend>
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

function ReviewStep({
  customerId,
  selected,
  name,
  budgetDollars,
  goal,
  targetCpaDollars,
  platforms,
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
  goal: string;
  targetCpaDollars: string;
  platforms: WizardPlatform[];
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
        A5 · Review, then validate (preferred) or type {CONFIRM_PAUSED_PHRASE} to apply PAUSED.
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
            {name} · ${budgetDollars}/day · PAUSED · App · TARGET_CPA ${targetCpaDollars} · {goal}
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Platforms</dt>
          <dd className="font-mono text-moss-300">
            {platforms
              .filter((item) => item.included)
              .map((item) => `${item.platform}:${item.appId}`)
              .join(" · ") || "none"}
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
            <span className="text-white">{group.name}</span> · {group.ads[0]?.headlines.length ?? 0} headlines
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="text-amber-400">
          Type {CONFIRM_PAUSED_PHRASE} only if you are applying. Validate does not need this.
        </span>
        <input
          ref={confirmRef}
          data-testid="app-wizard-confirm"
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
    return <p className="text-sm text-moss-500">A6 · Run validate or Create PAUSED from review to see a result.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-white">
        A6 · {result.ok ? (result.applied ? "Applied PAUSED" : "Validated") : "Failed"}{" "}
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
