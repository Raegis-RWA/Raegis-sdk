/**
 * Package-surface contract for @aegis/sdk.
 *
 * This file is type-checked after `npm run build`, so self-name imports resolve
 * through package.json#exports and the generated declaration files exactly as a
 * consumer sees them.
 */
import * as sdk from '@aegis/sdk';
import * as testing from '@aegis/sdk/testing';

import type {
  AegisClientConfig,
  AegisReadOnlyClient,
  AegisInvestorClient,
  AegisComplianceOperatorClient,
  AegisIssuerClient,
  AegisAdminClient,
  ClientRole,
  RoleCapabilities,
  ReadOnlyClientConfig,
  SignerClientConfig,
  RoleCapabilityErrorCode,
  PortfolioStatus,
  TransferEligibility,
  AssetMetadata,
  AssetHolding,
  InvestorPortfolio,
  FetchPortfolioOptions,
  PortfolioErrorCode,
  RoleName,
  RoleDiscoveryCode,
  RoleDiscoveryResult,
  CapabilityName,
  CapabilityCheckCode,
  CapabilityCheckResult,
  CapabilityMatrix,
  RoleErrorCode,
  AdminActionOperation,
  AdminActionStatus,
  AdminTransactionStatusInput,
  AdminReceiptCommonInput,
  AdminActionReceiptInput,
  AdminActionReceipt,
  AdminReceiptErrorCode,
  NetworkFailureCode,
  ConfigErrorCode,
  ContractEventKind,
  ContractEventEnvelope,
  ComplianceContractEvent,
  MintContractEvent,
  TransferContractEvent,
  AdminContractEvent,
  AssetMetadataContractEvent,
  UnknownContractEvent,
  AegisContractEvent,
  ContractEventInput,
  DecodeContractEventOptions,
  EventDecodeErrorCode,
  AegisEnvironmentName,
  AegisEnvironmentPreset,
  ResolvedAegisConfig,
  NetworkFailureDiagnostic,
  NetworkRecoveryAction,
} from '@aegis/sdk';
import type {
  MockAegisClientConfig,
  MockTransactionReceipt,
  MockFixtureSet,
} from '@aegis/sdk/testing';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Assert<T extends true> = T;

type ExpectedRootRuntimeExports =
  | 'AegisClient'
  | 'createReadOnlyClient'
  | 'createInvestorClient'
  | 'createComplianceOperatorClient'
  | 'createIssuerClient'
  | 'createAdminClient'
  | 'getRoleCapabilities'
  | 'RoleCapabilityError'
  | 'ComplianceModule'
  | 'AssetModule'
  | 'InvestorModule'
  | 'RoleModule'
  | 'EventsModule'
  | 'decodeContractEvent'
  | 'decodeContractEvents'
  | 'AEGIS_EVENT_TOPICS'
  | 'isKnownAegisEventTopic'
  | 'normalizeEventTopicName'
  | 'decodeScVal'
  | 'decodeEventName'
  | 'parseSorobanResult'
  | 'buildAdminActionReceipt'
  | 'buildAdminTransactionExplorerUrl'
  | 'normalizeAdminActionStatus'
  | 'classifyNetworkFailure'
  | 'buildNetworkFailureDiagnostic'
  | 'resolveClientConfig'
  | 'AEGIS_ENVIRONMENTS'
  | 'getEnvironmentPreset'
  | 'PortfolioError'
  | 'RoleError'
  | 'AdminReceiptError'
  | 'NetworkFailure'
  | 'ConfigValidationError'
  | 'EventDecodeError';

type ExpectedTestingRuntimeExports =
  | 'MockAegisClient'
  | 'MockComplianceModule'
  | 'MockAssetModule'
  | 'MockInvestorModule'
  | 'createMockAegisClient'
  | 'MOCK_CONTRACT_ID'
  | 'MOCK_SECONDARY_CONTRACT_ID'
  | 'DEFAULT_MOCK_ASSET_METADATA'
  | 'MOCK_TX_HASH_PREFIX'
  | 'createMockFixtures'
  | 'buildMockTxHash';

type RootRuntimeSurfaceIsReviewed = Assert<
  Equal<keyof typeof sdk, ExpectedRootRuntimeExports>
>;
type TestingRuntimeSurfaceIsReviewed = Assert<
  Equal<keyof typeof testing, ExpectedTestingRuntimeExports>
>;

// Type-only exports are named explicitly so removal/renaming is a compile failure.
type RootTypeSurfaceRemainsResolvable = [
  AegisClientConfig,
  AegisReadOnlyClient,
  AegisInvestorClient,
  AegisComplianceOperatorClient,
  AegisIssuerClient,
  AegisAdminClient,
  ClientRole,
  RoleCapabilities,
  ReadOnlyClientConfig,
  SignerClientConfig,
  RoleCapabilityErrorCode,
  PortfolioStatus,
  TransferEligibility,
  AssetMetadata,
  AssetHolding,
  InvestorPortfolio,
  FetchPortfolioOptions,
  PortfolioErrorCode,
  RoleName,
  RoleDiscoveryCode,
  RoleDiscoveryResult,
  CapabilityName,
  CapabilityCheckCode,
  CapabilityCheckResult,
  CapabilityMatrix,
  RoleErrorCode,
  AdminActionOperation,
  AdminActionStatus,
  AdminTransactionStatusInput,
  AdminReceiptCommonInput,
  AdminActionReceiptInput,
  AdminActionReceipt,
  AdminReceiptErrorCode,
  NetworkFailureCode,
  ConfigErrorCode,
  ContractEventKind,
  ContractEventEnvelope,
  ComplianceContractEvent,
  MintContractEvent,
  TransferContractEvent,
  AdminContractEvent,
  AssetMetadataContractEvent,
  UnknownContractEvent,
  AegisContractEvent,
  ContractEventInput,
  DecodeContractEventOptions,
  EventDecodeErrorCode,
  AegisEnvironmentName,
  AegisEnvironmentPreset,
  ResolvedAegisConfig,
  NetworkFailureDiagnostic,
  NetworkRecoveryAction,
];

type TestingTypeSurfaceRemainsResolvable = [
  MockAegisClientConfig,
  MockTransactionReceipt,
  MockFixtureSet,
];

type PublicTypeSurfaceContract = [
  RootTypeSurfaceRemainsResolvable,
  TestingTypeSurfaceRemainsResolvable,
];

// Deep source paths are internal. If one becomes public intentionally, remove
// this expectation in the same change and document the new entrypoint.
// @ts-expect-error package.json#exports intentionally blocks internal deep imports.
import type { ResolvedAegisConfig as DeepInternalImport } from '@aegis/sdk/config/validate';

type InternalBoundaryStaysClosed = DeepInternalImport;
