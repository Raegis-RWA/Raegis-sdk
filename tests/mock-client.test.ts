import {
  createMockAegisClient,
  createMockFixtures,
  MOCK_CONTRACT_ID,
  MOCK_SECONDARY_CONTRACT_ID,
  MOCK_TX_HASH_PREFIX,
} from '../src/testing';

describe('MockAegisClient', () => {
  describe('ComplianceModule', () => {
    it('returns whitelist status from in-memory state', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient();

      client.setWhitelisted(fixtures.investorAddress, true);

      await expect(
        client.compliance.checkWhitelist(fixtures.investorAddress)
      ).resolves.toBe(true);
      await expect(
        client.compliance.checkWhitelist(fixtures.secondaryInvestorAddress)
      ).resolves.toBe(false);
    });

    it('supports deterministic batch compliance queries', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient();
      client.setWhitelisted(fixtures.investorAddress, true);

      const result = await client.compliance.checkWhitelistBatch([
        fixtures.investorAddress,
        'invalid input must stay per-item',
        fixtures.secondaryInvestorAddress,
      ]);

      expect(result.items.map((item) => item.status)).toEqual([
        'whitelisted',
        'invalid-address',
        'not-whitelisted',
      ]);
      expect(result.summary).toMatchObject({
        requested: 3,
        queried: 2,
        invalid: 1,
        failed: 0,
      });
    });

    it('throws when compliance failure simulation is enabled', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient({ simulateComplianceFailure: true });

      client.setWhitelisted(fixtures.investorAddress, true);

      await expect(
        client.compliance.checkWhitelist(fixtures.investorAddress)
      ).rejects.toThrow('Mock compliance RPC failure.');
    });
  });

  describe('AssetModule (transaction receipts)', () => {
    it('mints tokens and records a mock transaction receipt', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient({ keypair: fixtures.signer });

      const hash = await client.asset.mint(fixtures.investorAddress, 1000);

      expect(hash).toMatch(new RegExp(`^${MOCK_TX_HASH_PREFIX}mint_\\d+$`));
      expect(client.transactions).toHaveLength(1);
      expect(client.transactions[0]).toMatchObject({
        type: 'mint',
        from: fixtures.signer.publicKey(),
        to: fixtures.investorAddress,
        amount: 1000,
      });
      expect(client._getBalance(fixtures.investorAddress, MOCK_CONTRACT_ID)).toBe(
        '1000'
      );
    });

    it('transfers tokens between whitelisted addresses', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient({ keypair: fixtures.signer });

      client.setWhitelisted(fixtures.signer.publicKey(), true);
      client.setWhitelisted(fixtures.secondaryInvestorAddress, true);
      client.setBalance(fixtures.signer.publicKey(), '5000');

      const hash = await client.asset.transfer(fixtures.secondaryInvestorAddress, 2000);

      expect(hash).toMatch(new RegExp(`^${MOCK_TX_HASH_PREFIX}transfer_\\d+$`));
      expect(client._getBalance(fixtures.signer.publicKey(), MOCK_CONTRACT_ID)).toBe(
        '3000'
      );
      expect(
        client._getBalance(fixtures.secondaryInvestorAddress, MOCK_CONTRACT_ID)
      ).toBe('2000');
    });

    it('rejects transfer when either party is not whitelisted', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient({ keypair: fixtures.signer });

      client.setBalance(fixtures.signer.publicKey(), '5000');

      await expect(
        client.asset.transfer(fixtures.secondaryInvestorAddress, 100)
      ).rejects.toThrow('sender is not whitelisted');

      client.setWhitelisted(fixtures.signer.publicKey(), true);

      await expect(
        client.asset.transfer(fixtures.secondaryInvestorAddress, 100)
      ).rejects.toThrow('recipient is not whitelisted');
    });

    it('requires a signer for write operations', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient();

      await expect(client.asset.mint(fixtures.investorAddress, 100)).rejects.toThrow(
        'Transaction signing requires a Keypair'
      );
    });
  });

  describe('InvestorModule (portfolio read model)', () => {
    it('builds an active portfolio for a whitelisted investor with balances', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient();

      client.setWhitelisted(fixtures.investorAddress, true);
      client.setBalance(fixtures.investorAddress, '5000000000');

      const portfolio = await client.investor.getPortfolio(fixtures.investorAddress);

      expect(portfolio.status).toBe('active');
      expect(portfolio.isKycApproved).toBe(true);
      expect(portfolio.isBlocked).toBe(false);
      expect(portfolio.holdings[0].balance).toBe('5000000000');
      expect(portfolio.holdings[0].formattedBalance).toBe('500.00');
      expect(portfolio.holdings[0].transferEligibility.isEligible).toBe(true);
    });

    it('returns empty status when investor has zero balances', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient();

      client.setWhitelisted(fixtures.investorAddress, true);

      const portfolio = await client.investor.getPortfolio(fixtures.investorAddress);

      expect(portfolio.status).toBe('empty');
      expect(portfolio.holdings[0].transferEligibility.code).toBe('ZERO_BALANCE');
    });

    it('returns blocked status when investor is not whitelisted', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient();

      client.setBalance(fixtures.investorAddress, '1000000000');

      const portfolio = await client.investor.getPortfolio(fixtures.investorAddress);

      expect(portfolio.status).toBe('blocked');
      expect(portfolio.isKycApproved).toBe(false);
      expect(portfolio.holdings[0].transferEligibility.code).toBe('NOT_WHITELISTED');
    });

    it('returns unavailable status when compliance query fails', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient({ simulateComplianceFailure: true });

      const portfolio = await client.investor.getPortfolio(fixtures.investorAddress);

      expect(portfolio.status).toBe('unavailable');
      expect(portfolio.error).toContain('Compliance status query failed');
    });

    it('supports multiple asset contracts via options', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient();

      client.setWhitelisted(fixtures.investorAddress, true);
      client.setBalance(fixtures.investorAddress, '1000000000', MOCK_CONTRACT_ID);
      client.setBalance(
        fixtures.investorAddress,
        '2000000000',
        MOCK_SECONDARY_CONTRACT_ID
      );

      const portfolio = await client.investor.getPortfolio(fixtures.investorAddress, {
        assetContractIds: [MOCK_CONTRACT_ID, MOCK_SECONDARY_CONTRACT_ID],
      });

      expect(portfolio.totalHoldingsCount).toBe(2);
      expect(portfolio.holdings.map((h) => h.balance)).toEqual([
        '1000000000',
        '2000000000',
      ]);
    });
  });

  describe('Helpers', () => {
    it('createMockFixtures generates ephemeral keypairs without fixed secrets', () => {
      const first = createMockFixtures();
      const second = createMockFixtures();

      expect(first.investorAddress).not.toBe(second.investorAddress);
      expect(first.signer.secret()).not.toBe(second.signer.secret());
    });

    it('reset clears state and transaction history', async () => {
      const fixtures = createMockFixtures();
      const client = createMockAegisClient({ keypair: fixtures.signer });

      client.setWhitelisted(fixtures.investorAddress, true);
      client.setBalance(fixtures.investorAddress, '1000');
      await client.asset.mint(fixtures.investorAddress, 500);

      client.reset();

      expect(client.transactions).toHaveLength(0);
      await expect(
        client.compliance.checkWhitelist(fixtures.investorAddress)
      ).resolves.toBe(false);
      expect(client._getBalance(fixtures.investorAddress, MOCK_CONTRACT_ID)).toBe(
        '0'
      );
    });
  });
});
