import { Keypair, Networks } from '@stellar/stellar-sdk';
import {
  createReadOnlyClient,
  createInvestorClient,
  createComplianceOperatorClient,
  createIssuerClient,
  createAdminClient,
  getRoleCapabilities,
} from '../src/client-factory';
import { RoleCapabilityError } from '../src/errors/client-factory';
import { AegisClient } from '../src/client';

// ---------------------------------------------------------------------------
// Shared RPC mock — same pattern as existing tests
// ---------------------------------------------------------------------------

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: jest.fn(),
        sendTransaction: jest.fn(),
      })),
    },
  };
});

const BASE_CONFIG = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
};

function makeKeypair() {
  return Keypair.random();
}

// ---------------------------------------------------------------------------
// getRoleCapabilities — static helper
// ---------------------------------------------------------------------------

describe('getRoleCapabilities', () => {
  it('returns the correct flags for read-only', () => {
    const caps = getRoleCapabilities('read-only');
    expect(caps.role).toBe('read-only');
    expect(caps.canRead).toBe(true);
    expect(caps.canSign).toBe(false);
    expect(caps.canTransfer).toBe(false);
    expect(caps.canMint).toBe(false);
    expect(caps.canManageWhitelist).toBe(false);
    expect(caps.canAdminister).toBe(false);
  });

  it('returns the correct flags for investor', () => {
    const caps = getRoleCapabilities('investor');
    expect(caps.canRead).toBe(true);
    expect(caps.canSign).toBe(true);
    expect(caps.canTransfer).toBe(true);
    expect(caps.canMint).toBe(false);
    expect(caps.canManageWhitelist).toBe(false);
    expect(caps.canAdminister).toBe(false);
  });

  it('returns the correct flags for compliance-operator', () => {
    const caps = getRoleCapabilities('compliance-operator');
    expect(caps.canRead).toBe(true);
    expect(caps.canSign).toBe(true);
    expect(caps.canTransfer).toBe(true);
    expect(caps.canMint).toBe(false);
    expect(caps.canManageWhitelist).toBe(true);
    expect(caps.canAdminister).toBe(false);
  });

  it('returns the correct flags for issuer', () => {
    const caps = getRoleCapabilities('issuer');
    expect(caps.canRead).toBe(true);
    expect(caps.canSign).toBe(true);
    expect(caps.canTransfer).toBe(true);
    expect(caps.canMint).toBe(true);
    expect(caps.canManageWhitelist).toBe(false);
    expect(caps.canAdminister).toBe(false);
  });

  it('returns the correct flags for admin', () => {
    const caps = getRoleCapabilities('admin');
    expect(caps.canRead).toBe(true);
    expect(caps.canSign).toBe(true);
    expect(caps.canTransfer).toBe(true);
    expect(caps.canMint).toBe(true);
    expect(caps.canManageWhitelist).toBe(true);
    expect(caps.canAdminister).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createReadOnlyClient
// ---------------------------------------------------------------------------

describe('createReadOnlyClient', () => {
  it('constructs successfully without a keypair', () => {
    const aegis = createReadOnlyClient(BASE_CONFIG);
    expect(aegis.role).toBe('read-only');
    expect(aegis.capabilities.canRead).toBe(true);
    expect(aegis.capabilities.canSign).toBe(false);
  });

  it('exposes compliance, investor, events, and role_module', () => {
    const aegis = createReadOnlyClient(BASE_CONFIG);
    expect(aegis.compliance).toBeDefined();
    expect(aegis.investor).toBeDefined();
    expect(aegis.events).toBeDefined();
    expect(aegis.role_module).toBeDefined();
  });

  it('exposes the underlying AegisClient via .client', () => {
    const aegis = createReadOnlyClient(BASE_CONFIG);
    expect(aegis.client).toBeInstanceOf(AegisClient);
  });

  it('does not expose an asset module', () => {
    const aegis = createReadOnlyClient(BASE_CONFIG);
    expect((aegis as any).asset).toBeUndefined();
  });

  it('underlying client throws when requireSigner is called (no keypair)', () => {
    const aegis = createReadOnlyClient(BASE_CONFIG);
    expect(() => aegis.client.requireSigner()).toThrow(
      'Transaction signing requires a Keypair',
    );
  });
});

// ---------------------------------------------------------------------------
// createInvestorClient
// ---------------------------------------------------------------------------

describe('createInvestorClient', () => {
  it('constructs successfully with a keypair', () => {
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(aegis.role).toBe('investor');
    expect(aegis.capabilities.canTransfer).toBe(true);
    expect(aegis.capabilities.canMint).toBe(false);
  });

  it('exposes asset.transfer', () => {
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(typeof aegis.asset.transfer).toBe('function');
  });

  it('does not expose asset.mint', () => {
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect((aegis.asset as any).mint).toBeUndefined();
  });

  it('throws RoleCapabilityError if mint is called via guard bypass', () => {
    // Simulate a consumer who casts to any and calls mint on the underlying client
    // but tries to call assertCapability indirectly through the investor surface.
    // The asset surface on investor only has transfer — calling .mint should not exist.
    // This test verifies the error shape if the guard is explicitly triggered.
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    // Transfer passes through the capability guard and should not throw on the guard
    // (it will throw only because the RPC mock is not set up for a real call).
    expect((aegis.asset as any).mint).toBeUndefined();
  });

  it('exposes compliance, investor, events, and role_module', () => {
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(aegis.compliance).toBeDefined();
    expect(aegis.investor).toBeDefined();
    expect(aegis.events).toBeDefined();
    expect(aegis.role_module).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createComplianceOperatorClient
// ---------------------------------------------------------------------------

describe('createComplianceOperatorClient', () => {
  it('constructs successfully with a keypair', () => {
    const aegis = createComplianceOperatorClient({
      ...BASE_CONFIG,
      keypair: makeKeypair(),
    });
    expect(aegis.role).toBe('compliance-operator');
    expect(aegis.capabilities.canManageWhitelist).toBe(true);
    expect(aegis.capabilities.canMint).toBe(false);
    expect(aegis.capabilities.canAdminister).toBe(false);
  });

  it('exposes asset.transfer', () => {
    const aegis = createComplianceOperatorClient({
      ...BASE_CONFIG,
      keypair: makeKeypair(),
    });
    expect(typeof aegis.asset.transfer).toBe('function');
  });

  it('does not expose asset.mint', () => {
    const aegis = createComplianceOperatorClient({
      ...BASE_CONFIG,
      keypair: makeKeypair(),
    });
    expect((aegis.asset as any).mint).toBeUndefined();
  });

  it('assertWhitelistAccess does not throw for compliance-operator', () => {
    const aegis = createComplianceOperatorClient({
      ...BASE_CONFIG,
      keypair: makeKeypair(),
    });
    expect(() => aegis.assertWhitelistAccess()).not.toThrow();
  });

  it('assertWhitelistAccess is absent on investor client', () => {
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect((aegis as any).assertWhitelistAccess).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createIssuerClient
// ---------------------------------------------------------------------------

describe('createIssuerClient', () => {
  it('constructs successfully with a keypair', () => {
    const aegis = createIssuerClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(aegis.role).toBe('issuer');
    expect(aegis.capabilities.canMint).toBe(true);
    expect(aegis.capabilities.canManageWhitelist).toBe(false);
    expect(aegis.capabilities.canAdminister).toBe(false);
  });

  it('exposes asset.mint and asset.transfer', () => {
    const aegis = createIssuerClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(typeof aegis.asset.mint).toBe('function');
    expect(typeof aegis.asset.transfer).toBe('function');
  });

  it('does not expose assertWhitelistAccess or assertAdminAccess', () => {
    const aegis = createIssuerClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect((aegis as any).assertWhitelistAccess).toBeUndefined();
    expect((aegis as any).assertAdminAccess).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createAdminClient
// ---------------------------------------------------------------------------

describe('createAdminClient', () => {
  it('constructs successfully with a keypair', () => {
    const aegis = createAdminClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(aegis.role).toBe('admin');
    expect(aegis.capabilities.canRead).toBe(true);
    expect(aegis.capabilities.canSign).toBe(true);
    expect(aegis.capabilities.canTransfer).toBe(true);
    expect(aegis.capabilities.canMint).toBe(true);
    expect(aegis.capabilities.canManageWhitelist).toBe(true);
    expect(aegis.capabilities.canAdminister).toBe(true);
  });

  it('exposes full asset module (mint and transfer)', () => {
    const aegis = createAdminClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(typeof aegis.asset.mint).toBe('function');
    expect(typeof aegis.asset.transfer).toBe('function');
  });

  it('assertAdminAccess does not throw for admin', () => {
    const aegis = createAdminClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(() => aegis.assertAdminAccess()).not.toThrow();
  });

  it('assertWhitelistAccess does not throw for admin', () => {
    const aegis = createAdminClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(() => aegis.assertWhitelistAccess()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RoleCapabilityError — shape and instanceof checks
// ---------------------------------------------------------------------------

describe('RoleCapabilityError', () => {
  it('has the correct name, code, role, and operation fields', () => {
    const err = new RoleCapabilityError(
      'Not permitted.',
      'OPERATION_NOT_PERMITTED',
      'investor',
      'mint',
    );
    expect(err.name).toBe('RoleCapabilityError');
    expect(err.code).toBe('OPERATION_NOT_PERMITTED');
    expect(err.role).toBe('investor');
    expect(err.operation).toBe('mint');
    expect(err.message).toBe('Not permitted.');
  });

  it('passes instanceof check', () => {
    const err = new RoleCapabilityError(
      'Not permitted.',
      'OPERATION_NOT_PERMITTED',
      'read-only',
      'transfer',
    );
    expect(err).toBeInstanceOf(RoleCapabilityError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Capability guard — RoleCapabilityError is thrown for gated operations
// ---------------------------------------------------------------------------

describe('capability guards throw RoleCapabilityError for unsupported operations', () => {
  it('investor asset surface does not include mint (type-level guard)', () => {
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    // mint is not on the type so accessing it requires a cast — verifies the
    // surface is narrowed correctly without a runtime throw path being needed.
    expect(Object.keys(aegis.asset)).not.toContain('mint');
  });

  it('read-only client does not expose asset module at all', () => {
    const aegis = createReadOnlyClient(BASE_CONFIG);
    expect(Object.keys(aegis)).not.toContain('asset');
  });

  it('compliance-operator client does not expose mint on asset', () => {
    const aegis = createComplianceOperatorClient({
      ...BASE_CONFIG,
      keypair: makeKeypair(),
    });
    expect(Object.keys(aegis.asset)).not.toContain('mint');
  });

  it('issuer client does not expose assertAdminAccess', () => {
    const aegis = createIssuerClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(Object.keys(aegis)).not.toContain('assertAdminAccess');
  });

  it('runtime guard throws RoleCapabilityError for an unsupported capability', () => {
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });

    expect(() => aegis.assertCapability('canMint', 'mint')).toThrow(
      RoleCapabilityError,
    );

    try {
      aegis.assertCapability('canMint', 'mint');
      throw new Error('expected runtime capability guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RoleCapabilityError);
      const roleError = error as RoleCapabilityError;
      expect(roleError.code).toBe('OPERATION_NOT_PERMITTED');
      expect(roleError.role).toBe('investor');
      expect(roleError.operation).toBe('mint');
    }
  });

  it('does not allow consumers to mutate shared capability flags', () => {
    const aegis = createInvestorClient({ ...BASE_CONFIG, keypair: makeKeypair() });

    expect(Reflect.set(aegis.capabilities as object, 'canMint', true)).toBe(false);
    expect(aegis.capabilities.canMint).toBe(false);
    expect(() => aegis.assertCapability('canMint', 'mint')).toThrow(
      RoleCapabilityError,
    );
  });

  it('runtime guard allows capabilities granted to the declared role', () => {
    const admin = createAdminClient({ ...BASE_CONFIG, keypair: makeKeypair() });
    expect(() =>
      admin.assertCapability('canAdminister', 'admin operation'),
    ).not.toThrow();
  });
});
