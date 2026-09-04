import { frozenCopy, readonlyMap, readonlySet } from './immutable';
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from './capability';
import type { BridgeCapabilityContract } from './bridge-contract';
import type {
  ContributionReferenceCatalog,
  NavigationContribution,
  RestrictedRouteContribution,
  RestrictedUiExtensionContribution,
  RouteContribution,
  UiExtensionContribution,
} from './contribution';
import type { HostApiId, PluginId } from './identifiers';
import {
  createContributionRegistry,
  type ContributionRegistry,
} from './contribution';
import { isPermissionId } from './manifest';
import type {
  InstalledPluginRecord,
  RestrictedPluginManifest,
} from './manifest';
import type {
  PluginCandidate,
  PluginDefinition,
  Resolution,
} from './plugin';
import { resolvePluginSet } from './resolver';
import {
  PluginRuntimeBootstrapError,
  PluginRuntimeContractError,
  type PluginRuntimeIssue,
  type PluginRuntimeState,
  type PluginValidationIssue,
} from './runtime-state';
import {
  createSurfaceDefinitionRegistry,
  type SurfaceDefinitionRegistry,
} from './surface-definition';

export interface PluginRuntime {
  readonly ready: true;
  readonly candidates: readonly PluginCandidate[];
  readonly installations: readonly InstalledPluginRecord[];
  readonly resolution: Resolution;
  readonly capabilities: CapabilityRegistry;
  readonly contributions: ContributionRegistry;
  readonly surfaces: SurfaceDefinitionRegistry;
  readonly bridgeContracts: ReadonlyMap<string, BridgeCapabilityContract>;
  readonly restrictedPlugins: ReadonlyMap<PluginId, InstalledPluginRecord>;
  readonly validationIssues: readonly PluginValidationIssue[];
  readonly plugins: ReadonlyMap<PluginId, PluginRuntimeState>;
}

export interface BootstrapPluginRuntimeOptions {
  readonly builtins: readonly PluginDefinition[];
  readonly coreRootIds: readonly PluginId[];
  readonly installed?: readonly InstalledPluginRecord[];
  readonly supportedHostApis?: readonly HostApiId[];
  readonly bridgeContracts?: readonly BridgeCapabilityContract[];
}

function asCandidate(definition: PluginDefinition): PluginCandidate {
  return {
    kind: 'builtin',
    descriptor: definition,
  };
}

interface NormalizedRestrictedDeclarations {
  readonly record: InstalledPluginRecord;
  readonly routes: readonly RouteContribution[];
  readonly navigation: readonly NavigationContribution[];
  readonly extensions: readonly UiExtensionContribution[];
}

function manifestIssue(
  input: Omit<PluginValidationIssue, 'validationStage'> & {
    readonly validationStage?: PluginValidationIssue['validationStage'];
  },
): PluginValidationIssue {
  return Object.freeze({
    ...input,
    validationStage: input.validationStage ?? 'manifest',
    path: input.path ? Object.freeze([...input.path]) : undefined,
  });
}

function createBridgeContractCatalog(
  contracts: readonly BridgeCapabilityContract[],
): ReadonlyMap<string, BridgeCapabilityContract> {
  const catalog = new Map<string, BridgeCapabilityContract>();

  for (const contract of [...contracts].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (catalog.has(contract.id)) {
      throw new PluginRuntimeBootstrapError({
        code: 'INVALID_BRIDGE_CONTRACT',
        stage: 'assertion',
        message: `Bridge Capability Contract ${contract.id} is duplicated.`,
        capability: contract.id,
      });
    }

    for (const [actionName, action] of Object.entries(contract.actions)) {
      if (
        actionName.length === 0 ||
        action.requiredPermissions.some(permission => !isPermissionId(permission))
      ) {
        throw new PluginRuntimeBootstrapError({
          code: 'INVALID_BRIDGE_CONTRACT',
          stage: 'assertion',
          message: `Bridge Capability Contract ${contract.id} contains an invalid action.`,
          capability: contract.id,
        });
      }
    }
    catalog.set(contract.id, contract);
  }

  return readonlyMap(catalog);
}

