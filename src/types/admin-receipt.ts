import { AegisSdkError } from '../errors/public';

export type AdminActionOperation =
  | 'whitelist-add'
  | 'whitelist-remove'
  | 'asset-register'
  | 'protocol-pause'
  | 'protocol-unpause'
  | 'asset-mint';

export type AdminActionStatus = 'success' | 'pending' | 'failed' | 'unknown';

export type AdminTransactionStatusInput =
  | AdminActionStatus
  | 'SUCCESS'
  | 'CONFIRMED'
  | 'PENDING'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'FAILED'
  | 'ERROR'
  | 'TRY_AGAIN_LATER'
  | 'UNKNOWN';

export interface AdminReceiptCommonInput {
  status: AdminTransactionStatusInput | string;
  networkPassphrase: string;
  transactionHash?: string | null;
  explorerBaseUrl?: string;
  observedAt?: Date | string;
  failureCode?: string;
}

export type AdminActionReceiptInput =
  | (AdminReceiptCommonInput & {
      operation: 'whitelist-add' | 'whitelist-remove';
      target: {
        address: string;
      };
    })
  | (AdminReceiptCommonInput & {
      operation: 'asset-register';
      target: {
        assetId: string;
      };
    })
  | (AdminReceiptCommonInput & {
      operation: 'protocol-pause' | 'protocol-unpause';
      target: {
        contractId: string;
      };
    })
  | (AdminReceiptCommonInput & {
      operation: 'asset-mint';
      target: {
        assetId: string;
        recipient: string;
        amount: string;
      };
    });

export interface AdminActionReceipt<
  TInput extends AdminActionReceiptInput = AdminActionReceiptInput,
> {
  operation: TInput['operation'];
  target: TInput['target'];
  status: AdminActionStatus;
  transactionHash: string | null;
  explorerUrl: string | null;
  observedAt: string;
  summary: string;
  failureCode?: string;
}

export type AdminReceiptErrorCode =
  | 'INVALID_TARGET'
  | 'INVALID_AMOUNT'
  | 'INVALID_TRANSACTION_HASH'
  | 'MISSING_TRANSACTION_HASH'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_EXPLORER_URL'
  | 'INVALID_FAILURE_CODE';

export class AdminReceiptError extends AegisSdkError<AdminReceiptErrorCode> {
  constructor(code: AdminReceiptErrorCode, message: string) {
    super({
      code,
      category: 'admin',
      message,
    });
    this.name = 'AdminReceiptError';
  }
}
