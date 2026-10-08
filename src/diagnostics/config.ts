import { AegisClientConfig, resolveClientConfig } from '../config/validate';
import { AEGIS_ENVIRONMENTS, AegisEnvironmentName } from '../config/environments';
import { ConfigErrorCode, ConfigValidationError } from '../errors/config';

/**
 * Safe, allowlisted description of an `AegisClientConfig`'s RPC endpoint.
 * Only `origin` and `pathname` are ever included — query strings and hashes
 * are the parts of a URL most likely to carry API keys or tokens, so they
 * are never read into a diagnostic, redacted or otherwise.
 */
export interface RpcUrlDiagnostic {
  present: boolean;
  origin?: string;
  path?: string;
}

export type ConfigDiagnosticsStatus = 'ok' | 'invalid';

export interface ConfigDiagnostics {
  contractId: { present: boolean };
  environment: { name: AegisEnvironmentName | 'custom' | 'unsupported' | 'unset' };
  rpcUrl: RpcUrlDiagnostic;
  networkPassphrase: { present: boolean };
  signerConfigured: boolean;
  status: ConfigDiagnosticsStatus;
  errorCode?: ConfigErrorCode;
}

/**
 * Builds a safe, allowlisted diagnostic of an `AegisClientConfig`-shaped value.
 *
 * This never throws, even for missing, malformed, or entirely bogus input —
 * invalid config is reported as `status: 'invalid'` with the validation
 * `errorCode`, not as an exception. Every field is read explicitly by name;
 * nothing from the input object is copied into the result wholesale, so a
 * field the caller adds that this function doesn't know about (a stray
 * secret, an unexpected credential) is silently absent from the report
 * rather than silently included.
 */
export function diagnoseConfig(rawConfig: unknown): ConfigDiagnostics {
  const candidate = isPlainObject(rawConfig) ? rawConfig : {};

  let resolvedRpcUrl: string | undefined;
  let resolvedNetworkPassphrase: string | undefined;
  let errorCode: ConfigErrorCode | undefined;

  try {
    const resolved = resolveClientConfig(candidate as unknown as AegisClientConfig);
    resolvedRpcUrl = resolved.rpcUrl;
    resolvedNetworkPassphrase = resolved.networkPassphrase;
  } catch (error) {
    errorCode = error instanceof ConfigValidationError ? error.code : 'MISSING_CONFIG';
  }

  const effectiveRpcUrl = resolvedRpcUrl ?? readString(candidate.rpcUrl);
  const effectiveNetworkPassphrase =
    resolvedNetworkPassphrase ?? readString(candidate.networkPassphrase);

  return Object.freeze({
    contractId: { present: isNonEmptyString(candidate.contractId) },
    environment: { name: describeEnvironment(candidate) },
    rpcUrl: describeRpcUrl(effectiveRpcUrl),
    networkPassphrase: { present: effectiveNetworkPassphrase.length > 0 },
    signerConfigured: candidate.keypair !== undefined && candidate.keypair !== null,
    status: errorCode ? 'invalid' : 'ok',
    ...(errorCode ? { errorCode } : {}),
  });
}

function describeEnvironment(
  candidate: Record<string, unknown>,
): AegisEnvironmentName | 'custom' | 'unsupported' | 'unset' {
  if (typeof candidate.environment === 'string') {
    // A named environment always takes priority over rpcUrl/networkPassphrase during
    // resolution (see `resolveClientConfig`), so an unrecognized name is reported as
    // 'unsupported' even when other fields are present — matching actual resolution
    // behavior rather than the raw (and possibly mistaken) string itself.
    return candidate.environment in AEGIS_ENVIRONMENTS
      ? (candidate.environment as AegisEnvironmentName)
      : 'unsupported';
  }
  if (isNonEmptyString(candidate.rpcUrl) || isNonEmptyString(candidate.networkPassphrase)) {
    return 'custom';
  }
  return 'unset';
}

function describeRpcUrl(rpcUrl: string): RpcUrlDiagnostic {
  if (!rpcUrl) {
    return { present: false };
  }
  try {
    const parsed = new URL(rpcUrl);
    return { present: true, origin: parsed.origin, path: parsed.pathname };
  } catch {
    // Malformed value — report presence only. The raw string is never
    // echoed back since a copy/paste mistake could put a token there.
    return { present: true };
  }
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
