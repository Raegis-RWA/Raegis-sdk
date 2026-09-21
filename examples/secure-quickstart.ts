import { Keypair } from '@stellar/stellar-sdk';
import { createAdminClient, createReadOnlyClient } from '@aegis/sdk';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalRpcUrl(): string | undefined {
  const value = process.env.RAEGIS_RPC_URL?.trim();
  return value || undefined;
}

/**
 * Read-only compliance lookup. No signer secret is read or required.
 */
export async function readComplianceStatus(address: string): Promise<boolean> {
  const reader = createReadOnlyClient({
    environment: 'testnet',
    contractId: requiredEnv('RAEGIS_CONTRACT_ID'),
    rpcUrl: optionalRpcUrl(),
  });

  return reader.compliance.checkWhitelist(address);
}

/**
 * Example privileged operation. Keep this function in trusted server-side code.
 * The secret is loaded only when a signer-required action is invoked.
 */
export async function mintAsAdmin(
  recipient: string,
  amount: number,
): Promise<unknown> {
  const admin = createAdminClient({
    environment: 'testnet',
    contractId: requiredEnv('RAEGIS_CONTRACT_ID'),
    rpcUrl: optionalRpcUrl(),
    keypair: Keypair.fromSecret(requiredEnv('RAEGIS_ADMIN_SECRET')),
  });

  admin.assertAdminAccess();
  return admin.asset.mint(recipient, amount);
}
