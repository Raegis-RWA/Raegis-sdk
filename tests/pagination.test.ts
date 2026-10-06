import { AegisClient } from '../src/client';
import { PaginationValidationError } from '../src/errors/pagination';
import {
  paginateArray,
  resolvePaginationRequest,
} from '../src/utils/pagination';
import { AssetHolding, InvestorPortfolio } from '../src/types/portfolio';
import { contractEventFixtures } from './fixtures/contract-events';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        getEvents: jest.fn(),
      })),
    },
  };
});

function expectPaginationError(
  action: () => unknown,
  code: 'INVALID_CURSOR' | 'INVALID_LIMIT',
  field: 'cursor' | 'limit'
): void {
  try {
    action();
    throw new Error('expected pagination validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(PaginationValidationError);
    expect(error).toMatchObject({ code, field });
  }
}

function holding(assetId: string): AssetHolding {
  return {
    assetId,
    balance: '1',
    formattedBalance: '0.00',
    metadata: {
      symbol: assetId,
      name: assetId,
      decimals: 7,
      isRwa: true,
    },
    isCompliant: true,
    transferEligibility: { isEligible: true },
  };
}

describe('typed pagination', () => {
  it('normalizes a valid request and applies the shared default limit', () => {
    expect(resolvePaginationRequest()).toEqual({ limit: 100 });
    expect(
      resolvePaginationRequest({ cursor: 'opaque-cursor', limit: 25 })
    ).toEqual({ cursor: 'opaque-cursor', limit: 25 });
  });

  it('rejects empty cursors and unsafe limits with typed errors', () => {
    expectPaginationError(
      () => resolvePaginationRequest({ cursor: '   ' }),
      'INVALID_CURSOR',
      'cursor'
    );
    expectPaginationError(
      () => resolvePaginationRequest({ limit: 0 }),
      'INVALID_LIMIT',
      'limit'
    );
    expectPaginationError(
      () => resolvePaginationRequest({ limit: 1.5 }),
      'INVALID_LIMIT',
      'limit'
    );
    expectPaginationError(
      () => resolvePaginationRequest({ limit: 10_001 }),
      'INVALID_LIMIT',
      'limit'
    );
  });

  it('pages an in-memory read model with known continuation state', () => {
    const first = paginateArray(['a', 'b', 'c'], { limit: 2 });

    expect(first.items).toEqual(['a', 'b']);
    expect(first.pagination.continuation).toEqual({
      state: 'available',
      cursor: 'offset:2',
    });

    if (first.pagination.continuation.state !== 'available') {
      throw new Error('expected a continuation cursor');
    }

    const second = paginateArray(['a', 'b', 'c'], {
      cursor: first.pagination.continuation.cursor,
      limit: 2,
    });

    expect(second.items).toEqual(['c']);
    expect(second.pagination.continuation).toEqual({ state: 'complete' });
  });

  it('exposes the same helper through InvestorModule holdings', () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    });
    const portfolio: InvestorPortfolio = {
      investorAddress: 'GTEST',
      status: 'active',
      totalHoldingsCount: 3,
      compliantHoldingsCount: 3,
      holdings: [holding('one'), holding('two'), holding('three')],
      isKycApproved: true,
      isBlocked: false,
      fetchedAt: '2026-10-06T00:00:00.000Z',
    };

    const page = client.investor.paginateHoldings(portfolio, { limit: 2 });

    expect(page.items.map((item) => item.assetId)).toEqual(['one', 'two']);
    expect(page.pagination.continuation).toEqual({
      state: 'available',
      cursor: 'offset:2',
    });
  });

  it('forwards validated event pagination and reports unknown continuation', async () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    });
    const mockGetEvents = client.rpcServer.getEvents as jest.Mock;
    const fixture = contractEventFixtures.transfer();
    mockGetEvents.mockResolvedValue({
      latestLedger: 999,
      events: [
        {
          contractId: fixture.contractId,
          txHash: fixture.txHash,
          ledger: fixture.ledger,
          inSuccessfulContractCall: true,
          topic: fixture.topic,
          value: fixture.value,
          pagingToken: 'rpc-next',
        },
      ],
    });

    const result = await client.events.fetchAndDecode(
      { filters: [{ type: 'contract', contractIds: [fixture.contractId!] }] },
      { cursor: 'rpc-current', limit: 25 }
    );

    expect(mockGetEvents).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'rpc-current', limit: 25 })
    );
    expect(result.events[0]).toMatchObject({ kind: 'transfer' });
    expect(result.pagination).toEqual({
      request: { cursor: 'rpc-current', limit: 25 },
      continuation: { state: 'unknown', cursor: 'rpc-next' },
    });
  });

  it('rejects a Soroban event cursor combined with startLedger before I/O', async () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    });
    const mockGetEvents = client.rpcServer.getEvents as jest.Mock;

    await expect(
      client.events.fetchAndDecode(
        { filters: [], startLedger: 1 },
        { cursor: 'rpc-current', limit: 25 }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
      field: 'cursor',
    });
    expect(mockGetEvents).not.toHaveBeenCalled();
  });
});
