import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const re = new RegExp(args[1]);
const lines = readFileSync(args[0], "utf8").split("\n");
for (let i = 0; i < lines.length; i++) {
  if (re.test(lines[i])) console.log(String(i + 1).padStart(4) + ": " + lines[i].trim());
}
