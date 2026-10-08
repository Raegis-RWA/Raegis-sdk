import {
  TransactionReceiptError,
  TransactionReceiptErrorCode,
  TransactionReceiptStatus,
  TransactionReceiptStatusInput,
} from './transaction-receipt';

export type AdminActionOperation =
  | 'whitelist-add'
  | 'whitelist-remove'
  | 'asset-register'
  | 'protocol-pause'
  | 'protocol-unpause'
  | 'asset-mint';

export type AdminActionStatus = TransactionReceiptStatus;
export type AdminTransactionStatusInput = TransactionReceiptStatusInput;

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
      target: { address: string };
    })
  | (AdminReceiptCommonInput & {
      operation: 'asset-register';
      target: { assetId: string };
    })
  | (AdminReceiptCommonInput & {
      operation: 'protocol-pause' | 'protocol-unpause';
      target: { contractId: string };
    })
  | (AdminReceiptCommonInput & {
      operation: 'asset-mint';
      target: { assetId: string; recipient: string; amount: string };
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

export type AdminReceiptErrorCode = TransactionReceiptErrorCode;

export class AdminReceiptError extends TransactionReceiptError {
  constructor(code: AdminReceiptErrorCode, message: string) {
    super(code, message);
    this.name = 'AdminReceiptError';
  }
}
