import { NetworkFailure, NetworkFailureCode } from '../errors/network';
import { redactSensitiveValue } from '../security/redaction';

const SAFE_MESSAGES: Readonly<Record<NetworkFailureCode, string>> = {
  TIMEOUT: 'The network request timed out.',
  RPC_UNAVAILABLE: 'The Stellar RPC service is temporarily unavailable.',
  RATE_LIMITED: 'The Stellar RPC service is rate limiting requests.',
  INVALID_NETWORK_PASSPHRASE:
    'The configured network does not match the target transaction.',
  MALFORMED_RESPONSE: 'The Stellar RPC service returned an invalid response.',
  UNKNOWN: 'The network request failed for an unknown reason.',
};

const RETRYABLE_CODES: ReadonlySet<NetworkFailureCode> = new Set([
  'TIMEOUT',
  'RPC_UNAVAILABLE',
  'RATE_LIMITED',
]);

const TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/**
 * Classifies an unknown RPC/network failure into a stable, user-safe SDK error.
 *
 * Raw messages are inspected only for classification. They are never copied to
 * the returned error message, so URLs, headers, payloads, and credentials do
 * not become part of support-facing output.
 */
export function classifyNetworkFailure(error: unknown): NetworkFailure {
  if (error instanceof NetworkFailure) {
    return error;
  }

  const name = readString(error, 'name');
  const code = readString(error, 'code').toUpperCase();
  const message = readString(error, 'message');
  const status = readHttpStatus(error);
  const signature = `${name} ${code} ${message}`.toLowerCase();

  if (
    status === 429 ||
    code === 'RATE_LIMITED' ||
    /\brate[-_\s]?limit(?:ed|ing)?\b|too many requests|resource exhausted/.test(
      signature,
    )
  ) {
    return createFailure('RATE_LIMITED', error, readRetryAfterSeconds(error));
  }

  if (
    code === 'INVALID_NETWORK_PASSPHRASE' ||
    /network passphrase.{0,40}(?:invalid|mismatch|wrong)|(?:invalid|wrong).{0,40}network passphrase/.test(
      signature,
    )
  ) {
    return createFailure('INVALID_NETWORK_PASSPHRASE', error);
  }

  if (
    TIMEOUT_CODES.has(code) ||
    name.toLowerCase() === 'timeouterror' ||
    name.toLowerCase() === 'aborterror' ||
    /\btimed?\s*out\b|deadline exceeded|request aborted/.test(signature)
  ) {
    return createFailure('TIMEOUT', error);
  }

  if (
    UNAVAILABLE_CODES.has(code) ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /service unavailable|rpc.{0,30}unavailable|network.{0,30}unreachable|fetch failed|connection (?:refused|reset)|socket hang up|dns lookup/.test(
      signature,
    )
  ) {
    return createFailure('RPC_UNAVAILABLE', error);
  }

  if (
    name.toLowerCase() === 'syntaxerror' ||
    /malformed.{0,20}response|invalid.{0,20}(?:rpc )?response|invalid json|unexpected token.{0,40}json|invalid xdr/.test(
      signature,
    )
  ) {
    return createFailure('MALFORMED_RESPONSE', error);
  }

  return createFailure('UNKNOWN', error);
}

function createFailure(
  code: NetworkFailureCode,
  cause: unknown,
  retryAfterSeconds?: number,
): NetworkFailure {
  return new NetworkFailure(
    SAFE_MESSAGES[code],
    code,
    RETRYABLE_CODES.has(code),
    {
      cause: redactSensitiveValue(cause),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    },
  );
}

function readString(value: unknown, key: string): string {
  const candidate = readProperty(value, key);
  if (typeof candidate === 'string') {
    return candidate;
  }
  if (typeof candidate === 'number') {
    return String(candidate);
  }
  return '';
}

function readHttpStatus(error: unknown): number | undefined {
  const directStatus =
    readFiniteNumber(readProperty(error, 'status')) ??
    readFiniteNumber(readProperty(error, 'statusCode'));

  if (directStatus !== undefined) {
    return directStatus;
  }

  const response = readProperty(error, 'response');
  return readFiniteNumber(readProperty(response, 'status'));
}

function readRetryAfterSeconds(error: unknown): number | undefined {
  const retryAfter =
    readProperty(error, 'retryAfterSeconds') ??
    readProperty(error, 'retryAfter');
  const seconds = readFiniteNumber(retryAfter);

  return seconds !== undefined && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readProperty(value: unknown, key: string): unknown {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  ) {
    return undefined;
  }

  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
