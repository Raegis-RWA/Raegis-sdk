import { Keypair, Networks } from '@stellar/stellar-sdk';
import { AegisClient } from '../src/client';

const MOCK_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('AegisClient Configuration', () => {
  it('should initialize correctly with valid parameters', () => {
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org:443',
      networkPassphrase: Networks.TESTNET,
      contractId: MOCK_CONTRACT_ID,
    });

    expect(client.rpcServer).toBeDefined();
    expect(client.contractId).toBe(MOCK_CONTRACT_ID);
    expect(client.compliance).toBeDefined();
    expect(client.asset).toBeDefined();
    expect(client.events).toBeDefined();
  });

  it('should throw an error when attempting a write operation without a keypair', () => {
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org:443',
      networkPassphrase: Networks.TESTNET,
      contractId: MOCK_CONTRACT_ID,
    });

    expect(() => {
      client.requireSigner();
    }).toThrow("Transaction signing requires a Keypair");
  });

  it('exposes a redacted configuration diagnostic', () => {
    const keypair = Keypair.random();
    const client = new AegisClient({
      environment: 'testnet',
      contractId: MOCK_CONTRACT_ID,
      keypair,
    });

    const diagnostic = client.diagnoseConfiguration();
    expect(diagnostic.ready).toBe(true);
    expect(diagnostic.signer).toEqual({ present: true, type: 'keypair' });
    expect(JSON.stringify(diagnostic)).not.toContain(keypair.secret());
  });
});
