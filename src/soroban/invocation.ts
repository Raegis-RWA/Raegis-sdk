import {
  Account,
  Contract,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { SorobanInvocationError } from '../errors/invocation';

export type ContractInvocationOperation = ReturnType<
  typeof Operation.invokeContractFunction
>;

export interface SorobanInvocationClient {
  rpcServer: rpc.Server;
  contractId: string;
  networkPassphrase: string;
  keypair?: Keypair;
  requireSigner(): Keypair;
  runNetworkOperation<T>(operation: () => Promise<T>): Promise<T>;
}

export interface SorobanWriteResult {
  hash: string;
  status: string;
}

/**
 * Shared Soroban invocation boundary for SDK modules.
 *
 * Read calls are simulation-only and never sign or submit. Mutating calls
 * require a configured signer, fetch its live account sequence, prepare the
 * Soroban transaction through RPC, sign the prepared envelope, then submit it.
 *
 * Network transport failures remain NetworkFailure instances through
 * AegisClient.runNetworkOperation(). Invocation-shape/status failures use
 * SorobanInvocationError so callers do not need to parse provider text.
 */
export class SorobanInvocation {
  constructor(private readonly client: SorobanInvocationClient) {}

  public createCall(
    functionName: string,
    ...args: xdr.ScVal[]
  ): ContractInvocationOperation {
    return this.createCallFor(this.client.contractId, functionName, ...args);
  }

  /**
   * Builds a call against an explicit contract id for modules that aggregate
   * reads across more than the client's primary contract.
   */
  public createCallFor(
    contractId: string,
    functionName: string,
    ...args: xdr.ScVal[]
  ): ContractInvocationOperation {
    return new Contract(contractId).call(functionName, ...args);
  }

  /**
   * Returns the configured signer or a stable typed invocation error.
   */
  public getRequiredSigner(operation?: string): Keypair {
    try {
      return this.client.requireSigner();
    } catch (cause) {
      throw new SorobanInvocationError(
        'A signer is required for this contract invocation.',
        'SIGNER_REQUIRED',
        { operation, cause },
      );
    }
  }

  /**
   * Simulates one read-only contract operation and maps the returned ScVal/XDR
   * through a caller-provided decoder.
   */
  public async read<T>(
    operation: ContractInvocationOperation,
    decode: (retval: unknown) => T,
    operationName?: string,
  ): Promise<T> {
    const tx = this.buildSimulationTransaction(operation);
    const response = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.simulateTransaction(tx),
    );

    if (!rpc.Api.isSimulationSuccess(response) || !response.result) {
      throw new SorobanInvocationError(
        'Contract simulation did not return a successful result.',
        'SIMULATION_FAILED',
        { operation: operationName },
      );
    }

    try {
      return decode(response.result.retval as unknown);
    } catch (cause) {
      throw new SorobanInvocationError(
        'Contract simulation returned a result that could not be decoded.',
        'MALFORMED_RESPONSE',
        { operation: operationName, cause },
      );
    }
  }

  /**
   * Prepares, signs, and submits one state-changing contract operation.
   */
  public async write(
    operation: ContractInvocationOperation,
    operationName?: string,
  ): Promise<SorobanWriteResult> {
    const signer = this.getRequiredSigner(operationName);
    const sourceAccount = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.getAccount(signer.publicKey()),
    );

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '1000',
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const prepared = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.prepareTransaction(tx),
    );
    prepared.sign(signer);

    const response = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.sendTransaction(prepared),
    );

    const status = String(response.status ?? 'UNKNOWN');
    const hash = typeof response.hash === 'string' ? response.hash : '';

    if (status === 'ERROR' || hash.length === 0) {
      throw new SorobanInvocationError(
        'Contract submission was rejected before a transaction hash was returned.',
        'SUBMISSION_FAILED',
        { operation: operationName },
      );
    }

    return { hash, status };
  }

  private buildSimulationTransaction(
    operation: ContractInvocationOperation,
  ): Transaction {
    const sourcePublicKey =
      this.client.keypair?.publicKey() ?? Keypair.random().publicKey();
    const sourceAccount = new Account(sourcePublicKey, '0');

    return new TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
  }
}
