import { Account, Keypair, Networks } from '@stellar/stellar-sdk';
import {
  ComplianceBatchError,
  ComplianceModule,
} from '../src/compliance';

function makeHarness() {
  const signer = Keypair.random();
  const rpcServer = {
    getAccount: jest.fn(),
    prepareTransaction: jest.fn(),
    sendTransaction: jest.fn(),
  };
  const client = {
    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    networkPassphrase: Networks.TESTNET,
    rpcServer,
    requireSigner: () => signer,
    runNetworkOperation: (operation: () => Promise<unknown>) => operation(),
  } as any;

  return {
    module: new ComplianceModule(client),
    rpcServer,
    signer,
    client,
  };
}

describe('ComplianceModule batch compliance operations', () => {
  it('rejects duplicate addresses before any RPC work', async () => {
    const { module, rpcServer } = makeHarness();
    const user = Keypair.random().publicKey();

    await expect(
      module.batchSetComplianceStatus([
        { user, newStatus: 'Approved' },
        { user, newStatus: 'Revoked' },
      ]),
    ).rejects.toMatchObject<Partial<ComplianceBatchError>>({
      name: 'ComplianceBatchError',
      code: 'DUPLICATE_ADDRESS',
      index: 1,
      user,
    });

    expect(rpcServer.getAccount).not.toHaveBeenCalled();
    expect(rpcServer.prepareTransaction).not.toHaveBeenCalled();
    expect(rpcServer.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects unsupported target states before any RPC work', async () => {
    const { module, rpcServer } = makeHarness();
    const user = Keypair.random().publicKey();

    await expect(
      module.batchSetComplianceStatus([
        { user, newStatus: 'Unknown' as any },
      ]),
    ).rejects.toMatchObject<Partial<ComplianceBatchError>>({
      name: 'ComplianceBatchError',
      code: 'INVALID_STATUS',
      index: 0,
      user,
    });

    expect(rpcServer.getAccount).not.toHaveBeenCalled();
  });

  it('rejects failed RPC submission statuses even when a hash is returned', async () => {
    const { module, rpcServer, signer } = makeHarness();
    const user = Keypair.random().publicKey();

    rpcServer.getAccount.mockResolvedValue(
      new Account(signer.publicKey(), '1'),
    );
    rpcServer.prepareTransaction.mockImplementation(
      async (transaction) => transaction,
    );
    rpcServer.sendTransaction.mockResolvedValue({
      status: 'ERROR',
      hash: 'rejected-hash',
      latestLedger: 1,
      latestLedgerCloseTime: 1,
    });

    await expect(module.batchWhitelist([user])).rejects.toThrow(
      'Batch compliance submission was not accepted: ERROR.',
    );
  });

  it('rejects malformed Stellar identities with a classified preflight error', async () => {
    const { module, rpcServer } = makeHarness();
    await expect(
      module.batchWhitelist(['not-a-Stellar-address']),
    ).rejects.toMatchObject({
      name: 'ComplianceBatchError',
      code: 'INVALID_ADDRESS',
      index: 0,
    });
    expect(rpcServer.getAccount).not.toHaveBeenCalled();
    expect(rpcServer.prepareTransaction).not.toHaveBeenCalled();
    expect(rpcServer.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects RPC source account mismatch before transaction preparation', async () => {
    const { module, rpcServer } = makeHarness();
    const user = Keypair.random().publicKey();
    rpcServer.getAccount.mockResolvedValue(
      new Account(Keypair.random().publicKey(), '1'),
    );

    await expect(module.batchWhitelist([user])).rejects.toMatchObject({
      name: 'ComplianceBatchError',
      code: 'BATCH_CONTEXT_CHANGED',
    });
    expect(rpcServer.prepareTransaction).not.toHaveBeenCalled();
    expect(rpcServer.sendTransaction).not.toHaveBeenCalled();
  });

  it('does not sign or send if signer network changes while RPC prepares', async () => {
    const { module, rpcServer, signer, client } = makeHarness();
    const user = Keypair.random().publicKey();
    rpcServer.getAccount.mockResolvedValue(
      new Account(signer.publicKey(), '1'),
    );
    rpcServer.prepareTransaction.mockImplementation(async (transaction) => {
      client.networkPassphrase = Networks.PUBLIC;
      return transaction;
    });

    await expect(module.batchWhitelist([user])).rejects.toMatchObject({
      name: 'ComplianceBatchError',
      code: 'BATCH_CONTEXT_CHANGED',
    });
    expect(rpcServer.prepareTransaction).toHaveBeenCalledTimes(1);
    expect(rpcServer.sendTransaction).not.toHaveBeenCalled();
  });

  it('maps whitelist and revocation helpers to explicit lifecycle targets', async () => {
    const { module } = makeHarness();
    const first = Keypair.random().publicKey();
    const second = Keypair.random().publicKey();
    const submit = jest
      .spyOn(module, 'batchSetComplianceStatus')
      .mockResolvedValue('tx-hash');

    await expect(module.batchWhitelist([first, second])).resolves.toBe('tx-hash');
    expect(submit).toHaveBeenLastCalledWith([
      { user: first, newStatus: 'Approved' },
      { user: second, newStatus: 'Approved' },
    ]);

    submit.mockClear();

    await expect(module.batchRevoke([first])).resolves.toBe('tx-hash');
    expect(submit).toHaveBeenLastCalledWith([
      { user: first, newStatus: 'Revoked' },
    ]);
  });
});
