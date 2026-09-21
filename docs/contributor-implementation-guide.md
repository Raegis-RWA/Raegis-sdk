# Contributor Implementation Guide

> Audience: contributors adding new modules, operations, or behaviours to the Aegis SDK.
> Scope: how to design, implement, type, test, and document a change so it stays safe for
> RWA (Real World Asset) / compliance use cases and consistent with the SDK, dashboard, and contract boundaries.

This guide complements `README.md` (usage) and `CONTRIBUTING.md` (process). Read those first.

---

## 1. Mental model

The Aegis SDK is the official TypeScript client for the **Aegis RWA protocol** — a set of Soroban
smart contracts on Stellar. The SDK exposes a clean, class-based interface so application code never
talks to Soroban raw.

```
App code
   │  uses
   ▼
AegisClient  (src/)            ← you extend this
   │  calls
   ▼
Soroban contracts (Stellar)    ← NOT in this repo; treated as a boundary
```

Boundaries you must respect:

- **SDK ↔ Contract**: the SDK only sends typed calls and parses typed results. Contract logic lives
  elsewhere; the SDK must never assume contract internals beyond its published interface.
- **SDK ↔ Dashboard**: the dashboard consumes SDK responses. Keep response shapes stable or bump a
  version note.
- **Compliance is load-bearing**: many operations gate on KYC/whitelist/compliance status. A missing
  check is a security bug, not a typo.

---

## 2. Before you write code

1. Open or claim the issue on GrantFox / GitHub.
2. Confirm the change touches `src/`, `tests/`, and `docs/` (see Acceptance Criteria).
3. Check `package.json` scripts (`npm run test`, build, lint) and match the existing style
   (TypeScript strict, class-based modules like `compliance`).
4. Identify the **compliance-sensitive assumptions** your feature relies on (see §5). Write them down
   now — do not discover them in review.

---

## 3. Implementation workflow

### 3.1 Design the data model

Define typed interfaces next to the module they belong to. Example shape (mirrors the existing
`compliance` module):

```ts
export interface WhitelistCheckResult {
  approved: boolean;
  checkedAt: string;      // ISO timestamp
  source: 'onchain' | 'cache';
}

export interface ComplianceModule {
  checkWhitelist(user: string): Promise<WhitelistCheckResult>;
}
```

Rules:

- No `any`. Every external/contract value is parsed and validated at the boundary.
- Failures are typed (`AegisError` with a `code`), not thrown strings.

### 3.2 Implement the module

```ts
import { AegisClient } from '../client';
import { WhitelistCheckResult } from './types';

export class ComplianceModule {
  constructor(private client: AegisClient) {}

  async checkWhitelist(user: string): Promise<WhitelistCheckResult> {
    // boundary parse + typed result
    const raw = await this.client.call('compliance_check_whitelist', { user });
    return {
      approved: Boolean(raw.approved),
      checkedAt: new Date().toISOString(),
      source: raw.source ?? 'onchain',
    };
  }
}
```

### 3.3 Wire it into `AegisClient`

Register the module so `aegis.compliance` keeps working:

```ts
this.compliance = new ComplianceModule(this);
```

### 3.4 Add fixtures and tests

Tests live in `tests/` and run with `npm run test` (Jest). Cover the happy path **and** the edge
cases from §4.

```ts
import { AegisClient } from '../src/client';
import { ComplianceModule } from '../src/compliance';

describe('ComplianceModule.checkWhitelist', () => {
  it('returns approved=true for a whitelisted user', async () => {
    const client = new AegisClient({ rpcUrl: 'mock', networkPassphrase: 'T', contractId: 'C', keypair: undefined });
    const mod = new ComplianceModule(client);
    // inject a fixture instead of hitting Soroban
    const res = await mod.checkWhitelist('G_WHITELISTED');
    expect(res.approved).toBe(true);
    expect(res.source).toBe('onchain');
  });
});
```

Prefer **fixtures** (static typed inputs) over live testnet calls so tests are deterministic and
offline.

---

## 4. Edge cases you must handle

Every new operation should document and test:

| Case | Expected behaviour |
|------|--------------------|
| User not whitelisted | `approved: false`, no throw, no silent pass |
| Invalid / malformed public key | Typed `AegisError` with `code: 'INVALID_KEY'` |
| Contract returns unexpected shape | Boundary parser rejects and throws typed error |
| Network/rpc failure | Typed error, no undefined state leaked to caller |
| Revoked investor | Respect transfer-out / freeze policy; do not bypass |
| Empty / null input | Early typed rejection, not a crash |

If a case is out of scope, say so explicitly in the PR description — silence is treated as a bug.

---

## 5. Security & compliance assumptions (document these)

For RWA/compliance features, state your assumptions clearly. The SDK is **not** legal or financial
advice; protocol-level compliance must not be presented as such.

Document:

- Which compliance gate the feature depends on (KYC, whitelist, freeze, holding caps).
- What the SDK verifies vs. what the contract enforces (the contract is the source of truth).
- Any caching of compliance state and its staleness window.
- What a caller MUST do after receiving a result (e.g. re-check before a high-value op).

Template:

```md
## Compliance assumptions
- Depends on: whitelist gate (`compliance_check_whitelist`).
- SDK verifies: response shape + boolean cast.
- Contract enforces: actual whitelist membership (source of truth).
- Staleness: results are point-in-time; re-check before transfers > threshold.
- Not legal/financial advice.
```

---

## 6. Docs & README

After implementation:

1. Add a section to `docs/` (this file or a feature page) with usage + edge cases.
2. Link it from `README.md` under "Guides".
3. Update `CONTRIBUTING.md` only if the process changed.

---

## 7. Acceptance checklist

- [ ] Feature implemented OR clearly specified with typed behaviour.
- [ ] Edge cases from §4 handled and tested.
- [ ] Security/compliance assumptions documented (§5).
- [ ] Fixtures or tests added in `tests/`.
- [ ] `README.md` / `docs/` link to the new guidance.
- [ ] Change is compatible with dashboard and contract boundaries (no breaking response shapes
      without a noted version bump).

---

## 8. Opening the PR

1. Fork, branch from `main` (`feat/<short-name>`).
2. `npm run test` is green locally.
3. PR description: link the GrantFox issue, summarise the change, paste the §5 compliance block.
4. On GrantFox, the issue shows "Direct GitHub comment" — your PR/comment posts from your account.

Keep wording precise: protocol-level compliance is not legal or financial advice.