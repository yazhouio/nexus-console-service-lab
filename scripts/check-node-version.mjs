import { pathToFileURL } from 'node:url';

export function supportsNode(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major > 22 || major === 22 && minor >= 22;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!supportsNode(process.versions.node)) {
    console.error(`Node >=22.22.0 is required; actual Node is ${process.versions.node}.`);
    process.exitCode = 1;
  } else console.log(`Node gate passed: ${process.versions.node}`);
}
