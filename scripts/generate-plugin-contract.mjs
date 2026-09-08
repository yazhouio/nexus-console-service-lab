import './plugin-contract/register.mjs';
import { resolve } from 'node:path';
import { rm, mkdir, writeFile } from 'node:fs/promises';

// Never accept a caller-supplied cleanup path; this directory contains only generated pages.
const output = resolve(import.meta.dirname, '../apps/docs/docs/generated/plugin-contract');
await rm(output, { recursive: true, force: true });
try {
  const { generatePages } = await import('./plugin-contract/generate.ts');
  const { sources, contracts } = await import('./plugin-contract/sources.ts');
  const pages = generatePages(sources, contracts);
  await mkdir(output, { recursive: true });
  for (const [name, contents] of pages) await writeFile(resolve(output, name), contents);
  console.log(`Generated ${pages.size} plugin contract pages.`);
} catch (error) {
  await rm(output, { recursive: true, force: true });
  throw error;
}
