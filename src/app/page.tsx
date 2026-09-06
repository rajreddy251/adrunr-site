import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="marketing-shell">
      <main className="mx-auto max-w-[720px] px-5 py-12 leading-relaxed text-[#202124]">
        <Image src="/logo.png" alt="Adrunr" width={48} height={48} className="mb-4" />
        <h1 className="mb-2 text-4xl font-medium text-brand-500">Adrunr</h1>
        <p className="text-[#5f6368]">Ads operations platform</p>
        <p className="mt-4">
          Adrunr helps advertisers connect Google Ads accounts with OAuth and manage campaigns and
          reporting through the Google Ads API — only for accounts they authorize.
        </p>
        <p className="mt-4">
          Contact: <a className="text-brand-500 underline" href="mailto:red4code@gmail.com">red4code@gmail.com</a>
        </p>
        <p className="mt-4">
          <Link className="text-brand-500 underline" href="/privacy">
            Privacy Policy
          </Link>
          {" · "}
          <Link className="text-brand-500 underline" href="/terms">
            Terms of Service
          </Link>
          {" · "}
          <Link className="text-brand-500 underline" href="/ops">
            Ops console
          </Link>
        </p>
      </main>
    </div>
  );
}
