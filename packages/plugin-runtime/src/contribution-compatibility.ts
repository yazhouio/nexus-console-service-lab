function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Run before submitting a declaration to a target's closed-schema validator. */
export function assertContributionContractCompatible(
  manifest: unknown,
  supportedVersion: 1 | 2 | 3,
): void {
  if (supportedVersion !== 1 && supportedVersion !== 2 && supportedVersion !== 3)
    throw new Error('CONTRIBUTION_CONTRACT_UNSUPPORTED');
  if (!isRecord(manifest) || !isRecord(manifest.contributions)) return;
  if (
    supportedVersion < 3 &&
    ((Array.isArray(manifest.actions) && manifest.actions.length > 0) ||
      Object.hasOwn(manifest, 'roles') ||
      Object.hasOwn(manifest, 'provenance') ||
      (Array.isArray(manifest.extensionPoints) &&
        manifest.extensionPoints.some(
          (point) =>
            isRecord(point) && (point.kind !== 'surface' || Object.hasOwn(point, 'profile')),
        )) ||
      Object.values(manifest.contributions).some(
        (entries) =>
          Array.isArray(entries) &&
          entries.some(
            (entry) =>
              isRecord(entry) &&
              (Object.hasOwn(entry, 'childPoint') ||
                Object.hasOwn(entry, 'expectedProfile') ||
                Object.hasOwn(entry, 'expectedRefContract') ||
                entry.kind === 'action' ||
                entry.kind === 'tab' ||
                (Object.hasOwn(entry, 'point') && entry.kind !== 'surface')),
          ),
      ))
  ) {
    throw new Error('CONTRIBUTION_CONTRACT_UNSUPPORTED: target requires contract version 3.');
  }
  for (const kind of ['routes', 'navigation'] as const) {
    const entries = manifest.contributions[kind];
    if (
      supportedVersion === 1 &&
      Array.isArray(entries) &&
      entries.some(
        (entry) =>
          isRecord(entry) &&
          (Object.hasOwn(entry, 'parentRouteId') || Object.hasOwn(entry, 'acceptsChildren')),
      )
    ) {
      throw new Error(
        'CONTRIBUTION_CONTRACT_UNSUPPORTED: target Host requires legacy declarations.',
      );
    }
  }
}
