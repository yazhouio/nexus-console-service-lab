import type { HostRenderTarget } from '../contribution';
import { validateContextSchema, type ContextSchema } from './schema';
export interface ExtensionPointRef { readonly ownerPluginId: string; readonly id: string; readonly contractMajor: number }
export interface ExtensionPointDefinition { readonly id: string; readonly kind: 'surface'; readonly contractMajor: number; readonly contextSchema: ContextSchema }
export interface SurfaceContributionDefinition { readonly id: string; readonly kind: 'surface'; readonly point: ExtensionPointRef; readonly surfaceId: string; readonly order?: number }
export interface UiSurfaceDefinition { readonly id: string; readonly target: HostRenderTarget }
export interface ContributionRef { readonly ownerPluginId: string; readonly id: string }
export type HostContributionPolicyRequest = { readonly contributorId: string; readonly ownerPluginId: string; readonly targetId: string } & ({ readonly kind: 'route' | 'navigation' } | { readonly kind: 'surface'; readonly contractMajor: number });
export type HostContributionPolicy = (request: HostContributionPolicyRequest) => boolean;
export const uiKey = (owner: string, id: string): string => JSON.stringify([owner, id]);
export function assertPoint(value: ExtensionPointDefinition): void {
  if (!value || Object.keys(value).some(k => !['id','kind','contractMajor','contextSchema'].includes(k)) || typeof value.id !== 'string' || !value.id.trim() || value.kind !== 'surface' || !Number.isSafeInteger(value.contractMajor) || value.contractMajor < 1) throw Error('Invalid Extension Point.');
  validateContextSchema(value.contextSchema);
}
export function assertSurfaceContribution(value: SurfaceContributionDefinition): void {
  if (!value || Object.keys(value).some(k => !['id','kind','point','surfaceId','order'].includes(k)) || value.kind !== 'surface' || typeof value.id !== 'string' || !value.id.trim() || typeof value.surfaceId !== 'string' || !value.surfaceId.trim() || value.order !== undefined && !Number.isFinite(value.order)) throw Error('Invalid Surface contribution.');
  const p = value.point;
  if (!p || Object.keys(p).some(k => !['ownerPluginId','id','contractMajor'].includes(k)) || typeof p.id !== 'string' || !p.id.trim() || typeof p.ownerPluginId !== 'string' || !p.ownerPluginId.trim() || !Number.isSafeInteger(p.contractMajor) || p.contractMajor < 1) throw Error('Invalid Point reference.');
}
