"use client";

import { useEffect, useState } from "react";

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
    <button type="button" className="theme-toggle" onClick={toggle} style={{ width: "auto", padding: "7px 14px" }}>
      {theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}
