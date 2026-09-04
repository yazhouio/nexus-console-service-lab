import { useHostServices } from './HostContext';
import { Overview } from './Overview';
import { SurfaceMount } from './SurfaceMount';

/** Included only in explicitly marked test builds. No additional production UI slot. */
export function IndependentSurfacesFixture() {
  const { runtime, adapter, failures } = useHostServices();
  const route = runtime.contributions.listRoutes().find(r => r.contribution.id === 'kubeeye-overview-route');
  return <>
    {route?.contribution.target.kind === 'sandbox-surface' && <SurfaceMount adapter={adapter} pluginId={route.ownerPluginId}
      target={route.contribution.target} mountPointId={`route:${route.contribution.id}`} label="KubeEye Surface" testId="surface" failure={failures[`route:${route.contribution.id}`]} />}
    <Overview />
  </>;
}
