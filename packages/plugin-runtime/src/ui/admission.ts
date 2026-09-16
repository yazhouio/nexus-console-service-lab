import type {
  CompiledExtensionPointDefinition,
  ExtensionKind,
  HostContributionPolicy,
  PointContributionMetadata,
} from './definitions';

/** A Point alone selects the contract; assertions can only reject that selection. */
export function admitContribution(
  owner: string,
  definition: PointContributionMetadata & { kind: ExtensionKind },
  point: CompiledExtensionPointDefinition,
  policy: HostContributionPolicy,
) {
  let authorized = owner === definition.point.ownerPluginId;
  if (!authorized) {
    try {
      authorized = policy({
        contributorId: owner,
        ownerPluginId: definition.point.ownerPluginId,
        kind: definition.kind,
        targetId: definition.point.id,
        contractMajor: definition.point.contractMajor,
      });
    } catch {
      return { authorized: false, reason: 'POLICY_ERROR' };
    }
  }
  const order = definition.order ?? 0;
  const reason = !authorized
    ? 'POLICY_DENIED'
    : definition.point.contractMajor !== point.contractMajor
      ? 'CONTRACT_MISMATCH'
      : definition.kind !== point.kind
        ? 'KIND_MISMATCH'
        : definition.expectedProfile !== undefined && definition.expectedProfile !== point.profile
          ? 'PROFILE_ASSERTION_FAILED'
          : definition.expectedRefContract !== undefined &&
              definition.expectedRefContract !== point.bindings?.itemRefContract
            ? 'REF_CONTRACT_ASSERTION_FAILED'
            : definition.kind === 'action' &&
                point.constraints?.cardinality &&
                (point.constraints.cardinality.min > 1 || point.constraints.cardinality.max < 1)
              ? 'POINT_CARDINALITY_INVALID'
              : point.constraints?.groups &&
                  !point.constraints.groups.includes(
                    definition.group ?? point.constraints.groups[0],
                  )
                ? 'GROUP_NOT_ALLOWED'
                : point.constraints?.order &&
                    (order < point.constraints.order.min || order > point.constraints.order.max)
                  ? 'ORDER_OUT_OF_RANGE'
                  : undefined;
  return { authorized, reason };
}

export function comparePointContributions<
  T extends { ownerPluginId: string; contribution: { id: string; order?: number; group?: string } },
>(point: CompiledExtensionPointDefinition | undefined, a: T, b: T): number {
  const groups = point?.constraints?.groups ?? [];
  const rank = (group?: string) => (group === undefined ? 0 : groups.indexOf(group));
  const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  return (
    rank(a.contribution.group) - rank(b.contribution.group) ||
    (a.contribution.order ?? 0) - (b.contribution.order ?? 0) ||
    compare(a.ownerPluginId, b.ownerPluginId) ||
    compare(a.contribution.id, b.contribution.id)
  );
}
