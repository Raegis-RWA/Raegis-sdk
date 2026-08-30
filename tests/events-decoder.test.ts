import {
  decodeContractEvent,
  decodeContractEvents,
  EventDecodeError,
  isKnownAegisEventTopic,
  normalizeEventTopicName,
} from '../src';
import { contractEventFixtures } from './fixtures/contract-events';

describe('Contract event decoder', () => {
  describe('compliance events', () => {
    it('decodes whitelist_add events', () => {
      const decoded = decodeContractEvent(contractEventFixtures.whitelistAdd());

      expect(decoded).toMatchObject({
        kind: 'compliance',
        action: 'whitelist_add',
        address: contractEventFixtures.addresses.investor,
        admin: contractEventFixtures.addresses.admin,
        eventName: 'whitelist_add',
      });
    });

    it('decodes whitelist_remove events', () => {
      const decoded = decodeContractEvent(contractEventFixtures.whitelistRemove());

      expect(decoded).toMatchObject({
        kind: 'compliance',
        action: 'whitelist_remove',
        address: contractEventFixtures.addresses.investor,
      });
    });
  });

  describe('mint and transfer events', () => {
    it('decodes mint events with topic recipient and amount value', () => {
      const decoded = decodeContractEvent(contractEventFixtures.mint());

      expect(decoded).toMatchObject({
        kind: 'mint',
        to: contractEventFixtures.addresses.recipient,
        amount: '1000000000',
      });
    });

    it('decodes mint_asset events with operator and asset metadata', () => {
      const decoded = decodeContractEvent(contractEventFixtures.mintAssetWithOperator());

      expect(decoded).toMatchObject({
        kind: 'mint',
        to: contractEventFixtures.addresses.recipient,
        amount: '2500000000',
        operator: contractEventFixtures.addresses.admin,
        assetId: 'RWA-2026-001',
      });
    });

    it('decodes transfer events', () => {
      const decoded = decodeContractEvent(contractEventFixtures.transfer());

      expect(decoded).toMatchObject({
        kind: 'transfer',
        from: contractEventFixtures.addresses.investor,
        to: contractEventFixtures.addresses.recipient,
        amount: '750000000',
      });
    });
  });

  describe('admin events', () => {
    it('decodes protocol pause and unpause events', () => {
      const pause = decodeContractEvent(contractEventFixtures.protocolPause());
      const unpause = decodeContractEvent(contractEventFixtures.protocolUnpause());

      expect(pause).toMatchObject({
        kind: 'admin',
        action: 'protocol_pause',
        contractId: expect.any(String),
        admin: contractEventFixtures.addresses.admin,
      });
      expect(unpause).toMatchObject({
        kind: 'admin',
        action: 'protocol_unpause',
      });
    });

    it('decodes asset registration events', () => {
      const decoded = decodeContractEvent(contractEventFixtures.assetRegister());

      expect(decoded).toMatchObject({
        kind: 'admin',
        action: 'asset_register',
        assetId: 'RWA-2026-001',
        admin: contractEventFixtures.addresses.admin,
      });
    });
  });

  describe('asset metadata events', () => {
    it('decodes asset metadata update events', () => {
      const decoded = decodeContractEvent(contractEventFixtures.assetMetadata());

      expect(decoded).toMatchObject({
        kind: 'asset_metadata',
        assetId: 'RWA-2026-001',
        symbol: 'AEGIS-RWA',
        name: 'Aegis Tokenized Real Estate',
        decimals: 7,
        category: 'Real Estate',
        isRwa: true,
      });
    });
  });

  describe('role events', () => {
    it('decodes role grant and revoke events', () => {
      const grant = decodeContractEvent(contractEventFixtures.roleGrant());
      const revoke = decodeContractEvent(contractEventFixtures.roleRevoke());

      expect(grant).toMatchObject({
        kind: 'role',
        action: 'role_grant',
        address: contractEventFixtures.addresses.investor,
        role: 'issuer',
        admin: contractEventFixtures.addresses.admin,
      });

      expect(revoke).toMatchObject({
        kind: 'role',
        action: 'role_revoke',
        address: contractEventFixtures.addresses.investor,
        role: 'issuer',
        admin: contractEventFixtures.addresses.admin,
      });
    });
  });

  describe('unknown fallback', () => {
    it('returns unknown events for unsupported topics', () => {
      const decoded = decodeContractEvent(contractEventFixtures.unknownTopic());

      expect(decoded.kind).toBe('unknown');
      if (decoded.kind === 'unknown') {
        expect(decoded.eventName).toBe('future_protocol_upgrade');
        expect(decoded.reason).toContain('Unsupported');
        expect(decoded.rawValue).toEqual({ version: 2n });
      }
    });

    it('returns unknown events when value payload cannot be decoded', () => {
      const decoded = decodeContractEvent(contractEventFixtures.malformedValue());

      expect(decoded.kind).toBe('unknown');
      if (decoded.kind === 'unknown') {
        expect(decoded.reason).toContain('decode');
      }
    });

    it('throws in strict mode for unsupported topics', () => {
      expect(() =>
        decodeContractEvent(contractEventFixtures.unknownTopic(), { strict: true })
      ).toThrow(EventDecodeError);
    });
  });

  describe('topic helpers', () => {
    it('normalises known aliases', () => {
      expect(normalizeEventTopicName('whitelist_added')).toBe('whitelist_add');
      expect(normalizeEventTopicName('register_asset')).toBe('asset_register');
      expect(isKnownAegisEventTopic('transfer')).toBe(true);
      expect(isKnownAegisEventTopic('future_protocol_upgrade')).toBe(false);
    });
  });

  describe('batch decoding', () => {
    it('decodes multiple events in order', () => {
      const decoded = decodeContractEvents([
        contractEventFixtures.whitelistAdd(),
        contractEventFixtures.mint(),
        contractEventFixtures.transfer(),
      ]);

      expect(decoded.map((event) => event.kind)).toEqual([
        'compliance',
        'mint',
        'transfer',
      ]);
    });
  });

  describe('envelope metadata', () => {
    it('preserves contract, ledger, and transaction metadata', () => {
      const fixture = contractEventFixtures.transfer();
      const decoded = decodeContractEvent(fixture);

      expect(decoded.contractId).toBe(fixture.contractId);
      expect(decoded.txHash).toBe(fixture.txHash);
      expect(decoded.ledger).toBe(fixture.ledger);
      expect(decoded.inSuccessfulContractCall).toBe(true);
      expect(decoded.decodedAt).toEqual(expect.any(String));
    });
  });
});
