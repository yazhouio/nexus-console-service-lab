import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, checkImport } from '../check-boundaries.mjs';

test('rejects reverse imports, re-exports, dynamic imports and private cross-package paths', () => {
  for (const [file, source] of [
    ['apps/console/src/plugins/feature.ts', "import x from '../HostContext'"],
    ['packages/browser-host/src/App.tsx', "import { consoleCore } from '@feforgejs/console-core'"],
    ['packages/plugin-runtime/src/plugin.ts', "export * from '@feforgejs/cluster-api'"],
    [
      'apps/console/src/plugins/feature.ts',
      "const context = import('@feforgejs/browser-host/testing')",
    ],
    ['apps/example-restricted-plugin/src/main.ts', "import x from '@feforgejs/console-core'"],
    [
      'apps/console/src/plugins/feature.ts',
      "import x from '../../../../packages/plugin-runtime/src/bootstrap'",
    ],
    [
      'packages/console-core-api/src/index.ts',
      "import { createUiRuntime } from '@feforgejs/plugin-runtime'",
    ],
    [
      'packages/console-core/src/Overview.tsx',
      "import type { ClusterCapability } from '@feforgejs/cluster-api'",
    ],
  ])
    assert.equal(checkSource(file, source).length, 1, source);
  assert.ok(checkImport('packages/browser-host/package.json', '@feforgejs/console-core', true));
});

test('permits Distribution assembly and public author contracts while ignoring comments', () => {
  for (const [file, source] of [
    ['apps/console/src/distribution.ts', "import { consoleCore } from '@feforgejs/console-core'"],
    [
      'apps/console/src/ui-fixtures.tsx',
      "import { useHostTestServices } from '@feforgejs/browser-host/testing'",
    ],
    [
      'packages/console-core-api/src/index.ts',
      "import type { PointProfile } from '@feforgejs/plugin-runtime'",
    ],
    [
      'apps/console/src/plugins/feature.ts',
      "import { Slot } from '@feforgejs/plugin-runtime/react'; // import bad from '@feforgejs/console-core'",
    ],
  ])
    assert.deepEqual(checkSource(file, source), [], source);
});
