import { commerceEnabled } from "@/lib/store";
import { site, storageKey } from "@/config/site";
import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Our story" };
export default function About() {
  return (
    <main id="main" className="shell section prose">
      <span className="eyebrow">{site.brand.wordmark} · OUR PERSPECTIVE</span>
      <h1>
        {site.copy.aboutTitle}
        <br />
        <em>{site.copy.aboutAccent}</em>
      </h1>
      <p className="lead">
        {site.brand.name}. {site.copy.aboutIntro}
      </p>
      <h2>Considered, not complicated.</h2>
      <p>{site.copy.aboutBody}</p>
      <h2>
        {commerceEnabled()
          ? "Clear information before you choose."
          : "A transparent beginning."}
      </h2>
      <p>
        {commerceEnabled()
          ? "Explore product specifications, delivery information and the warranty stated on each listing. Review the final total, return policy and delivery details before approving payment."
          : "The current collection is a preview. Product illustrations, names and prices are drafts. We’ll confirm the products, specifications, shipping destinations, warranties and store policies before accepting orders."}
      </p>
      <Link className="button dark" href="/#collection">
        Explore the collection ↗
      </Link>
    </main>
  );
}
