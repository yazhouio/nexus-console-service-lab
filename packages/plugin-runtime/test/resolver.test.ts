import { describe, expect, it } from 'vitest';

import {
  isCapabilityId,
  isHostApiId,
  PluginResolutionError,
  resolvePluginSet,
  type CapabilityId,
  type PluginCandidate,
} from '../src';

function plugin(
  id: string,
  options: {
    readonly kind?: PluginCandidate['kind'];
    readonly requires?: readonly CapabilityId[];
    readonly provides?: readonly CapabilityId[];
  } = {},
): PluginCandidate {
  return {
    kind: options.kind ?? 'builtin',
    descriptor: {
      id,
      version: '1.0.0',
      requires: options.requires ?? [],
      provides: options.provides ?? [],
    },
  };
}

function captureResolutionError(run: () => unknown): PluginResolutionError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PluginResolutionError);
    return error as PluginResolutionError;
  }

  throw new Error('Expected PluginResolutionError.');
}

describe('versioned identifiers', () => {
  it.each(['kubesphere.cluster@2', 'kubesphere.console@1', 'scope-feature@0'])(
    'accepts an explicit integer major in %s',
    (value) => {
      expect(isCapabilityId(value)).toBe(true);
      expect(isHostApiId(value)).toBe(true);
    },
  );

  it.each([
    'kubesphere.cluster',
    'kubesphere.cluster@^2',
    'kubesphere.cluster@2.1',
    'kubesphere.cluster@>=2',
    '@2',
  ])('rejects missing majors and ranges in %s', (value) => {
    expect(isCapabilityId(value)).toBe(false);
    expect(isHostApiId(value)).toBe(false);
  });
});

