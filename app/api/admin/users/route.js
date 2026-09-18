import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminGuard";
import { adminListUsers, friendlyDbErrorMessage } from "@/lib/db";
import { resolveEffectiveTier, isTrialTier } from "@/lib/membership";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    const users = await adminListUsers();
    const shaped = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      tier: resolveEffectiveTier(u),
      isTrial: isTrialTier(u),
      activityCount: u.activity_count,
      createdAt: u.created_at,
      lastActiveAt: u.last_active_at,
    }));
    return NextResponse.json({ users: shaped });
  } catch (e) {
    console.error("Admin user list query failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
