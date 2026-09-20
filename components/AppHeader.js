import Link from "next/link";
import TopNav from "@/components/TopNav";
import UserMenu from "@/components/UserMenu";

// The header shared by every page behind login (dashboard, training plan,
// account) — wordmark + primary nav on the left, identity/hamburger menu
// on the right. One component so the nav can't drift out of sync between
// pages the way three hand-rolled headers eventually would.
export default function AppHeader({ name, tier, isTrial, avatarUrl, onResync, resyncing, ouraConnected, onOuraChange }) {
  return (
    <header className="top">
      <div className="top-left">
        <Link href="/app" className="wordmark">
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="split">SPLIT</span><span className="line">LINE</span>
        </Link>
        <TopNav />
      </div>
      <nav className="navlinks">
        <UserMenu
          name={name}
          tier={tier}
          isTrial={isTrial}
          avatarUrl={avatarUrl}
          onResync={onResync}
          resyncing={resyncing}
          ouraConnected={ouraConnected}
          onOuraChange={onOuraChange}
        />
      </nav>
    </header>
  );
}
