import type { ContributionPolicyRequest, HostContributionPolicy } from './route-model';

/** Trusted Host configuration, versioned with the build; never read grants from browser storage. */
export const contributionGovernance = {
  revision: 'host-contributions-v1',
  grants: [
    ...((process.env.PUBLIC_TEST_FIXTURES === 'true' ? [
      { contributorId: 'ui-b', ownerPluginId: 'ui-a', kind: 'surface', targetId: 'details', contractMajor: 1 },
      { contributorId: 'ui-c', ownerPluginId: 'ui-b', kind: 'surface', targetId: 'children', contractMajor: 1 },
      { contributorId: 'ui-local', ownerPluginId: 'ui-a', kind: 'surface', targetId: 'details', contractMajor: 1 },
    ] : []) as ContributionPolicyRequest[]),
    { contributorId: 'cluster', ownerPluginId: 'console-shell', kind: 'surface', targetId: 'home.cards', contractMajor: 1 },
    { contributorId: 'kubeeye', ownerPluginId: 'console-shell', kind: 'surface', targetId: 'home.cards', contractMajor: 1 },
    { contributorId: 'kubeeye', ownerPluginId: 'cluster', kind: 'route', targetId: 'node-detail' },
    { contributorId: 'kubeeye', ownerPluginId: 'cluster', kind: 'navigation', targetId: 'node-navigation' },
  ] satisfies readonly ContributionPolicyRequest[],
} as const;
export const contributionPolicy: HostContributionPolicy = request => contributionGovernance.grants.some(grant =>
  grant.contributorId === request.contributorId && grant.ownerPluginId === request.ownerPluginId && grant.kind === request.kind && grant.targetId === request.targetId && (request.kind !== 'surface' || grant.kind === 'surface' && grant.contractMajor === request.contractMajor));
