import { frozenCopy } from './immutable';
import { isCapabilityId, isHostApiId } from './identifiers';
import { isJsonValue } from './contribution';
import type {
  JsonValue,
  NavigationContribution,
  RestrictedContributions,
  RestrictedRouteContribution,
  RestrictedUiExtensionContribution,
  SandboxSurfaceDefinition,
} from './contribution';
import type {
  CapabilityId,
  HostApiId,
  PluginId,
} from './identifiers';
import type { PluginDescriptor } from './plugin';

export type PermissionId = string;

export interface RestrictedPluginManifest extends PluginDescriptor {
  readonly provides: readonly [];
  readonly entry: string;
  readonly hostApi: HostApiId;
  readonly permissions: readonly PermissionId[];
  readonly surfaces: readonly SandboxSurfaceDefinition[];
  readonly contributions: RestrictedContributions;
}

export interface InstalledPluginConfig {
  readonly id: PluginId;
  readonly version: string;
  readonly enabled: boolean;
  readonly grantedPermissions: readonly PermissionId[];
}

export interface InstalledPluginRecord {
  readonly manifest: RestrictedPluginManifest;
  readonly config: InstalledPluginConfig;
}

export interface RestrictedInstallValidationOptions {
  readonly isEntryAllowed: (entry: string) => boolean;
}

export interface RestrictedManifestValidationIssue {
  readonly code: 'INVALID_RESTRICTED_MANIFEST';
  readonly validationStage: 'manifest';
  readonly message: string;
  readonly pluginId?: PluginId;
}

export class RestrictedManifestValidationError extends Error {
  readonly issue: RestrictedManifestValidationIssue;

  constructor(issue: RestrictedManifestValidationIssue) {
    super(issue.message);
    this.name = 'RestrictedManifestValidationError';
    this.issue = Object.freeze({ ...issue });
  }
}

const PERMISSION_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u;

export function isPermissionId(value: unknown): value is PermissionId {
  return typeof value === 'string' && PERMISSION_ID_PATTERN.test(value);
}

function invalid(message: string, pluginId?: PluginId): never {
  throw new RestrictedManifestValidationError({
    code: 'INVALID_RESTRICTED_MANIFEST',
    validationStage: 'manifest',
    message,
    pluginId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function record(
  value: unknown,
  label: string,
  pluginId?: PluginId,
): Record<string, unknown> {
  if (!isRecord(value)) {
    invalid(`${label} must be an object.`, pluginId);
  }
  return value;
}

function assertClosed(
  value: Record<string, unknown>,
  fields: readonly string[],
  label: string,
  pluginId?: PluginId,
): void {
  const allowed = new Set(fields);
  const unknownField = Object.keys(value).find(field => !allowed.has(field));
  if (unknownField !== undefined) {
    invalid(`${label} contains unknown field ${unknownField}.`, pluginId);
  }
}

function nonEmptyString(
  value: unknown,
  label: string,
  pluginId?: PluginId,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(`${label} must be a non-empty string.`, pluginId);
  }
  return value;
}

function optionalString(
  value: unknown,
  label: string,
  pluginId?: PluginId,
): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, label, pluginId);
}

function optionalOrder(
  value: unknown,
  label: string,
  pluginId?: PluginId,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`${label} must be a finite number.`, pluginId);
  }
  return value;
}

function uniqueStrings(
  value: unknown,
  label: string,
  validate: (entry: unknown) => entry is string,
  pluginId?: PluginId,
): readonly string[] {
  if (!Array.isArray(value) || value.some(entry => !validate(entry))) {
    invalid(`${label} must be an array of valid identifiers.`, pluginId);
  }

  if (new Set(value).size !== value.length) {
    invalid(`${label} must not contain duplicates.`, pluginId);
  }

  return Object.freeze([...value]);
}

function optionalJsonValue(
  source: Record<string, unknown>,
  key: string,
  label: string,
  pluginId: PluginId,
): JsonValue | undefined {
  if (!Object.hasOwn(source, key)) {
    return undefined;
  }
  const value = source[key];
  if (!isJsonValue(value)) {
    invalid(`${label} must be a serializable JsonValue.`, pluginId);
  }
  return frozenCopy(value);
}

function parseSurfaces(
  value: unknown,
  pluginId: PluginId,
): readonly SandboxSurfaceDefinition[] {
  if (!Array.isArray(value)) {
    invalid('Manifest surfaces must be an array.', pluginId);
  }

  const seen = new Set<string>();
  return Object.freeze(
    value.map((surfaceValue, index) => {
      const surface = record(surfaceValue, `Surface ${index}`, pluginId);
      assertClosed(surface, ['id'], `Surface ${index}`, pluginId);
      const id = nonEmptyString(surface.id, `Surface ${index} id`, pluginId);
      if (seen.has(id)) {
        invalid(`Surface id ${id} is duplicated.`, pluginId);
      }
      seen.add(id);
      return Object.freeze({ id });
    }),
  );
}

