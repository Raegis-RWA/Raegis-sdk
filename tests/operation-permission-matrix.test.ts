import { Keypair, Networks } from '@stellar/stellar-sdk';
import { createInvestorClient } from '../src/client-factory';

describe('operation permission matrix boundary', () => {
  it('keeps the investor typed surface narrower than the raw AegisClient escape hatch', () => {
    const investor = createInvestorClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      keypair: Keypair.random(),
    });

    expect(investor.capabilities.canMint).toBe(false);
    expect((investor.asset as { mint?: unknown }).mint).toBeUndefined();

    // The raw client is intentionally exposed for advanced/custom setups. This
    // proves the documented matrix is a typed guardrail, not an authorization
    // sandbox: contract authorization must still decide whether mint can succeed.
    expect(typeof investor.client.asset.mint).toBe('function');
  });
});
