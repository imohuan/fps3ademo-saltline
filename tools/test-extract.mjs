import { readFileSync } from "node:fs";

const inspector = readFileSync("inspector/main.js", "utf8");
const start = inspector.indexOf("function extractBlock(src, anchor) {");
const end = inspector.indexOf("// props share a handful of builder functions");
const code = inspector.slice(start, end);
const factory = new Function(code + "\nreturn extractBlock;");
const extractBlock = factory();

const cases = [
  ["src/world/props/basic-builders.js", "buildBasicContainer", 900],
  ["src/world/props/cargo-builders.js", "oR", 3000],
  ["src/world/props/detailed-builders.js", "VA", 150],
  ["src/weapons/weapon.js", "createWeapon", 5000],
  ["src/weapons/rig.js", "N_", 500],
  ["src/audio/library.js", "Go", 5000],
  ["src/audio/synthesis.js", "Av", 300],
  ["src/enemies/walker.js", "createWalker", 3000],
  ["src/enemies/models.js", "createWalkerModel", 2000],
];

let bad = 0;
for (const [file, anchor, min] of cases) {
  const src = readFileSync(file, "utf8");
  const block = extractBlock(src, anchor);
  const lines = block ? block.split("\n").length : 0;
  const ok = block && block.length >= min;
  if (!ok) bad++;
  console.log(
    (ok ? "OK  " : "FAIL") +
      "  " +
      file.padEnd(42) +
      anchor.padEnd(20) +
      String(lines).padStart(5) +
      " lines" +
      (block ? "  opens: " + block.slice(0, 46).replace(/\n/g, " ") : "  <null>"),
  );
}
console.log(bad === 0 ? "all ok" : bad + " failed");
