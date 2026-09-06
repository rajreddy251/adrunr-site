import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Adrunr",
};

export default function TermsPage() {
  return (
    <div className="marketing-shell">
      <main className="mx-auto max-w-[720px] px-5 py-12 leading-relaxed text-[#202124]">
        <p>
          <Link className="text-brand-500 underline" href="/">
            ← Adrunr
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-medium">Terms of Service</h1>
        <p className="mt-2">Last updated: 6 September 2026</p>
        <p className="mt-4">By using Adrunr (https://adrunr.app), you agree to these terms.</p>
        <h2 className="mt-6 text-xl font-medium">Service</h2>
        <p className="mt-2">
          Adrunr provides tools to connect Google Ads accounts via OAuth and to manage campaigns and
          reporting using Google’s APIs. You are responsible for your ad spend, campaign settings,
          and compliance with Google Ads policies.
        </p>
        <h2 className="mt-6 text-xl font-medium">Your account</h2>
        <p className="mt-2">
          You must provide accurate information and keep credentials secure. You may only connect
          Google Ads accounts you are authorized to manage.
        </p>
        <h2 className="mt-6 text-xl font-medium">Acceptable use</h2>
        <p className="mt-2">
          You may not use Adrunr for unauthorized access, abuse of Google APIs, or policy-violating
          advertising.
        </p>
        <h2 className="mt-6 text-xl font-medium">Disclaimer</h2>
        <p className="mt-2">
          Adrunr is provided “as is.” We do not guarantee uninterrupted service or specific
          advertising results.
        </p>
        <h2 className="mt-6 text-xl font-medium">Contact</h2>
        <p className="mt-2">
          <a className="text-brand-500 underline" href="mailto:red4code@gmail.com">
            red4code@gmail.com
          </a>
        </p>
      </main>
    </div>
  );
}
