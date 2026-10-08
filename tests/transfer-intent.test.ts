import { Buffer } from 'buffer';
import { Account, Keypair, Networks, StrKey } from '@stellar/stellar-sdk';
import { AegisClient } from '../src/client';
import { CompliantTransferIntentError } from '../src/errors/transfer-intent';

const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));
const ACCEPTED_HASH = 'a'.repeat(64);

function makeClient() {
  return new AegisClient({
    rpcUrl: 'https://soroban-testnet.stellar.org:443',
    networkPassphrase: Networks.TESTNET,
    contractId,
    keypair: Keypair.random(),
  });
}

async function expectIntentError(
  operation: Promise<unknown>,
  code: CompliantTransferIntentError['code'],
) {
  await expect(operation).rejects.toMatchObject({
    name: 'CompliantTransferIntentError',
    code,
  });
}

describe('compliant transfer intents', () => {
  it('rejects invalid recipient and amount before compliance I/O', async () => {
    const client = makeClient();
    const check = jest.spyOn(client.compliance, 'checkWhitelist');

    await expectIntentError(
      client.asset.buildTransferIntent('not-a-stellar-address', 1),
      'INVALID_RECIPIENT',
    );
    await expectIntentError(
      client.asset.buildTransferIntent(Keypair.random().publicKey(), 0),
      'INVALID_AMOUNT',
    );

    expect(check).not.toHaveBeenCalled();
  });

  it('rejects invalid contract and network configuration before compliance I/O', async () => {
    const client = makeClient();
    const check = jest.spyOn(client.compliance, 'checkWhitelist');
    const recipient = Keypair.random().publicKey();

    client.contractId = 'not-a-contract';
    await expectIntentError(
      client.asset.buildTransferIntent(recipient, 1),
      'INVALID_CONTRACT',
    );

    client.contractId = contractId;
    client.networkPassphrase = '   ';
    await expectIntentError(
      client.asset.buildTransferIntent(recipient, 1),
      'INVALID_NETWORK',
    );

    expect(check).not.toHaveBeenCalled();
  });

  it('checks the sender first and short-circuits when it is not compliant', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    const check = jest
      .spyOn(client.compliance, 'checkWhitelist')
      .mockResolvedValue(false);

    await expectIntentError(
      client.asset.buildTransferIntent(recipient, 10),
      'SENDER_NOT_COMPLIANT',
    );

    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(client.keypair!.publicKey());
  });

  it('fails closed when the recipient is non-compliant or compliance cannot be read', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    const check = jest.spyOn(client.compliance, 'checkWhitelist');

    check
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expectIntentError(
      client.asset.buildTransferIntent(recipient, 10),
      'RECIPIENT_NOT_COMPLIANT',
    );
    expect(check).toHaveBeenNthCalledWith(1, client.keypair!.publicKey());
    expect(check).toHaveBeenNthCalledWith(2, recipient);

    check.mockReset();
    check.mockRejectedValueOnce(new Error('rpc unavailable'));
    await expectIntentError(
      client.asset.buildTransferIntent(recipient, 10),
      'COMPLIANCE_CHECK_FAILED',
    );
  });

  it('rechecks compliance at explicit submission and blocks a revoked recipient', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    const check = jest
      .spyOn(client.compliance, 'checkWhitelist')
      .mockResolvedValue(true);

    const intent = await client.asset.buildTransferIntent(recipient, 25);
    expect(check).toHaveBeenCalledTimes(2);

    check.mockReset();
    check
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const send = jest.spyOn(client.rpcServer, 'sendTransaction');

    await expectIntentError(
      client.asset.submitTransferIntent(intent),
      'RECIPIENT_NOT_COMPLIANT',
    );

    expect(check).toHaveBeenCalledTimes(2);
    expect(check).toHaveBeenNthCalledWith(1, client.keypair!.publicKey());
    expect(check).toHaveBeenNthCalledWith(2, recipient);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an already-checked intent after signer, contract, or network drift', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest
      .spyOn(client.compliance, 'checkWhitelist')
      .mockResolvedValue(true);

    const intent = await client.asset.buildTransferIntent(recipient, 25);
    const send = jest.spyOn(client.rpcServer, 'sendTransaction');

    client.networkPassphrase = Networks.PUBLIC;
    await expectIntentError(
      client.asset.submitTransferIntent(intent),
      'INTENT_CONFIG_MISMATCH',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('legacy transfer delegates through compliant preflight and submits once', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    const check = jest
      .spyOn(client.compliance, 'checkWhitelist')
      .mockResolvedValue(true);
    const sourceAccount = new Account(client.keypair!.publicKey(), '123');
    const getAccount = jest
      .spyOn(client.rpcServer, 'getAccount')
      .mockResolvedValue(sourceAccount);
    const prepare = jest
      .spyOn(client.rpcServer, 'prepareTransaction')
      .mockImplementation(async (tx) => tx as any);
    const send = jest
      .spyOn(client.rpcServer, 'sendTransaction')
      .mockResolvedValue({ hash: ACCEPTED_HASH, status: 'PENDING' } as any);

    await expect(client.asset.transfer(recipient, 42)).resolves.toBe(ACCEPTED_HASH);

    expect(check).toHaveBeenCalledTimes(4);
    expect(check).toHaveBeenNthCalledWith(1, client.keypair!.publicKey());
    expect(check).toHaveBeenNthCalledWith(2, recipient);
    expect(check).toHaveBeenNthCalledWith(3, client.keypair!.publicKey());
    expect(check).toHaveBeenNthCalledWith(4, recipient);
    expect(getAccount).toHaveBeenCalledTimes(1);
    expect(getAccount).toHaveBeenCalledWith(client.keypair!.publicKey());
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(await prepare.mock.results[0].value);
  });

  it('distinguishes rejected and uncertain Soroban submission from an accepted hash', async () => {
    const client = makeClient();
    const sender = client.keypair!.publicKey();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(true);
    jest.spyOn(client.rpcServer, 'getAccount').mockResolvedValue(
      new Account(sender, '123'),
    );
    jest.spyOn(client.rpcServer, 'prepareTransaction')
      .mockImplementation(async (tx) => tx as any);
    const send = jest.spyOn(client.rpcServer, 'sendTransaction');
    const run = () => client.asset.transfer(recipient, 25);

    send.mockResolvedValueOnce({ status: 'ERROR', hash: ACCEPTED_HASH } as any);
    await expectIntentError(run(), 'SUBMISSION_REJECTED');

    send.mockResolvedValueOnce({ status: 'TRY_AGAIN_LATER', hash: ACCEPTED_HASH } as any);
    await expectIntentError(run(), 'SUBMISSION_UNCONFIRMED');

    send.mockResolvedValueOnce({ status: 'PENDING', hash: 'not-a-hash' } as any);
    await expectIntentError(run(), 'SUBMISSION_UNCONFIRMED');

    send.mockRejectedValueOnce(new Error('private RPC response details'));
    try {
      await run();
      throw new Error('Expected submission error');
    } catch (error) {
      expect(error).toBeInstanceOf(CompliantTransferIntentError);
      expect((error as CompliantTransferIntentError).code).toBe('SUBMISSION_UNCONFIRMED');
      expect(String(error)).not.toContain('private RPC response');
    }

    send.mockResolvedValueOnce({ status: 'PENDING', hash: ACCEPTED_HASH } as any);
    await expect(run()).resolves.toBe(ACCEPTED_HASH);
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('rechecks compliance after transaction preparation before signing or sending', async () => {
    const client = makeClient();
    const sender = client.keypair!.publicKey();
    const recipient = Keypair.random().publicKey();
    let prepared = false;
    const check = jest
      .spyOn(client.compliance, 'checkWhitelist')
      .mockImplementation(async (address) => !prepared || address === sender);
    jest.spyOn(client.rpcServer, 'getAccount').mockResolvedValue(
      new Account(sender, '123'),
    );
    const prepare = jest
      .spyOn(client.rpcServer, 'prepareTransaction')
      .mockImplementation(async (tx) => {
        prepared = true;
        return tx as any;
      });
    const send = jest.spyOn(client.rpcServer, 'sendTransaction');

    await expectIntentError(
      client.asset.transfer(recipient, 25),
      'RECIPIENT_NOT_COMPLIANT',
    );

    expect(check).toHaveBeenCalledTimes(4);
    expect(check).toHaveBeenNthCalledWith(1, sender);
    expect(check).toHaveBeenNthCalledWith(2, recipient);
    expect(check).toHaveBeenNthCalledWith(3, sender);
    expect(check).toHaveBeenNthCalledWith(4, recipient);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('never prepares or submits a transaction for the wrong network account', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(true);
    const incorrectAccount = new Account(Keypair.random().publicKey(), '123');
    jest.spyOn(client.rpcServer, 'getAccount').mockResolvedValue(incorrectAccount);
    const prepare = jest.spyOn(client.rpcServer, 'prepareTransaction');
    const send = jest.spyOn(client.rpcServer, 'sendTransaction');

    await expectIntentError(client.asset.transfer(recipient, 25), 'INTENT_CONFIG_MISMATCH');
    expect(prepare).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('revalidates the intended network after asynchronous transaction preparation', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(true);
    jest.spyOn(client.rpcServer, 'getAccount').mockResolvedValue(
      new Account(client.keypair!.publicKey(), '123'),
    );
    const prepare = jest
      .spyOn(client.rpcServer, 'prepareTransaction')
      .mockImplementation(async (tx) => {
        client.networkPassphrase = Networks.PUBLIC;
        return tx as any;
      });
    const send = jest.spyOn(client.rpcServer, 'sendTransaction');

    await expectIntentError(client.asset.transfer(recipient, 25), 'INTENT_CONFIG_MISMATCH');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
});
