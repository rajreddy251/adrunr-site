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
    body: "Create Search campaigns as PAUSED. Dry-run (validateOnly) is the default. There is no enable or go-live action, so a budgeted campaign still cannot spend until you enable it outside Adrunr.",
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

function statusTone(status: (typeof PROVIDERS)[number]["status"]) {
  if (status === "Live") return "bg-lime-400 text-ink-950";
  if (status === "Stub") return "bg-ink-950/8 text-moss-700";
  return "border border-ink-950/12 text-moss-600";
}

export default function HomePage() {
  return (
    <div className="marketing-shell">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-lime-400 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-950"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-ink-950/8 bg-paper-50/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Adrunr" width={36} height={36} priority className="rounded-md" />
            <span className="text-sm font-semibold tracking-tight text-ink-950">Adrunr</span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-3 text-sm sm:gap-4">
            <Link className="text-moss-600 hover:text-ink-950" href="/privacy">
              Privacy
            </Link>
            <Link className="text-moss-600 hover:text-ink-950" href="/terms">
              Terms
            </Link>
            <Link
              href="/ops"
              className="rounded-md bg-lime-400 px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-lime-500"
            >
              Ops console
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:py-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-moss-500">Ads operations platform</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-ink-950 sm:text-5xl">
              Campaign ops for agencies and advertisers.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-moss-600">
              Connect Google Ads with OAuth, run paused and dry-run campaign work, and keep reporting
              on a multi-channel foundation — only for accounts you authorize. Google Ads is live.
              GA4, Clarity, Meta, TikTok, and LinkedIn are schema-ready.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/ops"
                className="rounded-md bg-lime-400 px-4 py-2.5 text-sm font-medium text-ink-950 hover:bg-lime-500"
              >
                Open ops console
              </Link>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="rounded-md border border-ink-950/12 bg-paper-100 px-4 py-2.5 text-sm font-medium text-ink-950 hover:border-ink-950/25"
              >
                Contact
              </a>
            </div>
            <p className="mt-4 font-mono text-xs text-moss-500">{SAFETY_COPY.headline}</p>
          </div>

          <aside
            aria-label="Product preview"
            className="rounded-lg border border-ink-950/10 bg-paper-100 p-5 shadow-[0_1px_0_rgba(18,23,20,0.04)]"
          >
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss-500">Safety first</p>
            <p className="mt-2 text-lg font-medium text-ink-950">{SAFETY_COPY.headline}</p>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-moss-600">
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                New campaigns are created <span className="font-mono text-ink-950">PAUSED</span>.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                Dry-run / <span className="font-mono text-ink-950">validateOnly</span> is the default path.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                No spend without an explicit confirm — and no enable action in-app.
              </li>
            </ul>
            <div className="mt-5 grid gap-2">
              {PROVIDERS.slice(0, 3).map((provider) => (
                <div
                  key={provider.slug}
                  className="flex items-center justify-between gap-3 rounded-md border border-ink-950/8 bg-paper-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-950">{provider.name}</p>
                    <p className="font-mono text-[11px] text-moss-500">
                      {provider.slug} · {provider.category}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${statusTone(provider.status)}`}>
                    {provider.status}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="border-t border-ink-950/8">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-moss-500">What it does</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
              Tools for operators, not a black box.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <article
                  key={item.kicker}
                  className="rounded-lg border border-ink-950/10 bg-paper-100 p-5"
                >
                  <p className="font-mono text-xs text-moss-500">{item.kicker}</p>
                  <h3 className="mt-3 text-lg font-medium text-ink-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-moss-600">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ink-950/8">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-moss-500">Safety</p>
            <div className="mt-4 rounded-lg border border-amber-400/35 bg-[#fff8e8] p-6">
              <h2 className="text-xl font-semibold text-ink-950">{SAFETY_COPY.headline}</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-moss-700">
                {SAFETY_COPY.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-ink-950/8">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-moss-500">Providers</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
              Multi-channel from day one.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-moss-600">
              Seeded registry rows, same shape as the ops console. Google Ads Connect is implemented.
              Clarity, Meta, TikTok, LinkedIn, Heartza, and Custom are schema-ready stubs.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PROVIDERS.map((provider) => (
                <article
                  key={provider.slug}
                  className="rounded-lg border border-ink-950/10 bg-paper-100 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink-950">{provider.name}</h3>
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${statusTone(provider.status)}`}>
                      {provider.status}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-moss-500">
                    {provider.slug} · {provider.category}
                  </p>
                  <p className="mt-3 text-xs text-moss-600">{provider.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ink-950/8">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="rounded-lg border border-ink-950/10 bg-paper-100 px-6 py-10 md:px-10">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-moss-500">Next step</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
                Open the ops console.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-moss-600">
                Connect an authorized Google Ads account, list customers, and validate a paused
                Search campaign. Questions about access or onboarding go to{" "}
                <a className="font-medium text-ink-950 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/ops"
                  className="rounded-md bg-lime-400 px-4 py-2.5 text-sm font-medium text-ink-950 hover:bg-lime-500"
                >
                  Open ops console
                </Link>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="rounded-md border border-ink-950/12 px-4 py-2.5 text-sm font-medium text-ink-950 hover:border-ink-950/25"
                >
                  Email {CONTACT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-950/8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-moss-600">
            Contact:{" "}
            <a className="text-ink-950 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="text-sm text-moss-600">
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
