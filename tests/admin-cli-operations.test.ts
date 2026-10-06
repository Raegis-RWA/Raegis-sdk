import { Account, Keypair } from '@stellar/stellar-sdk';
import { AegisClient } from '../src/client';
import { MOCK_CONTRACT_ID } from '../src/testing/fixtures';

function createWritableClient() {
  const signer = Keypair.random();
  const client = new AegisClient({
    environment: 'testnet',
    contractId: MOCK_CONTRACT_ID,
    keypair: signer,
  });

  const getAccount = jest
    .fn()
    .mockResolvedValue(new Account(signer.publicKey(), '123'));
  const prepareTransaction = jest
    .fn()
    .mockImplementation(async (transaction: unknown) => transaction);
  const sendTransaction = jest
    .fn()
    .mockResolvedValue({ hash: 'mock_admin_tx_hash' });

  (client.rpcServer as any).getAccount = getAccount;
  (client.rpcServer as any).prepareTransaction = prepareTransaction;
  (client.rpcServer as any).sendTransaction = sendTransaction;

  return { client, signer, getAccount, prepareTransaction, sendTransaction };
}

describe('admin CLI-backed operations', () => {
  it('whitelists through a live-sequence prepared transaction', async () => {
    const { client, signer, getAccount, prepareTransaction, sendTransaction } =
      createWritableClient();
    const recipient = Keypair.random().publicKey();

    await expect(client.compliance.whitelist(recipient)).resolves.toBe(
      'mock_admin_tx_hash',
    );

    expect(getAccount).toHaveBeenCalledWith(signer.publicKey());
    expect(prepareTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('mints through a live-sequence prepared transaction', async () => {
    const { client, signer, getAccount, prepareTransaction, sendTransaction } =
      createWritableClient();
    const recipient = Keypair.random().publicKey();

    await expect(client.asset.mint(recipient, 25)).resolves.toBe(
      'mock_admin_tx_hash',
    );

    expect(getAccount).toHaveBeenCalledWith(signer.publicKey());
    expect(prepareTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects whitelist writes when no signer is configured', async () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: MOCK_CONTRACT_ID,
    });

    await expect(
      client.compliance.whitelist(Keypair.random().publicKey()),
    ).rejects.toThrow('Transaction signing requires a Keypair');
  });
});
