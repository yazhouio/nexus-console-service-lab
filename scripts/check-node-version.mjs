import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

export const requiredNodeRange = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).engines.node;

export function supportsNode(version, range = requiredNodeRange) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const bounds = /^>=(\d+)\.(\d+)\.(\d+)\s+<(\d+)$/.exec(range);
  if (!match || !bounds) return false;
  const [, major, minor, patch] = match.map(Number);
  const [, minimumMajor, minimumMinor, minimumPatch, maximumMajor] = bounds.map(Number);
  const atLeastMinimum = major > minimumMajor
    || major === minimumMajor && (minor > minimumMinor || minor === minimumMinor && patch >= minimumPatch);
  return atLeastMinimum && major < maximumMajor;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!supportsNode(process.versions.node)) {
    console.error(`Node ${requiredNodeRange} is required; actual Node is ${process.versions.node}.`);
    process.exitCode = 1;
  } else console.log(`Node gate passed: ${process.versions.node}`);
}
