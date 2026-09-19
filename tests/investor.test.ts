import { AegisClient } from '../src/client';
import { InvestorModule } from '../src/investor/portfolio';
import { Networks, Keypair, rpc, xdr, nativeToScVal, StrKey, Transaction } from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: jest.fn(),
      })),
      Api: {
        ...original.rpc.Api,
        isSimulationSuccess: jest.fn(),
      },
    },
  };
});

describe('InvestorModule (Portfolio Read Model)', () => {
  let client: AegisClient;
  let mockRpcServer: any;

  const mockContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
  const mockInvestorAddress = Keypair.random().publicKey();

  beforeEach(() => {
    jest.clearAllMocks();

    client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: mockContractId,
    });

    mockRpcServer = client.rpcServer;
  });

  describe('Active Portfolio', () => {
    it('should correctly build an active portfolio for a whitelisted investor with balances', async () => {
      (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);

      const trueScValBase64 = xdr.ScVal.scvBool(true).toXDR('base64');
      const balanceScValBase64 = xdr.ScVal.scvI128(
        new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('5000000000') })
      ).toXDR('base64');

      mockRpcServer.simulateTransaction
        .mockResolvedValueOnce({
          result: { retval: trueScValBase64 },
        })
        .mockResolvedValueOnce({
          result: { retval: balanceScValBase64 },
        });

      const portfolio = await client.investor.getPortfolio(mockInvestorAddress);

      expect(portfolio.investorAddress).toBe(mockInvestorAddress);
      expect(portfolio.status).toBe('active');
      expect(portfolio.isKycApproved).toBe(true);
      expect(portfolio.isBlocked).toBe(false);
      expect(portfolio.totalHoldingsCount).toBe(1);
      expect(portfolio.compliantHoldingsCount).toBe(1);

      const holding = portfolio.holdings[0];
      expect(holding.assetId).toBe(mockContractId);
      expect(holding.balance).toBe('5000000000');
      expect(holding.formattedBalance).toBe('500.00');
      expect(holding.isCompliant).toBe(true);
      expect(holding.transferEligibility.isEligible).toBe(true);
    });
  });

  describe('Empty Portfolio', () => {
    it('should return an empty status portfolio when investor has zero balances', async () => {
      (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);

      const trueScValBase64 = xdr.ScVal.scvBool(true).toXDR('base64');
      const zeroBalanceScValBase64 = xdr.ScVal.scvI128(
        new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('0') })
      ).toXDR('base64');

      mockRpcServer.simulateTransaction
        .mockResolvedValueOnce({
          result: { retval: trueScValBase64 },
        })
        .mockResolvedValueOnce({
          result: { retval: zeroBalanceScValBase64 },
        });

      const portfolio = await client.investor.getPortfolio(mockInvestorAddress);

      expect(portfolio.status).toBe('empty');
      expect(portfolio.isKycApproved).toBe(true);
      expect(portfolio.isBlocked).toBe(false);
      expect(portfolio.holdings[0].balance).toBe('0');
      expect(portfolio.holdings[0].formattedBalance).toBe('0.00');
      expect(portfolio.holdings[0].transferEligibility.isEligible).toBe(false);
      expect(portfolio.holdings[0].transferEligibility.code).toBe('ZERO_BALANCE');
    });
  });

  describe('Blocked Portfolio', () => {
    it('should return a blocked portfolio state when investor fails KYC/whitelist check', async () => {
      (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);

      const falseScValBase64 = xdr.ScVal.scvBool(false).toXDR('base64');
      const balanceScValBase64 = xdr.ScVal.scvI128(
        new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('1000000000') })
      ).toXDR('base64');

      mockRpcServer.simulateTransaction
        .mockResolvedValueOnce({
          result: { retval: falseScValBase64 },
        })
        .mockResolvedValueOnce({
          result: { retval: balanceScValBase64 },
        });

      const portfolio = await client.investor.getPortfolio(mockInvestorAddress);

      expect(portfolio.status).toBe('blocked');
      expect(portfolio.isKycApproved).toBe(false);
      expect(portfolio.isBlocked).toBe(true);
      expect(portfolio.holdings[0].isCompliant).toBe(false);
      expect(portfolio.holdings[0].transferEligibility.isEligible).toBe(false);
      expect(portfolio.holdings[0].transferEligibility.code).toBe('NOT_WHITELISTED');
    });
  });

  describe('Unavailable Portfolio', () => {
    it('should safely return unavailable status when RPC simulation fails', async () => {
      mockRpcServer.simulateTransaction.mockRejectedValue(new Error('Network RPC Connection Timeout'));

      const portfolio = await client.investor.getPortfolio(mockInvestorAddress);

      expect(portfolio.status).toBe('unavailable');
      expect(portfolio.isKycApproved).toBe(false);
      expect(portfolio.isBlocked).toBe(true);
      expect(portfolio.error).toBe(
        'Compliance status query failed: The network request timed out.'
      );
      expect(portfolio.error).not.toContain('Network RPC Connection Timeout');
      expect(portfolio.holdings).toHaveLength(0);
    });

    it('should handle invalid investor address gracefully', async () => {
      const portfolio = await client.investor.getPortfolio('');

      expect(portfolio.status).toBe('unavailable');
      expect(portfolio.error).toContain('Invalid investor address');
    });
  });

  describe('Balance simulation request shape', () => {
    /**
     * Regression test for issue #66 ("incorrect RPC formatting"): the balance
     * lookup used to call `simulateTransaction({ transaction: call as any }
     * as any)` — a wrapper object around an unbuilt operation — instead of a
     * real built `Transaction`. Assert the real shape so it can't regress.
     */
    it('calls simulateTransaction with a real built Transaction for the balance query', async () => {
      (rpc.Api.isSimulationSuccess as unknown as jest.Mock).mockReturnValue(true);

      const trueScValBase64 = xdr.ScVal.scvBool(true).toXDR('base64');
      const balanceScValBase64 = xdr.ScVal.scvI128(
        new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('0') })
      ).toXDR('base64');

      mockRpcServer.simulateTransaction
        .mockResolvedValueOnce({ result: { retval: trueScValBase64 } })
        .mockResolvedValueOnce({ result: { retval: balanceScValBase64 } });

      await client.investor.getPortfolio(mockInvestorAddress);

      expect(mockRpcServer.simulateTransaction).toHaveBeenCalledTimes(2);
      const balanceCallArg = mockRpcServer.simulateTransaction.mock.calls[1][0];
      expect(balanceCallArg).toBeInstanceOf(Transaction);
      expect(balanceCallArg.networkPassphrase).toBe(Networks.TESTNET);
    });
  });
});
