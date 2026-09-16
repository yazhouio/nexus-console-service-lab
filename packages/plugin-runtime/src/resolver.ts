import { isCapabilityId } from './identifiers';
import type { CapabilityId, PluginId } from './identifiers';
import {
  PluginResolutionError,
  type DependencyEdge,
  type PluginCandidate,
  type RejectedPlugin,
  type Resolution,
  type ResolutionErrorCode,
  type ResolutionIssue,
  type ResolutionValidationStage,
} from './plugin';

interface IssueInput {
  readonly code: ResolutionErrorCode;
  readonly validationStage: ResolutionValidationStage;
  readonly message: string;
  readonly pluginId?: PluginId;
  readonly pluginIds?: readonly PluginId[];
  readonly capability?: CapabilityId;
  readonly path?: readonly string[];
}

function createIssue(input: IssueInput): ResolutionIssue {
  return Object.freeze({
    ...input,
    pluginIds: input.pluginIds ? Object.freeze([...input.pluginIds]) : undefined,
    path: input.path ? Object.freeze([...input.path]) : undefined,
  });
}

function fail(issue: ResolutionIssue): never {
  throw new PluginResolutionError(issue);
}

function compareCandidates(left: PluginCandidate, right: PluginCandidate): number {
  return (
    left.descriptor.id.localeCompare(right.descriptor.id) ||
    left.kind.localeCompare(right.kind) ||
    left.descriptor.version.localeCompare(right.descriptor.version)
  );
}

function descriptorIssue(candidate: PluginCandidate): ResolutionIssue | undefined {
  const { descriptor } = candidate;

  if (typeof descriptor.id !== 'string' || descriptor.id.trim().length === 0) {
    return createIssue({
      code: 'INVALID_PLUGIN_DESCRIPTOR',
      validationStage: 'descriptor',
      message: 'Plugin id must be a non-empty string.',
      pluginId: descriptor.id,
    });
  }

  if (typeof descriptor.version !== 'string' || descriptor.version.trim().length === 0) {
    return createIssue({
      code: 'INVALID_PLUGIN_DESCRIPTOR',
      validationStage: 'descriptor',
      message: `Plugin ${descriptor.id} must declare a non-empty version.`,
      pluginId: descriptor.id,
    });
  }

  if (!Array.isArray(descriptor.requires) || !Array.isArray(descriptor.provides)) {
    return createIssue({
      code: 'INVALID_PLUGIN_DESCRIPTOR',
      validationStage: 'descriptor',
      message: `Plugin ${descriptor.id} requires and provides must be arrays.`,
      pluginId: descriptor.id,
    });
  }

  if (
    (descriptor.roles !== undefined &&
      (!Array.isArray(descriptor.roles) ||
        new Set(descriptor.roles).size !== descriptor.roles.length ||
        descriptor.roles.some((role) => !['provider', 'feature'].includes(role)))) ||
    (descriptor.provenance !== undefined &&
      !['first-party', 'partner', 'third-party'].includes(descriptor.provenance))
  ) {
    return createIssue({
      code: 'INVALID_PLUGIN_DESCRIPTOR',
      validationStage: 'descriptor',
      message: 'Plugin classification is invalid.',
      pluginId: descriptor.id,
    });
  }

  const invalidCapability = [...descriptor.requires, ...descriptor.provides].find(
    (capability) => !isCapabilityId(capability),
  );

  if (invalidCapability !== undefined) {
    return createIssue({
      code: 'INVALID_PLUGIN_DESCRIPTOR',
      validationStage: 'descriptor',
      message: `Plugin ${descriptor.id} contains a capability without an explicit major.`,
      pluginId: descriptor.id,
    });
  }

  if (
    new Set(descriptor.requires).size !== descriptor.requires.length ||
    new Set(descriptor.provides).size !== descriptor.provides.length
  ) {
    return createIssue({
      code: 'INVALID_PLUGIN_DESCRIPTOR',
      validationStage: 'descriptor',
      message: `Plugin ${descriptor.id} contains duplicate capability declarations.`,
      pluginId: descriptor.id,
    });
  }

  return undefined;
}

