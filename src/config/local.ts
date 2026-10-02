import { Keypair, Networks, StrKey, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from '../client';
import { AEGIS_ENVIRONMENTS } from './environments';
import { AegisClientConfig } from './validate';
import { LocalConfigError } from '../errors/local';
import { classifyNetworkFailure } from '../network/failures';

/**
 * Canonical local-development defaults for Stellar Quickstart / standalone.
 *
 * These values are intentionally public and safe to commit. They do **not**
 * include a contract ID — that must come from a local deploy (or env).
 */
export const LOCAL_DEV_DEFAULTS = Object.freeze({
  environment: 'local' as const,
  rpcUrl: AEGIS_ENVIRONMENTS.local.rpcUrl,
  networkPassphrase: AEGIS_ENVIRONMENTS.local.networkPassphrase,
  horizonUrl: 'http://localhost:8000',
  friendbotUrl: 'http://localhost:8000/friendbot',
  rpcPort: 8000,
  /**
   * Documented Quickstart image. Pin a digest in CI for reproducibility;
   * `latest` is acceptable for contributor machines following the docs.
   */
  quickstartImage: 'stellar/quickstart:latest',
});

/**
 * Environment variable names accepted by {@link resolveLocalConfig}.
 *
 * Pass `process.env` (or a test double) via `options.env` — the SDK never
 * reads `process.env` at module scope so browser bundles stay clean.
 */
export const LOCAL_ENV_KEYS = Object.freeze({
  rpcUrl: 'AEGIS_LOCAL_RPC_URL',
  networkPassphrase: 'AEGIS_LOCAL_NETWORK_PASSPHRASE',
  contractId: 'AEGIS_CONTRACT_ID',
  horizonUrl: 'AEGIS_LOCAL_HORIZON_URL',
  friendbotUrl: 'AEGIS_LOCAL_FRIENDBOT_URL',
  secretKey: 'AEGIS_LOCAL_SECRET_KEY',
});

export type LocalEnvRecord = Readonly<Record<string, string | undefined>>;

export interface LocalDevConfigOptions {
  /** Deployed Aegis contract ID on the local network (`C...`). */
  contractId?: string;
  rpcUrl?: string;
  networkPassphrase?: string;
  horizonUrl?: string;
  friendbotUrl?: string;
  /** Prefer this over `secretKey` when you already hold a Keypair instance. */
  keypair?: Keypair;
  /**
   * Optional secret key string. Never echoed in errors or returned fields.
   * Ignored when `keypair` is provided.
   */
  secretKey?: string;
  /**
   * Allow plain-http RPC URLs whose host is not loopback / docker-desktop.
   * Default `false` — local http against a remote host is almost always a
   * misconfiguration that would leak signing traffic in cleartext.
   */
  allowNonLoopbackRpc?: boolean;
  /**
   * Injected environment map (e.g. `process.env` in Node). Omit in browsers.
   */
  env?: LocalEnvRecord;
}

/**
 * Fully resolved local-development configuration.
 *
 * Safe to inspect in tests and docs. Never contains the secret key string —
 * only an optional `Keypair` instance when signing was requested.
 */
export interface ResolvedLocalDevConfig {
  readonly environment: 'local';
  readonly rpcUrl: string;
  readonly networkPassphrase: string;
  readonly contractId: string;
  readonly horizonUrl: string;
  readonly friendbotUrl: string;
  readonly keypair?: Keypair;
  /** True when the RPC host is a true loopback address. */
  readonly loopback: boolean;
  /** True when the RPC host is an allowed local-dev host (loopback or docker). */
  readonly localDevHost: boolean;
}

export type LocalNetworkStatus = 'ready' | 'unavailable' | 'misconfigured';

/**
 * Result of {@link checkLocalNetwork}. Safe for dashboards and support pastes.
 */
export interface LocalNetworkHealth {
  readonly status: LocalNetworkStatus;
  readonly rpcDisplay: string;
  readonly networkPassphraseMatches: boolean | null;
  readonly message: string;
  readonly hint?: string;
  readonly retryable: boolean;
}

/**
 * True for loopback hostnames (`localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`).
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') {
    return true;
  }
  return /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * True for hosts treated as local-development targets by this SDK.
 *
 * Includes true loopback plus `host.docker.internal` (SDK-in-container talking
 * to Quickstart on the Docker host).
 */
export function isAllowedLocalDevHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return isLoopbackHostname(host) || host === 'host.docker.internal';
}

/**
 * Parses `url` and reports whether its host is loopback / allowed for local http.
 */
