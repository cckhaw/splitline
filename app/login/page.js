"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't log in.");
      router.push("/app");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell narrow">
      <div className="wordmark" style={{ marginBottom: 28 }}>SPLIT<span>LINE</span></div>
      <div className="panel">
        <h2>Log in</h2>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="status-line warn" style={{ marginTop: 12 }}>{error}</div>}
          <button className="primary" type="submit" disabled={loading} style={{ marginTop: 18 }}>
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
        <div className="hint" style={{ marginTop: 14 }}>
          New here? <Link href="/signup">Sign up free</Link>
        </div>
      </div>
    </div>
  );
}
