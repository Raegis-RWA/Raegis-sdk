import { Account, BASE_FEE, Keypair, Networks, rpc, scValToNative, SorobanDataBuilder, Transaction, xdr } from '@stellar/stellar-sdk';
import { AegisClient } from '../src/client';
import { mapComplianceReadiness } from '../src/compliance';
import { ComplianceProtocolStatus } from '../src/types/compliance-readiness';

describe('compliance readiness', () => {
  const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
  const makeClient = () =>
    new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId,
    });

  const simulation = (whitelisted: boolean): rpc.Api.SimulateTransactionSuccessResponse => ({
    id: 'readiness',
    latestLedger: 1,
    events: [],
    _parsed: true,
    transactionData: new SorobanDataBuilder(),
    minResourceFee: '0',
    cost: { cpuInsns: '0', memBytes: '0' },
    result: { auth: [], retval: xdr.ScVal.scvBool(whitelisted) },
  });

  test.each<[ComplianceProtocolStatus, string, boolean, string]>([
    [true, 'approved', true, 'APPROVED'],
    [false, 'blocked', false, 'NOT_WHITELISTED'],
    ['revoked', 'revoked', false, 'REVOKED'],
    ['pending', 'pending', false, 'PENDING_REVIEW'],
    ['unknown', 'unknown', false, 'STATUS_UNKNOWN'],
    ['unavailable', 'unavailable', false, 'STATUS_UNAVAILABLE'],
  ])('maps %p to %s readiness', (status, state, eligible, code) => {
    const result = mapComplianceReadiness('GTEST', status, '2026-10-08T00:00:00.000Z');
    expect(result.state).toBe(state);
    expect(result.eligible).toBe(eligible);
    expect(result.code).toBe(code);
  });

  it('returns approved after a successful whitelist read', async () => {
    const client = makeClient();
    jest.spyOn(client, 'runNetworkOperation').mockResolvedValue(simulation(true));
    const result = await client.compliance.checkReadiness(Keypair.random().publicKey());
    expect(result.state).toBe('approved');
    expect(result.eligible).toBe(true);
    expect(result.verified).toBe(true);
  });

  it('returns blocked after a successful negative whitelist read', async () => {
    const client = makeClient();
    jest.spyOn(client, 'runNetworkOperation').mockResolvedValue(simulation(false));
    const result = await client.compliance.checkReadiness(Keypair.random().publicKey());
    expect(result.state).toBe('blocked');
    expect(result.code).toBe('NOT_WHITELISTED');
    expect(result.verified).toBe(true);
  });

  test.each([false, true])('builds a serialisable unsigned read with configured source %p', async (withSigner) => {
    const address = Keypair.random().publicKey();
    const keypair = Keypair.random();
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId,
      ...(withSigner ? { keypair } : {}),
    });
    const source = withSigner ? keypair.publicKey() : address;
    const getAccount = jest.spyOn(client.rpcServer, 'getAccount')
      .mockResolvedValue(new Account(source, '42'));
    const submit = jest.spyOn(client.rpcServer, 'sendTransaction');
    jest.spyOn(client.rpcServer, 'simulateTransaction').mockImplementation(async (transaction) => {
      expect(transaction).toBeInstanceOf(Transaction);
      const read = transaction as Transaction;
      expect(read.source).toBe(source);
      expect(read.sequence).toBe('43');
      expect(read.fee).toBe(BASE_FEE);
      expect(read.networkPassphrase).toBe(Networks.TESTNET);
      expect(read.signatures).toHaveLength(0);
      expect(read.operations).toHaveLength(1);
      const operation = read.operations[0];
      expect(operation.type).toBe('invokeHostFunction');
      if (operation.type !== 'invokeHostFunction') throw new Error('Expected contract read');
      const invocation = operation.func.invokeContract();
      expect(invocation.functionName().toString()).toBe('is_whitelisted');
      expect(scValToNative(invocation.args()[0])).toBe(address);
      // Exercise the actual serialization that rpc.Server.simulateTransaction requires.
      expect(read.toXDR()).toEqual(expect.any(String));
      return simulation(true);
    });
    expect((await client.compliance.checkReadiness(address)).state).toBe('approved');
    expect(getAccount).toHaveBeenCalledWith(source);
    expect(submit).not.toHaveBeenCalled();
  });

  test.each([true, false])('decodes the legacy parsed whitelist boolean %p', async (whitelisted) => {
    const client = makeClient();
    jest.spyOn(client, 'runNetworkOperation').mockResolvedValue(simulation(whitelisted));
    expect(await client.compliance.checkWhitelist(Keypair.random().publicKey())).toBe(whitelisted);
  });

  it('returns unavailable when the compliance read fails', async () => {
    const client = makeClient();
    jest.spyOn(client, 'runNetworkOperation').mockRejectedValue(new Error('RPC unavailable'));
    const result = await client.compliance.checkReadiness(Keypair.random().publicKey());
    expect(result.state).toBe('unavailable');
    expect(result.code).toBe('STATUS_UNAVAILABLE');
    expect(result.verified).toBe(false);
    expect(result.reason).not.toContain('RPC unavailable');
  });

  it('distinguishes unsuccessful simulation from a negative whitelist result', async () => {
    const client = makeClient();
    jest.spyOn(client, 'runNetworkOperation').mockResolvedValue({
      id: 'readiness',
      latestLedger: 1,
      events: [],
      _parsed: true,
      error: 'simulation unavailable',
    });
    const address = Keypair.random().publicKey();
    const result = await client.compliance.checkReadiness(address);
    expect(result.state).toBe('unavailable');
    expect(result.verified).toBe(false);
    expect(await client.compliance.checkWhitelist(address)).toBe(false);
  });

  it('returns unavailable when simulation succeeds without an invocation result', async () => {
    const client = makeClient();
    const response = simulation(false);
    delete response.result;
    jest.spyOn(client, 'runNetworkOperation').mockResolvedValue(response);
    const result = await client.compliance.checkReadiness(Keypair.random().publicKey());
    expect(result.state).toBe('unavailable');
    expect(result.verified).toBe(false);
  });

  it('does not approve an address when ledger restoration is still required', async () => {
    const client = makeClient();
    jest.spyOn(client, 'runNetworkOperation').mockResolvedValue({
      ...simulation(true),
      restorePreamble: { minResourceFee: '0', transactionData: new SorobanDataBuilder() },
    });
    const address = Keypair.random().publicKey();
    const result = await client.compliance.checkReadiness(address);
    expect(result.state).toBe('unavailable');
    expect(result.eligible).toBe(false);
    expect(result.verified).toBe(false);
    expect(await client.compliance.checkWhitelist(address)).toBe(false);
  });

  it('reports unknown for a successful read returning a non-boolean value', async () => {
    const client = makeClient();
    const response = simulation(false);
    response.result!.retval = xdr.ScVal.scvString('unexpected');
    jest.spyOn(client, 'runNetworkOperation').mockResolvedValue(response);
    const result = await client.compliance.checkReadiness(Keypair.random().publicKey());
    expect(result.state).toBe('unknown');
    expect(result.eligible).toBe(false);
    expect(result.verified).toBe(true);
  });

  it('rejects an invalid address without performing a compliance read', async () => {
    const client = makeClient();
    const spy = jest.spyOn(client, 'runNetworkOperation');
    const result = await client.compliance.checkReadiness('not-a-stellar-address');
    expect(result.state).toBe('unknown');
    expect(result.code).toBe('INVALID_ADDRESS');
    expect(spy).not.toHaveBeenCalled();
  });
});

