export type AegisErrorCategory =
  | 'compliance'
  | 'admin'
  | 'asset'
  | 'investor'
  | 'soroban'
  | 'network'
  | 'transaction'
  | 'unknown';

export type AegisPublicMetadataValue = string | number | boolean | null;
export type AegisPublicMetadata = Readonly<
  Record<string, AegisPublicMetadataValue>
>;

export interface AegisSdkErrorOptions<TCode extends string = string> {
  code: TCode;
  category: AegisErrorCategory;
  message: string;
  metadata?: Record<string, unknown>;
  cause?: unknown;
}

const SENSITIVE_METADATA_KEY =
  /authorization|cookie|credential|keypair|password|private|secret|seed|signature|token|xdr/i;
const MAX_PUBLIC_STRING_LENGTH = 256;

/**
 * Stable, serialisable SDK error surface.
 *
 * Raw causes are retained as non-enumerable debugging context and are never
 * copied into the public message or metadata.
 */
export class AegisSdkError<TCode extends string = string> extends Error {
  public readonly code: TCode;
  public readonly category: AegisErrorCategory;
  public readonly metadata: AegisPublicMetadata;
  public readonly cause?: unknown;

  constructor(options: AegisSdkErrorOptions<TCode>) {
    super(options.message);
    this.name = 'AegisSdkError';
    this.code = options.code;
    this.category = options.category;
    this.metadata = Object.freeze(sanitizePublicMetadata(options.metadata));

    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): {
    name: string;
    code: TCode;
    category: AegisErrorCategory;
    message: string;
    metadata: AegisPublicMetadata;
  } {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      metadata: this.metadata,
    };
  }
}

/**
 * Converts an unknown failure to the public SDK error shape without copying
 * raw messages, URLs, headers, payloads, or credentials.
 */
export function normalizeAegisSdkError(
  error: unknown,
  fallback: AegisSdkErrorOptions,
): AegisSdkError {
  if (error instanceof AegisSdkError) {
    return error;
  }

  return new AegisSdkError({
    ...fallback,
    cause: error,
  });
}

export function sanitizePublicMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, AegisPublicMetadataValue> {
  if (!metadata) {
    return {};
  }

  const safe: Record<string, AegisPublicMetadataValue> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_METADATA_KEY.test(key)) {
      continue;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safe[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      safe[key] = value.slice(0, MAX_PUBLIC_STRING_LENGTH);
    }
  }

  return safe;
}
