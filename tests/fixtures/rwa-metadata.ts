export const VALID_RWA_ISSUER =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export const validRwaAssetMetadataInput = {
  issuer: VALID_RWA_ISSUER,
  symbol: 'UST-6M',
  name: 'Tokenized Treasury Fund',
  status: 'active',
  supply: '1000000000000',
} as const;
