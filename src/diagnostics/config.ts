import { Keypair } from '@stellar/stellar-sdk';
import {
  AEGIS_ENVIRONMENTS,
  AegisEnvironmentName,
} from '../config/environments';
import { AegisClientConfig } from '../config/validate';
import { ConfigErrorCode } from '../errors/config';
import {
  describeNetworkPassphrase,
  inspectRpcUrl,
  redactContractId,
  redactIdentifier,
  redactRpcUrl,
} from '../security/redaction';

export type ConfigDiagnosticStatus = 'ok' | 'warning' | 'error';

export type ConfigDiagnosticField =
  | 'config'
  | 'contractId'
  | 'rpcUrl'
  | 'networkPassphrase'
  | 'environment'
  | 'allowMainnet'
  | 'keypair';

/**
 * Issue codes for configuration diagnostics.
 *
 * Extends the fail-fast `ConfigErrorCode` set with soft warnings that are
 * useful in support reports but do not block client construction.
 */
export type ConfigDiagnosticIssueCode =
  | ConfigErrorCode
  | 'INSECURE_RPC_URL'
  | 'RPC_URL_HAS_CREDENTIALS'
  | 'RPC_URL_HAS_SENSITIVE_SEGMENTS';

export type ConfigDiagnosticSeverity = 'error' | 'warning';

export interface ConfigDiagnosticIssue {
  readonly code: ConfigDiagnosticIssueCode;
  readonly field: ConfigDiagnosticField;
  readonly severity: ConfigDiagnosticSeverity;
  readonly message: string;
}

export interface ConfigDiagnosticRpcSummary {
  readonly display: string;
  readonly protocol: 'https' | 'http' | 'other' | 'unknown';
  readonly secure: boolean;
  readonly loopback: boolean;
  readonly hasCredentials: boolean;
  readonly hasSensitiveSegments: boolean;
}

export interface ConfigDiagnosticFeatureFlags {
  /** Whether `allowMainnet: true` was supplied. */
  readonly allowMainnet: boolean;
  /**
   * Whether the selected environment preset is marked available.
   * `null` when no recognisable environment was provided.
   */
  readonly environmentAvailable: boolean | null;
}

export interface ConfigDiagnosticSigner {
  /** True when a Keypair instance was supplied. Never includes the secret. */
  readonly present: boolean;
  readonly type: 'keypair' | 'none';
}

/**
 * Safe, serialisable configuration summary for logs, dashboards, and GitHub
 * support requests. Every field is allowlisted; secrets never appear.
 */
export interface ConfigDiagnostic {
  readonly status: ConfigDiagnosticStatus;
  /** True when there are no `error`-severity issues. Warnings are allowed. */
  readonly ready: boolean;
  readonly environment: string;
  readonly rpc: ConfigDiagnosticRpcSummary;
  readonly contractId: string;
  /** Well-known network name (`testnet`, `public`, …) or `custom` / `<missing>`. */
  readonly network: string;
  readonly featureFlags: ConfigDiagnosticFeatureFlags;
  readonly signer: ConfigDiagnosticSigner;
  readonly issues: readonly ConfigDiagnosticIssue[];
}

/**
 * Loose input accepted by the diagnostic builder.
 *
 * Invalid and partial configs are intentional — callers often need a report
 * *because* construction failed.
 */
export type ConfigDiagnosticInput = Partial<AegisClientConfig> | null | undefined;

const ISSUE_MESSAGES: Readonly<Record<ConfigDiagnosticIssueCode, string>> = {
  MISSING_CONFIG: 'Required configuration is missing or incomplete.',
  ENVIRONMENT_UNAVAILABLE:
    'The selected environment is gated and was not explicitly opted into.',
  INVALID_RPC_URL: 'The RPC URL is missing, malformed, or uses an unsupported protocol.',
  INVALID_NETWORK_PASSPHRASE: 'The network passphrase is missing or empty.',
  INVALID_CONTRACT_ID:
    'The contract ID is not a valid StrKey-encoded Soroban contract ID.',
  INSECURE_RPC_URL:
    'The RPC URL uses plain http outside the local environment preset.',
  RPC_URL_HAS_CREDENTIALS:
    'The RPC URL embeds credentials. Prefer header-based auth and never paste the raw URL.',
  RPC_URL_HAS_SENSITIVE_SEGMENTS:
    'The RPC URL includes a path, query, or fragment that may contain an API key.',
};

/**
 * Builds a frozen, redacted configuration diagnostic suitable for pasting into
 * GitHub issues. Never serialise the original config, Keypair, or RPC server.
 */
