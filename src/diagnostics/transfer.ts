export type TransferWhitelistState =
  | 'whitelisted'
  | 'not-whitelisted'
  | 'unknown'
  | 'unavailable';

export type TransferRestrictionStatus = 'ready' | 'restricted' | 'unknown';

export type TransferRestrictionCode =
  | 'INVALID_AMOUNT'
  | 'SIGNER_MISMATCH'
  | 'SIGNER_UNKNOWN'
  | 'SENDER_NOT_WHITELISTED'
  | 'RECIPIENT_NOT_WHITELISTED'
  | 'SENDER_WHITELIST_UNKNOWN'
  | 'RECIPIENT_WHITELIST_UNKNOWN'
  | 'SENDER_WHITELIST_UNAVAILABLE'
  | 'RECIPIENT_WHITELIST_UNAVAILABLE';

export type TransferRestrictionAction =
  | 'correct-input'
  | 'use-expected-signer'
  | 'review-protocol-whitelist'
  | 'retry-whitelist-read'
  | 'inspect-network';

export interface TransferRestrictionInput {
  amount: number;
  senderWhitelist: TransferWhitelistState;
  recipientWhitelist: TransferWhitelistState;
  senderAddress?: string;
  signerAddress?: string;
}

export interface TransferRestrictionReason {
  code: TransferRestrictionCode;
  message: string;
  action: TransferRestrictionAction;
  retryable: boolean;
}

export interface TransferRestrictionDiagnostic {
  status: TransferRestrictionStatus;
  canAttempt: boolean;
  reasons: readonly TransferRestrictionReason[];
}

function whitelistReason(
  side: 'SENDER' | 'RECIPIENT',
  state: TransferWhitelistState,
): TransferRestrictionReason | undefined {
  if (state === 'whitelisted') return undefined;

  const subject = side === 'SENDER' ? 'Sender' : 'Recipient';

  if (state === 'not-whitelisted') {
    return {
      code: `${side}_NOT_WHITELISTED` as TransferRestrictionCode,
      message: `${subject} is not whitelisted by the observed protocol state.`,
      action: 'review-protocol-whitelist',
      retryable: false,
    };
  }

  if (state === 'unavailable') {
    return {
      code: `${side}_WHITELIST_UNAVAILABLE` as TransferRestrictionCode,
      message: `${subject} whitelist state could not be read.`,
      action: 'inspect-network',
      retryable: true,
    };
  }

  return {
    code: `${side}_WHITELIST_UNKNOWN` as TransferRestrictionCode,
    message: `${subject} whitelist state is unknown.`,
    action: 'retry-whitelist-read',
    retryable: true,
  };
}

/**
 * Builds a fail-closed transfer diagnostic from states the caller has actually
 * observed. This is preflight guidance only: the contract remains authoritative
 * and a "ready" result is not legal/compliance approval or a transaction guarantee.
 */
export function diagnoseTransferRestrictions(
  input: TransferRestrictionInput,
): TransferRestrictionDiagnostic {
  const reasons: TransferRestrictionReason[] = [];

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    reasons.push({
      code: 'INVALID_AMOUNT',
      message: 'Transfer amount must be a positive finite number.',
      action: 'correct-input',
      retryable: false,
    });
  }

  if (input.senderAddress && !input.signerAddress) {
    reasons.push({
      code: 'SIGNER_UNKNOWN',
      message: 'Expected transfer sender is known but signer identity was not supplied.',
      action: 'use-expected-signer',
      retryable: false,
    });
  } else if (
    input.senderAddress &&
    input.signerAddress &&
    input.senderAddress !== input.signerAddress
  ) {
    reasons.push({
      code: 'SIGNER_MISMATCH',
      message: 'Configured signer does not match the expected transfer sender.',
      action: 'use-expected-signer',
      retryable: false,
    });
  }

  const senderReason = whitelistReason('SENDER', input.senderWhitelist);
  if (senderReason) reasons.push(senderReason);

  const recipientReason = whitelistReason('RECIPIENT', input.recipientWhitelist);
  if (recipientReason) reasons.push(recipientReason);

  const hasRestriction = reasons.some((reason) =>
    [
      'INVALID_AMOUNT',
      'SIGNER_MISMATCH',
      'SENDER_NOT_WHITELISTED',
      'RECIPIENT_NOT_WHITELISTED',
    ].includes(reason.code),
  );

  const hasUnknown = reasons.some((reason) =>
    reason.code === 'SIGNER_UNKNOWN' ||
    reason.code.endsWith('_UNKNOWN') ||
    reason.code.endsWith('_UNAVAILABLE'),
  );

  const status: TransferRestrictionStatus = hasRestriction
    ? 'restricted'
    : hasUnknown
      ? 'unknown'
      : 'ready';

  return Object.freeze({
    status,
    canAttempt: status === 'ready',
    reasons: Object.freeze(reasons),
  });
}
