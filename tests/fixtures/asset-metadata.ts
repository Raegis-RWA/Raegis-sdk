export const validRwaAssetMetadataFixture = {
  symbol: ' AEGIS-RWA ',
  name: ' Aegis Tokenized Real Estate ',
  decimals: 7,
  isRwa: true,
  category: ' Real Estate ',
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  futureField: 'ignored for forward compatibility',
};

export const minimalRwaAssetMetadataFixture = {
  symbol: 'RWA',
  name: 'Real World Asset',
  decimals: 0,
  isRwa: false,
};

export const invalidRwaAssetMetadataFixtures = {
  missingAndInvalidRequired: {
    symbol: '   ',
    decimals: -1,
    isRwa: 'yes',
  },
  invalidOptionalFields: {
    symbol: 'RWA',
    name: 'Real World Asset',
    decimals: 7,
    isRwa: true,
    category: '   ',
    contractId: 42,
  },
};