export function buildConfigDiagnostic(
  input: ConfigDiagnosticInput,
): ConfigDiagnostic {
  const issues: ConfigDiagnosticIssue[] = [];

  if (!input || typeof input !== 'object') {
    issues.push(
      issue('MISSING_CONFIG', 'config', 'error'),
    );

    return freezeDiagnostic({
      status: 'error',
      ready: false,
      environment: '<missing>',
      rpc: emptyRpcSummary(),
      contractId: redactContractId(undefined),
      network: '<missing>',
      featureFlags: { allowMainnet: false, environmentAvailable: null },
      signer: { present: false, type: 'none' },
      issues,
    });
  }

  const environmentName =
    typeof input.environment === 'string' ? input.environment : undefined;
  const preset =
    environmentName && environmentName in AEGIS_ENVIRONMENTS
      ? AEGIS_ENVIRONMENTS[environmentName as AegisEnvironmentName]
      : undefined;

  const allowMainnet = input.allowMainnet === true;
  const environmentLabel = environmentName
    ? redactIdentifier(environmentName)
    : '<none>';

  if (environmentName && !preset) {
    issues.push(issue('MISSING_CONFIG', 'environment', 'error'));
  }

  if (preset && !preset.available && !allowMainnet) {
    issues.push(issue('ENVIRONMENT_UNAVAILABLE', 'environment', 'error'));
  }

  // Contract ID
  const contractIdRaw = input.contractId;
  if (typeof contractIdRaw !== 'string' || !contractIdRaw.trim()) {
    issues.push(issue('MISSING_CONFIG', 'contractId', 'error'));
  } else if (
    redactContractId(contractIdRaw) === '<invalid-contract-id>'
  ) {
    issues.push(issue('INVALID_CONTRACT_ID', 'contractId', 'error'));
  }

  // Resolve effective RPC URL / passphrase the same way the client would,
  // without throwing, so the diagnostic still describes a partial config.
  const effectiveRpcUrl =
    typeof input.rpcUrl === 'string' && input.rpcUrl
      ? input.rpcUrl
      : preset?.rpcUrl;
  const effectivePassphrase =
    typeof input.networkPassphrase === 'string' && input.networkPassphrase
      ? input.networkPassphrase
      : preset?.networkPassphrase;

  if (!environmentName && (!input.rpcUrl || !input.networkPassphrase)) {
    issues.push(issue('MISSING_CONFIG', 'config', 'error'));
  }

  const rpcInspection = inspectRpcUrl(effectiveRpcUrl);
  const allowInsecure = environmentName === 'local';

  if (!effectiveRpcUrl) {
    // Already covered by MISSING_CONFIG when neither environment nor rpcUrl.
  } else if (!rpcInspection.valid) {
    issues.push(issue('INVALID_RPC_URL', 'rpcUrl', 'error'));
  } else if (rpcInspection.protocol === 'http' && !allowInsecure) {
    // Mirror resolveClientConfig: http is an error for non-local presets.
    // Fully custom (no environment) still allows http at construction time,
    // so surface it as a warning rather than blocking readiness.
    if (environmentName) {
      issues.push(issue('INVALID_RPC_URL', 'rpcUrl', 'error'));
    } else {
      issues.push(issue('INSECURE_RPC_URL', 'rpcUrl', 'warning'));
    }
  } else if (
    rpcInspection.protocol === 'http' &&
    allowInsecure &&
    !rpcInspection.loopback
  ) {
    // Local preset allows http, but a non-loopback override is unusual enough
    // to call out without blocking readiness.
    issues.push(issue('INSECURE_RPC_URL', 'rpcUrl', 'warning'));
  }

  if (rpcInspection.hasCredentials) {
    issues.push(issue('RPC_URL_HAS_CREDENTIALS', 'rpcUrl', 'warning'));
  }
  if (
    rpcInspection.hasPath ||
    rpcInspection.hasQuery ||
    rpcInspection.hasFragment
  ) {
    issues.push(issue('RPC_URL_HAS_SENSITIVE_SEGMENTS', 'rpcUrl', 'warning'));
  }

  // Explicit empty passphrase override
  if (
    input.networkPassphrase !== undefined &&
    (typeof input.networkPassphrase !== 'string' ||
      !input.networkPassphrase.trim())
  ) {
    issues.push(issue('INVALID_NETWORK_PASSPHRASE', 'networkPassphrase', 'error'));
  } else if (!effectivePassphrase) {
    // Covered by MISSING_CONFIG when neither environment nor passphrase.
  }

  const passphraseInfo = describeNetworkPassphrase(effectivePassphrase);
  const signer = describeSigner(input.keypair);

  const hasErrors = issues.some((entry) => entry.severity === 'error');
  const hasWarnings = issues.some((entry) => entry.severity === 'warning');

  return freezeDiagnostic({
    status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok',
    ready: !hasErrors,
    environment: environmentLabel,
    rpc: Object.freeze({
      display: effectiveRpcUrl ? redactRpcUrl(effectiveRpcUrl) : '<missing>',
      protocol: rpcInspection.protocol,
      secure: rpcInspection.secure,
      loopback: rpcInspection.loopback,
      hasCredentials: rpcInspection.hasCredentials,
      hasSensitiveSegments:
        rpcInspection.hasPath ||
        rpcInspection.hasQuery ||
        rpcInspection.hasFragment,
    }),
    contractId: redactContractId(contractIdRaw),
    network: passphraseInfo.network,
    featureFlags: Object.freeze({
      allowMainnet,
      environmentAvailable: preset ? preset.available : null,
    }),
    signer,
    issues: Object.freeze(issues.map((entry) => Object.freeze(entry))),
  });
}

function describeSigner(value: unknown): ConfigDiagnosticSigner {
  if (value instanceof Keypair) {
    return Object.freeze({ present: true, type: 'keypair' });
  }
  return Object.freeze({ present: false, type: 'none' });
}

function issue(
  code: ConfigDiagnosticIssueCode,
  field: ConfigDiagnosticField,
  severity: ConfigDiagnosticSeverity,
): ConfigDiagnosticIssue {
  return Object.freeze({
    code,
    field,
    severity,
    message: ISSUE_MESSAGES[code],
  });
}

function emptyRpcSummary(): ConfigDiagnosticRpcSummary {
  return Object.freeze({
    display: '<missing>',
    protocol: 'unknown',
    secure: false,
    loopback: false,
    hasCredentials: false,
    hasSensitiveSegments: false,
  });
}

function freezeDiagnostic(diagnostic: ConfigDiagnostic): ConfigDiagnostic {
  return Object.freeze(diagnostic);
}
