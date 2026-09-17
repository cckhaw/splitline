"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verify = params.get("verify");
    if (verify) {
      setEmail(verify);
      setAwaitingCode(true);
      window.history.replaceState({}, "", "/signup");
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't create that account.");
      setAwaitingCode(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't verify that code.");
      router.push("/app");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    setResent(false);
    await fetch("/api/auth/resend-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResent(true);
  }

  if (awaitingCode) {
    return (
      <div className="shell narrow">
        <div className="wordmark" style={{ marginBottom: 28 }}>SPLIT<span>LINE</span></div>
        <div className="panel">
          <h2>Check your email</h2>
          <div className="hint" style={{ marginTop: -8, marginBottom: 14 }}>
            We sent a 6-digit code to <strong>{email}</strong>. Enter it below to confirm your address.
          </div>
          <form onSubmit={handleVerify}>
            <label>Verification code</label>
            <input
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              style={{ letterSpacing: "0.3em", textAlign: "center", fontFamily: "var(--font-mono)" }}
            />
            {error && <div className="status-line warn" style={{ marginTop: 12 }}>{error}</div>}
            {resent && !error && <div className="status-line">Sent a new code.</div>}
            <button className="primary" type="submit" disabled={loading || code.length !== 6} style={{ marginTop: 18 }}>
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
          </form>
          <div className="hint" style={{ marginTop: 14 }}>
            Didn&rsquo;t get it? <a onClick={handleResend} style={{ cursor: "pointer" }}>Resend code</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell narrow">
      <div className="wordmark" style={{ marginBottom: 28 }}>SPLIT<span>LINE</span></div>
      <div className="panel">
        <h2>Create your account</h2>
        <a href="/api/auth/google">
          <button type="button" style={{ marginBottom: 16 }}>Continue with Google</button>
        </a>
        <div className="hint" style={{ textAlign: "center", margin: "0 0 16px" }}>or</div>
        <form onSubmit={handleSubmit}>
          <label>Full name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <label>Confirm password</label>
          <input type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          {error && <div className="status-line warn" style={{ marginTop: 12 }}>{error}</div>}
          <button className="primary" type="submit" disabled={loading} style={{ marginTop: 18 }}>
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <div className="hint" style={{ marginTop: 14 }}>
          Already have an account? <Link href="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
