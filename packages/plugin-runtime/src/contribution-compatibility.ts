function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Run before submitting a declaration to a target's closed-schema validator. */
export function assertContributionContractCompatible(manifest: unknown, supportedVersion: 1 | 2): void {
  if (supportedVersion !== 1 && supportedVersion !== 2) throw new Error('CONTRIBUTION_CONTRACT_UNSUPPORTED');
  if (!isRecord(manifest) || !isRecord(manifest.contributions)) return;
  for (const kind of ['routes', 'navigation'] as const) {
    const entries = manifest.contributions[kind];
    if (supportedVersion === 1 && Array.isArray(entries) && entries.some(entry => isRecord(entry) &&
      (Object.hasOwn(entry, 'parentRouteId') || Object.hasOwn(entry, 'acceptsChildren')))) {
      throw new Error('CONTRIBUTION_CONTRACT_UNSUPPORTED: target Host requires legacy declarations.');
    }
  }
}
