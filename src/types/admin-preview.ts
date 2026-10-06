import type { ClientRole } from './client-factory';

export type AdminPreviewOperation =
  | 'whitelist-add'
  | 'whitelist-remove'
  | 'asset-register'
  | 'asset-mint'
  | 'role-grant'
  | 'role-revoke';

export type AdminAssignableRole = Exclude<ClientRole, 'read-only' | 'investor'>;

export type AdminPreviewComplianceImpact =
  | 'changes-whitelist-state'
  | 'changes-asset-registry'
  | 'requires-recipient-compliance'
  | 'changes-privilege-surface';

export type AdminTransactionPreviewInput =
  | {
      operation: 'whitelist-add' | 'whitelist-remove';
      target: {
        address: string;
      };
    }
  | {
      operation: 'asset-register';
      target: {
        assetId: string;
      };
    }
  | {
      operation: 'asset-mint';
      target: {
        assetId: string;
        recipient: string;
        amount: string;
      };
    }
  | {
      operation: 'role-grant' | 'role-revoke';
      target: {
        address: string;
        role: AdminAssignableRole;
      };
    };

export interface AdminTransactionPreview<
  TInput extends AdminTransactionPreviewInput = AdminTransactionPreviewInput,
> {
  operation: TInput['operation'];
  target: TInput['target'];
  summary: string;
  complianceImpact: AdminPreviewComplianceImpact;
  warnings: readonly string[];
  reviewOnly: true;
  verified: false;
}

export type AdminPreviewErrorCode =
  | 'INVALID_TARGET'
  | 'INVALID_AMOUNT'
  | 'INVALID_ROLE';

export class AdminPreviewError extends Error {
  public readonly code: AdminPreviewErrorCode;

  constructor(code: AdminPreviewErrorCode, message: string) {
    super(message);
    this.name = 'AdminPreviewError';
    this.code = code;
  }
}
