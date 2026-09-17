"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FONT_SIZE_STORAGE_KEY, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, FONT_SIZE_DEFAULT, clampFontScale } from "@/lib/fontSize";

export const THEME_STORAGE_KEY = "splitline_theme";

const TIER_LABELS = { free: "Free", plus: "Plus", pro: "Pro" };

// The dashboard's top-right identity control: clicking the athlete's
// name (with their membership tier) opens a dropdown with the rest of
// the account-level navigation, instead of spreading those links flat
// across the header.
export default function UserMenu({ name, tier, isTrial }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(null);
  const [fontScale, setFontScale] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "dark");
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
    router.push("/login");
  }

  const tierLabel = TIER_LABELS[tier] || TIER_LABELS.free;
  const tierSuffix = isTrial ? " - Trial" : "";

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)}>
        {name} <span className="user-menu-tier">({tierLabel} Tier{tierSuffix})</span> <span className="caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <Link href="/account" onClick={() => setOpen(false)}>My account</Link>
          {theme && (
            <div className="user-menu-item" onClick={toggleTheme}>{theme === "light" ? "Dark mode" : "Light mode"}</div>
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
