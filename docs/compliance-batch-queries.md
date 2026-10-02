# Compliance batch queries

Admin dashboards often need whitelist status for many investor rows. Calling
`checkWhitelist` in an unbounded `Promise.all` can overload an RPC provider and
makes one rejected request difficult to represent without losing the rest.

`ComplianceModule.checkWhitelistBatch` validates each input, limits concurrent
RPC work, and returns exactly one typed item per input in the original order.

## Quickstart

```typescript
const result = await client.compliance.checkWhitelistBatch(
  ['G_INVESTOR_ONE', 'G_INVESTOR_TWO', 'invalid-input'],
  { concurrency: 4 },
);

for (const item of result.items) {
  if (item.status === 'whitelisted') {
    renderApprovedRow(item.index);
  } else if (item.status === 'failed') {
    renderRetryRow(item.index, item.diagnostic.code);
  } else {
    renderNotApprovedRow(item.index, item.code);
  }
}
```

Use `item.index` to correlate with the original array. Valid addresses are
included on resolved/failed items. Invalid input is deliberately omitted from
the result because callers can accidentally pass tokens, URLs, or other
sensitive strings into a bulk-input field.

## Per-item states

| `status` | Meaning |
| --- | --- |
| `whitelisted` | Contract query resolved `true`. |
| `not-whitelisted` | Contract query resolved `false`. |
| `invalid-address` | Input was rejected before RPC. |
| `failed` | Valid address, but its query could not be evaluated. |

Invalid-item codes distinguish:

- `INVALID_ADDRESS`
- `MUXED_ADDRESS_UNSUPPORTED`
- `CONTRACT_ADDRESS_UNSUPPORTED`

Failures use `COMPLIANCE_QUERY_FAILED` and carry a safe
`NetworkFailureDiagnostic`. Raw provider messages, request payloads, RPC URLs,
headers, and credentials are never copied into an item.

`isWhitelisted` is present on every item and fails closed (`false`) for invalid
and failed items. Dashboards should still branch on `status`: `false` does not
distinguish a confirmed non-whitelisted result from an unavailable result.

## Partial failures

The batch promise does not reject because one address is invalid or one RPC
request fails. Instead:

- successful addresses retain their resolved status;
- invalid addresses receive an `invalid-address` item;
- RPC/parse failures receive a `failed` item with a safe diagnostic.

`summary.partial` is true when at least one query resolved and at least one
failed. `summary.exhausted` is true when every valid item failed.

Batch-level configuration errors still throw `ComplianceBatchError`:

- `INVALID_BATCH_INPUT`: runtime input is not an array;
- `BATCH_TOO_LARGE`: input exceeds `maxBatchSize`;
- `INVALID_BATCH_OPTIONS`: concurrency, deduplication, or size options are invalid.

## Performance assumptions

Soroban RPC does not provide one batch simulation call for this contract method.
Therefore **N unique valid addresses require N `simulateTransaction` requests**.

Defaults:

- `concurrency: 4` (allowed range 1–20);
- `deduplicate: true`;
- `maxBatchSize: 100` (configurable up to 1000).

Deduplication queries an identical valid address once and fans the same result
back to every original position. Duplicate items set `duplicate: true`;
`summary.queried` records actual RPC requests rather than input rows.

Choose concurrency based on the provider's documented quota, deployment
latency, and other traffic sharing the same API key. A larger value can reduce
wall-clock latency but increases burst load; it does not reduce total RPC calls.
Start with the default or lower it for shared/public endpoints.

## Rate limits and retries

The SDK deliberately performs **no automatic retry** inside a batch. Hidden
retries can multiply provider load precisely when it is already rate limiting.

If an item is rate limited:

1. Keep all successfully resolved items.
2. Build the address-free batch diagnostic.
3. Honor `retryAfterSeconds` when present.
4. Retry only the failed source rows after backoff, not the entire batch.

```typescript
import { buildComplianceBatchDiagnostic } from '@aegis/sdk';

const diagnostic = buildComplianceBatchDiagnostic(result);

if (diagnostic.action === 'retry-with-backoff') {
  scheduleFailedRows(diagnostic.retryAfterSeconds);
}
```

`buildComplianceBatchDiagnostic` contains counts and classified failure codes
only. It intentionally excludes every address and original input, making it
suitable for telemetry and support reports.

## Validation rules

Only Stellar Ed25519 account public keys (`G...`) are accepted. Validation uses
`StrKey.isValidEd25519PublicKey` before contract/XDR construction:

- empty, malformed, and non-string runtime input is invalid;
- muxed (`M...`) addresses are currently unsupported;
- contract (`C...`) addresses cannot identify investors.

Validation is per item, so mixed input does not prevent valid rows from being
queried.

## Mock-client usage

The test-only client exposes the same method:

```typescript
import {
  createMockAegisClient,
  createMockFixtures,
} from '@aegis/sdk/testing';

const fixtures = createMockFixtures();
const client = createMockAegisClient();
client.setWhitelisted(fixtures.investorAddress, true);

const result = await client.compliance.checkWhitelistBatch([
  fixtures.investorAddress,
  fixtures.secondaryInvestorAddress,
]);
```

This uses in-memory state and makes no network calls.

## Security and compliance notes

- Public keys are identifiers, but a list of investors under compliance review
  can still be sensitive operational data. Keep batch results access-controlled.
- Use the address-free roll-up for logs and support tickets.
- Whitelist status reports protocol state; it is not legal, financial, or
  regulatory advice.
- `not-whitelisted`, `invalid-address`, and `failed` are distinct. Do not display
  an RPC outage as a compliance denial.

## Contributor checklist

- [ ] Results remain one-to-one with input and preserve order.
- [ ] Invalid inputs never reach RPC and are not echoed in results/diagnostics.
- [ ] One item failure never rejects otherwise valid batch work.
- [ ] Concurrency stays bounded and defaults remain documented.
- [ ] No automatic retry is introduced without explicit rate-limit analysis.
- [ ] Diagnostics remain free of addresses, raw errors, URLs, headers, and secrets.
- [ ] Tests cover mixed input, partial failure, rate limiting, ordering, and bounds.
