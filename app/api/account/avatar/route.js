import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { setUploadedAvatar, friendlyDbErrorMessage } from "@/lib/db";

export const runtime = "nodejs";

// Generous but bounded — this is a base64 data URI landing straight in a
// TEXT column, not a file upload to object storage, so it stays small.
const MAX_DATA_URL_LENGTH = 2_000_000; // ~1.5MB of image data once decoded

// The client crops to a square canvas and hands over a data: URI (see the
// account page's crop UI) — nothing is decoded server-side, just validated
// and stored, since Postgres TEXT holds it fine without needing blob storage.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { dataUrl } = await request.json().catch(() => ({}));
  if (typeof dataUrl !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) {
    return NextResponse.json({ error: "invalid_image", message: "That doesn't look like a valid image." }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return NextResponse.json({ error: "image_too_large", message: "Please crop to a smaller image and try again." }, { status: 400 });
  }

  try {
    await setUploadedAvatar(session.userId, dataUrl);
    return NextResponse.json({ ok: true, avatarUrl: dataUrl });
  } catch (e) {
    console.error("Failed to save avatar:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
