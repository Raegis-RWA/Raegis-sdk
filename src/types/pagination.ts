/**
 * Reusable pagination input for SDK read operations.
 * Cursors are opaque to callers unless a module documents a module-specific format.
 */
export interface PaginationRequest {
  cursor?: string;
  limit?: number;
}

/**
 * Describes what the SDK knows about the next page.
 * `unknown` is intentional: some upstream APIs return a resumable cursor without
 * proving whether another item currently exists.
 */
export type PaginationContinuation =
  | { state: 'available'; cursor: string }
  | { state: 'complete' }
  | { state: 'unknown'; cursor?: string };

export interface PaginationPageInfo {
  request: PaginationRequest;
  continuation: PaginationContinuation;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationPageInfo;
}
