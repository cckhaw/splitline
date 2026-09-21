import Link from "next/link";

// The top-left brand mark shared by every admin page: the same
// logo/wordmark used on user-facing pages, plus an "Admin" badge so it's
// unmistakable which module you're in. Each page still builds its own
// .admin-top row (some need a "Back to dashboard" link, one needs "Log
// out") — this is just the left-hand brand piece, kept in one place so it
// can't drift between pages.
export default function AdminBrand() {
  return (
    <div className="admin-brand">
      <Link href="/" className="wordmark">
        <img src="/logo.png" alt="" width={26} height={26} />
        <span className="split">SPLIT</span><span className="line">LINE</span>
      </Link>
      <span className="admin-module-badge">Admin</span>
    </div>
  );
}
