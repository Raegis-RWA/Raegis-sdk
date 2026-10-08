import { StrKey } from '@stellar/stellar-sdk';
import { InvestorModule } from '../src/investor/portfolio';
import type { WhitelistObservation } from '../src/types/transfer-eligibility';

const SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const DESTINATION = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));
const INVALID_CHECKSUM_SOURCE = `${SOURCE.slice(0, -1)}${SOURCE.endsWith('A') ? 'B' : 'A'}`;

function observation(
  address: string,
  state: WhitelistObservation['state'],
): WhitelistObservation {
  const code = {
    approved: 'WHITELIST_APPROVED',
    not_approved: 'WHITELIST_NOT_APPROVED',
    unknown: 'WHITELIST_STATUS_UNKNOWN',
    unavailable: 'WHITELIST_QUERY_FAILED',
  }[state] as WhitelistObservation['code'];

  return {
    address,
    state,
    isWhitelisted: state === 'approved' ? true : state === 'not_approved' ? false : null,
    code,
    observedAt: '2026-10-06T00:00:00Z',
  };
}

function moduleWith(
  responses: Record<string, WhitelistObservation>,
) {
  const observeWhitelist = jest.fn(async (address: string) => responses[address]);
  const client = { compliance: { observeWhitelist } } as any;
  return { investor: new InvestorModule(client), observeWhitelist };
}

describe('InvestorModule.checkTransferEligibility', () => {
  it('rejects malformed source before network work', async () => {
    const { investor, observeWhitelist } = moduleWith({});
    const result = await investor.checkTransferEligibility('bad', DESTINATION, 1);

    expect(result).toMatchObject({
      state: 'ineligible',
      isEligible: false,
      code: 'INVALID_SOURCE_ADDRESS',
    });
    expect(observeWhitelist).not.toHaveBeenCalled();
  });

  it('rejects checksum-invalid source before network work', async () => {
    const { investor, observeWhitelist } = moduleWith({});
    const result = await investor.checkTransferEligibility(
      INVALID_CHECKSUM_SOURCE,
      DESTINATION,
      1,
    );

    expect(result).toMatchObject({
      state: 'ineligible',
      isEligible: false,
      code: 'INVALID_SOURCE_ADDRESS',
    });
    expect(observeWhitelist).not.toHaveBeenCalled();
  });

  it('rejects non-positive amounts before network work', async () => {
    const { investor, observeWhitelist } = moduleWith({});
    const result = await investor.checkTransferEligibility(SOURCE, DESTINATION, 0);

    expect(result.code).toBe('INVALID_AMOUNT');
    expect(observeWhitelist).not.toHaveBeenCalled();
  });

  it('short-circuits when the source is not whitelisted', async () => {
    const { investor, observeWhitelist } = moduleWith({
      [SOURCE]: observation(SOURCE, 'not_approved'),
    });

    const result = await investor.checkTransferEligibility(SOURCE, DESTINATION, 5);

    expect(result.code).toBe('SOURCE_NOT_WHITELISTED');
    expect(observeWhitelist).toHaveBeenCalledTimes(1);
    expect(observeWhitelist).toHaveBeenCalledWith(SOURCE);
  });

  it('preserves unknown source status', async () => {
    const { investor, observeWhitelist } = moduleWith({
      [SOURCE]: observation(SOURCE, 'unknown'),
    });

    const result = await investor.checkTransferEligibility(SOURCE, DESTINATION, 5);

    expect(result).toMatchObject({
      state: 'unknown',
      code: 'SOURCE_STATUS_UNKNOWN',
      isEligible: false,
    });
    expect(observeWhitelist).toHaveBeenCalledTimes(1);
  });

  it('preserves unavailable source status', async () => {
    const { investor } = moduleWith({
      [SOURCE]: observation(SOURCE, 'unavailable'),
    });

    await expect(
      investor.checkTransferEligibility(SOURCE, DESTINATION, 5),
    ).resolves.toMatchObject({
      state: 'unavailable',
      code: 'SOURCE_QUERY_FAILED',
      isEligible: false,
    });
  });

  it('checks destination only after the source is eligible', async () => {
    const { investor, observeWhitelist } = moduleWith({
      [SOURCE]: observation(SOURCE, 'approved'),
      [DESTINATION]: observation(DESTINATION, 'not_approved'),
    });

    const result = await investor.checkTransferEligibility(SOURCE, DESTINATION, 5);

    expect(result.code).toBe('DESTINATION_NOT_WHITELISTED');
    expect(observeWhitelist.mock.calls.map(([address]) => address)).toEqual([
      SOURCE,
      DESTINATION,
    ]);
  });

  it('reports eligible only when both parties are explicitly approved', async () => {
    const { investor } = moduleWith({
      [SOURCE]: observation(SOURCE, 'approved'),
      [DESTINATION]: observation(DESTINATION, 'approved'),
    });

    await expect(
      investor.checkTransferEligibility(SOURCE, DESTINATION, 5),
    ).resolves.toMatchObject({
      state: 'eligible',
      code: 'ELIGIBLE',
      isEligible: true,
    });
  });
});
