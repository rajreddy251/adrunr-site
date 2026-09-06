import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Adrunr — ops console",
  description:
    "In-house Google Ads ops. Test Account developer token, paused-by-default campaigns, dry-run preferred.",
};

export default function OpsLayout({ children }: { children: ReactNode }) {
  return <div className="ops-shell min-h-screen font-sans text-moss-300">{children}</div>;
}
