/**
 * Migration Example: Minting & Transferring Tokens
 *
 * Shows the equivalent raw Soroban contract call code vs Aegis SDK usage.
 */
import {
  Contract,
  nativeToScVal,
  TransactionBuilder,
  Account,
  Keypair,
  Networks,
} from '@stellar/stellar-sdk';
import { AegisClient } from '@aegis/sdk';

// ============================================================
// BEFORE: Raw Soroban — Minting Tokens
// ============================================================

async function mintTokensRaw(
  rpcServer: any,
  contractId: string,
  networkPassphrase: string,
  signer: Keypair,
  to: string,
  amount: number
): Promise<string> {
  const contract = new Contract(contractId);
  const call = contract.call(
    'mint_asset',
    nativeToScVal(signer.publicKey(), { type: 'address' }),
    nativeToScVal(to, { type: 'address' }),
    nativeToScVal(amount, { type: 'i128' })
  );

  // In production, fetch the real sequence number from the network
  const sourceAccount = new Account(signer.publicKey(), '0');

  const tx = new TransactionBuilder(sourceAccount, {
    fee: '1000',
    networkPassphrase,
  })
    .addOperation(call)
    .setTimeout(30)
    .build();

  tx.sign(signer);

  try {
    const response = await rpcServer.sendTransaction(tx);
    return response.hash;
  } catch (error) {
    throw new Error(`Mint transaction failed: ${error}`);
  }
}

// ============================================================
// BEFORE: Raw Soroban — Transferring Tokens
// ============================================================

async function transferTokensRaw(
  rpcServer: any,
  contractId: string,
  networkPassphrase: string,
  signer: Keypair,
  to: string,
  amount: number
): Promise<string> {
  const contract = new Contract(contractId);
  const call = contract.call(
    'transfer',
    nativeToScVal(signer.publicKey(), { type: 'address' }),
    nativeToScVal(to, { type: 'address' }),
    nativeToScVal(amount, { type: 'i128' })
  );

  const sourceAccount = new Account(signer.publicKey(), '0');

  const tx = new TransactionBuilder(sourceAccount, {
    fee: '1000',
    networkPassphrase,
  })
    .addOperation(call)
    .setTimeout(30)
    .build();

  tx.sign(signer);

  const response = await rpcServer.sendTransaction(tx);
  return response.hash;
}

// ============================================================
// AFTER: Aegis SDK — Mint & Transfer
// ⚠️ Privileged operation: mint/transfer require a signing keypair with
// issuer/admin authority on the deployed contract. NEVER hardcode a real
// secret key — load it from an environment variable or secret manager
// that is excluded from version control.
// ============================================================

async function mintAndTransferSDK() {
  const aegis = new AegisClient({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    contractId: 'C_YOUR_CONTRACT_ID',
    keypair: Keypair.fromSecret(process.env.AEGIS_ISSUER_SECRET!),
  });

  // Mint 1000 tokens (in base units) to a recipient
  const mintTxHash = await aegis.asset.mint('G_RECIPIENT_ADDRESS', 1000000000);
  console.log('Mint tx hash:', mintTxHash);

  // Transfer 500 tokens to another whitelisted address
  const transferTxHash = await aegis.asset.transfer('G_RECIPIENT_ADDRESS', 500000000);
  console.log('Transfer tx hash:', transferTxHash);
}

// ============================================================
// Run
// ============================================================

mintAndTransferSDK().catch(console.error);
