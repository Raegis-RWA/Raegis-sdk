export { AegisClient, AegisClientConfig } from './client';
export {
  createReadOnlyClient,
  createInvestorClient,
  createComplianceOperatorClient,
  createIssuerClient,
  createAdminClient,
  getRoleCapabilities,
} from './client-factory';
export type {
  AegisReadOnlyClient,
  AegisInvestorClient,
  AegisComplianceOperatorClient,
  AegisIssuerClient,
  AegisAdminClient,
} from './client-factory';
export * from './types/client-factory';
export * from './errors/client-factory';
export { ComplianceModule } from './compliance';
export { AssetModule } from './asset';
export { InvestorModule } from './investor/portfolio';
export { RoleModule } from './role';
export { EventsModule } from './events/module';
export { decodeContractEvent, decodeContractEvents } from './events/decoder';
export {
  AEGIS_EVENT_TOPICS,
  isKnownAegisEventTopic,
  normalizeEventTopicName,
} from './events/topics';
export { decodeScVal, decodeEventName } from './soroban/scval';
export { parseSorobanResult } from './utils/xdr-parser';
export {
  buildAdminActionReceipt,
  buildAdminTransactionExplorerUrl,
  normalizeAdminActionStatus,
} from './admin/receipts';
export { classifyNetworkFailure } from './network/failures';
export {
  buildNetworkFailureDiagnostic,
  NetworkFailureDiagnostic,
  NetworkRecoveryAction,
} from './diagnostics/network';
export {
  buildConfigDiagnostic,
  ConfigDiagnostic,
  ConfigDiagnosticFeatureFlags,
  ConfigDiagnosticInput,
  ConfigDiagnosticIssue,
  ConfigDiagnosticIssueCode,
  ConfigDiagnosticRpcSummary,
  ConfigDiagnosticSigner,
  ConfigDiagnosticStatus,
} from './diagnostics/config';
export {
  describeNetworkPassphrase,
  inspectRpcUrl,
  redactContractId,
  redactIdentifier,
  redactRpcUrl,
  REDACTED,
} from './security/redaction';
export {
  resolveClientConfig,
  validateContractId,
  validateNetworkPassphrase,
  validateRpcUrl,
} from './config/validate';
export { AEGIS_ENVIRONMENTS, getEnvironmentPreset } from './config/environments';
export * from './types/portfolio';
export * from './errors/portfolio';
export * from './types/role';
export * from './errors/role';
export * from './types/admin-receipt';
export * from './errors/network';
export * from './errors/config';
export * from './types/contract-event';
export * from './errors/event';
export type { AegisEnvironmentName, AegisEnvironmentPreset } from './config/environments';
export type { ResolvedAegisConfig } from './config/validate';