describe('resolvePluginSet', () => {
  it('resolves provider edges and places providers before consumers', () => {
    const resolution = resolvePluginSet(
      [
        plugin('console-core', { requires: ['kubesphere.cluster@2'] }),
        plugin('cluster', { provides: ['kubesphere.cluster@2'] }),
      ],
      ['console-core'],
    );

    expect(resolution.order).toEqual(['cluster', 'console-core']);
    expect([...resolution.coreClosure]).toEqual(['cluster', 'console-core']);
    expect(resolution.dependencies).toEqual([
      {
        consumer: 'console-core',
        capability: 'kubesphere.cluster@2',
        provider: 'cluster',
      },
    ]);
    expect(resolution.skipped.size).toBe(0);
  });

  it('uses pluginId as a deterministic topological tie-breaker', () => {
    const candidates = [
      plugin('console-core', { requires: ['kubesphere.cluster@2'] }),
      plugin('cluster', { provides: ['kubesphere.cluster@2'] }),
      plugin('zeta'),
      plugin('alpha'),
    ];

    const forward = resolvePluginSet(candidates, ['console-core']);
    const reverse = resolvePluginSet([...candidates].reverse(), ['console-core']);

    expect(forward.order).toEqual(['alpha', 'cluster', 'console-core', 'zeta']);
    expect(reverse.order).toEqual(forward.order);
    expect(reverse.dependencies).toEqual(forward.dependencies);
  });

  it('treats a capability major mismatch as missing for a non-core consumer', () => {
    const resolution = resolvePluginSet(
      [
        plugin('console-core'),
        plugin('cluster-v1', { provides: ['kubesphere.cluster@1'] }),
        plugin('workloads', { requires: ['kubesphere.cluster@2'] }),
      ],
      ['console-core'],
    );

    expect(resolution.order).toEqual(['cluster-v1', 'console-core']);
    expect(resolution.skipped.get('workloads')).toMatchObject({
      code: 'MISSING_CAPABILITY',
      capability: 'kubesphere.cluster@2',
    });
  });

  it('skips every non-core duplicate provider and its consumers', () => {
    const resolution = resolvePluginSet(
      [
        plugin('console-core'),
        plugin('cluster-a', { provides: ['kubesphere.cluster@2'] }),
        plugin('cluster-b', { provides: ['kubesphere.cluster@2'] }),
        plugin('workloads', { requires: ['kubesphere.cluster@2'] }),
      ],
      ['console-core'],
    );

    expect(resolution.order).toEqual(['console-core']);
    expect(resolution.skipped.get('cluster-a')?.code).toBe('DUPLICATE_CAPABILITY_PROVIDER');
    expect(resolution.skipped.get('cluster-b')?.code).toBe('DUPLICATE_CAPABILITY_PROVIDER');
    expect(resolution.skipped.get('workloads')?.code).toBe('DUPLICATE_CAPABILITY_PROVIDER');
  });

  it('fails when a duplicate provider affects the Core Closure', () => {
    const error = captureResolutionError(() =>
      resolvePluginSet(
        [
          plugin('console-core', { requires: ['kubesphere.cluster@2'] }),
          plugin('cluster-a', { provides: ['kubesphere.cluster@2'] }),
          plugin('cluster-b', { provides: ['kubesphere.cluster@2'] }),
        ],
        ['console-core'],
      ),
    );

    expect(error.issue).toMatchObject({
      code: 'DUPLICATE_CAPABILITY_PROVIDER',
      pluginId: 'console-core',
      capability: 'kubesphere.cluster@2',
    });
  });

  it('fails fast when the Core Closure contains a dependency cycle', () => {
    const error = captureResolutionError(() =>
      resolvePluginSet(
        [
          plugin('console-core', {
            requires: ['capability.cluster@1'],
            provides: ['capability.shell@1'],
          }),
          plugin('cluster', {
            requires: ['capability.shell@1'],
            provides: ['capability.cluster@1'],
          }),
        ],
        ['console-core'],
      ),
    );

    expect(error.issue).toMatchObject({
      code: 'CIRCULAR_DEPENDENCY',
      path: [
        'console-core',
        'capability.cluster@1',
        'cluster',
        'capability.shell@1',
        'console-core',
      ],
    });
  });

  it('skips a non-core cycle and returns its complete dependency path', () => {
    const resolution = resolvePluginSet(
      [
        plugin('console-core'),
        plugin('alpha', {
          requires: ['capability.beta@1'],
          provides: ['capability.alpha@1'],
        }),
        plugin('beta', {
          requires: ['capability.alpha@1'],
          provides: ['capability.beta@1'],
        }),
      ],
      ['console-core'],
    );

    expect(resolution.order).toEqual(['console-core']);
    expect(resolution.skipped.get('alpha')).toMatchObject({
      code: 'CIRCULAR_DEPENDENCY',
      path: ['alpha', 'capability.beta@1', 'beta', 'capability.alpha@1', 'alpha'],
    });
    expect(resolution.skipped.get('beta')?.code).toBe('CIRCULAR_DEPENDENCY');
  });

  it('fails with a complete path when Core depends on a Restricted provider', () => {
    const error = captureResolutionError(() =>
      resolvePluginSet(
        [
          plugin('console-core', { requires: ['kubesphere.cluster@2'] }),
          plugin('external-cluster-provider', {
            kind: 'restricted',
            provides: ['kubesphere.cluster@2'],
          }),
        ],
        ['console-core'],
      ),
    );

    expect(error.issue).toMatchObject({
      code: 'CORE_DEPENDENCY_NOT_BUILTIN',
      pluginId: 'external-cluster-provider',
      path: ['console-core', 'kubesphere.cluster@2', 'external-cluster-provider'],
    });
  });

  it('fails when a Core root is missing', () => {
    const error = captureResolutionError(() => resolvePluginSet([], ['console-core']));

    expect(error.issue).toMatchObject({
      code: 'CORE_ROOT_MISSING',
      pluginId: 'console-core',
      path: ['console-core'],
    });
  });

  it('keeps a Builtin when a Restricted plugin collides with its id', () => {
    const resolution = resolvePluginSet(
      [plugin('console-core'), plugin('console-core', { kind: 'restricted' })],
      ['console-core'],
    );

    expect(resolution.order).toEqual(['console-core']);
    expect(resolution.skipped.has('console-core')).toBe(false);
    expect(resolution.rejected).toHaveLength(1);
    expect(resolution.rejected[0].candidate.kind).toBe('restricted');
    expect(resolution.rejected[0].issue.code).toBe('PLUGIN_ID_COLLISION');
  });

  it('treats duplicate Builtin ids as a Host build error', () => {
    const error = captureResolutionError(() =>
      resolvePluginSet([plugin('console-core'), plugin('console-core')], ['console-core']),
    );

    expect(error.issue.code).toBe('PLUGIN_ID_COLLISION');
  });

  it('skips an invalid non-core descriptor before resolution', () => {
    const invalid = plugin('invalid', {
      requires: ['kubesphere.cluster@^2' as CapabilityId],
    });
    const resolution = resolvePluginSet([plugin('console-core'), invalid], ['console-core']);

    expect(resolution.order).toEqual(['console-core']);
    expect(resolution.skipped.get('invalid')?.code).toBe('INVALID_PLUGIN_DESCRIPTOR');
    expect(resolution.rejected).toEqual([
      expect.objectContaining({
        candidate: invalid,
        issue: expect.objectContaining({
          validationStage: 'descriptor',
        }),
      }),
    ]);
  });

  it('recursively skips consumers of a skipped provider in one resolution', () => {
    const resolution = resolvePluginSet(
      [
        plugin('console-core'),
        plugin('broken-provider', { requires: ['missing.input@1'], provides: ['shared.value@1'] }),
        plugin('consumer', { requires: ['shared.value@1'], provides: ['consumer.value@1'] }),
        plugin('downstream', { requires: ['consumer.value@1'] }),
      ],
      ['console-core'],
    );

    expect(resolution.order).toEqual(['console-core']);
    expect(resolution.skipped.get('broken-provider')?.code).toBe('MISSING_CAPABILITY');
    expect(resolution.skipped.get('consumer')?.path).toEqual([
      'consumer',
      'shared.value@1',
      'broken-provider',
    ]);
    expect(resolution.skipped.get('downstream')?.path).toEqual([
      'downstream',
      'consumer.value@1',
      'consumer',
    ]);
  });
});
