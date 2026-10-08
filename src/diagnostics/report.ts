import {
  AEGIS_ENVIRONMENTS,
  AegisEnvironmentName,
} from '../config/environments';
import { ConfigErrorCode, ConfigValidationError } from '../errors/config';
import { NetworkFailure } from '../errors/network';
import {
  buildNetworkFailureDiagnostic,
  NetworkFailureDiagnostic,
  NetworkRecoveryAction,
} from './network';

export type DiagnosticsEnvironment = AegisEnvironmentName | 'custom';
export type DiagnosticsRpcTransport = 'http' | 'https' | 'unknown';
export type DiagnosticsNetworkStatus = 'not-checked' | 'degraded';
export type DiagnosticsErrorCategory =
  | 'network'
  | 'configuration'
  | 'unknown';

export interface BuildSdkDiagnosticsInput {
  environment?: AegisEnvironmentName;
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  signerConfigured: boolean;
  complianceAvailable: boolean;
}

export interface SdkDiagnosticsOptions {
  /**
   * Recent SDK errors to include in redacted form. Only the last five entries
   * are retained, and raw messages / causes are never copied into the report.
   */
  recentErrors?: readonly unknown[];
}

export interface SafeDiagnosticError {
  category: DiagnosticsErrorCategory;
  code: string;
  message: string;
  retryable?: boolean;
  action?: NetworkRecoveryAction;
  retryAfterSeconds?: number;
}

export interface AegisSdkDiagnosticsReport {
  schemaVersion: 1;
  safeToShare: true;
  configuration: {
    environment: DiagnosticsEnvironment;
    rpc: {
      configured: boolean;
      transport: DiagnosticsRpcTransport;
      usesPresetEndpoint: boolean;
    };
    network: {
      configured: boolean;
      target: DiagnosticsEnvironment;
    };
    contract: {
      configured: boolean;
    };
    signerConfigured: boolean;
  };
  network: {
    target: DiagnosticsEnvironment;
    status: DiagnosticsNetworkStatus;
    recentFailure?: NetworkFailureDiagnostic;
  };
  compliance: {
    module: 'available' | 'unavailable';
    protocolState: 'not-checked';
    legalStatus: 'not-assessed';
  };
  recentErrors: SafeDiagnosticError[];
}

const MAX_RECENT_ERRORS = 5;

const SAFE_CONFIG_MESSAGES: Readonly<Record<ConfigErrorCode, string>> = {
  ENVIRONMENT_UNAVAILABLE:
    'The requested SDK environment is not currently available.',
  INVALID_RPC_URL: 'The SDK RPC endpoint configuration is invalid.',
  INVALID_NETWORK_PASSPHRASE:
    'The SDK network passphrase configuration is invalid.',
  INVALID_CONTRACT_ID: 'The SDK contract identifier configuration is invalid.',
  MISSING_CONFIG: 'Required SDK configuration is missing.',
};

const UNKNOWN_ERROR_MESSAGE =
  'An SDK operation failed. Raw error details are intentionally omitted.';

/**
 * Builds a deterministic diagnostics report suitable for attaching to support
 * issues. Sensitive inputs are used only to derive coarse state and are never
 * copied to the returned object.
 */
export function buildSdkDiagnosticsReport(
  input: BuildSdkDiagnosticsInput,
  options: SdkDiagnosticsOptions = {},
): AegisSdkDiagnosticsReport {
  const { recentErrors, latestNetworkFailure } = sanitizeRecentErrors(
    options.recentErrors ?? [],
  );
  const networkTarget = identifyNetwork(input.networkPassphrase);

  return {
    schemaVersion: 1,
    safeToShare: true,
    configuration: {
      environment: input.environment ?? 'custom',
      rpc: {
        configured: input.rpcUrl.trim().length > 0,
        transport: identifyRpcTransport(input.rpcUrl),
        usesPresetEndpoint:
          input.environment !== undefined &&
          input.rpcUrl === AEGIS_ENVIRONMENTS[input.environment].rpcUrl,
      },
      network: {
        configured: input.networkPassphrase.trim().length > 0,
        target: networkTarget,
      },
      contract: {
        configured: input.contractId.length > 0,
      },
      signerConfigured: input.signerConfigured,
    },
    network: {
      target: networkTarget,
      status: latestNetworkFailure ? 'degraded' : 'not-checked',
      ...(latestNetworkFailure
        ? { recentFailure: latestNetworkFailure }
        : {}),
    },
    compliance: {
      module: input.complianceAvailable ? 'available' : 'unavailable',
      protocolState: 'not-checked',
      legalStatus: 'not-assessed',
    },
    recentErrors,
  };
}

function identifyNetwork(networkPassphrase: string): DiagnosticsEnvironment {
  for (const preset of Object.values(AEGIS_ENVIRONMENTS)) {
    if (preset.networkPassphrase === networkPassphrase) {
      return preset.name;
    }
  }

  return 'custom';
}

function identifyRpcTransport(rpcUrl: string): DiagnosticsRpcTransport {
  try {
    const protocol = new URL(rpcUrl).protocol;
    if (protocol === 'https:') {
      return 'https';
    }
    if (protocol === 'http:') {
      return 'http';
    }
  } catch {
    // The normal AegisClient path validates URLs before diagnostics are built.
    // Standalone callers still receive a safe, non-throwing diagnostic.
  }

  return 'unknown';
}

function sanitizeRecentErrors(errors: readonly unknown[]): {
  recentErrors: SafeDiagnosticError[];
  latestNetworkFailure?: NetworkFailureDiagnostic;
} {
  const recentErrors: SafeDiagnosticError[] = [];
  let latestNetworkFailure: NetworkFailureDiagnostic | undefined;

  for (const error of errors.slice(-MAX_RECENT_ERRORS)) {
    if (error instanceof NetworkFailure) {
      const diagnostic = buildNetworkFailureDiagnostic(error);
      latestNetworkFailure = diagnostic;
      recentErrors.push({
        category: 'network',
        code: diagnostic.code,
        message: diagnostic.message,
        retryable: diagnostic.retryable,
        action: diagnostic.action,
        ...(diagnostic.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: diagnostic.retryAfterSeconds }
          : {}),
      });
      continue;
    }

    if (error instanceof ConfigValidationError) {
      recentErrors.push({
        category: 'configuration',
        code: error.code,
        message: SAFE_CONFIG_MESSAGES[error.code],
      });
      continue;
    }

    recentErrors.push({
      category: 'unknown',
      code: 'UNKNOWN',
      message: UNKNOWN_ERROR_MESSAGE,
    });
  }

  return {
    recentErrors,
    ...(latestNetworkFailure ? { latestNetworkFailure } : {}),
  };
}
