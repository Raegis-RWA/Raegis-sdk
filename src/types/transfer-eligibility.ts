export type WhitelistObservationState =
  | 'approved'
  | 'not_approved'
  | 'unknown'
  | 'unavailable';

export type WhitelistObservationCode =
  | 'WHITELIST_APPROVED'
  | 'WHITELIST_NOT_APPROVED'
  | 'WHITELIST_STATUS_UNKNOWN'
  | 'WHITELIST_QUERY_FAILED';

export interface WhitelistObservation {
  address: string;
  state: WhitelistObservationState;
  isWhitelisted: boolean | null;
  code: WhitelistObservationCode;
  observedAt: string;
}

export type InvestorTransferEligibilityState =
  | 'eligible'
  | 'ineligible'
  | 'unknown'
  | 'unavailable';

export type InvestorTransferEligibilityCode =
  | 'ELIGIBLE'
  | 'INVALID_SOURCE_ADDRESS'
  | 'INVALID_DESTINATION_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'SOURCE_NOT_WHITELISTED'
  | 'DESTINATION_NOT_WHITELISTED'
  | 'SOURCE_STATUS_UNKNOWN'
  | 'DESTINATION_STATUS_UNKNOWN'
  | 'SOURCE_QUERY_FAILED'
  | 'DESTINATION_QUERY_FAILED';

export interface InvestorTransferEligibility {
  source: string;
  destination: string;
  amount: number;
  state: InvestorTransferEligibilityState;
  isEligible: boolean;
  code: InvestorTransferEligibilityCode;
  reason?: string;
  observedAt: string;
}
