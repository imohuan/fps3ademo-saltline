import { execSync } from "node:child_process";
const port = process.argv[2] || "5174";
const out = execSync(
  'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ' +
    port +
    ' -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess"',
).toString().trim();
if (!out) {
  console.log("no listener on " + port);
  process.exit(0);
}
execSync('powershell -NoProfile -Command "Stop-Process -Id ' + out + ' -Force"');
console.log("stopped pid " + out + " on port " + port);
