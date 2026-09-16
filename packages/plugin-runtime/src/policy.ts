import { frozenCopy } from './immutable';
import type { HostContributionPolicy, HostContributionPolicyRequest } from './ui/definitions';
export interface ContributionPolicyBundle {
  readonly revision: string;
  readonly grants: readonly HostContributionPolicyRequest[];
}
/** Pins exact contributor → Point Major relations for one distribution lifecycle. */
export function createContributionPolicy(bundle: ContributionPolicyBundle): HostContributionPolicy {
  if (!bundle.revision) throw Error('POLICY_REVISION_REQUIRED');
  const grants = frozenCopy(bundle.grants);
  for (const grant of grants) {
    if (
      !grant.contributorId ||
      !grant.ownerPluginId ||
      !grant.targetId ||
      !['route', 'navigation', 'surface', 'action', 'tab'].includes(grant.kind) ||
      !Number.isSafeInteger(grant.contractMajor) ||
      grant.contractMajor! < 1
    )
      throw Error('INVALID_POINT_GRANT');
  }
  return (request) =>
    grants.some(
      (grant) =>
        grant.contributorId === request.contributorId &&
        grant.ownerPluginId === request.ownerPluginId &&
        grant.kind === request.kind &&
        grant.targetId === request.targetId &&
        grant.contractMajor === request.contractMajor,
    );
}
