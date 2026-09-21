"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminBarList from "@/components/AdminBarList";
import AdminBrand from "@/components/AdminBrand";
import { eventLabel } from "@/lib/adminEvents";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ChurnedCard({ row, onUpdate, onPurge }) {
  const [notes, setNotes] = useState(row.admin_notes || "");
  const [saving, setSaving] = useState(false);
  const [contactedBusy, setContactedBusy] = useState(false);

  async function toggleContacted() {
    setContactedBusy(true);
    await onUpdate(row.id, { contacted: !row.contacted_at });
    setContactedBusy(false);
  }

  async function saveNotes() {
    setSaving(true);
    await onUpdate(row.id, { notes });
    setSaving(false);
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{row.name || row.email}</h2>
          <div className="hint" style={{ marginTop: 6 }}>
            {row.email} · <span className={`admin-tier-badge ${row.tier || "free"}`}>{row.tier || "free"}</span>
            {row.was_trial ? " (trial)" : ""} at deletion
            {row.signed_up_at && <> · Signed up {fmtDate(row.signed_up_at)}</>} · {row.activity_count} activities imported
          </div>
          <div className="hint" style={{ marginTop: 2 }}>Deleted {fmtDate(row.deleted_at)}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={{ width: "auto", padding: "6px 12px" }}
            onClick={toggleContacted}
            disabled={contactedBusy}
          >
            {row.contacted_at ? `✓ Contacted ${fmtDate(row.contacted_at)}` : "Mark as contacted"}
          </button>
          <button
            type="button"
            style={{ width: "auto", padding: "6px 12px", borderColor: "var(--coral)", color: "var(--coral)" }}
            onClick={() => onPurge(row.id)}
          >
            Purge record
          </button>
        </div>
      </div>

      {row.reason && (
        <div className="hint" style={{ marginTop: 12, color: "var(--ink)", fontStyle: "italic" }}>
          &ldquo;{row.reason}&rdquo;
        </div>
      )}

      {row.event_counts && Object.keys(row.event_counts).length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Usage before leaving</h3>
          <AdminBarList
            data={row.event_counts}
            labels={Object.fromEntries(Object.keys(row.event_counts).map((k) => [k, eventLabel(k)]))}
            defaultColor="var(--ink-dim)"
          />
        </>
      )}

      <label style={{ marginTop: 16 }}>Notes</label>
      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Outreach notes…" />
      <button type="button" style={{ width: "auto", padding: "6px 12px", marginTop: 8 }} onClick={saveNotes} disabled={saving}>
        {saving ? "Saving…" : "Save notes"}
      </button>
    </div>
  );
}

export default function ChurnedUsersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/me").then((r) => r.json()).then((me) => {
      if (!me.authenticated) { router.push("/admin/login"); return; }
      setReady(true);
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function load() {
    try {
      const res = await fetch("/api/admin/deleted-users");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Couldn't load deleted users.");
      setRows(body.deletedUsers);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleUpdate(id, patch) {
    await fetch(`/api/admin/deleted-users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function handlePurge(id) {
    if (!confirm("Permanently delete this churn record? This can't be undone.")) return;
    await fetch(`/api/admin/deleted-users/${id}`, { method: "DELETE" });
    await load();
  }

  if (!ready) return <div className="shell"><div className="status-line">Loading…</div></div>;

  return (
    <div className="shell">
      <div className="admin-top">
        <AdminBrand />
        <Link href="/admin">Back to dashboard</Link>
      </div>

      <h2 style={{ marginBottom: 4 }}>Churned users</h2>
      <div className="hint" style={{ marginTop: 0, marginBottom: 18 }}>
        Everyone who deleted their own Splitline account, kept here only so you can follow up about their
        feedback — their activities, gear, and plans are gone for good.
      </div>

      {error && <div className="status-line warn" style={{ marginBottom: 16 }}>{error}</div>}

      {!rows ? (
        <div className="status-line">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="panel"><div className="hint" style={{ marginTop: 0 }}>Nobody&rsquo;s deleted their account yet.</div></div>
      ) : (
        rows.map((row) => <ChurnedCard key={row.id} row={row} onUpdate={handleUpdate} onPurge={handlePurge} />)
      )}
    </div>
  );
}
