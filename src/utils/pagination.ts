import { PaginationValidationError } from '../errors/pagination';
import {
  PaginatedResult,
  PaginationContinuation,
  PaginationRequest,
} from '../types/pagination';

export const DEFAULT_PAGINATION_LIMIT = 100;
export const MAX_PAGINATION_LIMIT = 10_000;

export interface ResolvedPaginationRequest {
  cursor?: string;
  limit: number;
}

/**
 * Validates a reusable pagination request and fills the SDK default limit.
 * Cursor contents stay opaque here; module-specific helpers may apply a stricter
 * cursor format after this shared boundary.
 */
export function resolvePaginationRequest(
  request: PaginationRequest = {}
): ResolvedPaginationRequest {
  if (
    request.cursor !== undefined &&
    (typeof request.cursor !== 'string' || request.cursor.trim().length === 0)
  ) {
    throw new PaginationValidationError(
      'INVALID_CURSOR',
      'cursor',
      'Pagination cursor must be a non-empty string.'
    );
  }

  const limit = request.limit ?? DEFAULT_PAGINATION_LIMIT;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGINATION_LIMIT
  ) {
    throw new PaginationValidationError(
      'INVALID_LIMIT',
      'limit',
      `Pagination limit must be a safe integer between 1 and ${MAX_PAGINATION_LIMIT}.`
    );
  }

  return request.cursor === undefined
    ? { limit }
    : { cursor: request.cursor, limit };
}

const OFFSET_CURSOR_PREFIX = 'offset:';

function decodeOffsetCursor(cursor: string): number {
  if (!cursor.startsWith(OFFSET_CURSOR_PREFIX)) {
    throw new PaginationValidationError(
      'INVALID_CURSOR',
      'cursor',
      'Pagination cursor is not valid for an in-memory SDK view.'
    );
  }

  const rawOffset = cursor.slice(OFFSET_CURSOR_PREFIX.length);
  if (!/^(0|[1-9]\d*)$/.test(rawOffset)) {
    throw new PaginationValidationError(
      'INVALID_CURSOR',
      'cursor',
      'Pagination cursor is not valid for an in-memory SDK view.'
    );
  }

  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(offset)) {
    throw new PaginationValidationError(
      'INVALID_CURSOR',
      'cursor',
      'Pagination cursor exceeds the supported offset range.'
    );
  }

  return offset;
}

/**
 * Creates a stable page over an already-fetched SDK read model.
 * Returned cursors are opaque `offset:` cursors and should be passed back
 * unchanged rather than constructed by callers.
 */
export function paginateArray<T>(
  items: readonly T[],
  request: PaginationRequest = {}
): PaginatedResult<T> {
  const resolved = resolvePaginationRequest(request);
  const offset =
    resolved.cursor === undefined ? 0 : decodeOffsetCursor(resolved.cursor);

  if (offset > items.length) {
    throw new PaginationValidationError(
      'INVALID_CURSOR',
      'cursor',
      'Pagination cursor points beyond the available items.'
    );
  }

  const pageItems = items.slice(offset, offset + resolved.limit);
  const nextOffset = offset + pageItems.length;
  const continuation: PaginationContinuation =
    nextOffset < items.length
      ? { state: 'available', cursor: `${OFFSET_CURSOR_PREFIX}${nextOffset}` }
      : { state: 'complete' };

  return {
    items: pageItems,
    pagination: {
      request: resolved,
      continuation,
    },
  };
}
