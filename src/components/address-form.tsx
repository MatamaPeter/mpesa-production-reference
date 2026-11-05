"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clientAPI } from "./account-panel";
export function AddressForm() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    router = useRouter();
  return (
    <main id="main" className="shell section prose">
      <h1>
        Make yourself <em>at home.</em>
      </h1>
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            const data = await clientAPI("/api/account");
            if (!data.user) throw new Error("Sign in first");
            const address = Object.fromEntries(
              [
                "label",
                "name",
                "phone",
                "line1",
                "line2",
                "city",
                "region",
                "postalCode",
                "country",
              ].map((k) => [k, String(f.get(k) ?? "")]),
            );
            await clientAPI("/api/account", {
              method: "PATCH",
              body: JSON.stringify({
                name: data.user.name || data.user.email,
                addresses: [
                  ...data.user.addresses.map((a: Record<string, unknown>) => {
                    const { _id, ...rest } = a;
                    return rest;
                  }),
                  address,
                ],
              }),
            });
            router.push("/account");
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Could not save address",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          { name: "label", text: "Address label", required: true },
          { name: "name", text: "Recipient name", required: true },
          { name: "phone", text: "Phone", required: true },
          { name: "line1", text: "Street address", required: true },
          { name: "line2", text: "Apartment / suite" },
          { name: "city", text: "City", required: true },
          { name: "region", text: "State / region" },
          { name: "postalCode", text: "Postal code" },
          {
            name: "country",
            text: "Country code (e.g. KE or US)",
            required: true,
          },
        ].map((f) => (
          <label key={f.name}>
            {f.text}
            <input
              name={f.name}
              required={f.required}
              maxLength={f.name === "country" ? 2 : 160}
              pattern={f.name === "country" ? "[A-Z]{2}" : undefined}
            />
          </label>
        ))}
        <button className="button dark" disabled={busy}>
          Save address
        </button>
      </form>
      {message && (
        <p role="alert" className="error-box">
          {message}
        </p>
      )}
    </main>
  );
}
