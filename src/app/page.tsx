import Image from "next/image";
import Link from "next/link";

import { SAFETY_COPY } from "@/lib/safety";

const CONTACT_EMAIL = "red4code@gmail.com";

const CAPABILITIES = [
  {
    kicker: "01",
    title: "Connect what you authorize",
    body: "OAuth for Google Ads — and GA4 readonly on the same grant. Tokens are encrypted in Postgres. There is no file-token path, and Adrunr only touches accounts you approve.",
  },
  {
    kicker: "02",
    title: "Operate without autopilot",
    body: "Create Search, Display, Performance Max, Demand Gen, and Video campaigns as PAUSED. Dry-run (validateOnly) is the default. There is no enable or go-live action, so a budgeted campaign still cannot spend until you enable it outside Adrunr.",
  },
  {
    kicker: "03",
    title: "Grow across channels",
    body: "Google Ads is live today. GA4, Microsoft Clarity, Meta, TikTok, LinkedIn, Heartza, and Custom sit on the same provider registry — schema-ready stubs, not a rewrite later.",
  },
] as const;

const PROVIDERS = [
  {
    name: "Google Ads",
    slug: "google_ads",
    category: "ADS",
    status: "Live",
    note: "OAuth connect implemented",
  },
  {
    name: "Google Analytics (GA4)",
    slug: "google_analytics",
    category: "ANALYTICS",
    status: "Stub",
    note: "Readonly sample reports",
  },
  {
    name: "Microsoft Clarity",
    slug: "microsoft_clarity",
    category: "HEATMAP",
    status: "Ready",
    note: "Schema-ready stub",
  },
  {
    name: "Meta Ads",
    slug: "meta_ads",
    category: "ADS",
    status: "Ready",
    note: "Schema-ready stub",
  },
  {
    name: "TikTok Ads",
    slug: "tiktok_ads",
    category: "ADS",
    status: "Ready",
    note: "Schema-ready stub",
  },
  {
    name: "LinkedIn Ads",
    slug: "linkedin_ads",
    category: "ADS",
    status: "Ready",
    note: "Schema-ready stub",
  },
  {
    name: "Heartza",
    slug: "heartza",
    category: "OTHER",
    status: "Ready",
    note: "Schema-ready stub",
  },
  {
    name: "Custom / future",
    slug: "custom",
    category: "OTHER",
    status: "Ready",
    note: "Schema-ready stub",
  },
] as const;

const HERO_CHANNELS = [
  { label: "Google Ads", live: true },
  { label: "GA4", live: false },
  { label: "Clarity", live: false },
  { label: "Meta", live: false },
  { label: "TikTok", live: false },
  { label: "LinkedIn", live: false },
] as const;

function statusTone(status: (typeof PROVIDERS)[number]["status"]) {
  if (status === "Live") return "bg-lime-400 text-ink-950";
  if (status === "Stub") return "bg-ink-950/6 text-moss-600";
  return "border border-ink-950/12 text-moss-500";
}

