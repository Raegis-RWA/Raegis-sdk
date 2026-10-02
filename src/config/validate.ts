import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { AEGIS_ENVIRONMENTS, AegisEnvironmentName } from './environments';
import { ConfigValidationError } from '../errors/config';
import { redactRpcUrl } from '../security/redaction';

/**
 * Configuration accepted by `AegisClient`.
 *
 * Provide either:
 *  - `environment`: a named preset (`testnet` | `local` | `mainnet`), optionally
 *    overriding `rpcUrl` and/or `networkPassphrase`, or
 *  - explicit `rpcUrl` and `networkPassphrase` values (legacy/fully custom setups).
 */
export interface AegisClientConfig {
  contractId: string;
  keypair?: Keypair;
  environment?: AegisEnvironmentName;
  rpcUrl?: string;
  networkPassphrase?: string;
  /** Required to opt into the `mainnet` preset while it is marked unavailable. */
  allowMainnet?: boolean;
}

export interface ResolvedAegisConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  keypair?: Keypair;
}

/**
 * Validates an RPC URL. Error messages never echo the raw URL — credentials and
 * API keys commonly live in the userinfo, path, or query string.
 */
export function validateRpcUrl(
  rpcUrl: string,
  opts: { allowInsecure: boolean },
): void {
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new ConfigValidationError(
      `Invalid rpcUrl: "${redactRpcUrl(rpcUrl)}" is not a valid URL.`,
      'INVALID_RPC_URL',
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigValidationError(
      `Invalid rpcUrl: unsupported protocol "${parsed.protocol}" in "${redactRpcUrl(rpcUrl)}".`,
      'INVALID_RPC_URL',
    );
  }

  if (parsed.protocol === 'http:' && !opts.allowInsecure) {
    throw new ConfigValidationError(
      `Insecure rpcUrl "${redactRpcUrl(rpcUrl)}" is not allowed for this environment. ` +
        'Use an https:// endpoint, or the "local" environment preset for plain http.',
      'INVALID_RPC_URL',
    );
  }
}

/**
 * Validates a network passphrase. The raw value is never echoed in the error.
 */
export function validateNetworkPassphrase(networkPassphrase: string): void {
  if (
    typeof networkPassphrase !== 'string' ||
    networkPassphrase.trim().length === 0
  ) {
    throw new ConfigValidationError(
      'Invalid networkPassphrase: must be a non-empty string.',
      'INVALID_NETWORK_PASSPHRASE',
    );
  }
}

/**
 * Validates a StrKey-encoded Soroban contract ID.
 *
 * Whitespace and placeholder values like `"C..."` are rejected. The raw input
 * is never echoed so support logs stay free of deployment identifiers that
 * were never meant to be public.
 */
export function validateContractId(contractId: string): void {
  if (typeof contractId !== 'string' || contractId.trim().length === 0) {
    throw new ConfigValidationError(
      'AegisClientConfig.contractId is required.',
      'MISSING_CONFIG',
    );
  }

  if (!StrKey.isValidContract(contractId.trim())) {
    throw new ConfigValidationError(
      'Invalid contractId: expected a StrKey-encoded Soroban contract ID.',
      'INVALID_CONTRACT_ID',
    );
  }
}

/**
 * Resolves and validates an `AegisClientConfig` into concrete rpcUrl/networkPassphrase
 * values, merging in an environment preset when one is specified.
 */
export function resolveClientConfig(config: AegisClientConfig): ResolvedAegisConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError(
      'AegisClientConfig is required.',
      'MISSING_CONFIG',
    );
  }

  validateContractId(config.contractId);

  let rpcUrl: string;
  let networkPassphrase: string;

  if (config.environment) {
    const preset = AEGIS_ENVIRONMENTS[config.environment];
    if (!preset) {
      throw new ConfigValidationError(
        'Unknown environment. Valid options: testnet, local, mainnet.',
        'MISSING_CONFIG',
      );
    }

    // Strict equality — truthy strings like "yes" must not silently unlock mainnet.
    if (!preset.available && config.allowMainnet !== true) {
      throw new ConfigValidationError(
        `The "${preset.name}" environment is not yet available (${preset.description}). ` +
          'Pass `allowMainnet: true` to opt in explicitly once you understand the risks.',
        'ENVIRONMENT_UNAVAILABLE',
      );
    }

    const allowInsecure = config.environment === 'local';

    if (config.rpcUrl) {
      validateRpcUrl(config.rpcUrl, { allowInsecure });
    }
    if (config.networkPassphrase) {
      validateNetworkPassphrase(config.networkPassphrase);
    }

    rpcUrl = config.rpcUrl ?? preset.rpcUrl;
    networkPassphrase = config.networkPassphrase ?? preset.networkPassphrase;
  } else {
    if (!config.rpcUrl || !config.networkPassphrase) {
      throw new ConfigValidationError(
        'AegisClientConfig requires either an "environment" preset (testnet/local/mainnet) ' +
          'or explicit "rpcUrl" and "networkPassphrase" values.',
        'MISSING_CONFIG',
      );
    }

    validateRpcUrl(config.rpcUrl, { allowInsecure: true });
    validateNetworkPassphrase(config.networkPassphrase);

    rpcUrl = config.rpcUrl;
    networkPassphrase = config.networkPassphrase;
  }

  return {
    rpcUrl,
    networkPassphrase,
    contractId: config.contractId.trim(),
    keypair: config.keypair,
  };
}
