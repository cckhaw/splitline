"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import ThemeIcon from "@/components/ThemeIcon";
import { FONT_SIZE_STORAGE_KEY, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, FONT_SIZE_DEFAULT, clampFontScale } from "@/lib/fontSize";

export const THEME_STORAGE_KEY = "splitline_theme";

const TIER_LABELS = { free: "Free", plus: "Plus", pro: "Pro" };

// The dashboard's top-right identity control: clicking the athlete's
// name (with their membership tier) opens a dropdown with the rest of
// the account-level navigation, instead of spreading those links flat
// across the header.
export default function UserMenu({ name, tier, isTrial, avatarUrl, onResync, resyncing }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(null);
  const [fontScale, setFontScale] = useState(null);
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

  const tierLabel = TIER_LABELS[tier] || TIER_LABELS.free;
  const tierSuffix = isTrial ? " - Trial" : "";

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)} aria-label="Open menu">
        <span className="hamburger-icon"><span /><span /><span /></span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-profile">
            <Avatar src={avatarUrl} name={name} size={36} />
            <div>
              <div className="user-menu-profile-name">{name}</div>
              <div className="user-menu-tier">{tierLabel} Tier{tierSuffix}</div>
            </div>
          </div>
          <Link href="/account" onClick={() => setOpen(false)}>My account</Link>
          <div className="user-menu-item" onClick={handleResync} style={resyncing ? { opacity: 0.6, cursor: "default" } : undefined}>
            {resyncing ? "Re-syncing…" : "Re-sync from Strava"}
          </div>
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
