import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { ContractEventInput } from '../../src/types/contract-event';
import { MOCK_CONTRACT_ID } from '../../src/testing/fixtures';

const adminKeypair = Keypair.random();
const investorKeypair = Keypair.random();
const recipientKeypair = Keypair.random();

const MOCK_TX_HASH = 'a'.repeat(64);
const ADMIN_ADDRESS = adminKeypair.publicKey();
const INVESTOR_ADDRESS = investorKeypair.publicKey();
const RECIPIENT_ADDRESS = recipientKeypair.publicKey();

function symbolTopic(name: string): string {
  return nativeToScVal(name, { type: 'symbol' }).toXDR('base64');
}

function addressTopic(address: string): string {
  return nativeToScVal(address, { type: 'address' }).toXDR('base64');
}

function encodeValue(value: unknown): string {
  return nativeToScVal(value).toXDR('base64');
}

function baseEvent(
  topic: string[],
  value: string,
  overrides: Partial<ContractEventInput> = {}
): ContractEventInput {
  return {
    contractId: MOCK_CONTRACT_ID,
    txHash: MOCK_TX_HASH,
    ledger: 12345,
    inSuccessfulContractCall: true,
    topic,
    value,
    ...overrides,
  };
}

export const contractEventFixtures = {
  addresses: {
    admin: ADMIN_ADDRESS,
    investor: INVESTOR_ADDRESS,
    recipient: RECIPIENT_ADDRESS,
  },
  whitelistAdd: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('whitelist_add'), addressTopic(INVESTOR_ADDRESS)],
      encodeValue({ admin: ADMIN_ADDRESS })
    ),
  whitelistRemove: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('whitelist_remove'), addressTopic(INVESTOR_ADDRESS)],
      encodeValue({ admin: ADMIN_ADDRESS })
    ),
  mint: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('mint'), addressTopic(RECIPIENT_ADDRESS)],
      encodeValue(1_000_000_000n)
    ),
  mintAssetWithOperator: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('mint_asset'), addressTopic(RECIPIENT_ADDRESS)],
      encodeValue({
        amount: 2_500_000_000n,
        operator: ADMIN_ADDRESS,
        asset_id: 'RWA-2026-001',
      })
    ),
  transfer: (): ContractEventInput =>
    baseEvent(
      [
        symbolTopic('transfer'),
        addressTopic(INVESTOR_ADDRESS),
        addressTopic(RECIPIENT_ADDRESS),
      ],
      encodeValue(750_000_000n)
    ),
  protocolPause: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('protocol_pause')],
      encodeValue({ contract_id: MOCK_CONTRACT_ID, admin: ADMIN_ADDRESS })
    ),
  protocolUnpause: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('protocol_unpause')],
      encodeValue({ contract_id: MOCK_CONTRACT_ID, admin: ADMIN_ADDRESS })
    ),
  assetRegister: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('asset_register'), symbolTopic('RWA-2026-001')],
      encodeValue({ admin: ADMIN_ADDRESS })
    ),
  assetMetadata: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('asset_metadata'), symbolTopic('RWA-2026-001')],
      encodeValue({
        asset_id: 'RWA-2026-001',
        symbol: 'AEGIS-RWA',
        name: 'Aegis Tokenized Real Estate',
        decimals: 7,
        category: 'Real Estate',
        is_rwa: true,
      })
    ),
  roleGrant: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('role_grant'), addressTopic(INVESTOR_ADDRESS), symbolTopic('issuer')],
      encodeValue({ admin: ADMIN_ADDRESS })
    ),
  roleRevoke: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('role_revoke'), addressTopic(INVESTOR_ADDRESS), symbolTopic('issuer')],
      encodeValue({ admin: ADMIN_ADDRESS })
    ),
  unknownTopic: (): ContractEventInput =>
    baseEvent(
      [symbolTopic('future_protocol_upgrade')],
      encodeValue({ version: 2 })
    ),
  malformedValue: (): ContractEventInput =>
    baseEvent([symbolTopic('transfer'), addressTopic(INVESTOR_ADDRESS)], 'not-valid-xdr'),
};

export function buildMintEventTopics(): string[] {
  return contractEventFixtures.mint().topic as string[];
}

export function buildMintEventValue(): string {
  return contractEventFixtures.mint().value as string;
}

export function scValToTopicBase64(scVal: xdr.ScVal): string {
  return scVal.toXDR('base64');
}
