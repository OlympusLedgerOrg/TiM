import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '@ui5/webcomponents-fiori/dist/ShellBar.js';
import '@ui5/webcomponents/dist/Button.js';
import '@ui5/webcomponents/dist/MessageStrip.js';
import { getDispatchBoard, type DispatchBoard, type DispatchTruck } from '../services/fieldServiceService';
import '../styles/dispatch.css';

function formatServiceType(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Unscheduled';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function CapacityBar({ truck }: { truck: DispatchTruck }) {
  const percent = Math.min(100, Math.round((truck.onboardGallons / truck.tankCapacityGallons) * 100));
  const reservedPercent = Math.min(
    100 - percent,
    Math.round((truck.reservedGallons / truck.tankCapacityGallons) * 100),
  );

  return (
    <div className="dispatch-capacity" aria-label={`${truck.unitNumber} is ${percent}% loaded`}>
      <div className="dispatch-capacity__track">
        <span className="dispatch-capacity__onboard" style={{ width: `${percent}%` }} />
        <span
          className="dispatch-capacity__reserved"
          style={{ left: `${percent}%`, width: `${reservedPercent}%` }}
        />
      </div>
      <div className="dispatch-capacity__labels">
        <span>{truck.onboardGallons.toLocaleString()} gal onboard</span>
        <strong>{truck.dispatchableGallons.toLocaleString()} gal dispatchable</strong>
      </div>
    </div>
  );
}

export default function DispatchDashboard() {
  const [board, setBoard] = useState<DispatchBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setBoard(await getDispatchBoard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dispatch operations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const workOrders = board?.workOrders ?? [];
    return {
      calls: board?.callIntakes.length ?? 0,
      unassigned: workOrders.filter((workOrder) => !workOrder.assignedTruck).length,
      emergency: workOrders.filter((workOrder) => workOrder.priority === 'EMERGENCY').length,
      gallons: workOrders.reduce((sum, workOrder) => sum + workOrder.estimatedGallons, 0),
    };
  }, [board]);

  return (
    <div className="dispatch-page">
      <ui5-shellbar
        primary-title="TiM Field Operations"
        secondary-title="Call intake · dispatch · routes · gallons"
        show-notifications
      />

      <main className="dispatch-main">
        <header className="dispatch-heading">
          <div>
            <p className="dispatch-eyebrow">Operations control</p>
            <h1>Dispatch board</h1>
            <p>Call Guard feeds the triage queue. TiM owns the customer, job, route, truck, evidence, and load record.</p>
          </div>
          <ui5-button design="Emphasized" onClick={() => void load()} disabled={loading}>Refresh</ui5-button>
        </header>

        {error && <ui5-message-strip design="Negative">{error}</ui5-message-strip>}

        <section className="dispatch-stats" aria-label="Dispatch summary">
          <article><span>New calls</span><strong>{stats.calls}</strong></article>
          <article><span>Unassigned jobs</span><strong>{stats.unassigned}</strong></article>
          <article><span>Emergency jobs</span><strong>{stats.emergency}</strong></article>
          <article><span>Estimated gallons</span><strong>{stats.gallons.toLocaleString()}</strong></article>
        </section>

        {loading && !board ? (
          <div className="dispatch-loading">Loading field operations…</div>
        ) : (
          <div className="dispatch-grid">
            <section className="dispatch-panel dispatch-panel--wide">
              <div className="dispatch-panel__header">
                <div><h2>Fleet capacity</h2><p>Onboard volume plus committed route volume.</p></div>
              </div>
              <div className="dispatch-trucks">
                {(board?.trucks ?? []).map((truck) => (
                  <article className="dispatch-truck" key={truck.id}>
                    <div className="dispatch-truck__title">
                      <div><strong>Truck {truck.unitNumber}</strong><span>{truck.assignedDriver?.name ?? 'No driver assigned'}</span></div>
                      <span className={`dispatch-status dispatch-status--${truck.status.toLowerCase()}`}>{truck.status.replaceAll('_', ' ')}</span>
                    </div>
                    <CapacityBar truck={truck} />
                    <div className="dispatch-truck__meta">
                      <span>{truck.tankCapacityGallons.toLocaleString()} gal capacity</span>
                      <span>{truck.reservedGallons.toLocaleString()} gal reserved</span>
                      <span>{truck.homeYard ?? 'No home yard'}</span>
                    </div>
                  </article>
                ))}
                {(board?.trucks.length ?? 0) === 0 && <p className="dispatch-empty">No trucks have been entered yet.</p>}
              </div>
            </section>

            <section className="dispatch-panel">
              <div className="dispatch-panel__header"><div><h2>Call Guard queue</h2><p>Calls waiting for dispatcher review.</p></div></div>
              <div className="dispatch-call-list">
                {(board?.callIntakes ?? []).map((call) => (
                  <article key={call.id}>
                    <div><strong>{call.callerName ?? call.callerPhone}</strong><span>{call.priority}</span></div>
                    <p>{call.summary}</p>
                    <small>{call.callerPhone} · {formatDateTime(call.receivedAt)}</small>
                  </article>
                ))}
                {(board?.callIntakes.length ?? 0) === 0 && <p className="dispatch-empty">No calls waiting for triage.</p>}
              </div>
            </section>

            <section className="dispatch-panel dispatch-panel--full">
              <div className="dispatch-panel__header"><div><h2>Open work orders</h2><p>Every active stop, assignment, and gallon estimate.</p></div></div>
              <div className="dispatch-table-wrap">
                <table className="dispatch-table">
                  <thead><tr><th>Work order</th><th>Customer / location</th><th>Service</th><th>Schedule</th><th>Truck / driver</th><th>Gallons</th><th>Status</th></tr></thead>
                  <tbody>
                    {(board?.workOrders ?? []).map((workOrder) => (
                      <tr key={workOrder.id}>
                        <td><strong>{workOrder.workOrderNumber}</strong><small>{workOrder.priority}</small></td>
                        <td><strong>{workOrder.customer.name}</strong><small>{workOrder.serviceLocation.addressLine1}, {workOrder.serviceLocation.city}</small></td>
                        <td>{formatServiceType(workOrder.serviceType)}</td>
                        <td>{formatDateTime(workOrder.scheduledStart)}</td>
                        <td><strong>{workOrder.assignedTruck ? `Truck ${workOrder.assignedTruck.unitNumber}` : 'Unassigned'}</strong><small>{workOrder.assignedDriver?.name ?? 'No driver'}</small></td>
                        <td>{workOrder.estimatedGallons.toLocaleString()}</td>
                        <td><span className={`dispatch-status dispatch-status--${workOrder.status.toLowerCase()}`}>{workOrder.status.replaceAll('_', ' ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(board?.workOrders.length ?? 0) === 0 && <p className="dispatch-empty">No open field work orders.</p>}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
