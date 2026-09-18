"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't log in.");
      router.push("/admin");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell narrow">
      <div className="top" style={{ marginBottom: 28 }}>
        <span className="wordmark" style={{ cursor: "default" }}>
          <span className="split">ADMIN</span>
        </span>
      </div>
      <div className="panel">
        <h2>Admin sign in</h2>
        <div className="hint" style={{ marginTop: -8, marginBottom: 14 }}>
          Restricted — this is not a user account.
        </div>
        <form onSubmit={handleSubmit}>
          <label>Username</label>
          <input required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
          <label>Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="status-line warn" style={{ marginTop: 12 }}>{error}</div>}
          <button className="primary" type="submit" disabled={loading} style={{ marginTop: 18 }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
