// Next.js 16 "proxy" (formerly middleware). CSRF defense for the JSON
// API: SameSite=Lax doesn't stop requests from sibling subdomains
// (*.khaw.cc is one "site"), so any state-changing /api request carrying
// browser-origin signals must come from this exact host.
//
//  - Origin present  -> its host must equal the request host
//  - Sec-Fetch-Site  -> must be same-origin (or none: direct navigation)
//  - Neither header  -> a non-browser client (curl, MCP clients, Stripe);
//                       it has no ambient cookies to abuse, so allow.
//  - JSON endpoints must be sent as application/json, which a plain
//    cross-site <form> cannot produce.
//
// Exempt: /api/stripe/webhook (server-to-server, verified by signature)
// and /api/mcp (public, cookie-less, called from MCP clients).

import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT = ["/api/stripe/webhook", "/api/mcp"];

function deny(reason) {
  return NextResponse.json({ error: "forbidden", message: `Cross-site request blocked (${reason}).` }, { status: 403 });
}

export function proxy(request) {
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    let originHost;
    try { originHost = new URL(origin).host; } catch { return deny("bad origin"); }
    if (originHost !== host) return deny("origin");
  } else if (origin === "null") {
    return deny("opaque origin");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return deny("fetch-site");

  // Bodies on mutating routes are JSON (or multipart for uploads); reject
  // the "simple" cross-site form types outright.
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.startsWith("application/x-www-form-urlencoded") || ct.startsWith("text/plain")) return deny("content-type");

  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
