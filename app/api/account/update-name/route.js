import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { updateUserName, friendlyDbErrorMessage } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { name } = await request.json().catch(() => ({}));
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "missing_name", message: "Enter your full name." }, { status: 400 });
  }

  try {
    await updateUserName(session.userId, name.trim());
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to update name:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
