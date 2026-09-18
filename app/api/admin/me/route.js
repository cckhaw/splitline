import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getAdminSession(request);
  return NextResponse.json({ authenticated: Boolean(session) });
}
