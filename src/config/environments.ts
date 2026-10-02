import { Networks } from '@stellar/stellar-sdk';

/**
 * Named Aegis SDK environments with known-good RPC/network defaults.
 */
export type AegisEnvironmentName = 'testnet' | 'local' | 'mainnet';

/**
 * A typed preset bundling the RPC endpoint and network passphrase for a given environment.
 */
export interface AegisEnvironmentPreset {
  name: AegisEnvironmentName;
  rpcUrl: string;
  networkPassphrase: string;
  /** False for environments that are documented but not yet safe/ready to use (e.g. mainnet). */
  available: boolean;
  description: string;
}

/**
 * Built-in environment presets. `mainnet` is gated behind `allowMainnet` on the
 * client config since the Aegis protocol has not yet been audited/deployed there.
 */
export const AEGIS_ENVIRONMENTS: Record<AegisEnvironmentName, AegisEnvironmentPreset> = {
  testnet: {
    name: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    available: true,
    description: 'Stellar public testnet - safe for development and integration testing.',
  },
  local: {
    name: 'local',
    rpcUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: Networks.STANDALONE,
    available: true,
    description:
      'Local standalone network (e.g. Stellar Quickstart). Prefer createLocalClient / resolveLocalConfig for loopback enforcement, env loading, and readiness checks — see docs/local-development.md.',
  },
  mainnet: {
    name: 'mainnet',
    rpcUrl: 'https://soroban-rpc.mainnet.stellar.org',
    networkPassphrase: Networks.PUBLIC,
    available: false,
    description: 'Stellar public network. Gated: the Aegis protocol is not yet live on mainnet.',
  },
};

export function getEnvironmentPreset(name: AegisEnvironmentName): AegisEnvironmentPreset {
  return AEGIS_ENVIRONMENTS[name];
}
