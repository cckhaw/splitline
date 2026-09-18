"use client";

import { useEffect, useState } from "react";
import ThemeIcon from "@/components/ThemeIcon";

export const THEME_STORAGE_KEY = "splitline_theme";

export default function ThemeToggle() {
  // Starts null so the server-rendered markup and first client render
  // match exactly (avoids a hydration mismatch) — the inline script in
  // layout.js already set the real theme on <html> before paint.
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing / blocked storage — theme just won't persist.
    }
  }

  if (!theme) return null;

  return (
    <button
      type="button"
      className="theme-icon-toggle"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}
