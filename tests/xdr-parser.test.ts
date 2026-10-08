import { nativeToScVal } from '@stellar/stellar-sdk';
import { parseSorobanResult } from '../src/utils/xdr-parser';

describe('parseSorobanResult', () => {
  it('accepts parsed ScVal results from current Stellar simulations', () => {
    expect(parseSorobanResult(nativeToScVal(true))).toBe(true);
  });
});
