import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustList, planTrust } from '../npm-trust.mjs';

const repository = 'yazhouio/nexus-console-service-lab';
const binding = (overrides = {}) => ({
  type: 'github',
  id: 'good',
  file: 'release.yml',
  repository,
  environment: 'npm',
  permissions: ['createPackage'],
  ...overrides,
});

test('parses the pinned npm trust list output around 2FA prompts', () => {
  // Captured from npm@11.19.1 displayResponseBody, with a web 2FA prompt in front.
  const stdout = [
    'Authenticate your account at:',
    'https://www.npmjs.com/auth/cli/0000',
    'Press ENTER to open in the browser...',
    '',
    'type: github',
    'id: a1',
    'file: release.yml',
    `repository: ${repository}`,
    'environment: npm',
    'permissions: publish',
    '',
    'type: github',
    'id: b2',
    'file: release.yml',
    `repository: ${repository}`,
    'permissions: stage publish, publish',
    '',
  ].join('\r\n');
  assert.deepEqual(parseTrustList(stdout), [
    binding({ id: 'a1' }),
    {
      type: 'github',
      id: 'b2',
      file: 'release.yml',
      repository,
      permissions: ['createStagedPackage', 'createPackage'],
    },
  ]);
  assert.deepEqual(
    parseTrustList('\nNo trust configurations found for package (@feforgejs/x)\n'),
    [],
  );
});

test('accepts only a binding with matching repository, workflow, environment and publish permission', () => {
  assert.deepEqual(planTrust([binding()], { repository }), {
    satisfied: true,
    revoke: [],
    create: false,
    unrelated: [],
  });
  assert.equal(planTrust([binding()], { repository: repository.toUpperCase() }).satisfied, true);
  assert.deepEqual(planTrust([], { repository }), {
    satisfied: false,
    revoke: [],
    create: true,
    unrelated: [],
  });
});

test('revokes and recreates same-workflow bindings with the wrong environment or permissions', () => {
  const missingEnvironment = binding({ id: 'no-env', environment: undefined });
  const wrongEnvironment = binding({ id: 'wrong-env', environment: 'production' });
  const stagedOnly = binding({ id: 'staged', permissions: ['createStagedPackage'] });
  const noPermissions = binding({ id: 'none', permissions: undefined });
  for (const stale of [missingEnvironment, wrongEnvironment, stagedOnly, noPermissions]) {
    const plan = planTrust([stale], { repository });
    assert.equal(plan.satisfied, false, stale.id);
    assert.equal(plan.create, true, stale.id);
    assert.deepEqual(plan.revoke, [stale], stale.id);
  }
  const mixed = planTrust([stagedOnly, binding()], { repository });
  assert.equal(mixed.create, false);
  assert.deepEqual(mixed.revoke, [stagedOnly]);
});

test('leaves bindings for other repositories or workflows untouched', () => {
  const otherRepo = binding({ id: 'other-repo', repository: 'someone/else' });
  const otherWorkflow = binding({ id: 'other-workflow', file: 'publish.yml' });
  const plan = planTrust([otherRepo, otherWorkflow], { repository });
  assert.equal(plan.create, true);
  assert.deepEqual(plan.revoke, []);
  assert.deepEqual(plan.unrelated, [otherRepo, otherWorkflow]);
});
