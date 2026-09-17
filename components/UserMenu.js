"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export const THEME_STORAGE_KEY = "splitline_theme";

// The dashboard's top-right identity control: clicking the athlete's
// name opens a dropdown with the rest of the account-level navigation,
// instead of spreading those links flat across the header.
export default function UserMenu({ name }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "dark");
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)}>
        {name} <span className="caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <Link href="/training-plan" onClick={() => setOpen(false)}>Training plan</Link>
          <Link href="/account" onClick={() => setOpen(false)}>My account</Link>
          {theme && (
            <div className="user-menu-item" onClick={toggleTheme}>{theme === "light" ? "Dark mode" : "Light mode"}</div>
          )}
          <div className="user-menu-item" onClick={handleLogout}>Log out</div>
        </div>
      )}
    </div>
  );
}
