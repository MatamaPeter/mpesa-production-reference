import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Our story" };
export default function About() {
  return (
    <main id="main" className="shell section prose">
      <span className="eyebrow">THE LERON PERSPECTIVE</span>
      <h1>
        Tech for life
        <br />
        <em>in motion.</em>
      </h1>
      <p className="lead">
        Leron Urban Electronics is being built around a simple idea: technology
        should make everyday life more interesting, more connected and a little
        more your own.
      </p>
      <h2>Considered, not complicated.</h2>
      <p>
        Our collection brings together audio, wearables, cameras and workspace
        essentials. We’re preparing an international store with market-specific
        prices and payment options, including cards and M-Pesa for Kenya.
      </p>
      <h2>A transparent beginning.</h2>
      <p>
        The current collection is a preview. Product illustrations, names and
        prices are drafts. We’ll confirm the products, specifications, shipping
        destinations, warranties and store policies before accepting orders.
      </p>
      <Link className="button dark" href="/#collection">
        Explore the collection ↗
      </Link>
    </main>
  );
}
