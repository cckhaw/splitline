import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminGuard";
import { adminListUsers, adminEventTypeTotals, adminDeviceBrowserSplit, friendlyDbErrorMessage } from "@/lib/db";
import { resolveEffectiveTier, isTrialTier, TIERS } from "@/lib/membership";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    const [users, eventTotals, deviceRows] = await Promise.all([
      adminListUsers(),
      adminEventTypeTotals(),
      adminDeviceBrowserSplit(),
    ]);

    const tierBreakdown = Object.fromEntries(Object.keys(TIERS).map((k) => [k, 0]));
    let trialCount = 0;
    for (const u of users) {
      const tier = resolveEffectiveTier(u);
      tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
      if (isTrialTier(u)) trialCount++;
    }

    const deviceBreakdown = {};
    const browserBreakdown = {};
    for (const r of deviceRows) {
      if (r.device_type) deviceBreakdown[r.device_type] = (deviceBreakdown[r.device_type] || 0) + 1;
      if (r.browser) browserBreakdown[r.browser] = (browserBreakdown[r.browser] || 0) + 1;
    }

    return NextResponse.json({
      totalUsers: users.length,
      tierBreakdown,
      trialCount,
      eventTotals,
      deviceBreakdown,
      browserBreakdown,
      sampledUsers: deviceRows.length,
    });
  } catch (e) {
    console.error("Admin overview query failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
