import { useHostTestServices as useHostServices, TestSurfaceMount as SurfaceMount } from '@nexus/browser-host/testing';
import type { ComponentType } from 'react';



/** Included only in explicitly marked test builds. No additional production UI slot. */
export function IndependentSurfacesFixture() {
  const { runtime } = useHostServices();
  const route = runtime.contributions.listRoutes().find(r => r.contribution.id === 'kubeeye-overview-route');
  const overview = runtime.contributions.listRoutes().find(r => r.contribution.id === 'host-overview')?.contribution.target;
  const Overview = overview?.kind === 'builtin' ? overview.render as ComponentType : () => null;
  return <>
    {route?.contribution.target.kind === 'sandbox-surface' && <SurfaceMount pluginId={route.ownerPluginId}
      target={route.contribution.target} mountPointId={`route:${route.contribution.id}`} label="KubeEye Surface" testId="surface" />}
    <Overview />
  </>;
}
