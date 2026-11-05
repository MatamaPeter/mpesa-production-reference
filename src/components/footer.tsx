import { site, storageKey } from "@/config/site";
import Link from "next/link";
export function Footer() {
  return (
    <footer>
      <div className="shell footer-top">
        <div>
          <Link href="/" className="footer-brand">
            {site.brand.wordmark}
            <span>{site.brand.mark}</span>
          </Link>
          <p>{site.brand.footer}</p>
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/#collection">The collection</Link>
          <Link href="/about">Our story</Link>
          <Link href="/cart">Your bag</Link>
          <Link href="/account">Your account</Link>
          <Link href="/saved">Saved & compared</Link>
          <Link href="/contact">Contact us</Link>
        </div>
        <div>
          <h2>Need to know</h2>
          <Link href="/policies/shipping">Shipping & delivery</Link>
          <Link href="/policies/returns">Returns & warranty</Link>
          <Link href="/policies/privacy">Privacy</Link>
          <Link href="/policies/terms">Terms of sale</Link>
        </div>
        <div className="footer-note">
          <span className="eyebrow">{site.copy.footerEyebrow}</span>
          <h2>{site.copy.footerTitle}</h2>
          <Link href="/#collection">Find your next essential ↗</Link>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>
          © {new Date().getFullYear()} {site.brand.name}
        </span>
        <span>{site.currencies.join(" · ")} · Cards and M-Pesa</span>
        {site.contact.email && (
          <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
        )}
        {site.contact.phone && (
          <a href={`tel:${site.contact.phone}`}>{site.contact.phone}</a>
        )}
      </div>
    </footer>
  );
}