function parseRoutes(
  value: unknown,
  surfaceIds: ReadonlySet<string>,
  pluginId: PluginId,
): readonly RestrictedRouteContribution[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) {
    invalid('Manifest contributions.routes must be an array.', pluginId);
  }

  const seen = new Set<string>();
  return Object.freeze(
    value.map((routeValue, index) => {
      const route = record(routeValue, `Route ${index}`, pluginId);
      assertClosed(
        route,
        ['id', 'path', 'surfaceId', 'layout', 'initialParameters'],
        `Route ${index}`,
        pluginId,
      );
      const id = nonEmptyString(route.id, `Route ${index} id`, pluginId);
      const path = nonEmptyString(route.path, `Route ${id} path`, pluginId);
      const surfaceId = nonEmptyString(
        route.surfaceId,
        `Route ${id} surfaceId`,
        pluginId,
      );
      if (seen.has(id)) {
        invalid(`Route id ${id} is duplicated.`, pluginId);
      }
      if (!surfaceIds.has(surfaceId)) {
        invalid(`Route ${id} references unknown surface ${surfaceId}.`, pluginId);
      }
      seen.add(id);

      const layout = optionalJsonValue(route, 'layout', `Route ${id} layout`, pluginId);
      const initialParameters = optionalJsonValue(
        route,
        'initialParameters',
        `Route ${id} initialParameters`,
        pluginId,
      );
      return Object.freeze({
        id,
        path,
        surfaceId,
        ...(layout === undefined ? {} : { layout }),
        ...(initialParameters === undefined ? {} : { initialParameters }),
      });
    }),
  );
}

function parseNavigation(
  value: unknown,
  pluginId: PluginId,
): readonly NavigationContribution[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) {
    invalid('Manifest contributions.navigation must be an array.', pluginId);
  }

  const seen = new Set<string>();
  return Object.freeze(
    value.map((navigationValue, index) => {
      const navigation = record(
        navigationValue,
        `Navigation ${index}`,
        pluginId,
      );
      assertClosed(
        navigation,
        ['id', 'label', 'parentId', 'routeId', 'order'],
        `Navigation ${index}`,
        pluginId,
      );
      const id = nonEmptyString(
        navigation.id,
        `Navigation ${index} id`,
        pluginId,
      );
      if (seen.has(id)) {
        invalid(`Navigation id ${id} is duplicated.`, pluginId);
      }
      seen.add(id);
      const label = nonEmptyString(
        navigation.label,
        `Navigation ${id} label`,
        pluginId,
      );
      const parentId = optionalString(
        navigation.parentId,
        `Navigation ${id} parentId`,
        pluginId,
      );
      const routeId = optionalString(
        navigation.routeId,
        `Navigation ${id} routeId`,
        pluginId,
      );
      const order = optionalOrder(
        navigation.order,
        `Navigation ${id} order`,
        pluginId,
      );

      return Object.freeze({
        id,
        label,
        ...(parentId === undefined ? {} : { parentId }),
        ...(routeId === undefined ? {} : { routeId }),
        ...(order === undefined ? {} : { order }),
      });
    }),
  );
}

function parseExtensions(
  value: unknown,
  surfaceIds: ReadonlySet<string>,
  pluginId: PluginId,
): readonly RestrictedUiExtensionContribution[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) {
    invalid('Manifest contributions.extensions must be an array.', pluginId);
  }

  const seen = new Set<string>();
  return Object.freeze(
    value.map((extensionValue, index) => {
      const extension = record(extensionValue, `Extension ${index}`, pluginId);
      assertClosed(
        extension,
        ['id', 'slot', 'surfaceId', 'order', 'layout', 'initialParameters'],
        `Extension ${index}`,
        pluginId,
      );
      const id = nonEmptyString(
        extension.id,
        `Extension ${index} id`,
        pluginId,
      );
      const slot = nonEmptyString(
        extension.slot,
        `Extension ${id} slot`,
        pluginId,
      );
      const surfaceId = nonEmptyString(
        extension.surfaceId,
        `Extension ${id} surfaceId`,
        pluginId,
      );
      const scopedId = `${slot}\u0000${id}`;
      if (seen.has(scopedId)) {
        invalid(`Extension id ${id} is duplicated in slot ${slot}.`, pluginId);
      }
      if (!surfaceIds.has(surfaceId)) {
        invalid(
          `Extension ${id} references unknown surface ${surfaceId}.`,
          pluginId,
        );
      }
      seen.add(scopedId);

      const order = optionalOrder(
        extension.order,
        `Extension ${id} order`,
        pluginId,
      );
      const layout = optionalJsonValue(
        extension,
        'layout',
        `Extension ${id} layout`,
        pluginId,
      );
      const initialParameters = optionalJsonValue(
        extension,
        'initialParameters',
        `Extension ${id} initialParameters`,
        pluginId,
      );

      return Object.freeze({
        id,
        slot,
        surfaceId,
        ...(order === undefined ? {} : { order }),
        ...(layout === undefined ? {} : { layout }),
        ...(initialParameters === undefined ? {} : { initialParameters }),
      });
    }),
  );
}