export function inspectLocalRpcUrl(url: string): {
  valid: boolean;
  loopback: boolean;
  localDevHost: boolean;
  protocol: string;
  display: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      valid: false,
      loopback: false,
      localDevHost: false,
      protocol: 'unknown',
      display: '<invalid-url>',
    };
  }

  const hasCredentials = Boolean(parsed.username || parsed.password);
  const display = `${parsed.protocol}//${
    hasCredentials ? '<redacted>@' : ''
  }${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;

  return {
    valid: parsed.protocol === 'http:' || parsed.protocol === 'https:',
    loopback: isLoopbackHostname(parsed.hostname),
    localDevHost: isAllowedLocalDevHostname(parsed.hostname),
    protocol: parsed.protocol.replace(/:$/, ''),
    display,
  };
}

/**
 * Resolves local-development configuration.
 *
 * Precedence for each field: explicit option → injected env → {@link LOCAL_DEV_DEFAULTS}.
 * `contractId` has no default and must be supplied (option or `AEGIS_CONTRACT_ID`).
 */
export function resolveLocalConfig(
  options: LocalDevConfigOptions = {},
): ResolvedLocalDevConfig {
  const env = options.env ?? {};

  const rpcUrl = firstNonEmpty(
    options.rpcUrl,
    env[LOCAL_ENV_KEYS.rpcUrl],
    LOCAL_DEV_DEFAULTS.rpcUrl,
  )!;
  const networkPassphrase = firstNonEmpty(
    options.networkPassphrase,
    env[LOCAL_ENV_KEYS.networkPassphrase],
    LOCAL_DEV_DEFAULTS.networkPassphrase,
  )!;
  const horizonUrl = firstNonEmpty(
    options.horizonUrl,
    env[LOCAL_ENV_KEYS.horizonUrl],
    LOCAL_DEV_DEFAULTS.horizonUrl,
  )!;
  const friendbotUrl = firstNonEmpty(
    options.friendbotUrl,
    env[LOCAL_ENV_KEYS.friendbotUrl],
    LOCAL_DEV_DEFAULTS.friendbotUrl,
  )!;
  const contractId = firstNonEmpty(
    options.contractId,
    env[LOCAL_ENV_KEYS.contractId],
  );

  if (!contractId) {
    throw new LocalConfigError(
      'Local development requires a contractId (deploy the Aegis contract locally, then set AEGIS_CONTRACT_ID or pass contractId).',
      'MISSING_CONTRACT_ID',
      'Deploy with stellar-cli against the local network, then export AEGIS_CONTRACT_ID=C...',
    );
  }

  if (!StrKey.isValidContract(contractId)) {
    throw new LocalConfigError(
      'Invalid contractId: expected a StrKey-encoded Soroban contract ID.',
      'INVALID_CONTRACT_ID',
      'Placeholders like "C..." are not valid. Use the ID returned by your local deploy.',
    );
  }

  if (
    typeof networkPassphrase !== 'string' ||
    networkPassphrase.trim().length === 0
  ) {
    throw new LocalConfigError(
      'Invalid networkPassphrase: must be a non-empty string.',
      'INVALID_NETWORK_PASSPHRASE',
    );
  }

  const inspection = inspectLocalRpcUrl(rpcUrl);
  if (!inspection.valid) {
    throw new LocalConfigError(
      `Invalid rpcUrl: "${inspection.display}" is not a valid http(s) URL.`,
      'INVALID_RPC_URL',
    );
  }

  if (inspection.protocol === 'http' && !inspection.localDevHost) {
    if (options.allowNonLoopbackRpc !== true) {
      throw new LocalConfigError(
        `Refusing insecure non-local rpcUrl "${inspection.display}". ` +
          'Local http is limited to loopback / host.docker.internal unless allowNonLoopbackRpc is true.',
        'NON_LOOPBACK_RPC_URL',
        'Point AEGIS_LOCAL_RPC_URL at localhost, or pass allowNonLoopbackRpc: true only for trusted private networks.',
      );
    }
  }

  const keypair = resolveKeypair(options, env);

  return Object.freeze({
    environment: 'local',
    rpcUrl,
    networkPassphrase,
    contractId,
    horizonUrl,
    friendbotUrl,
    ...(keypair ? { keypair } : {}),
    loopback: inspection.loopback,
    localDevHost: inspection.localDevHost,
  });
}

/**
 * Converts a resolved local config into an `AegisClientConfig` suitable for
 * `new AegisClient(...)` or the role-aware factories.
 */
export function toAegisClientConfig(
  resolved: ResolvedLocalDevConfig,
): AegisClientConfig {
  return {
    environment: 'local',
    rpcUrl: resolved.rpcUrl,
    networkPassphrase: resolved.networkPassphrase,
    contractId: resolved.contractId,
    ...(resolved.keypair ? { keypair: resolved.keypair } : {}),
  };
}

/**
 * Constructs an `AegisClient` preconfigured for local Quickstart / standalone.
 */
export function createLocalClient(
  options: LocalDevConfigOptions = {},
): AegisClient {
  return new AegisClient(toAegisClientConfig(resolveLocalConfig(options)));
}

/**
 * Probes whether the local Soroban RPC is reachable and matches the expected
 * network passphrase.
 *
 * Unlike generic network diagnostics, a refused connection on loopback maps to
 * "start the local network" rather than "retry with backoff".
 */
export async function checkLocalNetwork(
  target: AegisClient | ResolvedLocalDevConfig | LocalDevConfigOptions,
): Promise<LocalNetworkHealth> {
  const resolved =
    target instanceof AegisClient
      ? {
          rpcUrl: readClientRpcUrl(target),
          networkPassphrase: target.networkPassphrase,
        }
      : isResolvedLocal(target)
        ? target
        : resolveLocalConfig(target);

  const inspection = inspectLocalRpcUrl(resolved.rpcUrl);
  const server = new rpc.Server(resolved.rpcUrl, {
    allowHttp: resolved.rpcUrl.startsWith('http://'),
  });

  try {
    await server.getHealth();
  } catch (error) {
    const failure = classifyNetworkFailure(error);
    if (
      failure.code === 'RPC_UNAVAILABLE' ||
      failure.code === 'TIMEOUT' ||
      failure.code === 'UNKNOWN'
    ) {
      return freezeHealth({
        status: 'unavailable',
        rpcDisplay: inspection.display,
        networkPassphraseMatches: null,
        message: 'The local Soroban RPC endpoint is not reachable.',
        hint:
          'Start the local network (npm run local:up or docker compose -f docker-compose.local.yml up -d), then retry.',
        retryable: false,
      });
    }

    return freezeHealth({
      status: 'misconfigured',
      rpcDisplay: inspection.display,
      networkPassphraseMatches: null,
      message: failure.message,
      hint: 'Inspect the local RPC path and Quickstart flags; newer images may expose /rpc instead of /soroban/rpc.',
      retryable: failure.retryable,
    });
  }

  let networkPassphraseMatches: boolean | null = null;
  try {
    const network = await server.getNetwork();
    if (typeof network?.passphrase === 'string') {
      networkPassphraseMatches =
        network.passphrase === resolved.networkPassphrase;
    }
  } catch {
    networkPassphraseMatches = null;
  }

  if (networkPassphraseMatches === false) {
    return freezeHealth({
      status: 'misconfigured',
      rpcDisplay: inspection.display,
      networkPassphraseMatches: false,
      message:
        'The local RPC is reachable, but its network passphrase does not match the configured standalone passphrase.',
      hint: `Expected "${Networks.STANDALONE}". Confirm the Quickstart container was started with --local.`,
      retryable: false,
    });
  }

  return freezeHealth({
    status: 'ready',
    rpcDisplay: inspection.display,
    networkPassphraseMatches,
    message: 'Local Soroban RPC is reachable.',
    retryable: false,
  });
}

function resolveKeypair(
  options: LocalDevConfigOptions,
  env: LocalEnvRecord,
): Keypair | undefined {
  if (options.keypair) {
    if (!(options.keypair instanceof Keypair)) {
      throw new LocalConfigError(
        'Invalid keypair: expected a Stellar Keypair instance.',
        'INVALID_SECRET_KEY',
      );
    }
    return options.keypair;
  }

  const secret = firstNonEmpty(options.secretKey, env[LOCAL_ENV_KEYS.secretKey]);
  if (!secret) {
    return undefined;
  }

  try {
    return Keypair.fromSecret(secret);
  } catch {
    throw new LocalConfigError(
      'Invalid secret key for local development. Expected a Stellar secret seed (S...).',
      'INVALID_SECRET_KEY',
      'Generate an ephemeral key with Keypair.random() for local work. Never reuse testnet/mainnet secrets.',
    );
  }
}

function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isResolvedLocal(
  value: ResolvedLocalDevConfig | LocalDevConfigOptions,
): value is ResolvedLocalDevConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'environment' in value &&
    (value as ResolvedLocalDevConfig).environment === 'local' &&
    typeof (value as ResolvedLocalDevConfig).contractId === 'string' &&
    typeof (value as ResolvedLocalDevConfig).loopback === 'boolean'
  );
}

function readClientRpcUrl(client: AegisClient): string {
  const server = client.rpcServer as rpc.Server & {
    serverURL?: { toString(): string } | string;
  };
  if (server.serverURL && typeof server.serverURL === 'object') {
    return server.serverURL.toString().replace(/\/$/, '');
  }
  if (typeof server.serverURL === 'string' && server.serverURL) {
    return server.serverURL.replace(/\/$/, '');
  }
  return LOCAL_DEV_DEFAULTS.rpcUrl;
}

function freezeHealth(health: LocalNetworkHealth): LocalNetworkHealth {
  return Object.freeze(health);
}