export default function HomePage() {
  return (
    <div className="marketing-shell">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-lime-400 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-950"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-ink-950/8 bg-[#f6f7f3]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Adrunr" width={36} height={36} priority className="rounded-md" />
            <span className="text-[15px] font-semibold tracking-tight text-ink-950">Adrunr</span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-4 text-sm sm:gap-5">
            <Link className="text-moss-500 transition-colors hover:text-ink-950" href="/privacy">
              Privacy
            </Link>
            <Link className="text-moss-500 transition-colors hover:text-ink-950" href="/terms">
              Terms
            </Link>
            <Link href="/ops" className="marketing-cta marketing-cta-compact">
              Ops console
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 md:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] md:gap-14 md:pb-24 md:pt-20">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-moss-500">
              Ads operations platform
            </p>
            <h1 className="mt-4 max-w-[14ch] text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-ink-950 sm:text-6xl">
              Campaign ops for agencies and advertisers.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-7 text-moss-500">
              Connect Google Ads with OAuth, run paused and dry-run campaign work, and keep reporting
              on a multi-channel foundation — only for accounts you authorize. Google Ads is live.
              GA4, Clarity, Meta, TikTok, and LinkedIn are schema-ready.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Supported channels">
              {HERO_CHANNELS.map((channel) => (
                <li
                  key={channel.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-950/10 bg-white px-2.5 py-1 font-mono text-[11px] text-moss-600"
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${channel.live ? "bg-lime-500" : "bg-ink-950/20"}`}
                  />
                  {channel.label}
                  {channel.live ? <span className="text-moss-500">live</span> : null}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/ops" className="marketing-cta">
                Open ops console
              </Link>
              <a href={`mailto:${CONTACT_EMAIL}`} className="marketing-cta-secondary">
                Contact
              </a>
            </div>
            <p className="mt-5 font-mono text-[12px] leading-5 text-moss-500">{SAFETY_COPY.headline}</p>
          </div>

          <aside aria-label="Product preview" className="marketing-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-950/8 px-5 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-moss-500">Safety first</p>
              <span className="rounded-full bg-lime-400 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-950">
                Paused · dry-run
              </span>
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-lg font-semibold leading-snug text-ink-950">{SAFETY_COPY.headline}</p>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-moss-500">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                  <span>
                    New campaigns are created <span className="font-mono text-ink-950">PAUSED</span>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                  <span>
                    Dry-run / <span className="font-mono text-ink-950">validateOnly</span> is the default
                    path.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                  <span>No spend without an explicit confirm — and no enable action in-app.</span>
                </li>
              </ul>
              <div className="mt-6 grid gap-2">
                {PROVIDERS.slice(0, 3).map((provider) => (
                  <div
                    key={provider.slug}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ink-950/8 bg-[#f6f7f3] px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink-950">{provider.name}</p>
                      <p className="font-mono text-[11px] text-moss-500">
                        {provider.slug} · {provider.category}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${statusTone(provider.status)}`}
                    >
                      {provider.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="border-t border-ink-950/8">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-moss-500">What it does</p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
              Tools for operators, not a black box.
            </h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <article key={item.kicker} className="marketing-card p-6 sm:p-7">
                  <p className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-lime-400 px-1.5 font-mono text-[11px] font-medium text-ink-950">
                    {item.kicker}
                  </p>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-moss-500">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ink-950/8">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-moss-500">Safety</p>
            <div className="marketing-callout mt-5 p-6 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight text-ink-950">{SAFETY_COPY.headline}</h2>
              <ul className="mt-5 list-disc space-y-2.5 pl-5 text-sm leading-6 text-moss-600">
                {SAFETY_COPY.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-ink-950/8">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-moss-500">Providers</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
              Multi-channel from day one.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-moss-500">
              Seeded registry rows, same shape as the ops console. Google Ads Connect is implemented.
              Clarity, Meta, TikTok, LinkedIn, Heartza, and Custom are schema-ready stubs.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PROVIDERS.map((provider) => (
                <article key={provider.slug} className="marketing-card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[15px] font-semibold leading-snug text-ink-950">{provider.name}</h3>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${statusTone(provider.status)}`}
                    >
                      {provider.status}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-moss-500">
                    {provider.slug} · {provider.category}
                  </p>
                  <p className="mt-auto pt-5 text-sm text-moss-500">{provider.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ink-950/8">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
            <div className="marketing-card px-6 py-12 sm:px-10 md:px-14 md:py-16">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-moss-500">Next step</p>
              <h2 className="mt-4 max-w-lg text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
                Open the ops console.
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-moss-500">
                Connect an authorized Google Ads account, list customers, and validate a paused Search
                campaign. Questions about access or onboarding go to{" "}
                <a className="font-medium text-ink-950 underline decoration-lime-400 underline-offset-4 hover:decoration-lime-500" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/ops" className="marketing-cta">
                  Open ops console
                </Link>
                <a href={`mailto:${CONTACT_EMAIL}`} className="marketing-cta-secondary">
                  Email {CONTACT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-950/8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-moss-500">
            Contact:{" "}
            <a className="font-medium text-ink-950 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="text-sm text-moss-500">
            <Link className="hover:text-ink-950 hover:underline" href="/privacy">
              Privacy Policy
            </Link>
            {" · "}
            <Link className="hover:text-ink-950 hover:underline" href="/terms">
              Terms of Service
            </Link>
            {" · "}
            <Link className="hover:text-ink-950 hover:underline" href="/ops">
              Ops console
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