function createProviderIndex(
  candidates: ReadonlyMap<PluginId, PluginCandidate>,
): ReadonlyMap<CapabilityId, readonly PluginCandidate[]> {
  const providers = new Map<CapabilityId, PluginCandidate[]>();

  for (const candidate of candidates.values()) {
    for (const capability of candidate.descriptor.provides) {
      const group = providers.get(capability) ?? [];
      group.push(candidate);
      providers.set(capability, group);
    }
  }

  return new Map(
    [...providers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([capability, group]) => [
        capability,
        Object.freeze([...group].sort(compareCandidates)),
      ]),
  );
}

function createDependencyEdges(
  candidates: ReadonlyMap<PluginId, PluginCandidate>,
  providers: ReadonlyMap<CapabilityId, readonly PluginCandidate[]>,
): readonly DependencyEdge[] {
  const dependencies: DependencyEdge[] = [];

  for (const candidate of candidates.values()) {
    for (const capability of candidate.descriptor.requires) {
      const providerGroup = providers.get(capability) ?? [];
      if (providerGroup.length === 1) {
        dependencies.push({
          consumer: candidate.descriptor.id,
          capability,
          provider: providerGroup[0].descriptor.id,
        });
      }
    }
  }

  return Object.freeze(
    dependencies.sort(
      (left, right) =>
        left.consumer.localeCompare(right.consumer) ||
        left.capability.localeCompare(right.capability) ||
        left.provider.localeCompare(right.provider),
    ),
  );
}

function computeCoreClosure(
  coreRootIds: readonly PluginId[],
  candidates: ReadonlyMap<PluginId, PluginCandidate>,
  providers: ReadonlyMap<CapabilityId, readonly PluginCandidate[]>,
): ReadonlySet<PluginId> {
  const closure = new Set<PluginId>();
  const visitState = new Map<PluginId, 'visiting' | 'visited'>();

  const visit = (pluginId: PluginId, path: readonly string[]): void => {
    const candidate = candidates.get(pluginId);

    if (candidate === undefined) {
      fail(
        createIssue({
          code: 'CORE_ROOT_MISSING',
          validationStage: 'resolve',
          message: `Core plugin ${pluginId} is missing.`,
          pluginId,
          path: [...path, pluginId],
        }),
      );
    }

    if (visitState.get(pluginId) === 'visiting') {
      fail(
        createIssue({
          code: 'CIRCULAR_DEPENDENCY',
          validationStage: 'resolve',
          message: `Core dependency cycle detected at ${pluginId}.`,
          pluginId,
          path: [...path, pluginId],
        }),
      );
    }

    if (visitState.get(pluginId) === 'visited') {
      return;
    }

    if (candidate.kind !== 'builtin') {
      fail(
        createIssue({
          code: 'CORE_DEPENDENCY_NOT_BUILTIN',
          validationStage: 'resolve',
          message: `Core closure contains restricted plugin ${pluginId}.`,
          pluginId,
          path: [...path, pluginId],
        }),
      );
    }

    visitState.set(pluginId, 'visiting');
    closure.add(pluginId);

    for (const capability of [...candidate.descriptor.requires].sort()) {
      const providerGroup = providers.get(capability) ?? [];

      if (providerGroup.length === 0) {
        fail(
          createIssue({
            code: 'MISSING_CAPABILITY',
            validationStage: 'resolve',
            message: `Core plugin ${pluginId} requires missing capability ${capability}.`,
            pluginId,
            capability,
            path: [...path, pluginId, capability],
          }),
        );
      }

      if (providerGroup.length > 1) {
        const providerIds = providerGroup.map((provider) => provider.descriptor.id);
        fail(
          createIssue({
            code: 'DUPLICATE_CAPABILITY_PROVIDER',
            validationStage: 'resolve',
            message: `Core dependency ${capability} has multiple providers.`,
            pluginId,
            pluginIds: providerIds,
            capability,
            path: [...path, pluginId, capability, ...providerIds],
          }),
        );
      }

      visit(providerGroup[0].descriptor.id, [...path, pluginId, capability]);
    }

    visitState.set(pluginId, 'visited');
  };

  for (const coreRootId of [...new Set(coreRootIds)].sort()) {
    visit(coreRootId, []);
  }

  for (const [capability, providerGroup] of providers) {
    if (providerGroup.length < 2) {
      continue;
    }

    const coreProviders = providerGroup.filter((provider) => closure.has(provider.descriptor.id));

    if (coreProviders.length > 0) {
      const providerIds = providerGroup.map((provider) => provider.descriptor.id);
      fail(
        createIssue({
          code: 'DUPLICATE_CAPABILITY_PROVIDER',
          validationStage: 'resolve',
          message: `Capability ${capability} conflicts with a provider in the Core Closure.`,
          pluginId: coreProviders[0].descriptor.id,
          pluginIds: providerIds,
          capability,
          path: [coreProviders[0].descriptor.id, capability, ...providerIds],
        }),
      );
    }
  }

  return new Set([...closure].sort());
}

