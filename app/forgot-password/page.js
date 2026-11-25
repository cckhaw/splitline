"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import { PASSWORD_REQUIREMENTS_TEXT } from "@/lib/password";

// A response can come back with an empty or non-JSON body — a platform
// timeout, a proxy error page, a crashed function — and calling res.json()
// directly on that throws a raw "Unexpected end of JSON input" that isn't
// useful to show anyone. This parses defensively and always returns a message.
async function safeJson(res) {
  const text = await res.text();
  if (!text) {
    return { message: res.ok ? "The server returned an empty response." : `Server error (${res.status}).` };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: `Unexpected response from the server (${res.status}).` };
  }
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState("email"); // "email" | "reset"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleRequestCode(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't send a reset code.");
      setStep("reset");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setCaptchaReset((n) => n + 1);
    }
  }

  async function handleResend() {
    setError("");
    setResent(false);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, captchaToken }),
    });
    setCaptchaReset((n) => n + 1);
    if (!res.ok) {
      const data = await safeJson(res);
      setError(data.message || "Couldn't send a new code.");
      return;
    }
    setResent(true);
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, newPassword, confirmPassword }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't reset your password.");
      router.push("/login?reset=1");
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

      {step === "email" ? (
        <div className="panel">
          <h2>Reset your password</h2>
          <div className="hint" style={{ marginTop: -8, marginBottom: 14 }}>
            Enter your account email and, if it has a Splitline account, we&rsquo;ll send a 6-digit code
            to reset your password.
          </div>
          <form onSubmit={handleRequestCode}>
            <label>Email</label>
            <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
            {error && <div className="status-line warn" style={{ marginTop: 12 }}>{error}</div>}
            <button className="primary" type="submit" disabled={loading} style={{ marginTop: 18 }}>
              {loading ? "Sending…" : "Send reset code"}
            </button>
          </form>
          <div className="hint" style={{ marginTop: 14 }}>
            <Link href="/login">Back to log in</Link>
          </div>
        </div>
      ) : (
        <div className="panel">
          <h2>Check your email</h2>
          <div className="hint" style={{ marginTop: -8, marginBottom: 14 }}>
            If <strong>{email}</strong> has a Splitline account, we sent a 6-digit code to it. Enter it
            below along with your new password.
          </div>
          <form onSubmit={handleReset}>
            <label>Verification code</label>
            <input
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              style={{ letterSpacing: "0.3em", textAlign: "center", fontFamily: "var(--font-mono)" }}
            />
            <label>New password</label>
            <input type="password" required minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <div className="hint" style={{ marginTop: 4 }}>{PASSWORD_REQUIREMENTS_TEXT}</div>
            <label>Confirm new password</label>
            <input type="password" required minLength={12} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
            {error && <div className="status-line warn" style={{ marginTop: 12 }}>{error}</div>}
            {resent && !error && <div className="status-line">Sent a new code.</div>}
            <button className="primary" type="submit" disabled={loading || code.length !== 6} style={{ marginTop: 18 }}>
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
          <div className="hint" style={{ marginTop: 14 }}>
            Didn&rsquo;t get it? <a onClick={handleResend} style={{ cursor: "pointer" }}>Resend code</a>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            Wrong email? <a onClick={() => setStep("email")} style={{ cursor: "pointer" }}>Start over</a>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
