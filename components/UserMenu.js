"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import ThemeIcon from "@/components/ThemeIcon";
import MobileNavMenu from "@/components/MobileNavMenu";
import { FONT_SIZE_STORAGE_KEY, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, FONT_SIZE_DEFAULT, clampFontScale } from "@/lib/fontSize";

export const THEME_STORAGE_KEY = "splitline_theme";

const TIER_LABELS = { free: "Free", plus: "Plus", pro: "Pro" };

// The dashboard's top-right identity control: clicking the athlete's
// name (with their membership tier) opens a dropdown with the rest of
// the account-level navigation, instead of spreading those links flat
// across the header.
export default function UserMenu({ name, tier, isTrial, avatarUrl, onResync, resyncing, stravaConnected, ouraConnected, onOuraChange }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(null);
  const [fontScale, setFontScale] = useState(null);
  const [ouraBusy, setOuraBusy] = useState(false);
  const [ouraError, setOuraError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
    const stored = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fs-scale"));
    setFontScale(clampFontScale(Number.isFinite(stored) ? stored : FONT_SIZE_DEFAULT));
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing / blocked storage — theme just won't persist.
    }
    setOpen(false);
  }

  function changeFontScale(delta) {
    const next = clampFontScale(fontScale + delta);
    setFontScale(next);
    document.documentElement.style.setProperty("--fs-scale", next);
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
    } catch {
      // Private browsing / blocked storage — size just won't persist.
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  // On the dashboard itself, onResync is the page's own import function —
  // called directly. Anywhere else (account, training plan, race day) it's
  // not passed, so this hands off to the dashboard to run it there instead.
  function handleResync() {
    if (resyncing) return;
    setOpen(false);
    if (onResync) onResync();
    else router.push("/app?resync=1");
  }

  // Self-contained (unlike resync, which the dashboard often owns) since
  // connecting is just "fetch, then redirect" and disconnecting is just a
  // POST — neither needs page-specific state, so every page that renders
  // this menu gets working Oura controls without wiring anything beyond
  // the ouraConnected/onOuraChange props already threaded through
  // AppHeader. onOuraChange lets the host page update its own `me` state
  // after a change it didn't itself trigger.
  async function handleConnectOura() {
    setOuraBusy(true);
    setOuraError("");
    try {
      const res = await fetch("/api/oura/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't start the Oura connection.");
      window.location.href = data.authorizeUrl;
    } catch (e) {
      setOuraError(e.message);
      setOuraBusy(false);
    }
  }

  async function handleDisconnectOura() {
    setOuraBusy(true);
    setOuraError("");
    try {
      const res = await fetch("/api/oura/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Couldn't disconnect Oura Ring — try again.");
      onOuraChange?.(false);
      setOpen(false);
    } catch (e) {
      setOuraError(e.message);
    } finally {
      setOuraBusy(false);
    }
  }

  const tierLabel = TIER_LABELS[tier] || TIER_LABELS.free;
  const tierSuffix = isTrial ? " - Trial" : "";
  const resyncLabel = resyncing ? "Re-syncing…" : ouraConnected ? "Re-sync from Strava & Oura" : "Re-sync from Strava";

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)} aria-label="Open menu">
        <span className="hamburger-icon"><span /><span /><span /></span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <MobileNavMenu onNavigate={() => setOpen(false)} />
          <div className="user-menu-profile">
            <Avatar src={avatarUrl} name={name} size={36} />
            <div>
              <div className="user-menu-profile-name">{name}</div>
              <div className="user-menu-tier">{tierLabel} Tier{tierSuffix}</div>
            </div>
          </div>
          <Link href="/account" onClick={() => setOpen(false)}>My account</Link>
          {stravaConnected && (
            <div className="user-menu-item" onClick={handleResync} style={resyncing ? { opacity: 0.6, cursor: "default" } : undefined}>
              {resyncLabel}
            </div>
          )}
          {ouraConnected != null && (
            <div
              className="user-menu-item"
              onClick={ouraConnected ? handleDisconnectOura : handleConnectOura}
              style={ouraBusy ? { opacity: 0.6, cursor: "default" } : undefined}
            >
              {ouraBusy
                ? ouraConnected ? "Disconnecting…" : "Connecting…"
                : ouraConnected ? "Disconnect Oura Ring" : "Connect Oura Ring"}
            </div>
          )}
          {ouraError && <div className="user-menu-error">{ouraError}</div>}
          {theme && (
            <div className="user-menu-item" onClick={toggleTheme}>
              <ThemeIcon theme={theme} style={{ marginRight: 8 }} />
              {theme === "light" ? "Dark mode" : "Light mode"}
            </div>
          )}
          {fontScale != null && (
            <div className="user-menu-fontsize">
              <span>Font size</span>
              <div className="user-menu-fontsize-controls">
                <button
                  type="button"
                  onClick={() => changeFontScale(-FONT_SIZE_STEP)}
                  disabled={fontScale <= FONT_SIZE_MIN}
                  aria-label="Decrease font size"
                >
                  –
                </button>
                <span className="user-menu-fontsize-value">{Math.round(fontScale * 100)}%</span>
                <button
                  type="button"
                  onClick={() => changeFontScale(FONT_SIZE_STEP)}
                  disabled={fontScale >= FONT_SIZE_MAX}
                  aria-label="Increase font size"
                >
                  +
                </button>
              </div>
            </div>
          )}
          <div className="user-menu-item" onClick={handleLogout}>Log out</div>
        </div>
      )}
    </div>
  );
}