function propagateSkippedProviders(
  candidates: ReadonlyMap<PluginId, PluginCandidate>,
  providers: ReadonlyMap<CapabilityId, readonly PluginCandidate[]>,
  skipped: Map<PluginId, ResolutionIssue>,
): void {
  let changed = true;

  while (changed) {
    changed = false;

    for (const candidate of candidates.values()) {
      const pluginId = candidate.descriptor.id;
      if (skipped.has(pluginId)) {
        continue;
      }

      for (const capability of [...candidate.descriptor.requires].sort()) {
        const providerGroup = providers.get(capability) ?? [];
        const provider = providerGroup.length === 1 ? providerGroup[0] : undefined;

        if (provider !== undefined && skipped.has(provider.descriptor.id)) {
          skipped.set(
            pluginId,
            createIssue({
              code: 'MISSING_CAPABILITY',
              validationStage: 'resolve',
              message: `Plugin ${pluginId} depends on skipped provider ${provider.descriptor.id}.`,
              pluginId,
              capability,
              path: [pluginId, capability, provider.descriptor.id],
            }),
          );
          changed = true;
          break;
        }
      }
    }
  }
}

function findDependencyCycles(
  activePluginIds: ReadonlySet<PluginId>,
  dependencies: readonly DependencyEdge[],
): readonly (readonly PluginId[])[] {
  const providersByConsumer = new Map<PluginId, PluginId[]>();
  for (const dependency of dependencies) {
    if (!activePluginIds.has(dependency.consumer) || !activePluginIds.has(dependency.provider)) {
      continue;
    }

    const group = providersByConsumer.get(dependency.consumer) ?? [];
    if (!group.includes(dependency.provider)) {
      group.push(dependency.provider);
      group.sort();
    }
    providersByConsumer.set(dependency.consumer, group);
  }

  const state = new Map<PluginId, 'visiting' | 'visited'>();
  const stack: PluginId[] = [];
  const stackIndexes = new Map<PluginId, number>();
  const cycles = new Map<string, readonly PluginId[]>();

  const visit = (pluginId: PluginId): void => {
    state.set(pluginId, 'visiting');
    stackIndexes.set(pluginId, stack.length);
    stack.push(pluginId);

    for (const providerId of providersByConsumer.get(pluginId) ?? []) {
      if (state.get(providerId) === undefined) {
        visit(providerId);
      } else if (state.get(providerId) === 'visiting') {
        const cycleStart = stackIndexes.get(providerId);
        if (cycleStart !== undefined) {
          const cycle = [...stack.slice(cycleStart), providerId];
          const signature = [...new Set(cycle)].sort().join('\u0000');
          cycles.set(signature, Object.freeze(cycle));
        }
      }
    }

    stack.pop();
    stackIndexes.delete(pluginId);
    state.set(pluginId, 'visited');
  };

  for (const pluginId of [...activePluginIds].sort()) {
    if (state.get(pluginId) === undefined) {
      visit(pluginId);
    }
  }

  return Object.freeze([...cycles.values()]);
}

function expandCyclePath(
  cycle: readonly PluginId[],
  dependencies: readonly DependencyEdge[],
): readonly string[] {
  const path: string[] = [];

  for (let index = 0; index < cycle.length - 1; index += 1) {
    const consumer = cycle[index];
    const provider = cycle[index + 1];
    const edge = dependencies.find(
      (dependency) => dependency.consumer === consumer && dependency.provider === provider,
    );

    path.push(consumer);
    if (edge !== undefined) {
      path.push(edge.capability);
    }
  }

  path.push(cycle[cycle.length - 1]);
  return Object.freeze(path);
}

