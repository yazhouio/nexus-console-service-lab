import { createRouteModel as compile } from '../src/routing/route-model';
import { createPointCompiler } from '../src/ui/point-compiler';
import type {
  CompiledExtensionPointDefinition,
  ExtensionPointRef,
  OwnedContribution,
} from '../src';

/** Explicit versioned admission setup for path-language and ownership fixtures. */
export function createRouteModel(input: Parameters<typeof compile>[0]) {
  const compiler = createPointCompiler();
  const points: OwnedContribution<CompiledExtensionPointDefinition>[] = [];
  function point(
    ownerPluginId: string,
    id: string,
    kind: 'route' | 'navigation',
  ): ExtensionPointRef {
    points.push({
      ownerPluginId,
      contribution: compiler({ id, kind, contractMajor: 1, contextSchema: { type: 'object' } }),
    });
    return { ownerPluginId, id, contractMajor: 1 };
  }
  const root = point('fixture-distribution', 'root-routes', 'route'),
    navRoot = point('fixture-distribution', 'root-navigation', 'navigation');
  const routes = input.routes.map((item) => ({
    ...item,
    contribution: {
      ...item.contribution,
      childPoint: point(item.ownerPluginId, item.contribution.id, 'route'),
    },
  }));
  const navigation = input.navigation.map((item) => ({
    ...item,
    contribution: {
      ...item.contribution,
      childPoint: point(item.ownerPluginId, `nav-${item.contribution.id}`, 'navigation'),
    },
  }));
  for (const item of routes) {
    const parent = routes.find(
      (parent) => parent.contribution.id === item.contribution.parentRouteId,
    );
    Object.assign(item.contribution, { point: parent?.contribution.childPoint ?? root });
    if (
      parent &&
      parent.ownerPluginId !== item.ownerPluginId &&
      !parent.contribution.acceptsChildren
    )
      delete (parent.contribution as Partial<typeof parent.contribution>).childPoint;
  }
  for (const item of navigation) {
    const parent = navigation.find(
      (parent) => parent.contribution.id === item.contribution.parentId,
    );
    Object.assign(item.contribution, { point: parent?.contribution.childPoint ?? navRoot });
    if (
      parent &&
      parent.ownerPluginId !== item.ownerPluginId &&
      !parent.contribution.acceptsChildren
    )
      delete (parent.contribution as Partial<typeof parent.contribution>).childPoint;
  }
  return compile({
    ...input,
    routes,
    navigation,
    points,
    rootRoutePoint: root,
    navigationRootPoints: [navRoot],
    policy: (request) =>
      request.ownerPluginId === 'fixture-distribution' || (input.policy?.(request) ?? false),
  });
}