export function validateRestrictedAgainstHost(
  installed: readonly InstalledPluginRecord[],
  supportedHostApis: ReadonlySet<HostApiId>,
  bridgeContracts: ReadonlyMap<string, BridgeCapabilityContract>,
): {
  readonly accepted: readonly InstalledPluginRecord[];
  readonly issues: readonly PluginValidationIssue[];
} {
  const accepted: InstalledPluginRecord[] = [];
  const issues: PluginValidationIssue[] = [];

  for (const record of installed) {
    if (!record.config.enabled) {
      continue;
    }

    const { manifest } = record;
    if (!supportedHostApis.has(manifest.hostApi)) {
      issues.push(
        manifestIssue({
          code: 'HOST_API_INCOMPATIBLE',
          message: `Host API ${manifest.hostApi} is not supported.`,
          pluginId: manifest.id,
        }),
      );
      continue;
    }

    const missingBridgeContract = manifest.requires.find(
      capability => !bridgeContracts.has(capability),
    );
    if (missingBridgeContract !== undefined) {
      issues.push(
        manifestIssue({
          code: 'CAPABILITY_NOT_BRIDGE_EXPOSED',
          message: `Capability ${missingBridgeContract} is not exposed through the Bridge.`,
          pluginId: manifest.id,
          capability: missingBridgeContract,
          path: [manifest.id, missingBridgeContract],
        }),
      );
      continue;
    }

    const knownPermissions = new Set(
      manifest.requires.flatMap(capability =>
        Object.values(bridgeContracts.get(capability)?.actions ?? {}).flatMap(
          action => action.requiredPermissions,
        ),
      ),
    );
    const unknownPermission = manifest.permissions.find(
      permission => !knownPermissions.has(permission),
    );
    if (unknownPermission !== undefined) {
      issues.push(
        manifestIssue({
          code: 'INVALID_RESTRICTED_MANIFEST',
          message: `Permission ${unknownPermission} is not known by a required Bridge Contract.`,
          pluginId: manifest.id,
        }),
      );
      continue;
    }

    accepted.push(record);
  }

  return {
    accepted: Object.freeze(accepted),
    issues: Object.freeze(issues),
  };
}

function normalizeRestrictedContributions(
  record: InstalledPluginRecord,
): NormalizedRestrictedDeclarations {
  const normalizeTarget = (
    contribution:
      | RestrictedRouteContribution
      | RestrictedUiExtensionContribution,
  ) =>
    Object.freeze({
      kind: 'sandbox-surface' as const,
      surfaceId: contribution.surfaceId,
      ...(contribution.layout === undefined
        ? {}
        : { layout: contribution.layout }),
      ...(contribution.initialParameters === undefined
        ? {}
        : { initialParameters: contribution.initialParameters }),
    });

  return {
    record,
    routes: Object.freeze(
      (record.manifest.contributions.routes ?? []).map(route =>
        Object.freeze({
          id: route.id,
          path: route.path,
          target: normalizeTarget(route),
        }),
      ),
    ),
    navigation: Object.freeze(
      [...(record.manifest.contributions.navigation ?? [])],
    ),
    extensions: Object.freeze(
      (record.manifest.contributions.extensions ?? []).map(extension =>
        Object.freeze({
          id: extension.id,
          slot: extension.slot,
          ...(extension.order === undefined ? {} : { order: extension.order }),
          target: normalizeTarget(extension),
        }),
      ),
    ),
  };
}

