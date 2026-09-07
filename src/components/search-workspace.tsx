"use client";

import { useRef, useState } from "react";

import { AppWizard, type AppWizardHandle } from "@/components/app-wizard";
import { DemandGenWizard, type DemandGenWizardHandle } from "@/components/demand-gen-wizard";
import { DisplayWizard, type DisplayWizardHandle } from "@/components/display-wizard";
import { HotelWizard, type HotelWizardHandle } from "@/components/hotel-wizard";
import { LocalServicesWizard, type LocalServicesWizardHandle } from "@/components/local-services-wizard";
import { LocalWizard, type LocalWizardHandle } from "@/components/local-wizard";
import { PmaxWizard, type PmaxWizardHandle } from "@/components/pmax-wizard";
import { SearchAssistant } from "@/components/search-assistant";
import { SearchWizard, type SearchWizardHandle } from "@/components/search-wizard";
import { ShoppingWizard, type ShoppingWizardHandle } from "@/components/shopping-wizard";
import { VideoWizard, type VideoWizardHandle } from "@/components/video-wizard";
import type { AdsAccountView, AssistantCampaignKind } from "@/lib/types";

export function SearchWorkspace({
  accounts,
  connected,
  onFinished,
}: {
  accounts: AdsAccountView[];
  connected: boolean;
  onFinished: () => Promise<void> | void;
}) {
  const [kind, setKind] = useState<AssistantCampaignKind>("SEARCH");
  const searchRef = useRef<SearchWizardHandle>(null);
  const displayRef = useRef<DisplayWizardHandle>(null);
  const pmaxRef = useRef<PmaxWizardHandle>(null);
  const demandGenRef = useRef<DemandGenWizardHandle>(null);
  const videoRef = useRef<VideoWizardHandle>(null);
  const shoppingRef = useRef<ShoppingWizardHandle>(null);
  const appRef = useRef<AppWizardHandle>(null);
  const hotelRef = useRef<HotelWizardHandle>(null);
  const localRef = useRef<LocalWizardHandle>(null);
  const localServicesRef = useRef<LocalServicesWizardHandle>(null);
  return (
    <section className="space-y-4" data-testid="ops-create-workspace">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Campaign type">
        <KindTab kind="SEARCH" current={kind} onSelect={setKind} testId="ops-kind-search" label="Search" />
        <KindTab kind="DISPLAY" current={kind} onSelect={setKind} testId="ops-kind-display" label="Display" />
        <KindTab kind="PMAX" current={kind} onSelect={setKind} testId="ops-kind-pmax" label="Performance Max" />
        <KindTab
          kind="DEMAND_GEN"
          current={kind}
          onSelect={setKind}
          testId="ops-kind-demand-gen"
          label="Demand Gen"
        />
        <KindTab kind="VIDEO" current={kind} onSelect={setKind} testId="ops-kind-video" label="Video" />
        <KindTab kind="SHOPPING" current={kind} onSelect={setKind} testId="ops-kind-shopping" label="Shopping" />
        <KindTab kind="APP" current={kind} onSelect={setKind} testId="ops-kind-app" label="App" />
        <KindTab kind="HOTEL" current={kind} onSelect={setKind} testId="ops-kind-hotel" label="Hotel" />
        <KindTab kind="LOCAL" current={kind} onSelect={setKind} testId="ops-kind-local" label="Local" />
        <KindTab
          kind="LOCAL_SERVICES"
          current={kind}
          onSelect={setKind}
          testId="ops-kind-local-services"
          label="Local Services"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        {kind === "SEARCH" ? (
          <>
            <SearchWizard ref={searchRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={searchRef} connected={connected} kind="SEARCH" />
          </>
        ) : kind === "DISPLAY" ? (
          <>
            <DisplayWizard ref={displayRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={displayRef} connected={connected} kind="DISPLAY" />
          </>
        ) : kind === "PMAX" ? (
          <>
            <PmaxWizard ref={pmaxRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={pmaxRef} connected={connected} kind="PMAX" />
          </>
        ) : kind === "DEMAND_GEN" ? (
          <>
            <DemandGenWizard
              ref={demandGenRef}
              accounts={accounts}
              connected={connected}
              onFinished={onFinished}
            />
            <SearchAssistant wizard={demandGenRef} connected={connected} kind="DEMAND_GEN" />
          </>
        ) : kind === "VIDEO" ? (
          <>
            <VideoWizard ref={videoRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={videoRef} connected={connected} kind="VIDEO" />
          </>
        ) : kind === "SHOPPING" ? (
          <>
            <ShoppingWizard
              ref={shoppingRef}
              accounts={accounts}
              connected={connected}
              onFinished={onFinished}
            />
            <SearchAssistant wizard={shoppingRef} connected={connected} kind="SHOPPING" />
          </>
        ) : kind === "APP" ? (
          <>
            <AppWizard ref={appRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={appRef} connected={connected} kind="APP" />
          </>
        ) : kind === "HOTEL" ? (
          <>
            <HotelWizard ref={hotelRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={hotelRef} connected={connected} kind="HOTEL" />
          </>
        ) : kind === "LOCAL" ? (
          <>
            <LocalWizard ref={localRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={localRef} connected={connected} kind="LOCAL" />
          </>
        ) : (
          <>
            <LocalServicesWizard
              ref={localServicesRef}
              accounts={accounts}
              connected={connected}
              onFinished={onFinished}
            />
            <SearchAssistant wizard={localServicesRef} connected={connected} kind="LOCAL_SERVICES" />
          </>
        )}
      </div>
    </section>
  );
}

function KindTab({
  kind,
  current,
  onSelect,
  testId,
  label,
}: {
  kind: AssistantCampaignKind;
  current: AssistantCampaignKind;
  onSelect: (kind: AssistantCampaignKind) => void;
  testId: string;
  label: string;
}) {
  const selected = kind === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-testid={testId}
      onClick={() => onSelect(kind)}
      className={`rounded-full px-4 py-1.5 font-mono text-xs ${
        selected ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
      }`}
    >
      {label}
    </button>
  );
}
