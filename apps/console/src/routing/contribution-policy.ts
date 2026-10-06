import type { ContributionPolicyBundle } from '@feforgejs/plugin-runtime';
import {
  CORE_ROUTES_POINT,
  PRIMARY_NAVIGATION_POINT,
  HOME_CARDS_POINT,
  SETTINGS_SECTIONS_POINT,
} from '@feforgejs/console-core-api';
import {
  NODE_CHILD_ROUTES_POINT,
  NODE_NAVIGATION_POINT,
  NODE_ACTIONS_POINT,
  NODE_TABS_POINT,
} from '@feforgejs/cluster-api';
export const contributionGovernance: ContributionPolicyBundle = {
  revision: 'console-contributions-v2',
  grants: [
    ...(['deployment-hpa', 'deployment-vpa'] as const).map((contributorId) => ({
      contributorId,
      ownerPluginId: 'deployment',
      kind: 'surface' as const,
      targetId: 'deployment.cards',
      contractMajor: 1,
    })),
    ...(['deployment-monitoring', 'deployment-network'] as const).map((contributorId) => ({
      contributorId,
      ownerPluginId: 'deployment',
      kind: 'tab' as const,
      targetId: 'deployment.tabs',
      contractMajor: 1,
    })),
    {
      contributorId: 'deployment-vpa',
      ownerPluginId: 'deployment',
      kind: 'action',
      targetId: 'deployment.actions',
      contractMajor: 1,
    },
    ...(['cluster', 'kubeeye', 'extension-demo', 'deployment'] as const).flatMap(
      (contributorId) => [
        {
          contributorId,
          ownerPluginId: CORE_ROUTES_POINT.ownerPluginId,
          kind: 'route' as const,
          targetId: CORE_ROUTES_POINT.id,
          contractMajor: 1,
        },
        {
          contributorId,
          ownerPluginId: PRIMARY_NAVIGATION_POINT.ownerPluginId,
          kind: 'navigation' as const,
          targetId: PRIMARY_NAVIGATION_POINT.id,
          contractMajor: 1,
        },
        {
          contributorId,
          ownerPluginId: HOME_CARDS_POINT.ownerPluginId,
          kind: 'surface' as const,
          targetId: HOME_CARDS_POINT.id,
          contractMajor: 1,
        },
      ],
    ),
    {
      contributorId: 'kubeeye',
      ownerPluginId: 'console-core',
      kind: 'surface',
      targetId: SETTINGS_SECTIONS_POINT.id,
      contractMajor: 1,
    },
    {
      contributorId: 'extension-demo',
      ownerPluginId: 'console-core',
      kind: 'surface',
      targetId: SETTINGS_SECTIONS_POINT.id,
      contractMajor: 1,
    },
    {
      contributorId: 'extension-demo',
      ownerPluginId: 'console-core',
      kind: 'action',
      targetId: 'plugin-details.actions',
      contractMajor: 1,
    },
    {
      contributorId: 'kubeeye',
      ownerPluginId: 'cluster',
      kind: 'route',
      targetId: NODE_CHILD_ROUTES_POINT.id,
      contractMajor: 1,
    },
    {
      contributorId: 'kubeeye',
      ownerPluginId: 'cluster',
      kind: 'navigation',
      targetId: NODE_NAVIGATION_POINT.id,
      contractMajor: 1,
    },
    {
      contributorId: 'extension-demo',
      ownerPluginId: 'cluster',
      kind: 'action',
      targetId: NODE_ACTIONS_POINT.id,
      contractMajor: 1,
    },
    {
      contributorId: 'extension-demo',
      ownerPluginId: 'cluster',
      kind: 'tab',
      targetId: NODE_TABS_POINT.id,
      contractMajor: 1,
    },
    ...(process.env.PUBLIC_TEST_FIXTURES === 'true'
      ? [
          {
            contributorId: 'ui-action',
            ownerPluginId: 'cluster',
            kind: 'action' as const,
            targetId: 'node.actions',
            contractMajor: 1,
          },
          {
            contributorId: 'ui-c',
            ownerPluginId: 'cluster',
            kind: 'tab' as const,
            targetId: 'node.tabs',
            contractMajor: 1,
          },
          {
            contributorId: 'ui-b',
            ownerPluginId: 'ui-a',
            kind: 'surface' as const,
            targetId: 'details',
            contractMajor: 1,
          },
          {
            contributorId: 'ui-c',
            ownerPluginId: 'ui-b',
            kind: 'surface' as const,
            targetId: 'children',
            contractMajor: 1,
          },
          {
            contributorId: 'ui-local',
            ownerPluginId: 'ui-a',
            kind: 'surface' as const,
            targetId: 'details',
            contractMajor: 1,
          },
        ]
      : []),
  ],
};
