import { AegisClient } from '../src/client';
import { Keypair, Networks } from '@stellar/stellar-sdk';

describe('AegisClient Configuration', () => {
  it('should initialize correctly with valid parameters', () => {
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org:443',
      networkPassphrase: Networks.TESTNET,
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4' // Mock Contract ID
    });

    expect(client.rpcServer).toBeDefined();
    expect(client.contractId).toBe('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4');
    expect(client.compliance).toBeDefined();
    expect(client.asset).toBeDefined();
    expect(client.events).toBeDefined();
  });

  it('should throw an error when attempting a write operation without a keypair', () => {
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org:443',
      networkPassphrase: Networks.TESTNET,
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4'
    });

    expect(() => {
      client.requireSigner();
    }).toThrow("Transaction signing requires a Keypair");
  });
});