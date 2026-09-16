import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

// The implementation now incorporates the experiments. Historical comparisons
// must continue to use the pre-implementation source and tests, not today's tree.
export const architectureBaseline = 'e1b594c3a12816b05c4e7310bd2cf121fa6ae81d';
export function restoreArchitectureBaseline(root, scratch) {
  const paths = [
    'packages/plugin-runtime/src',
    'packages/plugin-runtime/test',
    'apps/host/src',
    'apps/host/test',
  ];
  const archive = execFileSync('git', ['archive', architectureBaseline, '--', ...paths], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  });
  for (const path of paths) rmSync(join(scratch, path), { recursive: true, force: true });
  execFileSync('tar', ['-x', '-C', scratch], { input: archive });
}
