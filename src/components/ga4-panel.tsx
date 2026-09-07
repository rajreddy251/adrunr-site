"use client";

import { useOpsSession } from "@/components/ops-session";
import { GA4_CONNECT_NOTE, GA4_KEY_EVENTS_NOTE } from "@/lib/ga4-shared";

export function Ga4Panel({ compact = false }: { compact?: boolean }) {
  const {
    status,
    ga4,
    ga4Properties,
    ga4Warnings,
    ga4Error,
    selectedGa4PropertyId,
    setSelectedGa4PropertyId,
    bindGa4Property,
    loadGa4Properties,
    loadGa4,
    busy,
    disconnect,
  } = useOpsSession();

  const connected = status.ga4Connected || status.connected;
  const selected = ga4Properties.find((property) => property.propertyId === selectedGa4PropertyId);
  const bound = ga4Properties.find((property) => property.bound) ?? null;
  const connectHref = "/api/auth/google?next=/ops/analytics";

  return (
    <article className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-connect-ga4">
      <h2 className="text-lg text-paper-50">{compact ? "GA4 Connect" : "Google Analytics 4"}</h2>
      <p className="mt-1 text-sm text-moss-400">{GA4_CONNECT_NOTE}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-moss-500">Status</dt>
          <dd className="font-mono text-moss-300">
            {connected ? "connected" : "not connected"}
            {status.mockMode ? " · mock" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-moss-500">Bound property</dt>
          <dd className="font-mono text-moss-300">
            {bound
              ? `${bound.displayName} · ${bound.resourceName}`
              : status.ga4BoundDisplayName
                ? `${status.ga4BoundDisplayName} · properties/${status.ga4BoundPropertyId}`
                : "none"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        {connected ? (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={busy === "disconnect"}
            className="ops-btn-danger"
          >
            Disconnect
          </button>
        ) : (
          <a href={connectHref} className="ops-btn-primary">
            Connect GA4
          </a>
        )}
        <button
          type="button"
          onClick={() => void loadGa4Properties(connected)}
          disabled={!connected || busy === "ga4-bind"}
          className="ops-btn-secondary"
        >
          List properties
        </button>
      </div>

      {ga4Error ? <p className="mt-3 text-sm text-coral-400">{ga4Error}</p> : null}
      {ga4Warnings.map((warning) => (
        <p key={warning} className="mt-2 text-sm text-amber-400">
          {warning}
        </p>
      ))}

      <div className="mt-5 space-y-3">
        <label className="block text-sm text-moss-400" htmlFor="ga4-property-picker">
          Property
        </label>
        <select
          id="ga4-property-picker"
          data-testid="ga4-property-picker"
          className="input"
          value={selectedGa4PropertyId}
          disabled={!connected || ga4Properties.length === 0}
          onChange={(event) => setSelectedGa4PropertyId(event.target.value)}
        >
          {ga4Properties.length === 0 ? (
            <option value="">No properties</option>
          ) : (
            ga4Properties.map((property) => (
              <option key={property.propertyId} value={property.propertyId}>
                {property.displayName}
                {property.accountName ? ` · ${property.accountName}` : ""} · {property.resourceName}
                {property.bound ? " · bound" : ""}
              </option>
            ))
          )}
        </select>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="ga4-bind"
            onClick={() => void bindGa4Property(selectedGa4PropertyId)}
            disabled={!connected || !selectedGa4PropertyId || busy === "ga4-bind"}
            className="ops-btn-primary"
          >
            {busy === "ga4-bind" ? "Binding…" : "Bind property"}
          </button>
          <button
            type="button"
            onClick={() => void loadGa4(selectedGa4PropertyId)}
            disabled={!connected || !selectedGa4PropertyId}
            className="ops-btn-secondary"
          >
            Refresh sessions
          </button>
        </div>
        {selected ? (
          <p className="font-mono text-xs text-moss-500">
            Selected {selected.resourceName}
            {selected.bound ? " · bound" : " · not bound yet"}
          </p>
        ) : null}
      </div>

      <section className="mt-6 rounded-xl border border-ink-700 bg-ink-800 p-4" data-testid="ga4-sessions-report">
        <h3 className="text-sm text-paper-50">Sessions last 7 days</h3>
        {ga4 ? (
          <div className="mt-3 space-y-3">
            <p className="font-mono text-xs text-moss-500">
              {ga4.source}
              {ga4.softFail ? " · soft-fail" : ""} · property {ga4.report?.propertyId || "unset"}
            </p>
            {ga4.reason ? <p className="text-sm text-amber-400">{ga4.reason}</p> : null}
            {ga4.report?.totals ? (
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Sessions (7d)" value={ga4.report.totals.sessions} />
                <Stat label="Conversions (7d)" value={ga4.report.totals.conversions} />
              </div>
            ) : null}
            {ga4.report?.rows?.length ? (
              <table className="ops-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sessions</th>
                    <th>Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {ga4.report.rows.slice(-7).map((row) => (
                    <tr key={row.date} className="font-mono text-moss-300">
                      <td className="py-1">{row.date}</td>
                      <td className="py-1">{row.sessions}</td>
                      <td className="py-1">{row.conversions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-moss-500">Connect and bind a property to load sessions.</p>
        )}
      </section>

      <p
        className="mt-4 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-moss-400"
        data-testid="ga4-key-events"
      >
        {GA4_KEY_EVENTS_NOTE}. Writes stay behind a later confirm. No spend.
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-950/40 px-3 py-2">
      <p className="text-xs text-moss-500">{label}</p>
      <p className="font-mono text-xl text-paper-50">{value}</p>
    </div>
  );
}
