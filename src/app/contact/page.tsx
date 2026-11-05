import type { Metadata } from "next";
import { site } from "@/config/site";
import { ContactForm } from "@/components/contact-form";
export const metadata: Metadata = { title: "Contact & support" };
export default function Page() {
  return (
    <main id="main" className="shell section">
      <span className="eyebrow">HERE TO HELP</span>
      <h1 className="page-title">
        Let’s <em>talk.</em>
      </h1>
      <div className="account-layout">
        <ContactForm />
        <aside className="order-summary">
          <h2>{site.brand.name}</h2>
          {site.contact.email && (
            <p>
              <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
            </p>
          )}
          {site.contact.phone && (
            <p>
              <a href={`tel:${site.contact.phone}`}>{site.contact.phone}</a>
            </p>
          )}
          {site.contact.address && <p>{site.contact.address}</p>}
          {site.contact.supportHours && <p>{site.contact.supportHours}</p>}
          {!site.contact.email && !site.contact.phone && (
            <p>
              Public contact details are awaiting merchant approval. Requests
              submitted through this form are recorded in the store’s support
              queue when commerce is enabled.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
