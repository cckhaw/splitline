"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Mobile-only twin of components/TopNav.js — folded into the hamburger
// dropdown instead of sitting next to the wordmark, since a phone-width
// header doesn't have room for both a persistent nav row and the identity
// menu without wrapping (which is what put the dropdown in the wrong
// place). Hidden on desktop via CSS (see .mobile-nav-menu); TopNav's own
// row is hidden there in the same breakpoint, so the two never show at once.
export default function MobileNavMenu({ onNavigate }) {
  const pathname = usePathname();
  const trainingActive = pathname === "/training-plan" || pathname === "/race-day";
  const [trainingOpen, setTrainingOpen] = useState(trainingActive);

  return (
    <div className="mobile-nav-menu">
      <Link href="/app" className={`user-menu-item${pathname === "/app" ? " active" : ""}`} onClick={onNavigate}>
        Dashboard
      </Link>
      <Link href="/activities" className={`user-menu-item${pathname === "/activities" ? " active" : ""}`} onClick={onNavigate}>
        Last 30 Activities
      </Link>
      <div
        className={`user-menu-item mobile-nav-trigger${trainingActive ? " active" : ""}`}
        onClick={() => setTrainingOpen((o) => !o)}
      >
        <span>Training</span>
        <span className="caret">{trainingOpen ? "▴" : "▾"}</span>
      </div>
      {trainingOpen && (
        <>
          <Link href="/training-plan" className={`user-menu-item nested${pathname === "/training-plan" ? " active" : ""}`} onClick={onNavigate}>
            Training plan
          </Link>
          <Link href="/race-day" className={`user-menu-item nested${pathname === "/race-day" ? " active" : ""}`} onClick={onNavigate}>
            Race-day plan
          </Link>
        </>
      )}
      <div className="mobile-nav-divider" />
    </div>
  );
}
