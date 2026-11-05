import Link from "next/link";
export function Footer() {
  return (
    <footer>
      <div className="shell footer-top">
        <div>
          <Link href="/" className="footer-brand">
            LERON<span>®</span>
          </Link>
          <p>
            Good tech. Great possibilities.
            <br />
            Made for your everyday.
          </p>
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/#collection">The collection</Link>
          <Link href="/about">Our story</Link>
          <Link href="/cart">Your bag</Link>
        </div>
        <div>
          <h2>Need to know</h2>
          <Link href="/policies/shipping">Shipping & delivery</Link>
          <Link href="/policies/returns">Returns & warranty</Link>
          <Link href="/policies/privacy">Privacy</Link>
          <Link href="/policies/terms">Terms of sale</Link>
        </div>
        <div className="footer-note">
          <span className="eyebrow">STAY CURIOUS.</span>
          <h2>
            A better everyday
            <br />
            starts with a little tech.
          </h2>
          <Link href="/#collection">Find your next essential ↗</Link>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Leron Urban Electronics</span>
        <span>USD & KES · Cards and M-Pesa at launch</span>
      </div>
    </footer>
  );
}
