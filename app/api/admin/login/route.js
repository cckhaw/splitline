import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { verifyTotp } from "@/lib/totp";
import { createAdminSession, ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE } from "@/lib/adminSession";

export const runtime = "nodejs";

// Hashing both sides to a fixed-length digest before timingSafeEqual
// avoids both the length-mismatch throw (unequal-length buffers aren't
// comparable) and a length-based timing signal — comparing raw
// variable-length strings directly would leak how many leading
// characters matched via response time.
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function POST(request) {
  const { username, password, totp } = await request.json().catch(() => ({}));

  // Optional IP allow-list (comma-separated), e.g. ADMIN_ALLOWED_IPS="203.0.113.7,198.51.100.4".
  const allowed = (process.env.ADMIN_ALLOWED_IPS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(clientIp(request))) {
    return NextResponse.json({ error: "forbidden", message: "Admin login isn't available from this network." }, { status: 403 });
  }

  const limited = await rateLimit([
    { key: `admin-login:ip:${clientIp(request)}`, limit: 5, windowSeconds: 15 * 60 },
    { key: "admin-login:global", limit: 30, windowSeconds: 60 * 60 },
  ]);
  if (limited) return limited;

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    return NextResponse.json(
      { error: "not_configured", message: "Admin login isn't configured on this deployment — set ADMIN_USERNAME and ADMIN_PASSWORD." },
      { status: 503 }
    );
  }

  const ok = safeEqual(username || "", adminUsername) && safeEqual(password || "", adminPassword);
  if (!ok) {
    return NextResponse.json({ error: "invalid_credentials", message: "Wrong username or password." }, { status: 401 });
  }

  // Optional second factor: set ADMIN_TOTP_SECRET (base32) to require it.
  if (process.env.ADMIN_TOTP_SECRET && !verifyTotp(process.env.ADMIN_TOTP_SECRET, totp)) {
    return NextResponse.json({ error: "invalid_credentials", message: "Wrong username, password or authenticator code." }, { status: 401 });
  }

  const token = await createAdminSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: ADMIN_SESSION_MAX_AGE, path: "/",
  });
  return res;
}
