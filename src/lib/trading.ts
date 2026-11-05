import "server-only";
import { deploymentIssues } from "./deployment";
import { RequestError } from "./http";
export function assertTradingAllowed() {
  const issues = deploymentIssues(process.env);
  if (issues.length) {
    console.error(
      JSON.stringify({ event: "checkout.configuration_blocked", issues }),
    );
    throw new RequestError("Checkout is awaiting store launch validation", 503);
  }
}
