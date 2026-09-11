/** Distribution-owned acceptance harnesses only; feature imports are rejected by workspace boundaries. */
export { useHostServices as useHostTestServices } from './HostContext';
export { SurfaceMount as TestSurfaceMount } from './SurfaceMount';

export { ManagedBuiltin as TestBuiltinMount } from './ManagedBuiltin';
