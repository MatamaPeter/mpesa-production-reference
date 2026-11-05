import { site, storageKey } from "@/config/site";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
const policies: Record<
  string,
  { title: string; intro: string; sections: [string, string][] }
> = {
  shipping: {
    title: "Shipping & delivery",
    intro:
      "Delivery destinations and rates are being prepared. No shipping promises are made during the preview.",
    sections: [
      [
        "Before checkout opens",
        "We will publish supported countries, dispatch timelines, delivery estimates, courier options and tracking procedures.",
      ],
      [
        "International orders",
        "Import duties, taxes, restrictions and responsibility for customs charges must be clearly disclosed before sale. Only explicitly configured destinations will be accepted.",
      ],
    ],
  },
  returns: {
    title: "Returns & warranty",
    intro:
      "The returns and warranty policy is awaiting business and legal approval. Preview products are not offered for sale.",
    sections: [
      [
        "A clear policy before you buy",
        "Eligibility, time limits, return shipping costs, refund processing and exclusions will be published before checkout opens.",
      ],
      [
        "Product warranties",
        "Manufacturer and store warranty coverage must be confirmed for each actual product. No warranty duration is implied by this preview.",
      ],
    ],
  },
  privacy: {
    title: "Privacy notice",
    intro:
      "This draft explains the current application’s data use. The business must add its legal identity, contact details, retention periods and jurisdiction-specific rights before launch.",
    sections: [
      [
        "Your browsing data",
        "The shopping bag and selected currency are stored in your browser’s local storage. Guest checkout and administrator sessions use HTTP-only cookies. No advertising or analytics trackers are included.",
      ],
      [
        "Order information",
        "When checkout is enabled, the application stores delivery contact details, items, prices and payment status in MongoDB. Card details are entered on Stripe’s hosted checkout, not stored in this application. M-Pesa processing sends the payer’s phone number and amount to Safaricom.",
      ],
      [
        "Access and retention",
        "Order access is scoped to the browser’s guest session. Store operators must configure access controls, backups, retention and a process for data access or deletion requests before launch.",
      ],
    ],
  },
  terms: {
    title: "Terms of sale",
    intro:
      "These are preparation notes, not final legal terms. Checkout remains disabled while commercial policies are unapproved.",
    sections: [
      [
        "Merchant information",
        "The operating entity, registered address, customer support contact and applicable law must be supplied by the store operator.",
      ],
      [
        "Prices and orders",
        "Preview prices are illustrative. Live product prices and stock are determined on the server. An order is not paid until its payment provider event has been verified.",
      ],
      [
        "Before launch",
        "The merchant must approve payment terms, taxes, delivery, cancellation, returns, warranties and consumer rights for every supported market.",
      ],
    ],
  },
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ policy: string }>;
}): Promise<Metadata> {
  return {
    title: policies[(await params).policy]?.title ?? "Policy not found",
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ policy: string }>;
}) {
  const key = (await params).policy;
  const policy = policies[key];
  const approvedCopy =
    site.policy[key as "shipping" | "returns" | "privacy" | "terms"];
  if (!policy) notFound();
  return (
    <main id="main" className="shell section prose">
      <span className="eyebrow">
        THE DETAILS MATTER ·{" "}
        {site.policy.approved ? "STORE POLICY" : "DRAFT POLICY"}
      </span>
      <h1>{policy.title}</h1>
      {approvedCopy ? (
        <div className="policy-copy">{approvedCopy}</div>
      ) : (
        <p className="lead">{policy.intro}</p>
      )}
      {!approvedCopy &&
        policy.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
    </main>
  );
}
