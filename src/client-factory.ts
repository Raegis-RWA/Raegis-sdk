import { AegisClient } from './client';
import { AegisClientConfig } from './config/validate';
import {
  ClientRole,
  RoleCapabilities,
  ReadOnlyClientConfig,
  SignerClientConfig,
} from './types/client-factory';
import { RoleCapabilityError } from './errors/client-factory';
import { ComplianceModule } from './compliance';
import { AssetModule } from './asset';
import { InvestorModule } from './investor/portfolio';
import { EventsModule } from './events/module';
import { RoleModule } from './role';

// ---------------------------------------------------------------------------
// Capability matrix
// ---------------------------------------------------------------------------

const ROLE_CAPABILITIES: Readonly<Record<ClientRole, RoleCapabilities>> = {
  'read-only': {
    role: 'read-only',
    canRead: true,
    canSign: false,
    canTransfer: false,
    canMint: false,
    canManageWhitelist: false,
    canAdminister: false,
  },
  investor: {
    role: 'investor',
    canRead: true,
    canSign: true,
    canTransfer: true,
    canMint: false,
    canManageWhitelist: false,
    canAdminister: false,
  },
  'compliance-operator': {
    role: 'compliance-operator',
    canRead: true,
    canSign: true,
    canTransfer: true,
    canMint: false,
    canManageWhitelist: true,
    canAdminister: false,
  },
  issuer: {
    role: 'issuer',
    canRead: true,
    canSign: true,
    canTransfer: true,
    canMint: true,
    canManageWhitelist: false,
    canAdminister: false,
  },
  admin: {
    role: 'admin',
    canRead: true,
    canSign: true,
    canTransfer: true,
    canMint: true,
    canManageWhitelist: true,
    canAdminister: true,
  },
};

// ---------------------------------------------------------------------------
// Guard helper
// ---------------------------------------------------------------------------

/**
 * Throws a `RoleCapabilityError` when the declared role does not include the
 * required capability flag.
 */
function assertCapability(
  capabilities: RoleCapabilities,
  flag: keyof Omit<RoleCapabilities, 'role'>,
  operation: string,
): void {
  if (!capabilities[flag]) {
    throw new RoleCapabilityError(
      `The "${capabilities.role}" client does not permit "${operation}". ` +
        `Required capability: ${flag}.`,
      'OPERATION_NOT_PERMITTED',
      capabilities.role,
      operation,
    );
  }
}

// ---------------------------------------------------------------------------
// Typed client interfaces
// ---------------------------------------------------------------------------

/**
 * Shared read-only surface available on every role client.
 */
export interface AegisReadOnlyClient {
  /** The role this client was constructed for. */
  readonly role: ClientRole;
  /** The capability flags for this role. */
  readonly capabilities: RoleCapabilities;
  /** The underlying `AegisClient` instance. */
  readonly client: AegisClient;
  /** Compliance query module (read-only: single and batch whitelist checks). */
  readonly compliance: ComplianceModule;
  /** Investor portfolio read module. */
  readonly investor: InvestorModule;
  /** Contract event decoder/fetcher module. */
  readonly events: EventsModule;
  /** Client-side role discovery module. */
  readonly role_module: RoleModule;
}

/**
 * Signer-capable client extended with asset transfer.
 * Available for: `investor`, `compliance-operator`, `issuer`, `admin`.
 */
export interface AegisInvestorClient extends AegisReadOnlyClient {
  /** Asset module — transfer operation available. */
  readonly asset: Pick<AssetModule, 'transfer'>;
}

/**
 * Client with compliance whitelist management.
 * Available for: `compliance-operator`, `admin`.
 */
export interface AegisComplianceOperatorClient extends AegisInvestorClient {
  /**
   * Asserts that the configured keypair may be used to manage the whitelist.
   * Throws `RoleCapabilityError` if the role does not include `canManageWhitelist`.
   */
  assertWhitelistAccess(): void;
}

/**
 * Client with asset minting capability.
 * Available for: `issuer`, `admin`.
 */
export interface AegisIssuerClient extends AegisInvestorClient {
  /** Asset module — mint and transfer operations available. */
  readonly asset: Pick<AssetModule, 'mint' | 'transfer'>;
}

/**
 * Full-access admin client. All operations available.
 * Available for: `admin` only.
 *
 * Extends both `AegisIssuerClient` (for mint) and `AegisComplianceOperatorClient`
 * (for whitelist management) via a merged interface.
 */
export interface AegisAdminClient extends AegisIssuerClient {
  /** Asset module — full access. */
  readonly asset: AssetModule;
  /**
   * Asserts that the configured keypair may perform privileged admin operations.
   * Throws `RoleCapabilityError` if the role does not include `canAdminister`.
   */
  assertAdminAccess(): void;
  /**
   * Asserts that the configured keypair may be used to manage the whitelist.
   * Throws `RoleCapabilityError` if the role does not include `canManageWhitelist`.
   */
  assertWhitelistAccess(): void;
}

// ---------------------------------------------------------------------------
// Internal role client base class
// ---------------------------------------------------------------------------

class RoleAwareClient implements AegisReadOnlyClient {
  public readonly role: ClientRole;
  public readonly capabilities: RoleCapabilities;
  public readonly client: AegisClient;
  public readonly compliance: ComplianceModule;
  public readonly investor: InvestorModule;
  public readonly events: EventsModule;
  public readonly role_module: RoleModule;

