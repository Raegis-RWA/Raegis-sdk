import {
  Account,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  FreighterAdapterError,
  FreighterApiTransport,
  FreighterWalletAdapter,
} from '../src/wallet/freighter';

function makeTransport(
  overrides: Partial<FreighterApiTransport> = {},
): FreighterApiTransport {
  const address = Keypair.random().publicKey();

  return {
    isConnected: jest.fn().mockResolvedValue({ isConnected: true }),
    requestAccess: jest.fn().mockResolvedValue({ address }),
    signTransaction: jest.fn().mockResolvedValue({
      signedTxXdr: 'AAAA-signed-xdr',
      signerAddress: address,
    }),
    ...overrides,
  };
}

function makeUnsignedTransactionXdr(): string {
  const source = new Account(Keypair.random().publicKey(), '0');

  return new TransactionBuilder(source, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.manageData({
        name: 'freighter-adapter-test',
        value: 'ready',
      }),
    )
    .setTimeout(30)
    .build()
    .toXDR();
}

function expectAdapterError(
  promise: Promise<unknown>,
  code: FreighterAdapterError['code'],
): Promise<void> {
  return promise.then(
    () => {
      throw new Error(`expected FreighterAdapterError ${code}`);
    },
    (error) => {
      expect(error).toBeInstanceOf(FreighterAdapterError);
      expect((error as FreighterAdapterError).code).toBe(code);
    },
  );
}

describe('FreighterWalletAdapter', () => {
  it('reports unavailable without prompting for access', async () => {
    const requestAccess = jest.fn();
    const adapter = new FreighterWalletAdapter(
      makeTransport({
        isConnected: jest.fn().mockResolvedValue({ isConnected: false }),
        requestAccess,
      }),
    );

    await expectAdapterError(adapter.connect(), 'FREIGHTER_UNAVAILABLE');
    expect(requestAccess).not.toHaveBeenCalled();
  });

  it('returns a typed rejection when the user denies access', async () => {
    const adapter = new FreighterWalletAdapter(
      makeTransport({
        requestAccess: jest.fn().mockResolvedValue({
          address: '',
          error: { message: 'The user rejected this request.' },
        }),
      }),
    );

    await expectAdapterError(adapter.connect(), 'ACCESS_REJECTED');
  });

  it('rejects an invalid address returned by Freighter', async () => {
    const adapter = new FreighterWalletAdapter(
      makeTransport({
        requestAccess: jest.fn().mockResolvedValue({ address: 'not-a-stellar-address' }),
      }),
    );

    await expectAdapterError(adapter.connect(), 'INVALID_ADDRESS');
  });

  it('connects with a validated Stellar public key', async () => {
    const address = Keypair.random().publicKey();
    const adapter = new FreighterWalletAdapter(
      makeTransport({
        requestAccess: jest.fn().mockResolvedValue({ address }),
      }),
    );

    await expect(adapter.connect()).resolves.toEqual({ address });
  });

  it('rejects malformed transaction XDR without opening the wallet', async () => {
    const signTransaction = jest.fn();
    const adapter = new FreighterWalletAdapter(
      makeTransport({ signTransaction }),
    );

    await expectAdapterError(
      adapter.signTransaction('not-a-transaction-envelope', {
        networkPassphrase: Networks.TESTNET,
      }),
      'INVALID_TRANSACTION_XDR',
    );

    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('returns a typed rejection when the user refuses a signature', async () => {
    const adapter = new FreighterWalletAdapter(
      makeTransport({
        signTransaction: jest.fn().mockResolvedValue({
          signedTxXdr: '',
          signerAddress: '',
          error: { message: 'The user rejected this request.' },
        }),
      }),
    );

    await expectAdapterError(
      adapter.signTransaction(makeUnsignedTransactionXdr(), {
        networkPassphrase: Networks.TESTNET,
      }),
      'SIGNING_REJECTED',
    );
  });

  it('rejects a signer that differs from the requested account', async () => {
    const requestedAddress = Keypair.random().publicKey();
    const signerAddress = Keypair.random().publicKey();
    const adapter = new FreighterWalletAdapter(
      makeTransport({
        signTransaction: jest.fn().mockResolvedValue({
          signedTxXdr: 'AAAA-signed-xdr',
          signerAddress,
        }),
      }),
    );

    await expectAdapterError(
      adapter.signTransaction(makeUnsignedTransactionXdr(), {
        networkPassphrase: Networks.TESTNET,
        address: requestedAddress,
      }),
      'SIGNER_MISMATCH',
    );
  });

  it('returns the signed XDR and signer for a valid request', async () => {
    const address = Keypair.random().publicKey();
    const signTransaction = jest.fn().mockResolvedValue({
      signedTxXdr: 'AAAA-signed-xdr',
      signerAddress: address,
    });
    const adapter = new FreighterWalletAdapter(
      makeTransport({ signTransaction }),
    );
    const unsignedXdr = makeUnsignedTransactionXdr();

    await expect(
      adapter.signTransaction(unsignedXdr, {
        networkPassphrase: Networks.TESTNET,
        address,
      }),
    ).resolves.toEqual({
      signedTxXdr: 'AAAA-signed-xdr',
      signerAddress: address,
    });

    expect(signTransaction).toHaveBeenCalledWith(unsignedXdr, {
      networkPassphrase: Networks.TESTNET,
      address,
    });
  });
});
