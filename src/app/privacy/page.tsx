import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Adrunr",
};

export default function PrivacyPage() {
  return (
    <div className="marketing-shell">
      <main className="mx-auto max-w-[720px] px-5 py-12 leading-relaxed text-[#202124]">
        <p>
          <Link className="text-brand-500 underline" href="/">
            ← Adrunr
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-medium">Privacy Policy</h1>
        <p className="mt-2">Last updated: 6 September 2026</p>
        <p className="mt-4">
          Adrunr (“we”) provides an ads operations tool. This policy describes how we handle
          information when you use https://adrunr.app and related services.
        </p>
        <h2 className="mt-6 text-xl font-medium">Information we collect</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Account and contact details you provide (such as email).</li>
          <li>OAuth tokens and Google Ads account identifiers when you connect Google Ads.</li>
          <li>Campaign and performance data retrieved from Google APIs for accounts you authorize.</li>
          <li>Basic technical logs (IP, browser, timestamps) for security and reliability.</li>
        </ul>
        <h2 className="mt-6 text-xl font-medium">How we use information</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>To provide campaign management and reporting features you request.</li>
          <li>To operate, secure, and improve Adrunr.</li>
          <li>To communicate about the service (for example support or security notices).</li>
        </ul>
        <h2 className="mt-6 text-xl font-medium">Sharing</h2>
        <p className="mt-2">
          We do not sell personal information. We may use infrastructure providers to host Adrunr.
          We access Google Ads data only through Google’s APIs with your consent.
        </p>
        <h2 className="mt-6 text-xl font-medium">Retention</h2>
        <p className="mt-2">
          We retain connected-account data while your account is active and delete or anonymize it
          when you disconnect or close your account, subject to legal requirements.
        </p>
        <h2 className="mt-6 text-xl font-medium">Your choices</h2>
        <p className="mt-2">
          You can disconnect Google Ads in the product and request deletion by emailing{" "}
          <a className="text-brand-500 underline" href="mailto:red4code@gmail.com">
            red4code@gmail.com
          </a>
          .
        </p>
        <h2 className="mt-6 text-xl font-medium">Contact</h2>
        <p className="mt-2">red4code@gmail.com</p>
      </main>
    </div>
  );
}
