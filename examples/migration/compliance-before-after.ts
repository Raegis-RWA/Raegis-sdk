/**
 * Migration Example: Compliance / KYC Whitelist Check
 *
 * Shows the equivalent raw Soroban call vs Aegis SDK usage.
 */
import {
  rpc,
  Contract,
  nativeToScVal,
  xdr,
  scValToNative,
  Account,
  TransactionBuilder,
  Keypair,
} from '@stellar/stellar-sdk';
import { AegisClient } from '@aegis/sdk';

// ============================================================
// BEFORE: Raw Soroban Contract Calls
// ============================================================

async function checkWhitelistRaw(
  rpcServer: rpc.Server,
  contractId: string,
  networkPassphrase: string,
  address: string
): Promise<boolean> {
  const contract = new Contract(contractId);
  const call = contract.call(
    'is_whitelisted',
    nativeToScVal(address, { type: 'address' })
  );

  try {
    // simulateTransaction takes a built Transaction, not a bare operation.
    // Simulation never signs or submits, so a real account isn't required —
    // any structurally valid source account works, e.g. a throwaway keypair.
    const sourceAccount = new Account(Keypair.random().publicKey(), '0');
    const tx = new TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(call)
      .setTimeout(30)
      .build();

    const result = await rpcServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(result) && result.result) {
      const parsed = scValToNative(
        xdr.ScVal.fromXDR(result.result.retval, 'base64')
      );
      return parsed as boolean;
    }

    return false;
  } catch (error) {
    console.error('RPC Simulation failed:', error);
    throw error;
  }
}

// ============================================================
// AFTER: Aegis SDK
// ============================================================

async function checkWhitelistSDK(client: AegisClient, address: string): Promise<boolean> {
  return client.compliance.checkWhitelist(address);
}

// ============================================================
// Usage
// ============================================================

async function main() {
  const client = new AegisClient({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'C_YOUR_CONTRACT_ID',
  });

  const userAddress = 'G_USER_PUBLIC_KEY_HERE';

  // SDK approach — clean, typed, no XDR handling
  const isWhitelisted = await checkWhitelistSDK(client, userAddress);
  console.log(`User ${userAddress} whitelisted: ${isWhitelisted}`);
}

main().catch(console.error);
