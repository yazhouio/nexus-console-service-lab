import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertContributionContractCompatible } from '../../packages/plugin-runtime/src/contribution-compatibility.ts';
test('publishing gates reject new kinds, profiles and Point routing on older targets', () => {
  for (const manifest of [
    { actions: [{ id: 'save' }], contributions: {} },
    { extensionPoints: [{ id: 'cards', kind: 'surface', profile: 'home.cards@1' }], contributions: {} },
    { contributions: { routes: [{ id: 'route', point: { id: 'routes' } }] } },
    { contributions: { extensions: [{ kind: 'tab', id: 'tab' }] } },
  ]) {
    assert.throws(() => assertContributionContractCompatible(manifest, 2), /CONTRIBUTION_CONTRACT_UNSUPPORTED/);
    assert.doesNotThrow(() => assertContributionContractCompatible(manifest, 3));
  }
});
