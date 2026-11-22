import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const lines = readFileSync(args[0], "utf8").split("\n");
const from = Number(args[1]);
const to = Math.min(lines.length, Number(args[2]));
const out = [];
for (let i = from - 1; i < to; i++) out.push(String(i + 1).padStart(4) + ": " + lines[i]);
console.log(out.join("\n"));
