import { describe, expect, it } from 'vitest';

import { createCapabilityRegistry } from '../src/capability';
import type { PluginDescriptor } from '../src/plugin';
import { PluginRuntimeContractError } from '../src/runtime-state';

const descriptor: PluginDescriptor = {
  id: 'cluster',
  version: '1.0.0',
  requires: ['kubesphere.scope@1'],
  provides: ['kubesphere.cluster@2'],
};

describe('CapabilityRegistry', () => {
  it('keeps staged capabilities invisible until commit', () => {
    const controller = createCapabilityRegistry();
    const activation = controller.beginActivation('cluster', descriptor);

    activation.context.register('kubesphere.cluster@2', { ready: true });

    expect(controller.registry.get('kubesphere.cluster@2')).toBeUndefined();
    activation.commit();
    expect(controller.registry.get('kubesphere.cluster@2')).toEqual({
      ready: true,
    });
  });

  it('binds capability ownership to the activation context', () => {
    const controller = createCapabilityRegistry();
    const activation = controller.beginActivation('cluster', descriptor);

    activation.context.register('kubesphere.cluster@2', { ready: true });
    activation.commit();

    expect(controller.registry.list()).toEqual([
      {
        id: 'kubesphere.cluster@2',
        providerPluginId: 'cluster',
      },
    ]);
    expect(controller.registry.list()[0]).not.toHaveProperty('value');
  });

  it('rejects undeclared provides immediately', () => {
    const controller = createCapabilityRegistry();
    const activation = controller.beginActivation('cluster', descriptor);

    expect(() =>
      activation.context.register('kubesphere.unknown@1', {}),
    ).toThrowError(
      expect.objectContaining<Partial<PluginRuntimeContractError>>({
        issue: expect.objectContaining({
          code: 'UNDECLARED_CAPABILITY_PROVIDE',
        }),
      }),
    );
  });

  it('rejects undeclared requires before reading the registry', () => {
    const controller = createCapabilityRegistry();
    const activation = controller.beginActivation('cluster', descriptor);

    expect(() => activation.context.require('kubesphere.unknown@1')).toThrowError(
      expect.objectContaining<Partial<PluginRuntimeContractError>>({
        issue: expect.objectContaining({
          code: 'UNDECLARED_CAPABILITY_REQUIRE',
        }),
      }),
    );
  });

  it('discards every staged capability after a failed activation', () => {
    const controller = createCapabilityRegistry();
    const activation = controller.beginActivation('cluster', descriptor);
    activation.context.register('kubesphere.cluster@2', { ready: true });

    activation.discard();

    expect(controller.registry.list()).toEqual([]);
    expect(() => activation.commit()).toThrowError(
      expect.objectContaining<Partial<PluginRuntimeContractError>>({
        issue: expect.objectContaining({
          code: 'ACTIVATION_SCOPE_INACTIVE',
        }),
      }),
    );
  });

  it('rejects commit when a declared capability was not registered', () => {
    const controller = createCapabilityRegistry();
    const activation = controller.beginActivation('cluster', descriptor);

    expect(() => activation.commit()).toThrowError(
      expect.objectContaining<Partial<PluginRuntimeContractError>>({
        issue: expect.objectContaining({
          code: 'DECLARED_CAPABILITY_MISSING',
        }),
      }),
    );
    expect(controller.registry.list()).toEqual([]);
  });
});

