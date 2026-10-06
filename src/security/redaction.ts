export const REDACTED_VALUE = '[REDACTED]';

export type RedactedValue =
  | string
  | number
  | boolean
  | null
  | RedactedValue[]
  | { [key: string]: RedactedValue };

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|credential|keypair|password|private[_-]?key|secret(?:[_-]?key)?|seed|signature|token|transaction(?:[_-]?(?:xdr|payload))?|xdr/i;
const STELLAR_SECRET_PATTERN = /\bS[A-Z2-7]{55}\b/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(authorization|cookie|credential|keypair|password|private[_-]?key|secret(?:[_-]?key)?|seed|signature|token|transaction(?:[_-]?(?:xdr|payload))?|xdr)\b(["']?)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|Bearer\s+[A-Za-z0-9._~+\/-]+=*|[^\s,;}\]]+)/gi;
const ED25519_SIGNATURE_BASE64_PATTERN = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{86}==(?=$|[^A-Za-z0-9+/=])/g;
const LONG_BASE64_PATTERN = /\b[A-Za-z0-9+/]{96,}={0,2}/g;
const LONG_HEX_PATTERN = /\b[0-9a-fA-F]{128,}\b/g;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

/**
 * Redacts common secret material from a human-readable string while preserving
 * non-sensitive context that can still help with support and debugging.
 */
export function redactSensitiveText(value: string): string {
  return value
    .replace(STELLAR_SECRET_PATTERN, REDACTED_VALUE)
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, (_match, key, closingQuote, separator) => {
      return `${key}${closingQuote}${separator}${REDACTED_VALUE}`;
    })
    .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED_VALUE}`)
    .replace(ED25519_SIGNATURE_BASE64_PATTERN, REDACTED_VALUE)
    .replace(LONG_BASE64_PATTERN, REDACTED_VALUE)
    .replace(LONG_HEX_PATTERN, REDACTED_VALUE);
}

/**
 * Produces a log/support-safe copy of arbitrary diagnostic data.
 *
 * Sensitive field names are replaced wholesale. Strings are passed through the
 * text redactor, circular references are collapsed, and collection depth/size
 * is bounded so diagnostics cannot accidentally become an unbounded dump.
 */
export function redactSensitiveValue(value: unknown): RedactedValue {
  return redactValue(value, new WeakSet<object>(), 0);
}

function redactValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): RedactedValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value !== 'object' && typeof value !== 'function') {
    return String(value);
  }

  if (depth >= MAX_DEPTH) {
    return '[Truncated]';
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return '[Circular]';
  }

  seen.add(objectValue);

  try {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      const safeError: { [key: string]: RedactedValue } = {
        name: redactSensitiveText(value.name),
        message: redactSensitiveText(value.message),
      };
      const code = readProperty(value, 'code');
      if (typeof code === 'string' || typeof code === 'number') {
        safeError.code = redactSensitiveText(String(code));
      }
      const cause = readProperty(value, 'cause');
      if (cause !== undefined) {
        safeError.cause = redactValue(cause, seen, depth + 1);
      }
      return safeError;
    }

    if (Array.isArray(value)) {
      const redacted = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => redactValue(item, seen, depth + 1));
      if (value.length > MAX_ARRAY_ITEMS) {
        redacted.push('[Truncated]');
      }
      return redacted;
    }

    const safe: { [key: string]: RedactedValue } = {};
    for (const key of Object.keys(objectValue)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        safe[key] = REDACTED_VALUE;
        continue;
      }

      try {
        safe[key] = redactValue(
          (objectValue as Record<string, unknown>)[key],
          seen,
          depth + 1,
        );
      } catch {
        safe[key] = '[Unavailable]';
      }
    }
    return safe;
  } finally {
    seen.delete(objectValue);
  }
}

function readProperty(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
