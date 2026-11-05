import { adminPrincipal, isAdmin } from "@/lib/admin";
import { OperationsPanel } from "@/components/operations-panel";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await adminPrincipal();
  if (!actor)
    return (
      <main id="main" className="shell section prose">
        <h1>
          Staff access <em>required.</em>
        </h1>
        <p>Sign in with an authorized account and verify your authenticator.</p>
        <Link href="/account" className="button dark">
          Open account security
        </Link>
      </main>
    );
  return <OperationsPanel role={actor.role} />;
}
