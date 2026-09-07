"use client";

import { ImportPanel } from "@/components/import-panel";
import { useOpsSession } from "@/components/ops-session";

export function OpsImport() {
  const { selectedId, status, refreshAudit } = useOpsSession();
  return <ImportPanel customerId={selectedId} connected={status.connected} onFinished={refreshAudit} />;
}
