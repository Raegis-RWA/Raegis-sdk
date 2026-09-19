/**
 * Migration Example: Error Handling Patterns
 *
 * Shows how raw Soroban error handling compares to the Aegis SDK's
 * structured error approach.
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
import { AegisClient, PortfolioError } from '@aegis/sdk';
import type { InvestorPortfolio } from '@aegis/sdk';

// Simulation never signs or submits, so a real account isn't required — any
// structurally valid source account works, e.g. a throwaway keypair.
function buildSimulationTx(networkPassphrase: string, call: any) {
  const sourceAccount = new Account(Keypair.random().publicKey(), '0');
  return new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(call)
    .setTimeout(30)
    .build();
}

// ============================================================
// BEFORE: Raw Soroban — Manual Error Handling
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
    const tx = buildSimulationTx(networkPassphrase, call);
    const result = await rpcServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(result) && result.result) {
      return scValToNative(
        xdr.ScVal.fromXDR(result.result.retval, 'base64')
      ) as boolean;
    }

    // Problem: What should we return here? false? null? throw?
    return false;
  } catch (error) {
    // Raw error — no context about which operation failed
    console.error('RPC error:', error);
    throw error;
  }
}

// ============================================================
// AFTER: Aegis SDK — Structured Error Handling
// ============================================================

async function checkWhitelistSDK(
  client: AegisClient,
  address: string
): Promise<boolean> {
  try {
    return await client.compliance.checkWhitelist(address);
  } catch (error) {
    if (error instanceof Error) {
      // Error message includes context (e.g., "RPC Simulation failed...")
      console.error('Compliance check failed:', error.message);
    }
    throw error;
  }
}

// ============================================================
// BEFORE: Raw Soroban — Portfolio Assembly Error Handling
// ============================================================

async function getPortfolioRaw(
  rpcServer: rpc.Server,
  contractId: string,
  networkPassphrase: string,
  investorAddress: string
) {
  const contract = new Contract(contractId);

  try {
    const whitelistCall = contract.call(
      'is_whitelisted',
      nativeToScVal(investorAddress, { type: 'address' })
    );
    const whitelistTx = buildSimulationTx(networkPassphrase, whitelistCall);
    const whitelistResult = await rpcServer.simulateTransaction(whitelistTx);

    const isKycApproved =
      rpc.Api.isSimulationSuccess(whitelistResult) && whitelistResult.result
        ? scValToNative(
            xdr.ScVal.fromXDR(whitelistResult.result.retval, 'base64')
          )
        : false;

    const balanceCall = contract.call(
      'balance',
      nativeToScVal(investorAddress, { type: 'address' })
    );
    const balanceTx = buildSimulationTx(networkPassphrase, balanceCall);
    const balanceResult = await rpcServer.simulateTransaction(balanceTx);

    const balance =
      rpc.Api.isSimulationSuccess(balanceResult) && balanceResult.result
        ? scValToNative(
            xdr.ScVal.fromXDR(balanceResult.result.retval, 'base64')
          )
        : 0;

    return {
      investorAddress,
      isKycApproved,
      balance: String(balance),
      status: !isKycApproved ? 'blocked' : balance === 0 ? 'empty' : 'active',
    };
  } catch (error) {
    // Problem: If one RPC call fails, the whole function crashes.
    // Caller must handle the raw error and determine what happened.
    console.error('Portfolio query failed:', error);
    throw error;
  }
}

// ============================================================
// AFTER: Aegis SDK — Resilient Portfolio Queries
// ============================================================

async function getPortfolioSDK(
  client: AegisClient,
  investorAddress: string
): Promise<InvestorPortfolio> {
  // The SDK never throws on portfolio queries.
  // It returns a safe 'unavailable' fallback if anything goes wrong.
  return client.investor.getPortfolio(investorAddress);
}

// ============================================================
// Usage: Safe UI Pattern
// ============================================================

async function main() {
  const client = new AegisClient({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'C_YOUR_CONTRACT_ID',
  });

  const investorAddress = 'G_INVESTOR_PUBLIC_KEY';

  // Safe pattern — no try/catch needed for portfolio reads
  const portfolio = await getPortfolioSDK(client, investorAddress);

  if (portfolio.status === 'unavailable') {
    console.warn(`Portfolio unavailable: ${portfolio.error}`);
    // Show offline indicator or cached fallback UI
  } else if (portfolio.status === 'blocked') {
    // Prompt KYC re-verification
    console.log('KYC approval required.');
  } else if (portfolio.status === 'active') {
    console.log(`Holdings: ${portfolio.holdings.length}`);
  } else if (portfolio.status === 'empty') {
    console.log('No holdings.');
  }

  // For write operations, catch explicitly
  try {
    const txHash = await client.asset.mint('G_RECIPIENT', 1000000000);
    console.log('Minted:', txHash);
  } catch (error) {
    console.error('Mint failed:', error);
  }
}

main().catch(console.error);
