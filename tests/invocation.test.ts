import {
  Account,
  Keypair,
  Networks,
  Transaction,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { SorobanInvocation } from '../src/soroban/invocation';
import { ComplianceModule } from '../src/compliance';
import type { AegisClient } from '../src/client';
import { parseSorobanResult } from '../src/utils/xdr-parser';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Api: {
        ...original.rpc.Api,
        isSimulationSuccess: jest.fn(),
      },
    },
  };
});

describe('SorobanInvocation', () => {
  const signer = Keypair.random();
  const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  function makeHarness(withSigner = true) {
    const rpcServer = {
      simulateTransaction: jest.fn(),
      getAccount: jest.fn(),
      prepareTransaction: jest.fn(),
      sendTransaction: jest.fn(),
    };

    const client = {
      rpcServer: rpcServer as unknown as rpc.Server,
      contractId,
      networkPassphrase: Networks.TESTNET,
      keypair: withSigner ? signer : undefined,
      requireSigner: () => {
        if (!withSigner) {
          throw new Error('Transaction signing requires a Keypair');
        }
        return signer;
      },
      runNetworkOperation: async <T>(operation: () => Promise<T>): Promise<T> =>
        operation(),
    };

    return { invocation: new SorobanInvocation(client), rpcServer };
  }

  it('builds a real Transaction for read simulation and maps the retval', async () => {
    const { invocation, rpcServer } = makeHarness(false);
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);
    rpcServer.simulateTransaction.mockResolvedValueOnce({
      result: { retval: 'encoded-value' },
    });

    const call = invocation.createCall(
      'is_whitelisted',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
    );
    const result = await invocation.read(
      call,
      (retval) => String(retval),
      'is_whitelisted',
    );

    expect(result).toBe('encoded-value');
    expect(rpcServer.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(rpcServer.simulateTransaction.mock.calls[0][0]).toBeInstanceOf(
      Transaction,
    );
  });

  it('decodes parsed ScVal results from successful read simulations', async () => {
    const { invocation, rpcServer } = makeHarness(false);
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);
    rpcServer.simulateTransaction.mockResolvedValueOnce({
      result: { retval: nativeToScVal(true) },
    });

    const call = invocation.createCall('is_whitelisted');
    const result = await invocation.read(
      call,
      (retval) => parseSorobanResult(retval as xdr.ScVal) as boolean,
      'is_whitelisted',
    );

    expect(result).toBe(true);
  });

  it('decodes a real ScVal retval in a migrated compliance read', async () => {
    const { invocation, rpcServer } = makeHarness(false);
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);
    rpcServer.simulateTransaction.mockResolvedValueOnce({
      result: { retval: nativeToScVal(true) },
    });

    const module = new ComplianceModule({
      invocation,
    } as unknown as AegisClient);

    await expect(module.checkWhitelist(signer.publicKey())).resolves.toBe(true);
  });

  it('returns a typed simulation failure instead of a false business result', async () => {
    const { invocation, rpcServer } = makeHarness(false);
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(false);
    rpcServer.simulateTransaction.mockResolvedValueOnce({ result: undefined });

    const call = invocation.createCall('is_whitelisted');

    await expect(
      invocation.read(call, (retval) => retval, 'is_whitelisted'),
    ).rejects.toMatchObject({
      code: 'SIMULATION_FAILED',
      operation: 'is_whitelisted',
    });
  });

  it('enforces signer presence with a stable invocation error', async () => {
    const { invocation } = makeHarness(false);
    const call = invocation.createCall('transfer');

    await expect(invocation.write(call, 'transfer')).rejects.toMatchObject({
      code: 'SIGNER_REQUIRED',
      operation: 'transfer',
    });
  });

  it('fetches live signer state, prepares, signs, and submits writes', async () => {
    const { invocation, rpcServer } = makeHarness(true);
    rpcServer.getAccount.mockResolvedValueOnce(
      new Account(signer.publicKey(), '42'),
    );
    rpcServer.prepareTransaction.mockImplementationOnce(async (tx) => tx);
    rpcServer.sendTransaction.mockResolvedValueOnce({
      hash: 'abc123',
      status: 'PENDING',
    });

    const call = invocation.createCall('mint_asset');
    const result = await invocation.write(call, 'mint_asset');

    expect(rpcServer.getAccount).toHaveBeenCalledWith(signer.publicKey());
    expect(rpcServer.prepareTransaction).toHaveBeenCalledTimes(1);
    expect(rpcServer.sendTransaction).toHaveBeenCalledTimes(1);
    expect(rpcServer.sendTransaction.mock.calls[0][0]).toBeInstanceOf(
      Transaction,
    );
    expect(result).toEqual({ hash: 'abc123', status: 'PENDING' });
  });

  it('maps malformed decoders and rejected submissions to typed errors', async () => {
    const readHarness = makeHarness(false);
    (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);
    readHarness.rpcServer.simulateTransaction.mockResolvedValueOnce({
      result: { retval: 'bad-value' },
    });

    const readCall = readHarness.invocation.createCall('balance');
    await expect(
      readHarness.invocation.read(
        readCall,
        () => {
          throw new Error('decode failed');
        },
        'balance',
      ),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });

    const writeHarness = makeHarness(true);
    writeHarness.rpcServer.getAccount.mockResolvedValueOnce(
      new Account(signer.publicKey(), '42'),
    );
    writeHarness.rpcServer.prepareTransaction.mockImplementationOnce(
      async (tx) => tx,
    );
    writeHarness.rpcServer.sendTransaction.mockResolvedValueOnce({
      hash: '',
      status: 'ERROR',
    });

    const writeCall = writeHarness.invocation.createCall('transfer');
    await expect(
      writeHarness.invocation.write(writeCall, 'transfer'),
    ).rejects.toMatchObject({
      code: 'SUBMISSION_FAILED',
      operation: 'transfer',
    });
  });
});
