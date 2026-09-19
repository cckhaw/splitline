"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import AvatarCropper from "@/components/AvatarCropper";
import SiteFooter from "@/components/SiteFooter";
import { PLANS, formatUsd } from "@/lib/pricing";
import { TIERS } from "@/lib/membership";

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);

  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [checkoutWarn, setCheckoutWarn] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null); // `${tier}-${interval}` while in flight
  const [portalLoading, setPortalLoading] = useState(false);

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
  const [promptBirthdate, setPromptBirthdate] = useState(false);

  const [weightKg, setWeightKg] = useState("");
  const [weightStatus, setWeightStatus] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);

  const [pendingImage, setPendingImage] = useState(null); // { url, naturalWidth, naturalHeight }
  const [avatarStatus, setAvatarStatus] = useState("");
  const fileInputRef = useRef(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("prompt") === "birthdate") {
      setPromptBirthdate(true);
    }
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setCheckoutStatus("Subscription updated — thanks for upgrading!");
    } else if (checkout === "cancelled") {
      setCheckoutWarn(true);
      setCheckoutStatus("Checkout was cancelled — no changes were made.");
    }
    if (params.get("prompt") || checkout) window.history.replaceState({}, "", "/account");

    fetch("/api/me").then((r) => r.json()).then((data) => {
      if (!data.authenticated) { router.push("/login"); return; }
      setMe(data);
      setName(data.name || "");
      setBirthDate(data.birthDate ? String(data.birthDate).slice(0, 10) : "");
      setWeightKg(data.weightKg ? String(data.weightKg) : "");
    });
  }, [router]);

  async function startCheckout(tier, interval) {
    setCheckoutLoading(`${tier}-${interval}`);
    setCheckoutWarn(false);
    setCheckoutStatus("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier, interval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't start checkout.");
      window.location.href = data.url;
    } catch (e) {
      setCheckoutWarn(true);
      setCheckoutStatus(e.message);
      setCheckoutLoading(null);
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    setCheckoutWarn(false);
    setCheckoutStatus("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't open the billing portal.");
      window.location.href = data.url;
    } catch (e) {
      setCheckoutWarn(true);
      setCheckoutStatus(e.message);
      setPortalLoading(false);
    }
  }

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

  async function saveWeight(e) {
    e.preventDefault();
    setWeightSaving(true);
    setWeightStatus("");
    try {
      const res = await fetch("/api/account/weight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weightKg: Number(weightKg) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setWeightStatus("Saved — this sharpens the shoe-wear estimate on your dashboard.");
    } catch (e) {
      setWeightStatus(e.message || "Couldn't save that.");
    } finally {
      setWeightSaving(false);
    }
  }

  function onChoosePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-choosing the same file later
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPendingImage({ url, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    };
    img.src = url;
  }

  async function saveAvatar(dataUrl) {
    setAvatarStatus("");
    try {
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMe((m) => ({ ...m, avatarUrl: data.avatarUrl }));
      setPendingImage(null);
      setAvatarStatus("Photo saved.");
    } catch (e) {
      setAvatarStatus(e.message || "Couldn't save that photo.");
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    setDeleting(true);
    setDeleteStatus("");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: deletePassword, confirmEmail: deleteEmail, reason: deleteReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't delete your account.");
      window.location.href = "/login?deleted=1";
    } catch (e) {
      setDeleteStatus(e.message);
      setDeleting(false);
    }
  }

  if (!me) return <div className="shell"><div className="status-line">Loading…</div></div>;

  return (
    <div className="shell">
      <AppHeader name={me.name || me.email} tier={me.tier} isTrial={me.isTrial} avatarUrl={me.avatarUrl} />

      <h2 style={{ fontSize: "calc(20px * var(--fs-scale, 1))", color: "var(--ink)", marginBottom: 18 }}>My account</h2>

      <div className="panel">
        <h2>Profile photo</h2>
        {pendingImage ? (
          <AvatarCropper
            imageUrl={pendingImage.url}
            naturalWidth={pendingImage.naturalWidth}
            naturalHeight={pendingImage.naturalHeight}
            onCancel={() => setPendingImage(null)}
            onSave={saveAvatar}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Avatar src={me.avatarUrl} name={me.name || me.email} size={64} />
            <div>
              <button type="button" style={{ width: "auto", padding: "8px 16px" }} onClick={() => fileInputRef.current?.click()}>
                Change photo
              </button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onChoosePhoto} style={{ display: "none" }} />
              <div className="hint" style={{ marginTop: 6 }}>
                {me.avatarSource === "strava" ? "Currently your Strava profile photo." : "JPEG, PNG, or WebP."}
              </div>
            </div>
          </div>
        )}
        {avatarStatus && <div className="status-line">{avatarStatus}</div>}
      </div>

      <div className="panel">
        <h2>Membership</h2>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <span className={`tier-badge tier-${me.tier}`}>
              {TIERS[me.tier]?.label || "Free"} Tier{me.isTrial ? " - Trial" : ""}
            </span>
            {me.tier !== "free" && me.tierExpiresAt && (
              <div className="hint" style={{ marginTop: 8 }}>
                {new Date(me.tierExpiresAt) > new Date()
                  ? (me.isTrial ? "Trial ends" : "Renews")
                  : (me.isTrial ? "Trial ended" : "Expired")} on {formatDate(me.tierExpiresAt)}
              </div>
            )}
            <div className="hint" style={{ marginTop: 8 }}>
              AI refresh cadence: {TIERS[me.tier]?.refreshIntervalDays > 0 ? `once every ${TIERS[me.tier].refreshIntervalDays} days` : "unlimited"}.
            </div>
          </div>
          {me.hasStripeCustomer && (
            <button style={{ width: "auto", padding: "8px 16px" }} onClick={openBillingPortal} disabled={portalLoading}>
              {portalLoading ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>

        {checkoutStatus && <div className={`status-line${checkoutWarn ? " warn" : ""}`}>{checkoutStatus}</div>}

        <div className="plan-grid">
          {Object.values(PLANS).map((plan) => (
            <div key={plan.tier} className="plan-card">
              <h3 style={{ fontSize: "calc(15px * var(--fs-scale, 1))", color: "var(--ink)", textTransform: "none", letterSpacing: 0 }}>{plan.label}</h3>
              <div className="hint" style={{ marginTop: 0 }}>{plan.tagline}</div>
              <div className="plan-price">
                {formatUsd(plan.monthly.amountCents)}<span>/month</span>
              </div>
              <div className="hint" style={{ marginTop: 0 }}>or {formatUsd(plan.yearly.amountCents)}/year</div>
              <button
                className="primary"
                style={{ marginTop: 14 }}
                disabled={Boolean(checkoutLoading)}
                onClick={() => startCheckout(plan.tier, "month")}
              >
                {checkoutLoading === `${plan.tier}-month` ? "Redirecting…" : `Subscribe monthly`}
              </button>
              <button
                style={{ marginTop: 8 }}
                disabled={Boolean(checkoutLoading)}
                onClick={() => startCheckout(plan.tier, "year")}
              >
                {checkoutLoading === `${plan.tier}-year` ? "Redirecting…" : `Subscribe yearly`}
              </button>
            </div>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 16 }}>
          Already subscribed and want to renew, extend, or switch plans? Pick a plan above to check out again — it
          replaces your current subscription. Have a promo code? There&rsquo;s a field for it at checkout.
        </div>
      </div>

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
          <input type="password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <div className="hint" style={{ marginTop: 4 }}>
            At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.
          </div>
          <label>Confirm new password</label>
          <input type="password" minLength={12} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          {pwStatus && <div className={`status-line${pwWarn ? " warn" : ""}`}>{pwStatus}</div>}
          <button className="primary" type="submit" disabled={pwSaving} style={{ marginTop: 12 }}>
            {pwSaving ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Date of birth</h2>
        {promptBirthdate && !birthDate && (
          <div className="status-line warn" style={{ marginTop: -8, marginBottom: 12 }}>
            One more thing: Splitline requires accounts to be 13 or older. Please confirm your date of birth below.
          </div>
        )}
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

      <div className="panel">
        <h2>Body weight</h2>
        <div className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
          Optional. Heavier impact compresses running-shoe foam faster, so this sharpens the shoe-wear estimate
          in the Gears Check panel on your dashboard — it&rsquo;s used for that estimate only.
        </div>
        <form onSubmit={saveWeight}>
          <input
            type="number"
            min={25}
            max={250}
            step="0.1"
            placeholder="e.g. 68"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
          {weightStatus && <div className="status-line">{weightStatus}</div>}
          <button className="primary" type="submit" disabled={weightSaving || !weightKg} style={{ marginTop: 12 }}>
            {weightSaving ? "Saving…" : "Save weight (kg)"}
          </button>
        </form>
      </div>

      <div className="panel" style={{ borderColor: "var(--coral)" }}>
        <h2 style={{ color: "var(--coral)" }}>Danger zone</h2>
        {!confirmingDelete ? (
          <>
            <div className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
              Permanently delete your Splitline account and all imported data.
            </div>
            <button type="button" style={{ borderColor: "var(--coral)", color: "var(--coral)" }} onClick={() => setConfirmingDelete(true)}>
              Delete my account
            </button>
          </>
        ) : (
          <form onSubmit={deleteAccount}>
            <div className="status-line warn" style={{ marginTop: 0 }}>
              This cannot be undone. Deleting your account immediately and permanently erases your profile,
              every imported Strava activity, gear records, training and race day plans, and any cached AI
              insights — none of it can be recovered. You&rsquo;ll need to sign up for a brand new account to
              use Splitline again.
            </div>
            <div className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              The one exception: we keep your name, email, membership tier, and a summary of how you used
              Splitline (not your activities or plans themselves) so we can follow up about your feedback.
              That&rsquo;s it — no other data survives.
            </div>
            <label>Type your email ({me.email}) to confirm</label>
            <input type="email" required value={deleteEmail} onChange={(e) => setDeleteEmail(e.target.value)} />
            <label>Current password{me.hasGoogleLogin ? " (leave blank if you only sign in with Google)" : ""}</label>
            <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            <label>Mind telling us why you&rsquo;re leaving? (optional)</label>
            <textarea
              rows={3}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Helps us improve Splitline — totally optional."
            />
            {deleteStatus && <div className="status-line warn">{deleteStatus}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="submit"
                disabled={deleting || deleteEmail.toLowerCase() !== me.email.toLowerCase()}
                style={{ background: "var(--coral)", borderColor: "var(--coral)", color: "#fff" }}
              >
                {deleting ? "Deleting…" : "Permanently delete my account"}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmingDelete(false); setDeleteStatus(""); setDeleteEmail(""); setDeletePassword(""); setDeleteReason(""); }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
