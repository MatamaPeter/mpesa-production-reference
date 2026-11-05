import { deploymentIssues } from "../src/lib/deployment";
const issues = deploymentIssues({
  ...process.env,
  COMMERCE_LIVE: "true",
  COMMERCE_STAGE: "live",
});
if (issues.length) {
  console.error("Production configuration is incomplete:");
  for (const issue of issues) console.error("- " + issue);
  process.exitCode = 1;
} else
  console.log(
    "Static production configuration checks passed. Run runtime readiness, provider acceptance and deployment load/recovery tests before release.",
  );
