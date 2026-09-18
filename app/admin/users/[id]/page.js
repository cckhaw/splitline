"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AdminBarList from "@/components/AdminBarList";
import { eventLabel } from "@/lib/adminEvents";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(d) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/me").then((r) => r.json()).then((me) => {
      if (!me.authenticated) { router.push("/admin/login"); return; }
      setReady(true);
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, params.id]);

  async function load() {
    try {
      const res = await fetch(`/api/admin/users/${params.id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Couldn't load that user.");
      setData(body);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!ready) return <div className="shell"><div className="status-line">Loading…</div></div>;

  return (
    <div className="shell">
      <div className="admin-top">
        <span className="wordmark" style={{ cursor: "default" }}>
          <span className="split">ADMIN</span>
        </span>
        <Link href="/admin">Back to dashboard</Link>
      </div>

      {error && <div className="status-line warn" style={{ marginBottom: 16 }}>{error}</div>}

      {data && (
        <>
          <div className="panel">
            <h2>{data.user.name || data.user.email}</h2>
            <div className="hint" style={{ marginTop: 6 }}>
              {data.user.email} · <span className={`admin-tier-badge ${data.user.tier}`}>{data.user.tier}</span>
              {data.user.isTrial ? " (trial)" : ""} · Joined {fmtDate(data.user.createdAt)} · {data.user.activityCount} activities imported
            </div>
          </div>

          <div className="panel">
            <h2>Usage breakdown</h2>
            <div className="hint" style={{ marginTop: -8 }}>
              How many times this user has triggered each tracked action.
            </div>
            <AdminBarList
              data={data.eventCounts}
              labels={Object.fromEntries(Object.keys(data.eventCounts).map((k) => [k, eventLabel(k)]))}
              defaultColor="var(--brand)"
            />
          </div>

          <div className="panel">
            <h2>Recent activity</h2>
            {data.recentEvents.length === 0 ? (
              <div className="hint">No tracked activity yet.</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>Detail</th>
                    <th>Device</th>
                    <th>Browser</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEvents.map((e, i) => (
                    <tr key={i}>
                      <td>{fmtDateTime(e.created_at)}</td>
                      <td>{eventLabel(e.event_type)}</td>
                      <td>{e.metadata ? Object.entries(e.metadata).map(([k, v]) => `${k}: ${v}`).join(", ") : "—"}</td>
                      <td>{e.device_type || "—"}</td>
                      <td>{e.browser || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
