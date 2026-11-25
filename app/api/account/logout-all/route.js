import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { bumpSessionVersion, friendlyDbErrorMessage } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

// "Sign out everywhere": invalidates every session, this device included.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  try {
    await bumpSessionVersion(session.userId);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (e) {
    console.error("Sign out everywhere failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
