import { readFileSync } from 'node:fs';
import { assertContributionContractCompatible } from '../packages/plugin-runtime/src/contribution-compatibility.ts';
const [file, version] = process.argv.slice(2);
if (!file || !['1', '2', '3'].includes(version))
  throw new Error(
    'Usage: pnpm check:plugin-contract <manifest-or-installation.json> <target-contract-version>',
  );
const value = JSON.parse(readFileSync(file, 'utf8'));
assertContributionContractCompatible(value.manifest ?? value, Number(version));
console.log(`Contribution contract is compatible with target version ${version}.`);
