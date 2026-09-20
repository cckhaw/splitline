"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import ThemeIcon from "@/components/ThemeIcon";

export const THEME_STORAGE_KEY = "splitline_theme";

// The public (logged-out) header's nav — Features/Pricing/theme
// toggle/Log in laid out inline on desktop. At phone widths those four
// items wrap onto a second row before the header even gets narrow enough
// to justify it, so below that breakpoint this collapses into a single
// hamburger button (reusing the dashboard's .user-menu styling) whose
// dropdown holds the same items in the requested order: Log in, then the
// page's own links, then the light/dark toggle.
export default function PublicNav({ links = [] }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
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

  return (
    <nav className="navlinks">
      <div className="public-nav-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        <ThemeToggle />
        <Link href="/login">Log in</Link>
      </div>

      <div className="user-menu public-nav-menu" ref={ref}>
        <button type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)} aria-label="Open menu">
          <span className="hamburger-icon"><span /><span /><span /></span>
        </button>
        {open && (
          <div className="user-menu-dropdown">
            <Link href="/login" onClick={() => setOpen(false)}>Log in</Link>
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>
            ))}
            {theme && (
              <div className="user-menu-item" onClick={toggleTheme}>
                <ThemeIcon theme={theme} style={{ marginRight: 8 }} />
                {theme === "light" ? "Dark mode" : "Light mode"}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
