import { Keypair, Networks } from '@stellar/stellar-sdk';
import {
  createAdminClient,
  createInvestorClient,
  createReadOnlyClient,
} from '../src/client-factory';
import { AegisClient } from '../src/client';
import { RoleCapabilityError } from '../src/errors/client-factory';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: jest.fn(),
        sendTransaction: jest.fn(),
      })),
    },
  };
});

const BASE_CONFIG = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
};

describe('admin signer boundary', () => {
  it('returns a typed SIGNER_REQUIRED error for an unkeyed direct client', () => {
    const client = new AegisClient(BASE_CONFIG);

    try {
      client.requireSigner();
      throw new Error('expected requireSigner to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RoleCapabilityError);
      expect(error).toMatchObject({
        name: 'RoleCapabilityError',
        code: 'SIGNER_REQUIRED',
        role: 'read-only',
        operation: 'transaction signing',
      });
    }
  });

  it('preserves the read-only factory surface without asset writes', () => {
    const client = createReadOnlyClient(BASE_CONFIG);

    expect(client.capabilities.canSign).toBe(false);
    expect(client.capabilities.canAdminister).toBe(false);
    expect((client as any).asset).toBeUndefined();
    expect((client as any).assertAdminAccess).toBeUndefined();
  });

  it('preserves admin signing capability when a keypair is configured', () => {
    const keypair = Keypair.random();
    const client = createAdminClient({ ...BASE_CONFIG, keypair });

    expect(client.capabilities.canSign).toBe(true);
    expect(client.capabilities.canAdminister).toBe(true);
    expect(client.client.requireSigner()).toBe(keypair);
    expect(() => client.assertAdminAccess()).not.toThrow();
  });

  it('does not expose the admin guard on an investor client', () => {
    const client = createInvestorClient({
      ...BASE_CONFIG,
      keypair: Keypair.random(),
    });

    expect(client.capabilities.canAdminister).toBe(false);
    expect((client as any).assertAdminAccess).toBeUndefined();
  });
});
