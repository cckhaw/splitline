"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The primary site nav, next to the wordmark: Dashboard, plus a Training
// menu that opens onto Training plan. Kept as its own component (rather
// than inlined per-page) so it's identical — and stays in sync — on every
// authenticated page instead of drifting as pages are edited separately.
export default function TopNav() {
  const pathname = usePathname();
  const [trainingOpen, setTrainingOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setTrainingOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const trainingActive = pathname === "/training-plan" || pathname === "/race-day";

  return (
    <nav className="top-nav">
      <Link href="/app" className={`top-nav-link${pathname === "/app" ? " active" : ""}`}>
        Dashboard
      </Link>
      <Link href="/activities" className={`top-nav-link${pathname === "/activities" ? " active" : ""}`}>
        Activities
      </Link>
      <div className="top-nav-item" ref={ref}>
        <button
          type="button"
          className={`top-nav-link${trainingActive ? " active" : ""}`}
          onClick={() => setTrainingOpen((o) => !o)}
        >
          Training <span className="caret">{trainingOpen ? "▴" : "▾"}</span>
        </button>
        {trainingOpen && (
          <div className="top-nav-dropdown">
            <Link href="/training-plan" onClick={() => setTrainingOpen(false)}>Training plan</Link>
            <Link href="/race-day" onClick={() => setTrainingOpen(false)}>Race Day Plan</Link>
          </div>
        )}
      </div>
    </nav>
  );
}
