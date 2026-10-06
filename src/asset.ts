import {
  Account,
  Contract,
  nativeToScVal,
  StrKey,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { MintReadinessError } from './errors/mint-readiness';
import {
  MintReadinessCheck,
  MintReadinessCheckName,
  MintReadinessProbe,
  MintReadinessProbeContext,
  MintReadinessProbes,
  MintReadinessResult,
} from './types/mint-readiness';

function readinessCheck(
  name: MintReadinessCheckName,
  status: MintReadinessCheck['status'],
  code: MintReadinessCheck['code'],
  message: string,
  verified: boolean,
): MintReadinessCheck {
  return { name, status, code, message, verified };
}

export class AssetModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Evaluates issuer authority, recipient compliance, asset status, amount,
   * and network health before a mint transaction is constructed or signed.
   *
   * Issuer and asset probes are required because the current Raegis contract
   * interface does not expose authoritative read methods for those states.
   * Missing probes are reported as `unknown` and block readiness.
   */
  public async checkMintReadiness(
    to: string,
    amount: number,
    probes: MintReadinessProbes = {},
  ): Promise<MintReadinessResult> {
    const issuer = this.client.keypair?.publicKey() ?? null;
    const context: MintReadinessProbeContext | null = issuer
      ? {
          issuer,
          recipient: to,
          amount,
          contractId: this.client.contractId,
          networkPassphrase: this.client.networkPassphrase,
        }
      : null;

    const [issuerCheck, recipientCheck, assetCheck, networkCheck] =
      await Promise.all([
        this.checkIssuerReadiness(issuer, context, probes.issuerAuthorized),
        this.checkRecipientReadiness(to),
        this.checkAssetReadiness(context, probes.assetActive),
        this.checkNetworkReadiness(context, probes.networkReady),
      ]);

    const amountCheck = Number.isSafeInteger(amount) && amount > 0
      ? readinessCheck(
          'amount',
          'passed',
          'OK',
          'Mint amount is a positive safe integer.',
          true,
        )
      : readinessCheck(
          'amount',
          'blocked',
          'INVALID_AMOUNT',
          'Mint amount must be a positive safe integer.',
          true,
        );

    const checks = {
      issuer: issuerCheck,
      recipient: recipientCheck,
      asset: assetCheck,
      amount: amountCheck,
      network: networkCheck,
    };
    const blockingCodes = Object.values(checks)
      .filter((check) => check.status !== 'passed')
      .map((check) => check.code);

    return {
      ready: blockingCodes.length === 0,
      issuer,
      recipient: to,
      amount,
      contractId: this.client.contractId,
      checks,
      blockingCodes,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Re-runs all readiness checks immediately before delegating to `mint()`.
   * Throws `MintReadinessError` before transaction construction/signing when
   * any state is blocked, unknown, or errored.
   */
  public async mintWhenReady(
    to: string,
    amount: number,
    probes: MintReadinessProbes = {},
  ): Promise<string> {
    const readiness = await this.checkMintReadiness(to, amount, probes);
    if (!readiness.ready) {
      throw new MintReadinessError(readiness);
    }
    return this.mint(to, amount);
  }

  /**
   * Low-level mint submission.
   *
   * This method does not run the readiness model. Prefer `mintWhenReady()` for
   * application flows that must block before signing.
   *
   * @param to Stellar public key of the recipient.
   * @param amount Amount to mint.
   */
  public async mint(to: string, amount: number): Promise<string> {
    const signer = this.client.requireSigner();
    const contract = new Contract(this.client.contractId);

    const call = contract.call(
      'mint_asset',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(to, { type: 'address' }),
      nativeToScVal(amount, { type: 'i128' }),
    );

    // Note: In production, you must fetch the real sequence number for the account
    const sourceAccount = new Account(signer.publicKey(), '0');

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '1000',
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(call)
      .setTimeout(30)
      .build();

    tx.sign(signer);

    try {
      const response = await this.client.rpcServer.sendTransaction(tx);
      return response.hash;
    } catch (error) {
      throw new Error(`Mint transaction failed: ${error}`);
    }
  }

  /**
   * Transfers RWA tokens to another whitelisted address.
   * @param to Stellar public key of the recipient.
   * @param amount Amount to transfer.
   */
  public async transfer(to: string, amount: number): Promise<string> {
    const signer = this.client.requireSigner();
    const contract = new Contract(this.client.contractId);

    const call = contract.call(
      'transfer',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(to, { type: 'address' }),
      nativeToScVal(amount, { type: 'i128' }),
    );

    const sourceAccount = new Account(signer.publicKey(), '0');

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '1000',
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(call)
      .setTimeout(30)
      .build();

    tx.sign(signer);

    try {
      const response = await this.client.rpcServer.sendTransaction(tx);
      return response.hash;
    } catch (error) {
      throw new Error(`Transfer transaction failed: ${error}`);
    }
  }

  private async checkIssuerReadiness(
    issuer: string | null,
    context: MintReadinessProbeContext | null,
    probe?: MintReadinessProbe,
  ): Promise<MintReadinessCheck> {
    if (!issuer || !context) {
      return readinessCheck(
        'issuer',
        'blocked',
        'NO_SIGNER_CONFIGURED',
        'No signing Keypair is configured for the issuer.',
        true,
      );
    }
    if (!probe) {
      return readinessCheck(
        'issuer',
        'unknown',
        'ISSUER_AUTHORIZATION_UNAVAILABLE',
        'Issuer authorization cannot be verified without an authoritative probe.',
        false,
      );
    }
    try {
      return (await probe(context))
        ? readinessCheck(
            'issuer',
            'passed',
            'OK',
            'Issuer authorization probe passed.',
            true,
          )
        : readinessCheck(
            'issuer',
            'blocked',
            'ISSUER_NOT_AUTHORIZED',
            'Issuer authorization probe denied minting.',
            true,
          );
    } catch {
      return readinessCheck(
        'issuer',
        'error',
        'ISSUER_AUTHORIZATION_QUERY_FAILED',
        'Issuer authorization probe failed.',
        false,
      );
    }
  }

  private async checkRecipientReadiness(
    recipient: string,
  ): Promise<MintReadinessCheck> {
    if (!StrKey.isValidEd25519PublicKey(recipient)) {
      return readinessCheck(
        'recipient',
        'blocked',
        'INVALID_RECIPIENT',
        'Recipient must be a valid Stellar account public key.',
        true,
      );
    }
    try {
      return (await this.client.compliance.checkWhitelist(recipient))
        ? readinessCheck(
            'recipient',
            'passed',
            'OK',
            'Recipient is KYC/whitelist approved.',
            true,
          )
        : readinessCheck(
            'recipient',
            'blocked',
            'RECIPIENT_NOT_WHITELISTED',
            'Recipient is not KYC/whitelist approved.',
            true,
          );
    } catch {
      return readinessCheck(
        'recipient',
        'error',
        'RECIPIENT_COMPLIANCE_QUERY_FAILED',
        'Recipient compliance query failed.',
        false,
      );
    }
  }

  private async checkAssetReadiness(
    context: MintReadinessProbeContext | null,
    probe?: MintReadinessProbe,
  ): Promise<MintReadinessCheck> {
    if (!context || !probe) {
      return readinessCheck(
        'asset',
        'unknown',
        'ASSET_STATUS_UNAVAILABLE',
        'Asset status cannot be verified without an authoritative probe.',
        false,
      );
    }
    try {
      return (await probe(context))
        ? readinessCheck(
            'asset',
            'passed',
            'OK',
            'Asset status probe reports the asset is active.',
            true,
          )
        : readinessCheck(
            'asset',
            'blocked',
            'ASSET_NOT_ACTIVE',
            'Asset status probe reports the asset is not active.',
            true,
          );
    } catch {
      return readinessCheck(
        'asset',
        'error',
        'ASSET_STATUS_QUERY_FAILED',
        'Asset status probe failed.',
        false,
      );
    }
  }

  private async checkNetworkReadiness(
    context: MintReadinessProbeContext | null,
    probe?: MintReadinessProbe,
  ): Promise<MintReadinessCheck> {
    try {
      if (probe) {
        if (!context) {
          return readinessCheck(
            'network',
            'blocked',
            'NO_SIGNER_CONFIGURED',
            'Network readiness context is unavailable without a signer.',
            true,
          );
        }
        return (await probe(context))
          ? readinessCheck(
              'network',
              'passed',
              'OK',
              'Network readiness probe passed.',
              true,
            )
          : readinessCheck(
              'network',
              'blocked',
              'NETWORK_UNHEALTHY',
              'Network readiness probe reported an unhealthy network.',
              true,
            );
      }

      const health = await this.client.runNetworkOperation(() =>
        this.client.rpcServer.getHealth(),
      );
      const status = String(health.status ?? '').toLowerCase();
      return status === 'healthy'
        ? readinessCheck(
            'network',
            'passed',
            'OK',
            'Soroban RPC health check passed.',
            true,
          )
        : readinessCheck(
            'network',
            'blocked',
            'NETWORK_UNHEALTHY',
            'Soroban RPC did not report a healthy status.',
            true,
          );
    } catch {
      return readinessCheck(
        'network',
        'error',
        'NETWORK_UNAVAILABLE',
        'Soroban RPC health check failed.',
        false,
      );
    }
  }
}
