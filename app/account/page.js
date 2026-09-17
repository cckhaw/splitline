"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);

  const [name, setName] = useState("");
  const [nameStatus, setNameStatus] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailStep, setEmailStep] = useState("idle"); // idle | code
  const [emailCode, setEmailCode] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [emailWarn, setEmailWarn] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwStatus, setPwStatus] = useState("");
  const [pwWarn, setPwWarn] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [birthDate, setBirthDate] = useState("");
  const [birthStatus, setBirthStatus] = useState("");
  const [birthSaving, setBirthSaving] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((data) => {
      if (!data.authenticated) { router.push("/login"); return; }
      setMe(data);
      setName(data.name || "");
      setBirthDate(data.birthDate ? String(data.birthDate).slice(0, 10) : "");
    });
  }, [router]);

  async function saveName(e) {
    e.preventDefault();
    setNameSaving(true);
    setNameStatus("");
    try {
      const res = await fetch("/api/account/update-name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setNameStatus("Saved.");
    } catch (e) {
      setNameStatus(e.message || "Couldn't save that.");
    } finally {
      setNameSaving(false);
    }
  }

  async function requestEmailChange(e) {
    e.preventDefault();
    setEmailSaving(true);
    setEmailWarn(false);
    setEmailStatus("");
    try {
      const res = await fetch("/api/account/change-email/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setEmailStep("code");
      setEmailStatus(`Sent a code to ${newEmail}.`);
    } catch (e) {
      setEmailWarn(true);
      setEmailStatus(e.message || "Couldn't start that change.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function confirmEmailChange(e) {
    e.preventDefault();
    setEmailSaving(true);
    setEmailWarn(false);
    try {
      const res = await fetch("/api/account/change-email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: emailCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMe((m) => ({ ...m, email: data.email }));
      setEmailStep("idle");
      setNewEmail("");
      setEmailCode("");
      setEmailStatus("Email updated.");
    } catch (e) {
      setEmailWarn(true);
      setEmailStatus(e.message || "Couldn't verify that code.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwSaving(true);
    setPwWarn(false);
    setPwStatus("");
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPwStatus("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPwWarn(true);
      setPwStatus(e.message || "Couldn't update your password.");
    } finally {
      setPwSaving(false);
    }
  }

  async function saveBirthDate(e) {
    e.preventDefault();
    setBirthSaving(true);
    setBirthStatus("");
    try {
      const res = await fetch("/api/account/birthdate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ birthDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setBirthStatus("Saved — this feeds the injury-risk estimate on your dashboard.");
    } catch (e) {
      setBirthStatus(e.message || "Couldn't save that.");
    } finally {
      setBirthSaving(false);
    }
  }

  if (!me) return <div className="shell"><div className="status-line">Loading…</div></div>;

  return (
    <div className="shell">
      <header className="top">
        <div className="wordmark">SPLIT<span>LINE</span></div>
        <nav className="navlinks">
          <Link href="/app">Dashboard</Link>
        </nav>
      </header>

      <h2 style={{ fontSize: 20, color: "var(--ink)", marginBottom: 18 }}>My account</h2>

      <div className="panel">
        <h2>Full name</h2>
        <form onSubmit={saveName}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          {nameStatus && <div className="status-line">{nameStatus}</div>}
          <button className="primary" type="submit" disabled={nameSaving} style={{ marginTop: 12 }}>
            {nameSaving ? "Saving…" : "Save name"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Email</h2>
        <div className="hint" style={{ marginTop: -8, marginBottom: 12 }}>Current: {me.email}</div>
        {emailStep === "idle" ? (
          <form onSubmit={requestEmailChange}>
            <label>New email</label>
            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            {emailStatus && <div className={`status-line${emailWarn ? " warn" : ""}`}>{emailStatus}</div>}
            <button className="primary" type="submit" disabled={emailSaving} style={{ marginTop: 12 }}>
              {emailSaving ? "Sending code…" : "Send verification code"}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmEmailChange}>
            <div className="hint" style={{ marginTop: 0 }}>Enter the code sent to {newEmail}.</div>
            <label>Verification code</label>
            <input
              inputMode="numeric"
              maxLength={6}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
              style={{ letterSpacing: "0.3em", textAlign: "center", fontFamily: "var(--font-mono)" }}
            />
            {emailStatus && <div className={`status-line${emailWarn ? " warn" : ""}`}>{emailStatus}</div>}
            <button className="primary" type="submit" disabled={emailSaving || emailCode.length !== 6} style={{ marginTop: 12 }}>
              {emailSaving ? "Verifying…" : "Confirm new email"}
            </button>
            <button type="button" onClick={() => setEmailStep("idle")} style={{ marginTop: 8 }}>Cancel</button>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>Password</h2>
        <form onSubmit={savePassword}>
          {me.hasGoogleLogin && (
            <div className="hint" style={{ marginTop: 0 }}>
              Your account can also sign in with Google. Setting a password here adds email/password as a second way in.
            </div>
          )}
          <label>Current password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <label>New password</label>
          <input type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <label>Confirm new password</label>
          <input type="password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          {pwStatus && <div className={`status-line${pwWarn ? " warn" : ""}`}>{pwStatus}</div>}
          <button className="primary" type="submit" disabled={pwSaving} style={{ marginTop: 12 }}>
            {pwSaving ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Date of birth</h2>
        <div className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
          Strava&rsquo;s API doesn&rsquo;t share your date of birth, so Splitline can&rsquo;t read your age from
          your Strava profile. Add it here to sharpen the injury-risk estimate on your dashboard — it&rsquo;s
          used for that estimate only.
        </div>
        <form onSubmit={saveBirthDate}>
          <input type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          {birthStatus && <div className="status-line">{birthStatus}</div>}
          <button className="primary" type="submit" disabled={birthSaving} style={{ marginTop: 12 }}>
            {birthSaving ? "Saving…" : "Save date of birth"}
          </button>
        </form>
      </div>
    </div>
  );
}
