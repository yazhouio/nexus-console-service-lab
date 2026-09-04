import type { ContributionPolicyRequest, HostContributionPolicy } from './route-model';

/** Trusted Host configuration, versioned with the build; never read grants from browser storage. */
export const contributionGovernance = {
  revision: 'host-contributions-v1',
  grants: [
    { contributorId: 'kubeeye', ownerPluginId: 'cluster', kind: 'route', targetId: 'node-detail' },
    { contributorId: 'kubeeye', ownerPluginId: 'cluster', kind: 'navigation', targetId: 'node-navigation' },
  ] satisfies readonly ContributionPolicyRequest[],
} as const;
export const contributionPolicy: HostContributionPolicy = request => contributionGovernance.grants.some(grant =>
  grant.contributorId === request.contributorId && grant.ownerPluginId === request.ownerPluginId && grant.kind === request.kind && grant.targetId === request.targetId);
