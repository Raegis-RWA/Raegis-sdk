/**
 * The explicit role a consumer uses when constructing a role-aware client.
 *
 * This is the *declared intent* at construction time — not a contract-verified
 * on-chain role. The factory uses it to narrow which modules and write operations
 * are accessible via the returned typed client object.
 *
 * Role capability assumptions:
 * - `read-only`: No keypair required. Portfolio reads and compliance queries only.
 * - `investor`: Keypair required. Adds transfer capability on top of read-only.
 * - `compliance-operator`: Keypair required. Adds whitelist management on top of investor.
 * - `issuer`: Keypair required. Adds asset minting on top of investor.
 * - `admin`: Keypair required. Full access — all write operations and admin receipt building.
 */
export type ClientRole =
  | 'read-only'
  | 'investor'
  | 'compliance-operator'
  | 'issuer'
  | 'admin';

/**
 * Flags describing which capability groups are enabled for a given role.
 * Used internally by module guards and surfaced on the typed client for inspection.
 */
export interface RoleCapabilities {
  /** Role name this set of capabilities was built for. */
  readonly role: ClientRole;
  /** Can call read operations: compliance queries, portfolio reads, event decoding. */
  readonly canRead: boolean;
  /** Can sign and submit transactions (requires a configured keypair). */
  readonly canSign: boolean;
  /** Can initiate asset transfers. */
  readonly canTransfer: boolean;
  /** Can mint new asset tokens. */
  readonly canMint: boolean;
  /** Can manage the KYC/compliance whitelist (add/remove). */
  readonly canManageWhitelist: boolean;
  /** Can perform privileged admin operations (protocol pause/unpause, asset registration). */
  readonly canAdminister: boolean;
}

/**
 * Configuration for `createReadOnlyClient`.
 * No keypair is accepted — read-only clients never sign transactions.
 */
export interface ReadOnlyClientConfig {
  contractId?: string;
  contractRegistry?: import('../config/contracts').AegisContractRegistry;
  contractName?: string;
  environment?: import('../config/environments').AegisEnvironmentName;
  rpcUrl?: string;
  networkPassphrase?: string;
  allowMainnet?: boolean;
}

/**
 * Configuration for signer-capable role clients (investor, compliance-operator, issuer, admin).
 * A keypair is required for any role that can write to the contract.
 */
export interface SignerClientConfig extends ReadOnlyClientConfig {
  keypair: import('@stellar/stellar-sdk').Keypair;
}
