import type { Metadata } from "next";
import type { ReactNode } from "react";

import { OpsSessionProvider } from "@/components/ops-session";
import { OpsShell } from "@/components/ops-shell";

export const metadata: Metadata = {
  title: "Adrunr — ops console",
  description:
    "In-house Google Ads ops. Test Account developer token, paused-by-default campaigns, dry-run preferred.",
};

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ops-shell min-h-screen font-sans text-moss-300">
      <OpsSessionProvider>
        <OpsShell>{children}</OpsShell>
      </OpsSessionProvider>
    </div>
  );
}
