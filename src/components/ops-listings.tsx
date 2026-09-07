"use client";

import { ListingsPanel } from "@/components/listings-panel";
import { useOpsSession } from "@/components/ops-session";

export function OpsListings() {
  const { selectedId, status, refreshAudit } = useOpsSession();
  return <ListingsPanel customerId={selectedId} connected={status.connected} onFinished={refreshAudit} />;
}
