export type TransactionReceiptOperation =
  | 'compliance-update'
  | 'asset-mint'
  | 'asset-transfer'
  | 'investor-update';

export type TransactionReceiptStatus = 'success' | 'pending' | 'failed' | 'unknown';

export type TransactionReceiptStatusInput =
  | TransactionReceiptStatus
  | 'SUCCESS'
  | 'CONFIRMED'
  | 'PENDING'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'FAILED'
  | 'ERROR'
  | 'TRY_AGAIN_LATER'
  | 'UNKNOWN';

export interface TransactionReceiptCommonInput {
  status: TransactionReceiptStatusInput | string;
  networkPassphrase: string;
  transactionHash?: string | null;
  explorerBaseUrl?: string;
  observedAt?: Date | string;
  failureCode?: string;
}

export type TransactionReceiptInput =
  | (TransactionReceiptCommonInput & {
      operation: 'compliance-update';
      target: { address: string; compliant: boolean };
    })
  | (TransactionReceiptCommonInput & {
      operation: 'asset-mint';
      target: { assetId: string; recipient: string; amount: string };
    })
  | (TransactionReceiptCommonInput & {
      operation: 'asset-transfer';
      target: { assetId: string; from: string; to: string; amount: string };
    })
  | (TransactionReceiptCommonInput & {
      operation: 'investor-update';
      target: { investor: string };
    });

export interface TransactionReceipt<
  TInput extends TransactionReceiptInput = TransactionReceiptInput,
> {
  operation: TInput['operation'];
  target: TInput['target'];
  status: TransactionReceiptStatus;
  transactionHash: string | null;
  explorerUrl: string | null;
  observedAt: string;
  summary: string;
  failureCode?: string;
}

export type TransactionReceiptErrorCode =
  | 'INVALID_TARGET'
  | 'INVALID_AMOUNT'
  | 'INVALID_TRANSACTION_HASH'
  | 'MISSING_TRANSACTION_HASH'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_EXPLORER_URL'
  | 'INVALID_FAILURE_CODE';

export class TransactionReceiptError extends Error {
  public readonly code: TransactionReceiptErrorCode;

  constructor(code: TransactionReceiptErrorCode, message: string) {
    super(message);
    this.name = 'TransactionReceiptError';
    this.code = code;
  }
}
