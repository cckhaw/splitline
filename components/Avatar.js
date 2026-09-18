// A round profile photo, or a plain initial-letter placeholder when the
// athlete has no photo on file yet (no Strava photo fetched, no upload).
export default function Avatar({ src, name, size = 36 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const style = { width: size, height: size, borderRadius: "50%", flexShrink: 0 };

  if (src) {
    return <img src={src} alt="" style={{ ...style, objectFit: "cover" }} />;
  }
  return (
    <div
      style={{
        ...style,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--brand)", color: "#10151f", fontWeight: 600,
        fontSize: Math.round(size * 0.44),
      }}
    >
      {initial}
    </div>
  );
}
