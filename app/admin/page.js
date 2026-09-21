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

const SORTABLE_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "tier", label: "Tier" },
  { key: "activityCount", label: "Activities" },
  { key: "createdAt", label: "Joined" },
  { key: "lastActiveAt", label: "Last active" },
];

function compareUsers(a, b, key, dir) {
  let av = a[key];
  let bv = b[key];
  // Nulls (mainly lastActiveAt: "never") always sort to the end, in
  // either direction — a null isn't meaningfully "less" or "greater",
  // it's "no value to rank by."
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (key === "createdAt" || key === "lastActiveAt") { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
  else if (typeof av === "string") { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
  const cmp = av < bv ? -1 : av > bv ? 1 : 0;
  return dir === "asc" ? cmp : -cmp;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");

  const [userSearch, setUserSearch] = useState("");
  const [userPageSize, setUserPageSize] = useState(10);
  const [userPage, setUserPage] = useState(1);
  const [userSortKey, setUserSortKey] = useState("createdAt");
  const [userSortDir, setUserSortDir] = useState("desc");

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

  function toggleUserSort(key) {
    if (userSortKey === key) {
      setUserSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setUserSortKey(key);
      setUserSortDir("asc");
    }
    setUserPage(1);
  }

  function changeUserSearch(value) {
    setUserSearch(value);
    setUserPage(1);
  }

  function changeUserPageSize(value) {
    setUserPageSize(value);
    setUserPage(1);
  }

  if (!ready) return <div className="shell"><div className="status-line">Loading…</div></div>;

  const eventTotalsData = overview ? Object.fromEntries(overview.eventTotals.map((r) => [r.event_type, r.n])) : {};
  const eventLabels = overview ? Object.fromEntries(overview.eventTotals.map((r) => [r.event_type, eventLabel(r.event_type)])) : {};

  // Search + sort operate on the full user list before pagination slices
  // it — so sorting (and the page-size choice) stays correct "across all
  // pages" rather than each page just being independently re-sorted.
  const needle = userSearch.trim().toLowerCase();
  const filteredUsers = users
    ? users.filter((u) => !needle || (u.name || "").toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
    : [];
  const sortedUsers = [...filteredUsers].sort((a, b) => compareUsers(a, b, userSortKey, userSortDir));
  const userTotalPages = Math.max(1, Math.ceil(sortedUsers.length / userPageSize));
  const userPageClamped = Math.min(userPage, userTotalPages);
  const pagedUsers = sortedUsers.slice((userPageClamped - 1) * userPageSize, userPageClamped * userPageSize);

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Churned users</h2>
              <Link href="/admin/churned">View churned users →</Link>
            </div>
            <div className="admin-stat-grid">
              <div className="admin-stat-tile">
                <div className="label">Accounts deleted</div>
                <div className="value">{overview.deletedUserCount}</div>
              </div>
              <div className="admin-stat-tile">
                <div className="label">Not yet contacted</div>
                <div className="value">{overview.uncontactedDeletedUserCount}</div>
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
          <>
            <div className="admin-table-toolbar">
              <input
                type="text"
                placeholder="Search name or email…"
                value={userSearch}
                onChange={(e) => changeUserSearch(e.target.value)}
                style={{ maxWidth: 280 }}
              />
              <label className="admin-page-size">
                Show
                <select value={userPageSize} onChange={(e) => changeUserPageSize(Number(e.target.value))} style={{ width: "auto" }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                per page
              </label>
            </div>

            <table className="admin-table">
              <thead>
                <tr>
                  {SORTABLE_COLUMNS.map((col) => (
                    <th key={col.key} className="admin-table-sortable" onClick={() => toggleUserSort(col.key)}>
                      {col.label}
                      {userSortKey === col.key && <span className="admin-sort-arrow">{userSortDir === "asc" ? " ▲" : " ▼"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => (
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
                {sortedUsers.length === 0 && (
                  <tr><td colSpan={6} className="hint">{needle ? "No users match that search." : "No users yet."}</td></tr>
                )}
              </tbody>
            </table>

            {sortedUsers.length > 0 && (
              <div className="activities-pagination">
                <button
                  style={{ width: "auto", padding: "7px 14px" }}
                  onClick={() => setUserPage(Math.max(1, userPageClamped - 1))}
                  disabled={userPageClamped <= 1}
                >
                  ← Previous
                </button>
                <span className="hint" style={{ margin: 0 }}>
                  Page {userPageClamped} of {userTotalPages} · {sortedUsers.length} user{sortedUsers.length === 1 ? "" : "s"}
                </span>
                <button
                  style={{ width: "auto", padding: "7px 14px" }}
                  onClick={() => setUserPage(Math.min(userTotalPages, userPageClamped + 1))}
                  disabled={userPageClamped >= userTotalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
