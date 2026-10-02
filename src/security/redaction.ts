import { Networks, StrKey } from '@stellar/stellar-sdk';

/** Placeholder substituted for any value that must never be shared. */
export const REDACTED = '<redacted>';

const MISSING = '<missing>';
const INVALID_URL = '<invalid-url>';
const INVALID_CONTRACT = '<invalid-contract-id>';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const KNOWN_PASSPHRASES: Readonly<Record<string, string>> = {
  [Networks.PUBLIC]: 'public',
  [Networks.TESTNET]: 'testnet',
  [Networks.FUTURENET]: 'futurenet',
  [Networks.SANDBOX]: 'sandbox',
  [Networks.STANDALONE]: 'standalone',
};

export type RpcUrlProtocol = 'https' | 'http' | 'other' | 'unknown';

export interface RpcUrlInspection {
  /** Safe display form. Credentials, path, query, and fragment are removed. */
  display: string;
  valid: boolean;
  protocol: RpcUrlProtocol;
  secure: boolean;
  loopback: boolean;
  /** True when the raw URL embedded `user:password@`. */
  hasCredentials: boolean;
  /** True when the raw URL carried a path, which often holds provider API keys. */
  hasPath: boolean;
  hasQuery: boolean;
  hasFragment: boolean;
}

export type NetworkPassphraseKind = 'known' | 'custom' | 'missing';

export interface NetworkPassphraseInspection {
  /** Well-known network name, or `custom` / `missing`. Never the raw value. */
  network: string;
  kind: NetworkPassphraseKind;
  valid: boolean;
}

/**
 * Inspects an RPC URL and produces a shareable summary.
 *
 * The host is preserved because support requests are not actionable without it,
 * but userinfo credentials, path segments, query strings, and fragments are
 * replaced. Managed Soroban providers routinely place API keys in the path or
 * query, so those are treated as secrets even though the URL looks innocuous.
 */
export function inspectRpcUrl(value: unknown): RpcUrlInspection {
  if (typeof value !== 'string' || !value.trim()) {
    return frozenUrlInspection({ display: MISSING, protocol: 'unknown' });
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return frozenUrlInspection({ display: INVALID_URL, protocol: 'unknown' });
  }

  const protocol = readProtocol(parsed.protocol);
  const hasCredentials = Boolean(parsed.username || parsed.password);
  const hasPath = parsed.pathname !== '' && parsed.pathname !== '/';
  const hasQuery = parsed.search !== '';
  const hasFragment = parsed.hash !== '';

  let display = `${parsed.protocol}//`;
  if (hasCredentials) {
    display += `${REDACTED}@`;
  }
  display += parsed.host;
  if (hasPath) {
    display += `/${REDACTED}`;
  }
  if (hasQuery) {
    display += `?${REDACTED}`;
  }
  if (hasFragment) {
    display += `#${REDACTED}`;
  }

  return frozenUrlInspection({
    display,
    valid: protocol === 'https' || protocol === 'http',
    protocol,
    secure: protocol === 'https',
    loopback: LOOPBACK_HOSTS.has(parsed.hostname),
    hasCredentials,
    hasPath,
    hasQuery,
    hasFragment,
  });
}

/**
 * Returns only the shareable display form of an RPC URL.
 *
 * Use this anywhere a URL would otherwise be interpolated into an error message
 * or log line.
 */
export function redactRpcUrl(value: unknown): string {
  return inspectRpcUrl(value).display;
}

/**
 * Masks a contract ID to its leading and trailing characters.
 *
 * Contract IDs are public on-chain identifiers, but an unannounced deployment
 * is still sensitive, and the masked form remains enough to confirm which
 * contract a reporter is pointing at.
 */
export function redactContractId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return MISSING;
  }

  const trimmed = value.trim();
  if (!StrKey.isValidContract(trimmed)) {
    return INVALID_CONTRACT;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/**
 * Describes a network passphrase by name without echoing its value.
 *
 * Well-known passphrases are public constants, but a custom passphrase can
 * identify a private network, so only the fact that it is custom is reported.
 */
export function describeNetworkPassphrase(
  value: unknown,
): NetworkPassphraseInspection {
  if (typeof value !== 'string' || !value.trim()) {
    return Object.freeze({ network: MISSING, kind: 'missing', valid: false });
  }

  const known = KNOWN_PASSPHRASES[value];
  return Object.freeze({
    network: known ?? 'custom',
    kind: known ? 'known' : 'custom',
    valid: true,
  });
}

/**
 * Echoes a short identifier-like value only when it is obviously safe.
 *
 * Runtime callers can pass arbitrary values where an enum is expected, so
 * anything unexpected collapses to a placeholder instead of being interpolated.
 */
export function redactIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return MISSING;
  }

  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{1,32}$/.test(trimmed) ? trimmed : REDACTED;
}

function readProtocol(protocol: string): RpcUrlProtocol {
  if (protocol === 'https:') {
    return 'https';
  }
  if (protocol === 'http:') {
    return 'http';
  }
  return 'other';
}

function frozenUrlInspection(
  overrides: Partial<RpcUrlInspection> & { display: string },
): RpcUrlInspection {
  return Object.freeze({
    valid: false,
    protocol: 'unknown',
    secure: false,
    loopback: false,
    hasCredentials: false,
    hasPath: false,
    hasQuery: false,
    hasFragment: false,
    ...overrides,
  });
}