function stableTopologicalOrder(
  candidates: ReadonlyMap<PluginId, PluginCandidate>,
  dependencies: readonly DependencyEdge[],
  skipped: ReadonlyMap<PluginId, ResolutionIssue>,
): readonly PluginId[] {
  const activeIds = [...candidates.keys()].filter((pluginId) => !skipped.has(pluginId));
  const activeSet = new Set(activeIds);
  const providerDependencies = new Map<PluginId, Set<PluginId>>();
  const consumersByProvider = new Map<PluginId, Set<PluginId>>();

  for (const pluginId of activeIds) {
    providerDependencies.set(pluginId, new Set());
    consumersByProvider.set(pluginId, new Set());
  }

  for (const dependency of dependencies) {
    if (!activeSet.has(dependency.consumer) || !activeSet.has(dependency.provider)) {
      continue;
    }

    providerDependencies.get(dependency.consumer)?.add(dependency.provider);
    consumersByProvider.get(dependency.provider)?.add(dependency.consumer);
  }

  const ready = activeIds
    .filter((pluginId) => providerDependencies.get(pluginId)?.size === 0)
    .sort();
  const order: PluginId[] = [];

  while (ready.length > 0) {
    const pluginId = ready.shift();
    if (pluginId === undefined) {
      break;
    }
    order.push(pluginId);

    for (const consumerId of [...(consumersByProvider.get(pluginId) ?? [])].sort()) {
      const dependenciesForConsumer = providerDependencies.get(consumerId);
      dependenciesForConsumer?.delete(pluginId);
      if (
        dependenciesForConsumer?.size === 0 &&
        !order.includes(consumerId) &&
        !ready.includes(consumerId)
      ) {
        ready.push(consumerId);
        ready.sort();
      }
    }
  }

  return Object.freeze(order);
}

