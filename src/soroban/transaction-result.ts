const RESULT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.:-]{0,63}$/;

/**
 * Reads the result code of a Soroban transaction result as a stable uppercase
 * string (for example `txFailed` becomes `TX_FAILED`).
 *
 * Only the result switch name is read, so envelopes, signatures, memos, and raw
 * XDR payloads never leave this helper. Returns `undefined` when the input is
 * absent or does not expose a readable switch name, so callers can treat a
 * missing code as "no safe detail available" rather than an error.
 */
export function decodeTransactionResultCode(
  result: unknown,
): string | undefined {
  if (!result) {
    return undefined;
  }

  try {
    const inner = (
      result as { result?: () => { switch?: () => { name?: string } } }
    ).result?.();
    const name = inner?.switch?.().name;

    if (typeof name !== 'string' || !name) {
      return undefined;
    }

    const normalized = name
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase();

    return RESULT_CODE_PATTERN.test(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
}
