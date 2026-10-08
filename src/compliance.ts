import {
  Contract,
  nativeToScVal,
  rpc,
  StrKey,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { parseSorobanResult } from './utils/xdr-parser';

export type ComplianceStatus =
  | 'Unknown'
  | 'Pending'
  | 'Approved'
  | 'Revoked'
  | 'Blocked';

export type ComplianceBatchTargetStatus = Exclude<ComplianceStatus, 'Unknown'>;

export interface ComplianceBatchUpdate {
  user: string;
  newStatus: ComplianceBatchTargetStatus;
}

export type ComplianceBatchErrorCode =
  | 'INVALID_BATCH'
  | 'INVALID_ADDRESS'
  | 'INVALID_STATUS'
  | 'DUPLICATE_ADDRESS'
  | 'BATCH_CONTEXT_CHANGED';

export class ComplianceBatchError extends Error {
  public readonly code: ComplianceBatchErrorCode;
  public readonly index?: number;
  public readonly user?: string;

  constructor(
    message: string,
    code: ComplianceBatchErrorCode,
    options: { index?: number; user?: string } = {},
  ) {
    super(message);
    this.name = 'ComplianceBatchError';
    this.code = code;
    this.index = options.index;
    this.user = options.user;
  }
}

const TARGET_STATUSES = new Set<ComplianceBatchTargetStatus>([
  'Pending',
  'Approved',
  'Revoked',
  'Blocked',
]);

export class ComplianceModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Queries the contract to check if a user is KYC-approved (whitelisted).
   * @param address The Stellar public key to check.
   * @returns boolean indicating whitelist status.
   */
  public async checkWhitelist(address: string): Promise<boolean> {
    const contract = new Contract(this.client.contractId);
    const call = contract.call(
      'is_whitelisted',
      nativeToScVal(address, { type: 'address' }),
    );

    const result = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.simulateTransaction({
        transaction: call as any,
      } as any),
    );

    if (rpc.Api.isSimulationSuccess(result) && result.result) {
      return parseSorobanResult(result.result.retval as any) as boolean;
    }
    return false;
  }

  /**
   * Atomically applies compliance lifecycle transitions through the contract's
   * native batch_set_compliance_status entrypoint.
   */
  public async batchSetComplianceStatus(
    updates: readonly ComplianceBatchUpdate[],
  ): Promise<string> {
    const signer = this.client.requireSigner();
    const signerAddress = signer.publicKey();
    const contractId = this.client.contractId;
    const networkPassphrase = this.client.networkPassphrase;
    const normalized = this.validateBatch(updates);
    const contract = new Contract(contractId);

    const assertBoundContext = () => {
      if (
        this.client.requireSigner().publicKey() !== signerAddress ||
        this.client.contractId !== contractId ||
        this.client.networkPassphrase !== networkPassphrase
      ) {
        throw new ComplianceBatchError(
          'Batch compliance context changed before signing or submission.',
          'BATCH_CONTEXT_CHANGED',
        );
      }
    };

    const call = contract.call(
      'batch_set_compliance_status',
      nativeToScVal(signerAddress, { type: 'address' }),
      xdr.ScVal.scvVec(normalized.map((update) => this.encodeUpdate(update))),
    );

    return this.client.runNetworkOperation(async () => {
      const sourceAccount = await this.client.rpcServer.getAccount(
        signerAddress,
      );
      assertBoundContext();
      if (sourceAccount.accountId() !== signerAddress) {
        throw new ComplianceBatchError(
          'RPC source account does not match the authorized batch signer.',
          'BATCH_CONTEXT_CHANGED',
        );
      }
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: '1000',
        networkPassphrase,
      })
        .addOperation(call)
        .setTimeout(30)
        .build();

      const prepared = await this.client.rpcServer.prepareTransaction(transaction);
      // RPC preparation is asynchronous; reject revoked signer/network/contract
      // bindings before signing a privileged compliance state transition.
      assertBoundContext();
      prepared.sign(signer);

      const response = await this.client.rpcServer.sendTransaction(prepared);
      if (
        response.status !== 'PENDING' &&
        response.status !== 'DUPLICATE'
      ) {
        throw new Error(
          `Batch compliance submission was not accepted: ${response.status}.`,
        );
      }
      if (!response.hash) {
        throw new Error(
          'Batch compliance submission returned no transaction hash.',
        );
      }
      return response.hash;
    });
  }

  public async batchWhitelist(users: readonly string[]): Promise<string> {
    return this.batchSetComplianceStatus(
      users.map((user) => ({ user, newStatus: 'Approved' })),
    );
  }

  /**
   * Uses the canonical lifecycle target Revoked. This is intentionally
   * stricter than the tolerant legacy single-address revoke wrapper.
   */
  public async batchRevoke(users: readonly string[]): Promise<string> {
    return this.batchSetComplianceStatus(
      users.map((user) => ({ user, newStatus: 'Revoked' })),
    );
  }

  private validateBatch(
    updates: readonly ComplianceBatchUpdate[],
  ): ComplianceBatchUpdate[] {
    if (!Array.isArray(updates)) {
      throw new ComplianceBatchError(
        'Compliance batch updates must be an array.',
        'INVALID_BATCH',
      );
    }

    const seen = new Set<string>();

    return updates.map((update, index) => {
      if (!update || typeof update.user !== 'string' || !update.user.trim()) {
        throw new ComplianceBatchError(
          `Compliance batch update at index ${index} has an invalid user address.`,
          'INVALID_ADDRESS',
          { index },
        );
      }

      const user = update.user.trim();
      // Soroban Address is a valid Stellar public account (G) or contract (C)
      // identity. Validate before nativeToScVal so malformed entries carry a
      // stable SDK error and never escape as an unclassified XDR exception.
      if (!StrKey.isValidEd25519PublicKey(user) && !StrKey.isValidContract(user)) {
        throw new ComplianceBatchError(
          `Compliance batch update at index ${index} must contain a Stellar G- or C-address.`,
          'INVALID_ADDRESS',
          { index },
        );
      }
      if (seen.has(user)) {
        throw new ComplianceBatchError(
          `Compliance batch contains duplicate user ${user}.`,
          'DUPLICATE_ADDRESS',
          { index, user },
        );
      }
      seen.add(user);

      if (!TARGET_STATUSES.has(update.newStatus)) {
        throw new ComplianceBatchError(
          `Compliance batch update at index ${index} has invalid target status ${String(
            update.newStatus,
          )}.`,
          'INVALID_STATUS',
          { index, user },
        );
      }

      return { user, newStatus: update.newStatus };
    });
  }

  private encodeUpdate(update: ComplianceBatchUpdate): xdr.ScVal {
    return xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('new_status'),
        val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(update.newStatus)]),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('user'),
        val: nativeToScVal(update.user, { type: 'address' }),
      }),
    ]);
  }
}
