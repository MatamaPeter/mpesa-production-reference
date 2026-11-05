import { randomBytes, scryptSync } from "node:crypto";
// Input is read from stdin, never from command arguments or saved to disk.
let password = "";
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, "");
if (password.length < 16) {
  console.error("Use at least 16 characters. Pipe the password through stdin.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
console.log(salt + ":" + scryptSync(password, salt, 64).toString("hex"));
