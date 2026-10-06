import {
  AdminAssignableRole,
  AdminPreviewComplianceImpact,
  AdminPreviewError,
  AdminPreviewOperation,
  AdminTransactionPreview,
  AdminTransactionPreviewInput,
} from '../types/admin-preview';

const POSITIVE_AMOUNT_PATTERN = /^(?:0*[1-9]\d*)(?:\.\d+)?$|^0*\.\d*[1-9]\d*$/;

const VALID_ASSIGNABLE_ROLES: readonly AdminAssignableRole[] = [
  'compliance-operator',
  'issuer',
  'admin',
];

const OPERATION_LABELS: Readonly<Record<AdminPreviewOperation, string>> = {
  'whitelist-add': 'Whitelist addition',
  'whitelist-remove': 'Whitelist removal',
  'asset-register': 'Asset registration',
  'asset-mint': 'Asset mint',
  'role-grant': 'Role grant',
  'role-revoke': 'Role revoke',
};

const COMPLIANCE_IMPACTS: Readonly<
  Record<AdminPreviewOperation, AdminPreviewComplianceImpact>
> = {
  'whitelist-add': 'changes-whitelist-state',
  'whitelist-remove': 'changes-whitelist-state',
  'asset-register': 'changes-asset-registry',
  'asset-mint': 'requires-recipient-compliance',
  'role-grant': 'changes-privilege-surface',
  'role-revoke': 'changes-privilege-surface',
};

const OPERATION_WARNINGS: Readonly<Record<AdminPreviewOperation, readonly string[]>> = {
  'whitelist-add': [
    'This changes protocol whitelist state; verify the address and the applicable compliance process before signing.',
    'This preview does not prove KYC, legal eligibility, or contract authorization.',
  ],
  'whitelist-remove': [
    'Removing an address may prevent restricted transfers or other protocol actions.',
    'Confirm the intended address and operational impact before signing.',
  ],
  'asset-register': [
    'Asset registration can create persistent protocol state; verify asset identity and metadata before signing.',
    'This preview does not validate off-chain legal, issuer, or compliance claims.',
  ],
  'asset-mint': [
    'Minting changes token supply; verify the asset, recipient, and amount before signing.',
    'Recipient compliance and contract authorization must still be checked at submission time.',
  ],
  'role-grant': [
    'Granting a privileged role can expand protocol capabilities for the target address.',
    'The current SDK cannot verify on-chain role support or authorization from this preview.',
  ],
  'role-revoke': [
    'Revoking a privileged role can interrupt protocol operations for the target address.',
    'The current SDK cannot verify on-chain role support or authorization from this preview.',
  ],
};

/**
 * Builds a deterministic review model for an admin action before any transaction is signed.
 *
 * The preview is deliberately pure: it does not simulate, submit, authorize, or make
 * compliance/legal assertions. The contract and the application's real transaction path
 * remain authoritative.
 */
export function buildAdminTransactionPreview<
  TInput extends AdminTransactionPreviewInput,
>(input: TInput): AdminTransactionPreview<TInput> {
  const target = normalizeTarget(input);
  const warnings = Object.freeze([...OPERATION_WARNINGS[input.operation]]);

  return Object.freeze({
    operation: input.operation,
    target,
    summary: `${OPERATION_LABELS[input.operation]} ready for admin review.`,
    complianceImpact: COMPLIANCE_IMPACTS[input.operation],
    warnings,
    reviewOnly: true,
    verified: false,
  }) as AdminTransactionPreview<TInput>;
}

function normalizeTarget<TInput extends AdminTransactionPreviewInput>(
  input: TInput,
): TInput['target'] {
  switch (input.operation) {
    case 'whitelist-add':
    case 'whitelist-remove':
      return Object.freeze({
        address: requireValue(input.target.address, 'Whitelist address'),
      }) as TInput['target'];

    case 'asset-register':
      return Object.freeze({
        assetId: requireValue(input.target.assetId, 'Asset identifier'),
      }) as TInput['target'];

    case 'asset-mint': {
      const amount = input.target.amount.trim();
      if (!POSITIVE_AMOUNT_PATTERN.test(amount)) {
        throw new AdminPreviewError(
          'INVALID_AMOUNT',
          'Mint amount must be a positive decimal string.',
        );
      }

      return Object.freeze({
        assetId: requireValue(input.target.assetId, 'Asset identifier'),
        recipient: requireValue(input.target.recipient, 'Mint recipient'),
        amount,
      }) as TInput['target'];
    }

    case 'role-grant':
    case 'role-revoke': {
      const role = String(input.target.role).trim() as AdminAssignableRole;
      if (!VALID_ASSIGNABLE_ROLES.includes(role)) {
        throw new AdminPreviewError(
          'INVALID_ROLE',
          'Role preview must target compliance-operator, issuer, or admin.',
        );
      }

      return Object.freeze({
        address: requireValue(input.target.address, 'Role target address'),
        role,
      }) as TInput['target'];
    }
  }
}

function requireValue(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new AdminPreviewError('INVALID_TARGET', `${field} is required.`);
  }
  return normalized;
}
