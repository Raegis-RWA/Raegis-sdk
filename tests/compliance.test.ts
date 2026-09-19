import { AegisClient } from '../src/client';
import { Networks, Keypair, rpc, xdr, Transaction } from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: jest.fn(),
      })),
      Api: {
        ...original.rpc.Api,
        isSimulationSuccess: jest.fn(),
      },
    },
  };
});

describe('ComplianceModule', () => {
  let client: AegisClient;
  let mockRpcServer: any;

  const mockContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
  const mockUserAddress = Keypair.random().publicKey();

  beforeEach(() => {
    jest.clearAllMocks();

    client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: mockContractId,
    });

    mockRpcServer = client.rpcServer;
  });

  it('returns true when simulation succeeds and decodes to true', async () => {
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);
    const trueScValBase64 = xdr.ScVal.scvBool(true).toXDR('base64');
    mockRpcServer.simulateTransaction.mockResolvedValueOnce({
      result: { retval: trueScValBase64 },
    });

    await expect(client.compliance.checkWhitelist(mockUserAddress)).resolves.toBe(true);
  });

  it('returns false when simulation succeeds and decodes to false', async () => {
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);
    const falseScValBase64 = xdr.ScVal.scvBool(false).toXDR('base64');
    mockRpcServer.simulateTransaction.mockResolvedValueOnce({
      result: { retval: falseScValBase64 },
    });

    await expect(client.compliance.checkWhitelist(mockUserAddress)).resolves.toBe(false);
  });

  it('returns false, not throw, when the simulation does not succeed', async () => {
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(false);
    mockRpcServer.simulateTransaction.mockResolvedValueOnce({ result: undefined });

    await expect(client.compliance.checkWhitelist(mockUserAddress)).resolves.toBe(false);
  });

  it('re-throws when simulateTransaction itself rejects', async () => {
    mockRpcServer.simulateTransaction.mockRejectedValueOnce(new Error('RPC unreachable'));

    await expect(client.compliance.checkWhitelist(mockUserAddress)).rejects.toThrow();
  });

  /**
   * Regression test for the "incorrect RPC formatting" bug (issue #66):
   * `checkWhitelist` used to call `simulateTransaction({ transaction: call as
   * any } as any)` — a `{ transaction }` wrapper around a bare, unbuilt
   * contract-call operation. `rpc.Server.simulateTransaction` actually takes a
   * built `Transaction` directly as its first argument. Both the wrapper shape
   * and the missing transaction envelope (fee, source account, sequence
   * number, network passphrase) were wrong; assert the real shape here so this
   * can't silently regress.
   */
  it('calls simulateTransaction with a real built Transaction, not a wrapper object', async () => {
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);
    mockRpcServer.simulateTransaction.mockResolvedValueOnce({
      result: { retval: xdr.ScVal.scvBool(true).toXDR('base64') },
    });

    await client.compliance.checkWhitelist(mockUserAddress);

    expect(mockRpcServer.simulateTransaction).toHaveBeenCalledTimes(1);
    const passedArg = mockRpcServer.simulateTransaction.mock.calls[0][0];
    expect(passedArg).toBeInstanceOf(Transaction);
    expect(passedArg.networkPassphrase).toBe(Networks.TESTNET);
  });

  it('uses the configured signer as the simulation source account when one is set', async () => {
    const signer = Keypair.random();
    const signedClient = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: mockContractId,
      keypair: signer,
    });
    const signedMockRpcServer = signedClient.rpcServer as any;

    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);
    signedMockRpcServer.simulateTransaction.mockResolvedValueOnce({
      result: { retval: xdr.ScVal.scvBool(true).toXDR('base64') },
    });

    await signedClient.compliance.checkWhitelist(mockUserAddress);

    const passedArg = signedMockRpcServer.simulateTransaction.mock.calls[0][0];
    expect(passedArg.source).toBe(signer.publicKey());
  });
});