export function resolvePluginSet(
  pluginCandidates: readonly PluginCandidate[],
  coreRootIds: readonly PluginId[],
): Resolution {
  const coreRoots = new Set(coreRootIds);
  const validCandidates: PluginCandidate[] = [];
  const rejected: RejectedPlugin[] = [];

  for (const candidate of [...pluginCandidates].sort(compareCandidates)) {
    const issue = descriptorIssue(candidate);
    if (issue === undefined) {
      validCandidates.push(candidate);
      continue;
    }

    if (coreRoots.has(candidate.descriptor.id)) {
      fail(issue);
    }
    rejected.push({ candidate, issue });
  }

  const candidatesById = new Map<PluginId, PluginCandidate[]>();
  for (const candidate of validCandidates) {
    const pluginId = candidate.descriptor.id;
    const group = candidatesById.get(pluginId) ?? [];
    group.push(candidate);
    candidatesById.set(pluginId, group);
  }

  const selected = new Map<PluginId, PluginCandidate>();
  const collisionIssues = new Map<PluginId, ResolutionIssue>();

  for (const [pluginId, group] of [...candidatesById.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const builtins = group.filter((candidate) => candidate.kind === 'builtin');

    if (builtins.length > 1) {
      fail(
        createIssue({
          code: 'PLUGIN_ID_COLLISION',
          validationStage: 'resolve',
          message: `Builtin plugin id ${pluginId} is declared more than once.`,
          pluginId,
          pluginIds: group.map((candidate) => candidate.descriptor.id),
        }),
      );
    }

    if (builtins.length === 1) {
      selected.set(pluginId, builtins[0]);
      for (const restricted of group.filter((candidate) => candidate.kind === 'restricted')) {
        rejected.push({
          candidate: restricted,
          issue: createIssue({
            code: 'PLUGIN_ID_COLLISION',
            validationStage: 'resolve',
            message: `Restricted plugin ${pluginId} cannot replace a Builtin plugin.`,
            pluginId,
          }),
        });
      }
      continue;
    }

    if (group.length > 1) {
      const issue = createIssue({
        code: 'PLUGIN_ID_COLLISION',
        validationStage: 'resolve',
        message: `Restricted plugin id ${pluginId} is declared more than once.`,
        pluginId,
      });
      collisionIssues.set(pluginId, issue);
      for (const candidate of group) {
        rejected.push({ candidate, issue });
      }
      continue;
    }

    selected.set(pluginId, group[0]);
  }

  for (const coreRootId of [...coreRoots].sort()) {
    if (!selected.has(coreRootId)) {
      fail(
        createIssue({
          code: 'CORE_ROOT_MISSING',
          validationStage: 'resolve',
          message: `Core plugin ${coreRootId} is missing.`,
          pluginId: coreRootId,
          path: [coreRootId],
        }),
      );
    }
  }

  const providers = createProviderIndex(selected);
  const dependencies = createDependencyEdges(selected, providers);
  const coreClosure = computeCoreClosure(coreRootIds, selected, providers);
  const skipped = new Map<PluginId, ResolutionIssue>(collisionIssues);

  for (const rejection of rejected) {
    const pluginId = rejection.candidate.descriptor.id;
    if (pluginId.length > 0 && !selected.has(pluginId) && !skipped.has(pluginId)) {
      skipped.set(pluginId, rejection.issue);
    }
  }

  for (const [capability, providerGroup] of providers) {
    if (providerGroup.length < 2) {
      continue;
    }

    const providerIds = providerGroup.map((provider) => provider.descriptor.id);
    for (const provider of providerGroup) {
      skipped.set(
        provider.descriptor.id,
        createIssue({
          code: 'DUPLICATE_CAPABILITY_PROVIDER',
          validationStage: 'resolve',
          message: `Plugin ${provider.descriptor.id} conflicts on capability ${capability}.`,
          pluginId: provider.descriptor.id,
          pluginIds: providerIds,
          capability,
          path: [provider.descriptor.id, capability, ...providerIds],
        }),
      );
    }
  }

  for (const candidate of selected.values()) {
    const pluginId = candidate.descriptor.id;
    if (skipped.has(pluginId)) {
      continue;
    }

    for (const capability of [...candidate.descriptor.requires].sort()) {
      const providerGroup = providers.get(capability) ?? [];
      if (providerGroup.length === 0) {
        skipped.set(
          pluginId,
          createIssue({
            code: 'MISSING_CAPABILITY',
            validationStage: 'resolve',
            message: `Plugin ${pluginId} requires missing capability ${capability}.`,
            pluginId,
            capability,
            path: [pluginId, capability],
          }),
        );
        break;
      }

      if (providerGroup.length > 1) {
        const providerIds = providerGroup.map((provider) => provider.descriptor.id);
        skipped.set(
          pluginId,
          createIssue({
            code: 'DUPLICATE_CAPABILITY_PROVIDER',
            validationStage: 'resolve',
            message: `Plugin ${pluginId} requires capability ${capability} with multiple providers.`,
            pluginId,
            pluginIds: providerIds,
            capability,
            path: [pluginId, capability, ...providerIds],
          }),
        );
        break;
      }
    }
  }

  propagateSkippedProviders(selected, providers, skipped);

  const activePluginIds = new Set(
    [...selected.keys()].filter((pluginId) => !skipped.has(pluginId)),
  );
  const cycles = findDependencyCycles(activePluginIds, dependencies);
  for (const cycle of cycles) {
    const path = expandCyclePath(cycle, dependencies);
    for (const pluginId of new Set(cycle.slice(0, -1))) {
      skipped.set(
        pluginId,
        createIssue({
          code: 'CIRCULAR_DEPENDENCY',
          validationStage: 'resolve',
          message: `Plugin ${pluginId} participates in a dependency cycle.`,
          pluginId,
          path,
        }),
      );
    }
  }

  propagateSkippedProviders(selected, providers, skipped);

  const stableSkipped = new Map(
    [...skipped.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const order = stableTopologicalOrder(selected, dependencies, stableSkipped);

  return Object.freeze({
    order,
    coreClosure,
    dependencies,
    skipped: stableSkipped,
    rejected: Object.freeze(
      [...rejected].sort((left, right) => compareCandidates(left.candidate, right.candidate)),
    ),
  });
}
