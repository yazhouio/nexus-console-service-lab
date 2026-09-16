import { describe, expect, it } from 'vitest';

import { RestrictedManifestValidationError, validateRestrictedInstallRecord } from '../src';

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
            kind: 'surface',
            point: { ownerPluginId: 'workload', id: 'detail', contractMajor: 1 },
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
    const result = validateRestrictedInstallRecord(validRecord(), validationOptions);

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

  it.each(['trustLevel', 'executionMode', 'critical'])(
    'rejects unsupported policy field %s',
    (field) => {
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

  it('defers well-formed Surface references to contribution relation validation', () => {
    const input = validRecord();
    input.manifest.contributions.extensions[0].surfaceId = 'missing';
    expect(
      validateRestrictedInstallRecord(input, validationOptions).manifest.contributions
        .extensions?.[0],
    ).toMatchObject({ kind: 'surface', surfaceId: 'missing' });
  });

  it('rejects duplicate contribution IDs even across different points', () => {
    const input = validRecord();
    input.manifest.contributions.extensions.push({
      id: 'workload-detail-tab',
      kind: 'surface',
      point: { ownerPluginId: 'pod', id: 'detail', contractMajor: 1 },
      surfaceId: 'workload-detail',
      order: 200,
    });

    expectInvalid(input, 'Duplicate Extension contribution id');
  });

  it('rejects duplicate contribution IDs', () => {
    const input = validRecord();
    input.manifest.contributions.extensions.push({
      ...input.manifest.contributions.extensions[0],
    });
    expectInvalid(input, 'Duplicate Extension contribution id');
  });

  it('rejects non-serializable mount parameters', () => {
    const input = validRecord();
    Object.assign(input.manifest.contributions.routes[0], {
      initialParameters: { callback: () => undefined },
    });
    expectInvalid(input, 'serializable JsonValue');
  });
});

it('preflights new contribution fields before publishing to an old Host contract', () => {
  const legacy = validRecord();
  expect(
    validateRestrictedInstallRecord(legacy, {
      ...validationOptions,
      contributionContractVersion: 1,
    }).manifest.id,
  ).toBe('kubeeye');
  const next = validRecord();
  Object.assign(next.manifest.contributions.routes[0], { parentRouteId: 'node-detail' });
  expect(() =>
    validateRestrictedInstallRecord(next, { ...validationOptions, contributionContractVersion: 1 }),
  ).toThrow('CONTRIBUTION_CONTRACT_UNSUPPORTED');
  expect(
    validateRestrictedInstallRecord(next, { ...validationOptions, contributionContractVersion: 2 })
      .manifest.contributions.routes?.[0].parentRouteId,
  ).toBe('node-detail');
});
