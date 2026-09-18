import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminGuard";
import { adminSetDeletedUserContacted, adminSetDeletedUserNotes, adminDeleteDeletedUserRecord, friendlyDbErrorMessage } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const { contacted, notes } = await request.json().catch(() => ({}));

  try {
    if (typeof contacted === "boolean") await adminSetDeletedUserContacted(id, contacted);
    if (typeof notes === "string") await adminSetDeletedUserNotes(id, notes);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin deleted-user update failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}

// Purges a churn record outright — the honest end state once an operator
// has followed up (or a former user asks for even this to be erased, per
// the Privacy Policy). Not automatic; there's no scheduled job in this
// app to age these out on its own.
export async function DELETE(request, { params }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  try {
    await adminDeleteDeletedUserRecord(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin deleted-user purge failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
