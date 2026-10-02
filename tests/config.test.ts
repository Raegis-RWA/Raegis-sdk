import { AegisClient } from '../src/client';
import { AEGIS_ENVIRONMENTS } from '../src/config/environments';
import { ConfigValidationError } from '../src/errors/config';
import { Networks } from '@stellar/stellar-sdk';

const mockContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('AegisClient environment presets', () => {
  it('resolves the testnet preset', () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: mockContractId,
    });

    expect(client.rpcServer).toBeDefined();
    expect(client.networkPassphrase).toBe(AEGIS_ENVIRONMENTS.testnet.networkPassphrase);
    expect(client.networkPassphrase).toBe(Networks.TESTNET);
  });

  it('resolves the local preset (plain http allowed)', () => {
    const client = new AegisClient({
      environment: 'local',
      contractId: mockContractId,
    });

    expect(client.networkPassphrase).toBe(AEGIS_ENVIRONMENTS.local.networkPassphrase);
  });

  it('rejects the mainnet preset unless allowMainnet is set', () => {
    expect(() => {
      new AegisClient({
        environment: 'mainnet',
        contractId: mockContractId,
      });
    }).toThrow(ConfigValidationError);

    try {
      new AegisClient({
        environment: 'mainnet',
        contractId: mockContractId,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).code).toBe('ENVIRONMENT_UNAVAILABLE');
    }
  });

  it('allows the mainnet preset when allowMainnet is explicitly true', () => {
    const client = new AegisClient({
      environment: 'mainnet',
      contractId: mockContractId,
      allowMainnet: true,
    });

    expect(client.networkPassphrase).toBe(Networks.PUBLIC);
  });

  it('allows overriding the rpcUrl of a preset with a valid https endpoint', () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: mockContractId,
      rpcUrl: 'https://custom-soroban-testnet.example.com',
    });

    expect(client.rpcServer).toBeDefined();
  });

  it('rejects an insecure http rpcUrl override on a non-local environment', () => {
    expect(() => {
      new AegisClient({
        environment: 'testnet',
        contractId: mockContractId,
        rpcUrl: 'http://insecure-endpoint.example.com',
      });
    }).toThrow(ConfigValidationError);
  });

  it('rejects a malformed rpcUrl override', () => {
    expect(() => {
      new AegisClient({
        environment: 'testnet',
        contractId: mockContractId,
        rpcUrl: 'not-a-url',
      });
    }).toThrow(ConfigValidationError);

    try {
      new AegisClient({
        environment: 'testnet',
        contractId: mockContractId,
        rpcUrl: 'not-a-url-with-secret-token',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).code).toBe('INVALID_RPC_URL');
      expect((error as Error).message).not.toContain('secret-token');
    }
  });

  it('rejects an empty networkPassphrase override', () => {
    expect(() => {
      new AegisClient({
        environment: 'testnet',
        contractId: mockContractId,
        networkPassphrase: '   ',
      });
    }).toThrow(ConfigValidationError);
  });

  it('rejects an unknown environment name at runtime', () => {
    expect(() => {
      new AegisClient({
        // @ts-expect-error intentionally invalid for runtime validation coverage
        environment: 'devnet',
        contractId: mockContractId,
      });
    }).toThrow(ConfigValidationError);
  });
});

describe('AegisClient explicit (legacy) configuration', () => {
  it('still supports fully explicit rpcUrl/networkPassphrase configuration', () => {
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org:443',
      networkPassphrase: Networks.TESTNET,
      contractId: mockContractId,
    });

    expect(client.rpcServer).toBeDefined();
    expect(client.contractId).toBe(mockContractId);
  });

  it('throws when neither environment nor rpcUrl/networkPassphrase are provided', () => {
    expect(() => {
      new AegisClient({ contractId: mockContractId });
    }).toThrow(ConfigValidationError);
  });

  it('throws when contractId is missing', () => {
    expect(() => {
      // @ts-expect-error intentionally missing required config for runtime validation coverage
      new AegisClient({ environment: 'testnet' });
    }).toThrow(ConfigValidationError);
  });

  it('throws INVALID_CONTRACT_ID for non-StrKey placeholders', () => {
    try {
      new AegisClient({
        environment: 'testnet',
        contractId: 'C_YOUR_CONTRACT_ID',
      });
      throw new Error('expected ConfigValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).code).toBe('INVALID_CONTRACT_ID');
    }
  });
});
