"use client";

import { MetricsPanel } from "@/components/metrics-panel";
import { useOpsSession } from "@/components/ops-session";

export function OpsMetrics() {
  const { selectedId, status, refreshAudit } = useOpsSession();
  return <MetricsPanel customerId={selectedId} connected={status.connected} onFinished={refreshAudit} />;
}
