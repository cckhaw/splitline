"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";

const ERROR_MESSAGES = {
  google_not_configured: "Google sign-in isn't set up on this deployment yet.",
  google_access_denied: "Google sign-in was cancelled.",
  google_no_email: "That Google account has no email address to sign in with.",
  state_mismatch: "That sign-in attempt looked tampered with — try again.",
  google_auth_failed: "Google sign-in failed — try again.",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(ERROR_MESSAGES[err] || "Couldn't sign in.");
      window.history.replaceState({}, "", "/login");
    }
    if (params.get("reset") === "1") {
      setResetDone(true);
      window.history.replaceState({}, "", "/login");
    }
    if (params.get("deleted") === "1") {
      setAccountDeleted(true);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "email_unverified") {
          await fetch("/api/auth/resend-code", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          });
          setNeedsVerification(true);
        }
        throw new Error(data.message || "Couldn't log in.");
      }
      router.push("/app");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell narrow">
      <div className="top" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
        <Link href="/" className="wordmark">
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="split">SPLIT</span><span className="line">LINE</span>
        </Link>
        <ThemeToggle />
      </div>
      <div className="panel">
        <h2>Log in</h2>
        {resetDone && <div className="status-line" style={{ marginBottom: 14 }}>Your password has been reset — log in with your new one.</div>}
        {accountDeleted && <div className="status-line" style={{ marginBottom: 14 }}>Your account and all data have been permanently deleted. Sign up again any time.</div>}
        <a href="/api/auth/google">
          <button type="button" style={{ marginBottom: 16 }}>Continue with Google</button>
        </a>
        <div className="hint" style={{ textAlign: "center", margin: "0 0 16px" }}>or</div>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="status-line warn" style={{ marginTop: 12 }}>{error}</div>}
          {needsVerification && (
            <div className="hint">
              We sent a fresh verification code to {email}.{" "}
              <Link href={`/signup?verify=${encodeURIComponent(email)}`}>Enter it here</Link>.
            </div>
          )}
          <button className="primary" type="submit" disabled={loading} style={{ marginTop: 18 }}>
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
        <div className="hint" style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
          <span>New here? <Link href="/signup">Sign up free</Link></span>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
