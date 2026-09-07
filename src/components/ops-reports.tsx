"use client";

import { ReportsPanel } from "@/components/reports-panel";
import { useOpsSession } from "@/components/ops-session";

export function OpsReports() {
  const { selectedId, status, audit, refreshAudit } = useOpsSession();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-medium text-paper-50">Reports</h1>
        <p className="mt-1 text-sm text-moss-400">
          Read-only performance rollups plus the org audit trail. Preview / dry-run first. No enable path.
        </p>
      </header>

      <ReportsPanel customerId={selectedId} connected={status.connected} onFinished={refreshAudit} />

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-audit">
        <h2 className="text-lg text-paper-50">Audit trail</h2>
        <p className="mt-1 text-sm text-moss-400">
          Recent AuditEvent rows for the platform org. Connect, list, dry-run, and blocked mutates are
          recorded as TEXT metadata.
        </p>
        {audit.length === 0 ? (
          <p className="mt-4 text-sm text-moss-500">No events yet. Connect and run a dry-run to populate.</p>
        ) : (
          <ol className="mt-4 space-y-2 font-mono text-xs text-moss-300">
            {audit.map((event) => (
              <li key={event.id} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2">
                <span className="text-moss-500">{event.createdAt}</span>{" "}
                <span className="text-lime-400">{event.action}</span> · {event.resourceType}
                {event.resourceId ? ` · ${event.resourceId}` : ""}
                {event.metadataText ? (
                  <span className="mt-1 block truncate text-moss-500">{event.metadataText}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
