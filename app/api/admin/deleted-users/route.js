import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminGuard";
import { adminListDeletedUsers, friendlyDbErrorMessage } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    const rows = await adminListDeletedUsers();
    return NextResponse.json({ deletedUsers: rows });
  } catch (e) {
    console.error("Admin deleted-users query failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