function parseContributions(
  value: unknown,
  surfaceIds: ReadonlySet<string>,
  pluginId: PluginId,
): RestrictedContributions {
  const contributions = record(value, 'Manifest contributions', pluginId);
  assertClosed(
    contributions,
    ['routes', 'navigation', 'extensions'],
    'Manifest contributions',
    pluginId,
  );

  return Object.freeze({
    routes: parseRoutes(contributions.routes, surfaceIds, pluginId),
    navigation: parseNavigation(contributions.navigation, pluginId),
    extensions: parseExtensions(contributions.extensions, surfaceIds, pluginId),
  });
}

function parseManifest(
  value: unknown,
  options: RestrictedInstallValidationOptions,
): RestrictedPluginManifest {
  const manifest = record(value, 'Manifest');
  const pluginId =
    typeof manifest.id === 'string' && manifest.id.length > 0
      ? manifest.id
      : undefined;
  assertClosed(
    manifest,
    [
      'id',
      'version',
      'requires',
      'provides',
      'entry',
      'hostApi',
      'permissions',
      'surfaces',
      'contributions',
    ],
    'Manifest',
    pluginId,
  );

  const id = nonEmptyString(manifest.id, 'Manifest id', pluginId);
  const version = nonEmptyString(manifest.version, 'Manifest version', id);
  const requires = uniqueStrings(
    manifest.requires,
    'Manifest requires',
    isCapabilityId,
    id,
  ) as readonly CapabilityId[];
  const provides = uniqueStrings(
    manifest.provides,
    'Manifest provides',
    isCapabilityId,
    id,
  );
  if (provides.length !== 0) {
    invalid('Restricted Manifest provides must be empty.', id);
  }

  const entry = nonEmptyString(manifest.entry, 'Manifest entry', id);
  if (!options.isEntryAllowed(entry)) {
    invalid(`Manifest entry ${entry} is not allowed by the Host.`, id);
  }
  if (!isHostApiId(manifest.hostApi)) {
    invalid('Manifest hostApi must contain an explicit major.', id);
  }
  const hostApi = manifest.hostApi;
  const permissions = uniqueStrings(
    manifest.permissions,
    'Manifest permissions',
    isPermissionId,
    id,
  );
  const surfaces = parseSurfaces(manifest.surfaces, id);
  const surfaceIds = new Set(surfaces.map(surface => surface.id));
  const contributions = parseContributions(
    manifest.contributions,
    surfaceIds,
    id,
  );

  return Object.freeze({
    id,
    version,
    requires,
    provides: Object.freeze([]) as readonly [],
    entry,
    hostApi,
    permissions,
    surfaces,
    contributions,
  });
}

function parseConfig(value: unknown, pluginId?: PluginId): InstalledPluginConfig {
  const config = record(value, 'Installed config', pluginId);
  assertClosed(
    config,
    ['id', 'version', 'enabled', 'grantedPermissions'],
    'Installed config',
    pluginId,
  );
  const id = nonEmptyString(config.id, 'Installed config id', pluginId);
  const version = nonEmptyString(
    config.version,
    'Installed config version',
    id,
  );
  if (typeof config.enabled !== 'boolean') {
    invalid('Installed config enabled must be a boolean.', id);
  }
  const grantedPermissions = uniqueStrings(
    config.grantedPermissions,
    'Installed config grantedPermissions',
    isPermissionId,
    id,
  );

  return Object.freeze({
    id,
    version,
    enabled: config.enabled,
    grantedPermissions,
  });
}

export function validateRestrictedInstallRecord(
  value: unknown,
  options: RestrictedInstallValidationOptions,
): InstalledPluginRecord {
  const installRecord = record(value, 'Installed plugin record');
  assertClosed(installRecord, ['manifest', 'config'], 'Installed plugin record');
  const manifest = parseManifest(installRecord.manifest, options);
  const config = parseConfig(installRecord.config, manifest.id);

  if (config.id !== manifest.id || config.version !== manifest.version) {
    invalid(
      'Installed config id and version must exactly match the Manifest.',
      manifest.id,
    );
  }

  const requestedPermissions = new Set(manifest.permissions);
  const unexpectedGrant = config.grantedPermissions.find(
    permission => !requestedPermissions.has(permission),
  );
  if (unexpectedGrant !== undefined) {
    invalid(
      `Granted permission ${unexpectedGrant} was not requested by the Manifest.`,
      manifest.id,
    );
  }

  return Object.freeze({ manifest, config });
}
