import { site, storageKey } from "@/config/site";
import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="shell section empty-state">
      <span className="eyebrow">404 · A LITTLE OFF TRACK</span>
      <h1>This one’s out of range.</h1>
      <p>Let’s get you back to something good.</p>
      <Link className="button dark" href="/">
        Back to {site.brand.wordmark} ↗
      </Link>
    </main>
  );
}
