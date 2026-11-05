"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export function VerifyAccount({ token }: { token: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    router = useRouter();
  return (
    <main id="main" className="shell section prose">
      <span className="eyebrow">ONE-TIME SIGN-IN</span>
      <h1>
        Welcome <em>back.</em>
      </h1>
      <p>
        Confirm below to finish signing in. Your link expires after 15 minutes
        and can be used once. We never sign you in automatically when an email
        scanner opens a link.
      </p>
      <button
        className="button dark"
        disabled={busy || !/^[a-f0-9]{64}$/.test(token)}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/account/auth/verify", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token }),
              }),
              data = await r.json();
            if (!r.ok) throw new Error(data.error);
            window.dispatchEvent(new Event("account-changed"));
            router.replace("/account");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign-in failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing in…" : "Confirm sign-in"}
      </button>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <p>
        <Link className="text-link" href="/account">
          Request another link
        </Link>
      </p>
    </main>
  );
}
