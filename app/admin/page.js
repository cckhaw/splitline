"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminBarList from "@/components/AdminBarList";
import { eventLabel } from "@/lib/adminEvents";

const DEVICE_COLORS = { desktop: "var(--brand2)", mobile: "var(--brand)", tablet: "var(--teal)" };
const BROWSER_COLORS = {
  Chrome: "var(--brand)", Safari: "var(--brand2)", Firefox: "var(--amber)",
  Edge: "var(--teal)", "Samsung Internet": "var(--coral)", Opera: "var(--ink-dim)", Other: "var(--ink-dim)",
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(d) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/me").then((r) => r.json()).then((data) => {
      if (!data.authenticated) { router.push("/admin/login"); return; }
      setReady(true);
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function load() {
    try {
      const [ovRes, usersRes] = await Promise.all([fetch("/api/admin/overview"), fetch("/api/admin/users")]);
      if (!ovRes.ok || !usersRes.ok) throw new Error("Couldn't load admin data.");
      setOverview(await ovRes.json());
      setUsers((await usersRes.json()).users);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (!ready) return <div className="shell"><div className="status-line">Loading…</div></div>;

  const eventTotalsData = overview ? Object.fromEntries(overview.eventTotals.map((r) => [r.event_type, r.n])) : {};
  const eventLabels = overview ? Object.fromEntries(overview.eventTotals.map((r) => [r.event_type, eventLabel(r.event_type)])) : {};

  return (
    <div className="shell">
      <div className="admin-top">
        <span className="wordmark" style={{ cursor: "default" }}>
          <span className="split">ADMIN</span>
        </span>
        <button onClick={handleLogout} style={{ width: "auto", padding: "7px 14px" }}>Log out</button>
      </div>

      {error && <div className="status-line warn" style={{ marginBottom: 16 }}>{error}</div>}

      {overview && (
        <>
          <div className="panel">
            <h2>Users</h2>
            <div className="admin-stat-grid">
              <div className="admin-stat-tile">
                <div className="label">Total users</div>
                <div className="value">{overview.totalUsers}</div>
              </div>
              <div className="admin-stat-tile">
                <div className="label">Free</div>
                <div className="value">{overview.tierBreakdown.free || 0}</div>
              </div>
              <div className="admin-stat-tile">
                <div className="label">Plus</div>
                <div className="value">{overview.tierBreakdown.plus || 0}</div>
              </div>
              <div className="admin-stat-tile">
                <div className="label">Pro</div>
                <div className="value">{overview.tierBreakdown.pro || 0}</div>
              </div>
              <div className="admin-stat-tile">
                <div className="label">On a trial/comp</div>
                <div className="value">{overview.trialCount}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>Feature usage (site-wide)</h2>
            <div className="hint" style={{ marginTop: -8 }}>
              Total times each feature has been used, across every user, since tracking began.
            </div>
            <AdminBarList data={eventTotalsData} labels={eventLabels} colors={{}} defaultColor="var(--brand)" />
          </div>

          <div className="panel">
            <h2>Device split</h2>
            <div className="hint" style={{ marginTop: -8 }}>
              Each user counted once, by their most recent activity&rsquo;s device — {overview.sampledUsers} of {overview.totalUsers} users have activity recorded.
            </div>
            <AdminBarList data={overview.deviceBreakdown} colors={DEVICE_COLORS} />
          </div>

          <div className="panel">
            <h2>Browser split</h2>
            <AdminBarList data={overview.browserBreakdown} colors={BROWSER_COLORS} />
          </div>
        </>
      )}

      <div className="panel">
        <h2>All users</h2>
        {!users ? (
          <div className="hint">Loading…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Tier</th>
                <th>Activities</th>
                <th>Joined</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><Link href={`/admin/users/${u.id}`}>{u.name || "—"}</Link></td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`admin-tier-badge ${u.tier}`}>{u.tier}</span>
                    {u.isTrial && " (trial)"}
                  </td>
                  <td>{u.activityCount}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>{u.lastActiveAt ? fmtDateTime(u.lastActiveAt) : "never"}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="hint">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
