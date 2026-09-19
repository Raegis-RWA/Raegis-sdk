import { Account, Keypair, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { AegisClient } from '../client';

/**
 * Builds a properly-typed `Transaction` for a read-only simulation call.
 *
 * `rpc.Server.simulateTransaction` takes a `Transaction` (or `FeeBumpTransaction`)
 * directly as its first argument — it does not accept a bare contract-call
 * `Operation`, and it does not accept a `{ transaction: ... }` wrapper object.
 * Passing either of those (as this SDK previously did via `as any` casts) relies
 * on undocumented, version-dependent leniency in the underlying RPC client
 * rather than the documented request shape.
 *
 * Simulation never signs or submits anything, so the source account does not
 * need to be real or have a live sequence number: sequence `"0"` is a safe
 * placeholder here, same as the one `AssetModule` already uses for write
 * transactions before they're actually submitted. When the client has a
 * configured signer, its public key is reused as the source account so a
 * simulation reflects the account that would actually sign; otherwise an
 * ephemeral keypair's public key is used purely to satisfy the transaction
 * envelope's structural requirement for a source account.
 */
export function buildSimulationTransaction(
  client: AegisClient,
  operation: ReturnType<typeof Operation.invokeContractFunction>
): Transaction {
  const sourcePublicKey = client.keypair?.publicKey() ?? Keypair.random().publicKey();
  const sourceAccount = new Account(sourcePublicKey, '0');

  return new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();
}
