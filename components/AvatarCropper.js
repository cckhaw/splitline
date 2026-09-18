"use client";

import { useRef, useState, useCallback } from "react";

const VIEWPORT = 260;   // on-screen crop circle, css px
const EXPORT_SIZE = 480; // exported image resolution

// A dependency-free crop tool: drag to pan, a slider to zoom, and a
// circular preview matching how the photo will actually display. Built by
// hand rather than pulling in a cropper library since the whole thing is
// just pointer-drag math plus a canvas draw at save time.
export default function AvatarCropper({ imageUrl, naturalWidth, naturalHeight, onCancel, onSave }) {
  const baseScale = Math.max(VIEWPORT / naturalWidth, VIEWPORT / naturalHeight);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(() => centerOffset(naturalWidth, naturalHeight, baseScale));
  const [saving, setSaving] = useState(false);
  const dragRef = useRef(null);
  const imgRef = useRef(null);

  const scale = baseScale * zoom;

  function clamp(o, s) {
    const w = naturalWidth * s;
    const h = naturalHeight * s;
    const minX = Math.min(0, VIEWPORT - w);
    const minY = Math.min(0, VIEWPORT - h);
    return { x: Math.max(minX, Math.min(0, o.x)), y: Math.max(minY, Math.min(0, o.y)) };
  }

  function centerOffset(w, h, s) {
    return { x: (VIEWPORT - w * s) / 2, y: (VIEWPORT - h * s) / 2 };
  }

  function onPointerDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy }, scale));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function changeZoom(next) {
    const nextScale = baseScale * next;
    setZoom(next);
    setOffset((o) => clamp(o, nextScale));
  }

  const handleSave = useCallback(() => {
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_SIZE;
      canvas.height = EXPORT_SIZE;
      const ctx = canvas.getContext("2d");
      const ratio = EXPORT_SIZE / VIEWPORT;

      ctx.save();
      ctx.beginPath();
      ctx.arc(EXPORT_SIZE / 2, EXPORT_SIZE / 2, EXPORT_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        imgRef.current,
        offset.x * ratio,
        offset.y * ratio,
        naturalWidth * scale * ratio,
        naturalHeight * scale * ratio
      );
      ctx.restore();

      onSave(canvas.toDataURL("image/png"));
    } finally {
      setSaving(false);
    }
  }, [offset, scale, naturalWidth, naturalHeight, onSave]);

  return (
    <div className="avatar-cropper">
      <div
        className="avatar-cropper-viewport"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: naturalWidth * scale,
            height: naturalHeight * scale,
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            userSelect: "none",
          }}
        />
      </div>
      <div className="hint" style={{ marginTop: 8, marginBottom: 4 }}>Drag to reposition</div>
      <input
        type="range"
        min="1"
        max="3"
        step="0.01"
        value={zoom}
        onChange={(e) => changeZoom(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="primary" type="button" onClick={handleSave} disabled={saving} style={{ width: "auto", padding: "8px 16px" }}>
          {saving ? "Saving…" : "Save photo"}
        </button>
        <button type="button" onClick={onCancel} style={{ width: "auto", padding: "8px 16px" }}>Cancel</button>
      </div>
    </div>
  );
}
