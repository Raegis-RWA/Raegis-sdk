import { Contract, Keypair, Networks } from '@stellar/stellar-sdk';
import {
  AegisClient,
  AssetTokenisationError,
} from '../src/index';

describe('AssetTokenisationModule', () => {
  const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  const makeClient = () =>
    new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId,
    });

  it('normalizes valid metadata and exposes the module on the public client', () => {
    const client = makeClient();
    const metadata = client.assetTokenisation.validateMetadata({
      name: '  Treasury Note  ',
      symbol: ' TN1 ',
      uri: '',
    });

    expect(metadata).toEqual({
      name: 'Treasury Note',
      symbol: 'TN1',
      uri: '',
    });
  });

  it('rejects incomplete metadata with a stable typed error', () => {
    const client = makeClient();

    try {
      client.assetTokenisation.validateMetadata({
        name: ' ',
        symbol: 'TN1',
        uri: '',
      });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AssetTokenisationError);
      expect((error as AssetTokenisationError).code).toBe('INVALID_METADATA');
    }
  });

  it('reports ready only when metadata, lifecycle and pause state permit issuance', async () => {
    const module = makeClient().assetTokenisation;
    const read = jest.spyOn(module as any, 'readContractValue');

    read.mockImplementation(async (method: string) => {
      const values: Record<string, unknown> = {
        get_asset_metadata: { name: 'Treasury Note', symbol: 'TN1', uri: '' },
        get_asset_status: 1,
        is_paused: false,
        get_total_supply: 2500n,
        get_supply_cap: 10000n,
        get_holding_cap: 2500n,
      };
      return values[method];
    });

    const readiness = await module.checkReadiness();

    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.protocolOnly).toBe(true);
    expect(readiness.issuance).toMatchObject({
      lifecycleStatus: 'active',
      contractPaused: false,
      totalSupply: '2500',
      supplyCap: '10000',
      holdingCap: '2500',
    });
  });

  it('surfaces each protocol readiness blocker', async () => {
    const module = makeClient().assetTokenisation;
    const read = jest.spyOn(module as any, 'readContractValue');

    read.mockImplementation(async (method: string) => {
      const values: Record<string, unknown> = {
        get_asset_metadata: { name: '', symbol: '', uri: '' },
        get_asset_status: 'Draft',
        is_paused: true,
        get_total_supply: '0',
        get_supply_cap: '0',
        get_holding_cap: '0',
      };
      return values[method];
    });

    const readiness = await module.checkReadiness();

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map((item) => item.code)).toEqual([
      'METADATA_INCOMPLETE',
      'CONTRACT_PAUSED',
      'ASSET_NOT_ACTIVE',
    ]);
  });

  it('uses the current contract method names and rejects a zero mint amount', () => {
    const module = makeClient().assetTokenisation;
    const caller = Keypair.random().publicKey();
    const recipient = Keypair.random().publicKey();
    const call = jest
      .spyOn(Contract.prototype, 'call')
      .mockImplementation((() => ({ prepared: true })) as any);

    expect(
      module.buildMetadataUpdateOperation(caller, {
        name: 'Treasury Note',
        symbol: 'TN1',
        uri: 'ipfs://metadata',
      })
    ).toEqual({ prepared: true });
    expect(call.mock.calls[0][0]).toBe('update_asset_metadata');

    expect(module.buildMintOperation(caller, recipient, '100')).toEqual({
      prepared: true,
    });
    expect(call.mock.calls[1][0]).toBe('mint_asset');

    expect(() => module.buildMintOperation(caller, recipient, '0')).toThrow(
      AssetTokenisationError
    );
  });
});