  constructor(client: AegisClient, role: ClientRole) {
    this.role = role;
    this.capabilities = ROLE_CAPABILITIES[role];
    this.client = client;
    this.compliance = client.compliance;
    this.investor = client.investor;
    this.events = client.events;
    this.role_module = client.role;
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Creates a read-only Aegis client.
 *
 * No keypair is accepted. Any write operation attempted on the underlying
 * `client` will throw a standard `"Transaction signing requires a Keypair"`
 * error from `AegisClient.requireSigner()`. The role-typed surface only exposes
 * read modules so callers have a clear compile-time indication of what is safe.
 *
 * @example
 * ```ts
 * const aegis = createReadOnlyClient({
 *   environment: 'testnet',
 *   contractId: 'C...',
 * });
 * const isApproved = await aegis.compliance.checkWhitelist('G...');
 * const portfolio  = await aegis.investor.getPortfolio('G...');
 * ```
 */
export function createReadOnlyClient(
  config: ReadOnlyClientConfig,
): AegisReadOnlyClient {
  const clientConfig: AegisClientConfig = {
    contractId: config.contractId,
    environment: config.environment,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    allowMainnet: config.allowMainnet,
    // keypair intentionally omitted — read-only
  };
  const client = new AegisClient(clientConfig);
  return new RoleAwareClient(client, 'read-only');
}

/**
 * Creates an investor client with transfer capability.
 *
 * The returned client exposes `asset.transfer()` in addition to the read-only
 * surface. Minting and whitelist management throw `RoleCapabilityError`.
 *
 * @example
 * ```ts
 * const aegis = createInvestorClient({
 *   environment: 'testnet',
 *   contractId: 'C...',
 *   keypair: Keypair.fromSecret('S...'),
 * });
 * await aegis.asset.transfer('G_RECIPIENT', 100);
 * ```
 */
export function createInvestorClient(
  config: SignerClientConfig,
): AegisInvestorClient {
  const client = new AegisClient(config);
  const base = new RoleAwareClient(client, 'investor');
  const capabilities = base.capabilities;

  return {
    ...base,
    asset: {
      transfer: (...args) => {
        assertCapability(capabilities, 'canTransfer', 'transfer');
        return client.asset.transfer(...args);
      },
    },
  };
}

/**
 * Creates a compliance-operator client with whitelist management access.
 *
 * Adds `assertWhitelistAccess()` on top of the investor surface. Minting and
 * privileged admin operations throw `RoleCapabilityError`.
 *
 * @example
 * ```ts
 * const aegis = createComplianceOperatorClient({
 *   environment: 'testnet',
 *   contractId: 'C...',
 *   keypair: Keypair.fromSecret('S...'),
 * });
 * aegis.assertWhitelistAccess(); // confirms role before calling contract
 * await aegis.compliance.checkWhitelist('G...');
 * ```
 */
export function createComplianceOperatorClient(
  config: SignerClientConfig,
): AegisComplianceOperatorClient {
  const client = new AegisClient(config);
  const base = new RoleAwareClient(client, 'compliance-operator');
  const capabilities = base.capabilities;

  return {
    ...base,
    asset: {
      transfer: (...args) => {
        assertCapability(capabilities, 'canTransfer', 'transfer');
        return client.asset.transfer(...args);
      },
    },
    assertWhitelistAccess(): void {
      assertCapability(capabilities, 'canManageWhitelist', 'whitelist management');
    },
  };
}

/**
 * Creates an issuer client with asset minting capability.
 *
 * Exposes `asset.mint()` and `asset.transfer()` in addition to the read-only
 * surface. Whitelist management and privileged admin operations throw
 * `RoleCapabilityError`.
 *
 * @example
 * ```ts
 * const aegis = createIssuerClient({
 *   environment: 'testnet',
 *   contractId: 'C...',
 *   keypair: Keypair.fromSecret('S...'),
 * });
 * await aegis.asset.mint('G_INVESTOR', 1000);
 * ```
 */
export function createIssuerClient(
  config: SignerClientConfig,
): AegisIssuerClient {
  const client = new AegisClient(config);
  const base = new RoleAwareClient(client, 'issuer');
  const capabilities = base.capabilities;

  return {
    ...base,
    asset: {
      mint: (...args) => {
        assertCapability(capabilities, 'canMint', 'mint');
        return client.asset.mint(...args);
      },
      transfer: (...args) => {
        assertCapability(capabilities, 'canTransfer', 'transfer');
        return client.asset.transfer(...args);
      },
    },
  };
}

/**
 * Creates a full-access admin client.
 *
 * All operations are available. `assertAdminAccess()` provides an explicit
 * guard callers can invoke before privileged operations to confirm the role.
 *
 * @example
 * ```ts
 * const aegis = createAdminClient({
 *   environment: 'testnet',
 *   contractId: 'C...',
 *   keypair: Keypair.fromSecret('S...'),
 * });
 * aegis.assertAdminAccess();
 * await aegis.asset.mint('G_INVESTOR', 5000);
 * ```
 */
export function createAdminClient(config: SignerClientConfig): AegisAdminClient {
  const client = new AegisClient(config);
  const base = new RoleAwareClient(client, 'admin');
  const capabilities = base.capabilities;

  return {
    ...base,
    asset: client.asset,
    assertAdminAccess(): void {
      assertCapability(capabilities, 'canAdminister', 'admin operation');
    },
    assertWhitelistAccess(): void {
      assertCapability(capabilities, 'canManageWhitelist', 'whitelist management');
    },
  };
}

/**
 * Returns the static capability matrix for a given role without constructing
 * a client. Useful for UI feature-flagging before initialization.
 */
export function getRoleCapabilities(role: ClientRole): RoleCapabilities {
  return ROLE_CAPABILITIES[role];
}
