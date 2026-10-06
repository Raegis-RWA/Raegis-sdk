import { StrKey } from '@stellar/stellar-sdk';
import { ConfigValidationError } from '../errors/config';
import { AegisEnvironmentName } from './environments';

/**
 * Environment-scoped named contract IDs.
 *
 * Registry lookup is intentionally tied to a named SDK environment so a
 * testnet contract cannot be selected accidentally while using a different
 * network preset.
 */
export type AegisContractRegistry = Readonly<
  Partial<Record<AegisEnvironmentName, Readonly<Record<string, string>>>>
>;

/**
 * Validates a Stellar contract StrKey and returns it unchanged.
 */
export function validateContractId(contractId: string): string {
  if (typeof contractId !== 'string' || !StrKey.isValidContract(contractId)) {
    throw new ConfigValidationError(
      'Invalid contractId: expected a valid Stellar contract StrKey (C...).',
      'INVALID_CONTRACT_ID'
    );
  }

  return contractId;
}

/**
 * Validates every entry in a registry while preserving the caller's object.
 * This helper is optional, but useful when a registry is declared once and
 * reused by multiple clients.
 */
export function defineContractRegistry(
  registry: AegisContractRegistry
): AegisContractRegistry {
  for (const contracts of Object.values(registry)) {
    if (!contracts) continue;

    for (const [name, contractId] of Object.entries(contracts)) {
      if (name.trim().length === 0) {
        throw new ConfigValidationError(
          'Contract registry names must be non-empty strings.',
          'MISSING_CONFIG'
        );
      }
      validateContractId(contractId);
    }
  }

  return registry;
}

/**
 * Resolves one named contract from the registry for the selected environment.
 */
export function resolveRegisteredContractId(
  registry: AegisContractRegistry,
  environment: AegisEnvironmentName,
  contractName: string
): string {
  defineContractRegistry(registry);

  const normalizedName = typeof contractName === 'string' ? contractName.trim() : '';
  if (!normalizedName) {
    throw new ConfigValidationError(
      'contractName is required when contractRegistry is used.',
      'MISSING_CONFIG'
    );
  }

  const contractId = registry[environment]?.[normalizedName];
  if (!contractId) {
    throw new ConfigValidationError(
      `No contract named "${normalizedName}" is registered for environment "${environment}".`,
      'MISSING_CONFIG'
    );
  }

  return validateContractId(contractId);
}
