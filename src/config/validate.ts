import { Keypair } from '@stellar/stellar-sdk';
import { AEGIS_ENVIRONMENTS, AegisEnvironmentName } from './environments';
import {
  AegisContractRegistry,
  resolveRegisteredContractId,
  validateContractId,
} from './contracts';
import { ConfigValidationError } from '../errors/config';

/**
 * Configuration accepted by `AegisClient`.
 *
 * Provide either:
 *  - `environment`: a named preset (`testnet` | `local` | `mainnet`), optionally
 *    overriding `rpcUrl` and/or `networkPassphrase`, or
 *  - explicit `rpcUrl` and `networkPassphrase` values (legacy/fully custom setups).
 *
 * Select the contract either with a direct `contractId`, or with
 * `contractRegistry` + `contractName` when using a named environment.
 */
export interface AegisClientConfig {
  contractId?: string;
  contractRegistry?: AegisContractRegistry;
  contractName?: string;
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

function validateRpcUrl(rpcUrl: string, opts: { allowInsecure: boolean }): void {
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new ConfigValidationError(`Invalid rpcUrl: "${rpcUrl}" is not a valid URL.`, 'INVALID_RPC_URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigValidationError(
      `Invalid rpcUrl: unsupported protocol "${parsed.protocol}" in "${rpcUrl}".`,
      'INVALID_RPC_URL'
    );
  }

  if (parsed.protocol === 'http:' && !opts.allowInsecure) {
    throw new ConfigValidationError(
      `Insecure rpcUrl "${rpcUrl}" is not allowed for this environment. Use an https:// endpoint, or the "local" environment preset for plain http.`,
      'INVALID_RPC_URL'
    );
  }
}

function validateNetworkPassphrase(networkPassphrase: string): void {
  if (typeof networkPassphrase !== 'string' || networkPassphrase.trim().length === 0) {
    throw new ConfigValidationError('Invalid networkPassphrase: must be a non-empty string.', 'INVALID_NETWORK_PASSPHRASE');
  }
}

function resolveConfiguredContractId(config: AegisClientConfig): string {
  const hasDirectContract = config.contractId !== undefined;
  const hasRegistrySelection =
    config.contractRegistry !== undefined || config.contractName !== undefined;

  if (hasDirectContract && hasRegistrySelection) {
    throw new ConfigValidationError(
      'Choose either contractId or contractRegistry + contractName, not both.',
      'MISSING_CONFIG'
    );
  }

  if (hasDirectContract) {
    return validateContractId(config.contractId as string);
  }

  if (!config.contractRegistry || config.contractName === undefined) {
    throw new ConfigValidationError(
      'AegisClientConfig requires either contractId or contractRegistry + contractName.',
      'MISSING_CONFIG'
    );
  }

  if (!config.environment) {
    throw new ConfigValidationError(
      'contractRegistry lookup requires a named environment (testnet/local/mainnet).',
      'MISSING_CONFIG'
    );
  }

  return resolveRegisteredContractId(
    config.contractRegistry,
    config.environment,
    config.contractName
  );
}

/**
 * Resolves and validates an `AegisClientConfig` into concrete rpcUrl/networkPassphrase
 * values, merging in an environment preset when one is specified.
 */
export function resolveClientConfig(config: AegisClientConfig): ResolvedAegisConfig {
  if (!config) {
    throw new ConfigValidationError('AegisClientConfig is required.', 'MISSING_CONFIG');
  }

  let rpcUrl: string;
  let networkPassphrase: string;

  if (config.environment) {
    const preset = AEGIS_ENVIRONMENTS[config.environment];
    if (!preset) {
      throw new ConfigValidationError(
        `Unknown environment "${config.environment}". Valid options: ${Object.keys(AEGIS_ENVIRONMENTS).join(', ')}.`,
        'MISSING_CONFIG'
      );
    }

    if (!preset.available && !config.allowMainnet) {
      throw new ConfigValidationError(
        `The "${preset.name}" environment is not yet available (${preset.description}). ` +
          'Pass `allowMainnet: true` to opt in explicitly once you understand the risks.',
        'ENVIRONMENT_UNAVAILABLE'
      );
    }

    const allowInsecure = config.environment === 'local';

    if (config.rpcUrl) {
      validateRpcUrl(config.rpcUrl, { allowInsecure });
    }
    if (config.networkPassphrase) {
      validateNetworkPassphrase(config.networkPassphrase);

      const usesNamedRegistry =
        config.contractId === undefined &&
        config.contractRegistry !== undefined &&
        config.contractName !== undefined;
      if (usesNamedRegistry && config.networkPassphrase !== preset.networkPassphrase) {
        throw new ConfigValidationError(
          `Invalid networkPassphrase: registry selection for environment "${config.environment}" must use that environment's preset passphrase.`,
          'INVALID_NETWORK_PASSPHRASE'
        );
      }
    }

    rpcUrl = config.rpcUrl ?? preset.rpcUrl;
    networkPassphrase = config.networkPassphrase ?? preset.networkPassphrase;
  } else {
    if (!config.rpcUrl || !config.networkPassphrase) {
      throw new ConfigValidationError(
        'AegisClientConfig requires either an "environment" preset (testnet/local/mainnet) ' +
          'or explicit "rpcUrl" and "networkPassphrase" values.',
        'MISSING_CONFIG'
      );
    }

    validateRpcUrl(config.rpcUrl, { allowInsecure: true });
    validateNetworkPassphrase(config.networkPassphrase);

    rpcUrl = config.rpcUrl;
    networkPassphrase = config.networkPassphrase;
  }

  const contractId = resolveConfiguredContractId(config);

  return {
    rpcUrl,
    networkPassphrase,
    contractId,
    keypair: config.keypair,
  };
}
