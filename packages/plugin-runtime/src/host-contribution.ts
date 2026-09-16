/** Host facts are independent of both plugin bootstrap and any routing executor. */
export type ContributionState = 'AVAILABLE' | 'QUARANTINED' | 'UNREACHABLE';
export type ContributionKind = 'route' | 'navigation';
export type ContributionDiagnosticCode =
  | 'POLICY_ERROR'
  | 'POINT_MISSING'
  | 'POINT_TARGET_MISMATCH'
  | 'CONTRACT_MISMATCH'
  | 'KIND_MISMATCH'
  | 'PROFILE_ASSERTION_FAILED'
  | 'REF_CONTRACT_ASSERTION_FAILED'
  | 'GROUP_NOT_ALLOWED'
  | 'ORDER_OUT_OF_RANGE'
  | 'INVALID_PATH'
  | 'DUPLICATE_PARAMETER'
  | 'PARENT_MISSING'
  | 'PARENT_QUARANTINED'
  | 'PARENT_UNREACHABLE'
  | 'PARENT_NOT_LAYOUT'
  | 'PARENT_WILDCARD'
  | 'PARENT_CYCLE'
  | 'EXTENSION_POINT_CLOSED'
  | 'POLICY_DENIED'
  | 'ROUTE_CONFLICT'
  | 'TARGET_MISSING'
  | 'TARGET_UNAVAILABLE'
  | 'TARGET_PARAMS_MISSING'
  | 'TARGET_SHADOWED';
export interface ContributionIdentity {
  readonly ownerPluginId: string;
  readonly kind: ContributionKind;
  readonly contributionId: string;
}
export interface ContributionDiagnostic {
  readonly code: ContributionDiagnosticCode;
  readonly related?: readonly ContributionIdentity[];
  readonly cause?: ContributionDiagnostic;
  /** Constructed from templates, never from a user's actual URL or parameters. */
  readonly witness?: string;
  readonly missingParams?: readonly string[];
}
export interface HostContributionFact extends ContributionIdentity {
  readonly state: ContributionState;
  readonly declaredPath?: string;
  readonly fullPath?: string;
  readonly parentId?: string;
  readonly diagnostics: readonly ContributionDiagnostic[];
  readonly navigationDiagnostic?: ContributionDiagnostic;
}