function validateRestrictedContributionSet(
  declarations: readonly NormalizedRestrictedDeclarations[],
  contributionRegistry: ContributionRegistry,
): {
  readonly issues: ReadonlyMap<PluginId, PluginValidationIssue>;
  readonly references: ContributionReferenceCatalog;
} {
  const issues = new Map<PluginId, PluginValidationIssue>();
  const restrictedIds = new Set(
    declarations.map(declaration => declaration.record.manifest.id),
  );

  const markCollision = (
    pluginId: PluginId,
    description: string,
  ): void => {
    if (!issues.has(pluginId)) {
      issues.set(
        pluginId,
        manifestIssue({
          code: 'INVALID_CONTRIBUTION',
          message: description,
          pluginId,
        }),
      );
    }
  };

  const routeOwners = new Map<string, Set<PluginId>>();
  const navigationOwners = new Map<string, Set<PluginId>>();
  const extensionOwners = new Map<string, Set<PluginId>>();
  const addOwner = (
    index: Map<string, Set<PluginId>>,
    id: string,
    ownerPluginId: PluginId,
  ): void => {
    const owners = index.get(id) ?? new Set<PluginId>();
    owners.add(ownerPluginId);
    index.set(id, owners);
  };

  for (const route of contributionRegistry.listRoutes()) {
    addOwner(routeOwners, route.contribution.id, route.ownerPluginId);
  }
  for (const item of contributionRegistry.listNavigation()) {
    addOwner(navigationOwners, item.contribution.id, item.ownerPluginId);
  }
  const restrictedSlots = new Set(
    declarations.flatMap(declaration =>
      declaration.extensions.map(extension => extension.slot),
    ),
  );
  for (const slot of restrictedSlots) {
    for (const extension of contributionRegistry.listExtensions(slot)) {
      addOwner(
        extensionOwners,
        `${slot}\u0000${extension.contribution.id}`,
        extension.ownerPluginId,
      );
    }
  }

  for (const declaration of declarations) {
    const pluginId = declaration.record.manifest.id;
    for (const route of declaration.routes) {
      addOwner(routeOwners, route.id, pluginId);
    }
    for (const item of declaration.navigation) {
      addOwner(navigationOwners, item.id, pluginId);
    }
    for (const extension of declaration.extensions) {
      addOwner(extensionOwners, `${extension.slot}\u0000${extension.id}`, pluginId);
    }
  }

  for (const [id, owners] of routeOwners) {
    if (owners.size > 1) {
      for (const owner of owners) {
        if (restrictedIds.has(owner)) {
          markCollision(owner, `Route id ${id} conflicts in the Runtime.`);
        }
      }
    }
  }
  for (const [id, owners] of navigationOwners) {
    if (owners.size > 1) {
      for (const owner of owners) {
        if (restrictedIds.has(owner)) {
          markCollision(owner, `Navigation id ${id} conflicts in the Runtime.`);
        }
      }
    }
  }
  for (const [scopedId, owners] of extensionOwners) {
    if (owners.size > 1) {
      for (const owner of owners) {
        if (restrictedIds.has(owner)) {
          const [slot, id] = scopedId.split('\u0000');
          markCollision(
            owner,
            `Extension id ${id} conflicts in slot ${slot}.`,
          );
        }
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const activeDeclarations = declarations.filter(
      declaration => !issues.has(declaration.record.manifest.id),
    );
    const routeIds = new Set([
      ...contributionRegistry
        .listRoutes()
        .map(route => route.contribution.id),
      ...activeDeclarations.flatMap(declaration =>
        declaration.routes.map(route => route.id),
      ),
    ]);
    const navigationIds = new Set([
      ...contributionRegistry
        .listNavigation()
        .map(item => item.contribution.id),
      ...activeDeclarations.flatMap(declaration =>
        declaration.navigation.map(item => item.id),
      ),
    ]);

    for (const declaration of activeDeclarations) {
      const pluginId = declaration.record.manifest.id;
      const invalidNavigation = declaration.navigation.find(
        item =>
          (item.routeId !== undefined && !routeIds.has(item.routeId)) ||
          (item.parentId !== undefined && !navigationIds.has(item.parentId)),
      );
      if (invalidNavigation !== undefined) {
        const missingReference =
          invalidNavigation.routeId !== undefined &&
          !routeIds.has(invalidNavigation.routeId)
            ? invalidNavigation.routeId
            : invalidNavigation.parentId;
        markCollision(
          pluginId,
          `Navigation ${invalidNavigation.id} references unknown contribution ${missingReference}.`,
        );
        changed = true;
      }
    }
  }

  const finalDeclarations = declarations.filter(
    declaration => !issues.has(declaration.record.manifest.id),
  );
  return {
    issues,
    references: {
      routeIds: new Set(
        finalDeclarations.flatMap(declaration =>
          declaration.routes.map(route => route.id),
        ),
      ),
      navigationIds: new Set(
        finalDeclarations.flatMap(declaration =>
          declaration.navigation.map(item => item.id),
        ),
      ),
    },
  };
}

function bootstrapFailure(
  pluginId: PluginId,
  error: unknown,
): PluginRuntimeBootstrapError {
  if (error instanceof PluginRuntimeContractError) {
    return new PluginRuntimeBootstrapError({
      ...error.issue,
      pluginId,
    });
  }

  return new PluginRuntimeBootstrapError({
    code: 'PLUGIN_ACTIVATION_FAILED',
    stage: 'activate',
    message: `Core plugin ${pluginId} failed during activation.`,
    pluginId,
    cause: error,
  });
}

export async function bootstrapPluginRuntime(
  options: BootstrapPluginRuntimeOptions,
): Promise<PluginRuntime> {
  // Capture inputs before the first await. Ready catalogs cannot follow caller edits.
  options = frozenCopy(options);
  const bridgeContracts = createBridgeContractCatalog(
    options.bridgeContracts ?? [],
  );
  const hostValidation = validateRestrictedAgainstHost(
    options.installed ?? [],
    new Set(options.supportedHostApis ?? []),
    bridgeContracts,
  );
  const builtinIds = new Set(options.builtins.map(definition => definition.id));
  const resolution = resolvePluginSet(
    [
      ...options.builtins.map(asCandidate),
      ...hostValidation.accepted.map(record => ({
        kind: 'restricted' as const,
        descriptor: record.manifest,
      })),
    ],
    options.coreRootIds,
  );
  const definitions = new Map(
    options.builtins.map(definition => [definition.id, definition]),
  );
  const capabilityController = createCapabilityRegistry();
  const contributionController = createContributionRegistry();
  const surfaceController = createSurfaceDefinitionRegistry();
  const pluginStates = new Map<PluginId, PluginRuntimeState>();
  const validationIssues: PluginValidationIssue[] = [
    ...hostValidation.issues,
  ];
  const restrictedRecords = new Map(
    hostValidation.accepted.map(record => [record.manifest.id, record]),
  );
  const activeRestrictedRecords = new Map<PluginId, InstalledPluginRecord>();

  for (const issue of hostValidation.issues) {
    if (!builtinIds.has(issue.pluginId)) {
      pluginStates.set(
        issue.pluginId,
        Object.freeze({
          state: 'SKIPPED',
          stage: 'manifest',
          reason: issue.code,
        }),
      );
    }
  }

  for (const [pluginId, issue] of resolution.skipped) {
    pluginStates.set(
      pluginId,
      Object.freeze({
        state: 'SKIPPED',
        stage: 'resolve',
        reason: issue.code,
      }),
    );
  }

  const orderedBuiltinIds = [
    ...resolution.order.filter(pluginId => resolution.coreClosure.has(pluginId)),
    ...resolution.order.filter(pluginId => !resolution.coreClosure.has(pluginId)),
  ];

  for (const pluginId of orderedBuiltinIds) {
    const definition = definitions.get(pluginId);
    if (definition === undefined) {
      continue;
    }

    const inactiveDependency = resolution.dependencies.find(
      dependency =>
        dependency.consumer === pluginId &&
        pluginStates.get(dependency.provider)?.state !== 'ACTIVE',
    );

    if (inactiveDependency !== undefined) {
      const issue: PluginRuntimeIssue = {
        code: 'CAPABILITY_UNAVAILABLE',
        stage: 'assertion',
        message: `Plugin ${pluginId} depends on inactive provider ${inactiveDependency.provider}.`,
        pluginId,
        capability: inactiveDependency.capability,
      };

      if (resolution.coreClosure.has(pluginId)) {
        throw new PluginRuntimeBootstrapError(issue);
      }

      pluginStates.set(
        pluginId,
        Object.freeze({
          state: 'SKIPPED',
          stage: 'resolve',
          reason: issue.code,
        }),
      );
      continue;
    }

    const activation = capabilityController.beginActivation(
      pluginId,
      definition,
    );
    const contributionActivation =
      contributionController.beginActivation(pluginId);

    try {
      await definition.activate({
        capabilities: activation.context,
        contributions: contributionActivation.context,
      });
      activation.validate();
      contributionActivation.validate();
      activation.apply();
      contributionActivation.apply();
      pluginStates.set(pluginId, Object.freeze({ state: 'ACTIVE' }));
    } catch (error) {
      activation.discard();
      contributionActivation.discard();
      const stage =
        error instanceof PluginRuntimeContractError
          ? error.issue.stage
          : 'activate';
      pluginStates.set(
        pluginId,
        Object.freeze({
          state: 'FAILED',
          stage,
          error,
        }),
      );

      if (resolution.coreClosure.has(pluginId)) {
        throw bootstrapFailure(pluginId, error);
      }
    }
  }

  const eligibleRestricted: NormalizedRestrictedDeclarations[] = [];
  const orderedRestrictedIds = resolution.order.filter(
    pluginId => !builtinIds.has(pluginId) && restrictedRecords.has(pluginId),
  );

  for (const pluginId of orderedRestrictedIds) {
    const record = restrictedRecords.get(pluginId);
    if (record === undefined) {
      continue;
    }

    const inactiveDependency = resolution.dependencies.find(
      dependency =>
        dependency.consumer === pluginId &&
        pluginStates.get(dependency.provider)?.state !== 'ACTIVE',
    );
    if (inactiveDependency !== undefined) {
      const issue = manifestIssue({
        code: 'CAPABILITY_UNAVAILABLE',
        validationStage: 'resolve',
        message: `Restricted plugin ${pluginId} depends on inactive provider ${inactiveDependency.provider}.`,
        pluginId,
        capability: inactiveDependency.capability,
        path: [pluginId, inactiveDependency.capability, inactiveDependency.provider],
      });
      validationIssues.push(issue);
      pluginStates.set(
        pluginId,
        Object.freeze({
          state: 'SKIPPED',
          stage: 'resolve',
          reason: issue.code,
        }),
      );
      continue;
    }

    eligibleRestricted.push(normalizeRestrictedContributions(record));
  }

  const contributionValidation = validateRestrictedContributionSet(
    eligibleRestricted,
    contributionController.registry,
  );
  for (const [pluginId, issue] of contributionValidation.issues) {
    validationIssues.push(issue);
    pluginStates.set(
      pluginId,
      Object.freeze({
        state: 'SKIPPED',
        stage: 'manifest',
        reason: issue.code,
      }),
    );
  }

  for (const declaration of eligibleRestricted) {
    const { manifest } = declaration.record;
    if (contributionValidation.issues.has(manifest.id)) {
      continue;
    }

    const contributionActivation = contributionController.beginActivation(
      manifest.id,
      contributionValidation.references,
    );
    const surfaceActivation = surfaceController.beginDeclaration(
      manifest.id,
      manifest.version,
      manifest.surfaces,
    );
    for (const route of declaration.routes) {
      contributionActivation.context.registerRoute(route);
    }
    for (const item of declaration.navigation) {
      contributionActivation.context.registerNavigation(item);
    }
    for (const extension of declaration.extensions) {
      contributionActivation.context.registerExtension(extension);
    }

    try {
      contributionActivation.validate();
      surfaceActivation.validate();
      contributionActivation.apply();
      surfaceActivation.apply();
      activeRestrictedRecords.set(manifest.id, declaration.record);
      pluginStates.set(manifest.id, Object.freeze({ state: 'ACTIVE' }));
    } catch (error) {
      contributionActivation.discard();
      surfaceActivation.discard();
      const issue = manifestIssue({
        code: 'INVALID_CONTRIBUTION',
        message: `Restricted declarations for ${manifest.id} could not be committed.`,
        pluginId: manifest.id,
      });
      validationIssues.push(issue);
      pluginStates.set(
        manifest.id,
        Object.freeze({
          state: 'SKIPPED',
          stage: 'manifest',
          reason: issue.code,
        }),
      );
    }
  }

  return Object.freeze({
    ready: true,
    candidates: frozenCopy([
      ...options.builtins.map(definition => ({ kind: 'builtin' as const, descriptor: {
        id: definition.id, version: definition.version, requires: definition.requires, provides: definition.provides,
      } })),
      ...(options.installed ?? []).filter(record => record.config.enabled).map(record => ({ kind: 'restricted' as const, descriptor: record.manifest })),
    ]),
    installations: Object.freeze((options.installed ?? []).filter(record => record.config.enabled)),
    resolution: Object.freeze({
      ...resolution, coreClosure: readonlySet(resolution.coreClosure),
      skipped: readonlyMap(resolution.skipped),
    }),
    capabilities: capabilityController.registry,
    contributions: contributionController.registry,
    surfaces: surfaceController.registry,
    bridgeContracts,
    restrictedPlugins: readonlyMap(
      [...activeRestrictedRecords.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    validationIssues: Object.freeze(
      validationIssues.sort((left, right) =>
        left.pluginId.localeCompare(right.pluginId),
      ),
    ),
    plugins: readonlyMap(
      [...pluginStates.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}
