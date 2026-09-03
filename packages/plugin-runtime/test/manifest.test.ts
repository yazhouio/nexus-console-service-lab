import { describe, expect, it } from 'vitest';

import {
  RestrictedManifestValidationError,
  validateRestrictedInstallRecord,
} from '../src';

function validRecord() {
  return {
    manifest: {
      id: 'kubeeye',
      version: '1.2.0',
      entry: '/plugins/kubeeye/1.2.0/',
      hostApi: 'kubesphere.console@1',
      requires: ['kubesphere.cluster@2'],
      provides: [],
      permissions: ['cluster.read', 'workload.read'],
      surfaces: [{ id: 'overview' }, { id: 'workload-detail' }],
      contributions: {
        routes: [
          {
            id: 'overview-route',
            path: '/kubeeye',
            surfaceId: 'overview',
            initialParameters: { source: 'navigation' },
          },
        ],
        navigation: [
          {
            id: 'overview-nav',
            label: 'KubeEye',
            routeId: 'overview-route',
            order: 200,
          },
        ],
        extensions: [
          {
            id: 'workload-detail-tab',
            slot: 'workload.detail.tabs',
            surfaceId: 'workload-detail',
            order: 200,
          },
        ],
      },
    },
    config: {
      id: 'kubeeye',
      version: '1.2.0',
      enabled: true,
      grantedPermissions: ['cluster.read'],
    },
  };
}

const validationOptions = {
  isEntryAllowed: (entry: string) => entry.startsWith('/plugins/'),
};

function expectInvalid(value: unknown, message: string): void {
  try {
    validateRestrictedInstallRecord(value, validationOptions);
  } catch (error) {
    expect(error).toBeInstanceOf(RestrictedManifestValidationError);
    expect(error).toMatchObject({
      issue: {
        code: 'INVALID_RESTRICTED_MANIFEST',
        validationStage: 'manifest',
        pluginId: 'kubeeye',
      },
    });
    expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error('Expected RestrictedManifestValidationError.');
}

describe('validateRestrictedInstallRecord', () => {
  it('returns a frozen Manifest and Config pair for the next Runtime', () => {
    const result = validateRestrictedInstallRecord(
      validRecord(),
      validationOptions,
    );

    expect(result.manifest).toMatchObject({
      id: 'kubeeye',
      version: '1.2.0',
      provides: [],
      hostApi: 'kubesphere.console@1',
    });
    expect(result.config).toEqual({
      id: 'kubeeye',
      version: '1.2.0',
      enabled: true,
      grantedPermissions: ['cluster.read'],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.manifest.surfaces)).toBe(true);
  });

  it.each(['trustLevel', 'executionMode', 'critical']) (
    'rejects unsupported policy field %s',
    field => {
      const input = validRecord();
      Object.assign(input.manifest, { [field]: 'unsupported' });
      expectInvalid(input, `unknown field ${field}`);
    },
  );

  it('requires Restricted provides to be empty', () => {
    const input = validRecord();
    input.manifest.provides = ['kubesphere.external@1'] as never[];
    expectInvalid(input, 'provides must be empty');
  });

  it('requires hostApi to contain an explicit major', () => {
    const input = validRecord();
    input.manifest.hostApi = 'kubesphere.console';
    expectInvalid(input, 'explicit major');
  });

  it('uses the Host entry allowlist', () => {
    const input = validRecord();
    input.manifest.entry = 'https://third-party.invalid/plugin.js';
    expectInvalid(input, 'is not allowed');
  });

  it('requires Config id and version to exactly match the Manifest', () => {
    const input = validRecord();
    input.config.version = '1.1.0';
    expectInvalid(input, 'exactly match');
  });

  it('requires every grant to have been requested', () => {
    const input = validRecord();
    input.config.grantedPermissions = ['cluster.write'];
    expectInvalid(input, 'was not requested');
  });

  it('rejects malformed Permission IDs', () => {
    const input = validRecord();
    input.manifest.permissions = ['Cluster Read'];
    expectInvalid(input, 'valid identifiers');
  });

  it('rejects duplicate Surface IDs', () => {
    const input = validRecord();
    input.manifest.surfaces.push({ id: 'overview' });
    expectInvalid(input, 'Surface id overview is duplicated');
  });

  it('rejects Route references to unknown Surfaces', () => {
    const input = validRecord();
    input.manifest.contributions.routes[0].surfaceId = 'missing';
    expectInvalid(input, 'references unknown surface missing');
  });

  it('rejects Extension references to unknown Surfaces', () => {
    const input = validRecord();
    input.manifest.contributions.extensions[0].surfaceId = 'missing';
    expectInvalid(input, 'references unknown surface missing');
  });

  it('allows the same Extension ID in different Slots', () => {
    const input = validRecord();
    input.manifest.contributions.extensions.push({
      id: 'workload-detail-tab',
      slot: 'pod.detail.tabs',
      surfaceId: 'workload-detail',
      order: 200,
    });

    const result = validateRestrictedInstallRecord(input, validationOptions);
    expect(result.manifest.contributions.extensions).toHaveLength(2);
  });

  it('rejects duplicate Extension IDs in the same Slot', () => {
    const input = validRecord();
    input.manifest.contributions.extensions.push({
      ...input.manifest.contributions.extensions[0],
    });
    expectInvalid(input, 'duplicated in slot workload.detail.tabs');
  });

  it('rejects non-serializable mount parameters', () => {
    const input = validRecord();
    Object.assign(input.manifest.contributions.routes[0], {
      initialParameters: { callback: () => undefined },
    });
    expectInvalid(input, 'serializable JsonValue');
  });
});

