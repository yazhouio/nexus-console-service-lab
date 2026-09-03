import { describe, expect, it } from 'vitest';

import {
  createContributionRegistry,
  DEFAULT_CONTRIBUTION_ORDER,
} from '../src/contribution';
import { PluginRuntimeContractError } from '../src/runtime-state';

const render = () => null;

describe('ContributionRegistry', () => {
  it('binds ownership and keeps duplicate paths as distinct routes', () => {
    const controller = createContributionRegistry();
    const first = controller.beginActivation('alpha');
    first.context.registerRoute({
      id: 'alpha-route',
      path: '/shared',
      target: { kind: 'builtin', render },
    });
    first.commit();

    const second = controller.beginActivation('beta');
    second.context.registerRoute({
      id: 'beta-route',
      path: '/shared',
      target: { kind: 'builtin', render },
    });
    second.commit();

    expect(controller.registry.listRoutes()).toMatchObject([
      { ownerPluginId: 'alpha', contribution: { id: 'alpha-route' } },
      { ownerPluginId: 'beta', contribution: { id: 'beta-route' } },
    ]);
  });

  it('orders visual contributions by order, owner, then id', () => {
    const controller = createContributionRegistry();

    for (const ownerPluginId of ['beta', 'alpha']) {
      const activation = controller.beginActivation(ownerPluginId);
      activation.context.registerNavigation({
        id: `${ownerPluginId}-late`,
        label: 'Late',
        order: DEFAULT_CONTRIBUTION_ORDER,
      });
      activation.context.registerNavigation({
        id: `${ownerPluginId}-early`,
        label: 'Early',
        order: 10,
      });
      activation.commit();
    }

    expect(
      controller.registry
        .listNavigation()
        .map(item => `${item.ownerPluginId}/${item.contribution.id}`),
    ).toEqual([
      'alpha/alpha-early',
      'beta/beta-early',
      'alpha/alpha-late',
      'beta/beta-late',
    ]);
  });

  it('allows Navigation to reference an ACTIVE owner route and parent', () => {
    const controller = createContributionRegistry();
    const shell = controller.beginActivation('console-shell');
    shell.context.registerRoute({
      id: 'home-route',
      path: '/',
      target: { kind: 'builtin', render },
    });
    shell.context.registerNavigation({ id: 'home-nav', label: 'Home' });
    shell.commit();

    const cluster = controller.beginActivation('cluster');
    cluster.context.registerNavigation({
      id: 'cluster-nav',
      label: 'Cluster',
      routeId: 'home-route',
      parentId: 'home-nav',
    });
    cluster.commit();

    expect(controller.registry.listNavigation()).toHaveLength(2);
  });

  it('rejects unknown Navigation references without committing records', () => {
    const controller = createContributionRegistry();
    const activation = controller.beginActivation('cluster');
    activation.context.registerNavigation({
      id: 'cluster-nav',
      label: 'Cluster',
      routeId: 'missing-route',
    });

    expect(() => activation.commit()).toThrowError(
      expect.objectContaining<Partial<PluginRuntimeContractError>>({
        issue: expect.objectContaining({ code: 'INVALID_CONTRIBUTION' }),
      }),
    );
    expect(controller.registry.listNavigation()).toEqual([]);
  });

  it('scopes Extension id collisions to a Slot', () => {
    const controller = createContributionRegistry();
    const activation = controller.beginActivation('cluster');
    activation.context.registerExtension({
      id: 'overview',
      slot: 'cluster.cards',
      target: { kind: 'builtin', render },
    });
    activation.context.registerExtension({
      id: 'overview',
      slot: 'workspace.cards',
      target: { kind: 'builtin', render },
    });
    activation.commit();

    expect(controller.registry.listExtensions('cluster.cards')).toHaveLength(1);
    expect(controller.registry.listExtensions('workspace.cards')).toHaveLength(1);
    expect(controller.registry.listExtensions('missing.slot')).toEqual([]);
  });
});

