/**
 * Migration Example: Investor Portfolio Reads
 *
 * Shows the equivalent raw Soroban multi-call pattern vs Aegis SDK's
 * consolidated getPortfolio() method.
 */
import {
  rpc,
  Contract,
  nativeToScVal,
  xdr,
  scValToNative,
  Networks,
  Account,
  TransactionBuilder,
  Keypair,
} from '@stellar/stellar-sdk';
import { AegisClient } from '@aegis/sdk';
import type { InvestorPortfolio, PortfolioStatus } from '@aegis/sdk';

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
// BEFORE: Raw Soroban — Manual Portfolio Assembly
// ============================================================

async function getPortfolioRaw(
  rpcServer: rpc.Server,
  contractId: string,
  networkPassphrase: string,
  investorAddress: string
) {
  const contract = new Contract(contractId);

  // Step 1: Check KYC status
  const whitelistCall = contract.call(
    'is_whitelisted',
    nativeToScVal(investorAddress, { type: 'address' })
  );
  // simulateTransaction takes a built Transaction, not a bare operation.
  const whitelistTx = buildSimulationTx(networkPassphrase, whitelistCall);
  const whitelistResult = await rpcServer.simulateTransaction(whitelistTx);
  const isKycApproved =
    rpc.Api.isSimulationSuccess(whitelistResult) && whitelistResult.result
      ? scValToNative(
          xdr.ScVal.fromXDR(whitelistResult.result.retval, 'base64')
        )
      : false;

  // Step 2: Query token balance
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

  // Step 3: Manually compute portfolio status
  let status: string;
  if (!isKycApproved) {
    status = 'blocked';
  } else if (balance === 0) {
    status = 'empty';
  } else {
    status = 'active';
  }

  return {
    investorAddress,
    isKycApproved,
    balance: String(balance),
    status,
  };
}

// ============================================================
// AFTER: Aegis SDK — Single getPortfolio() Call
// ============================================================

async function getPortfolioSDK(
  client: AegisClient,
  investorAddress: string
): Promise<InvestorPortfolio> {
  return client.investor.getPortfolio(investorAddress);
}

// ============================================================
// Usage
// ============================================================

async function main() {
  const client = new AegisClient({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    contractId: 'C_YOUR_CONTRACT_ID',
  });

  const investorAddress = 'G_INVESTOR_PUBLIC_KEY';

  const portfolio = await getPortfolioSDK(client, investorAddress);

  // Check portfolio status with type safety
  switch (portfolio.status) {
    case 'active':
      console.log(
        `Portfolio has ${portfolio.holdings.length} asset(s), ` +
        `${portfolio.compliantHoldingsCount} compliant.`
      );
      for (const holding of portfolio.holdings) {
        console.log(
          `  ${holding.metadata.name}: ` +
          `${holding.formattedBalance} | ` +
          `Transfer eligible: ${holding.transferEligibility.isEligible}`
        );
      }
      break;

    case 'empty':
      console.log('Investor is KYC approved but has no token holdings.');
      break;

    case 'blocked':
      console.log('Investor is not KYC approved. Transfers disabled.');
      break;

    case 'unavailable':
      console.warn(`Portfolio data unavailable: ${portfolio.error}`);
      break;
  }
}

// ============================================================
// Multi-asset Portfolio Query
// ============================================================

async function queryMultiAsset() {
  const client = new AegisClient({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    contractId: 'C_PRIMARY_CONTRACT_ID',
  });

  const portfolio = await client.investor.getPortfolio('G_INVESTOR', {
    includeMetadata: true,
    assetContractIds: [
      'C_CONTRACT_ID_1',
      'C_CONTRACT_ID_2',
      'C_CONTRACT_ID_3',
    ],
  });

  console.log(`Total holdings: ${portfolio.totalHoldingsCount}`);
  for (const h of portfolio.holdings) {
    console.log(`  [${h.metadata.symbol}] ${h.formattedBalance}`);
  }
}

main().catch(console.error);
queryMultiAsset().catch(console.error);
