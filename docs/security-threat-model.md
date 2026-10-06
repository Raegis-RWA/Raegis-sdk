# SDK Security Threat Model

This document describes the security boundaries, assumptions, major threats, and
recommended mitigations for consumers of the Raegis SDK.

The SDK is a client-side integration layer for Raegis protocol operations. It can
help applications validate inputs, choose safer defaults, and present protocol
state consistently, but it is **not** an authorization authority, key-management
system, transaction policy engine, legal-compliance service, or substitute for
reviewing the deployed Soroban contracts.

## Scope

The model covers SDK use involving:

- keypairs and signing material;
- read-only, investor, issuer, compliance, and administrative workflows;
- compliance and asset-state reads;
- transaction construction, signing, submission, and receipt handling;
- RPC, network, and contract configuration;
- diagnostics, errors, application logs, and support reports;
- dashboards and other applications that consume SDK results.

The following are outside the SDK's direct control:

- compromise of the host, browser, mobile device, CI runner, or secret store;
- correctness of third-party RPC providers and network infrastructure;
- authorization enforced by deployed smart contracts;
- custody policy, HSM/MPC controls, multisignature policy, or operator approval;
- identity verification, sanctions screening, legal KYC/AML determinations, or
  other off-chain compliance obligations;
- vulnerabilities in application code that bypasses or misuses the SDK.

## Trust boundaries

| Boundary | Trusted for | Not trusted for |
| --- | --- | --- |
| Application calling the SDK | Supplying intended operation parameters | Protecting secrets after the application exposes them |
| SDK role-aware interfaces | Reducing accidental misuse and clarifying capabilities | Proving the caller has an on-chain role |
| Soroban contract | Final protocol authorization and state transition rules | Off-chain identity or legal-compliance decisions |
| RPC provider | Returning network data and accepting submissions | Confidentiality of submitted public transaction data or perfect availability |
| Dashboard / UI | Presenting SDK state to operators | Acting as an authorization control by itself |
| Logs / diagnostics | Operational debugging when deliberately bounded | Safe storage of arbitrary application objects or secrets |
| Environment / config | Providing selected RPC and contract endpoints | Authenticity unless values are validated and deployment policy controls them |

## Security objectives

A consuming application should be able to use the SDK without:

1. exposing signing secrets through normal SDK errors, examples, or diagnostics;
2. treating a client-side role or readiness check as authoritative permission;
3. submitting a transaction to an unintended network or contract because of
   ambiguous configuration;
4. replaying or duplicating a state-changing action because retries are not
   operation-aware;
5. converting unavailable or unknown compliance state into an implicit approval;
6. presenting stale or partially verified SDK state as a legal-compliance result.

## Threats and mitigations

### Secret material exposure

**Threat.** Secret keys, signatures, signed envelopes, environment variables, or
other sensitive values can be copied into logs, support tickets, exception
messages, telemetry, browser state, or screenshots.

**Mitigations.**

- Treat secret keys as write-only application inputs and avoid rendering them.
- Prefer a dedicated secret manager, hardware-backed key, HSM, MPC, or another
  production custody mechanism instead of long-lived plaintext environment
  variables.
- Keep diagnostics and error metadata allowlisted; do not serialize whole config,
  request, keypair, or transaction objects for convenience.
- Use public keys, transaction hashes, and non-sensitive identifiers when support
  context is needed.
- Rotate credentials after suspected exposure; redaction cannot make a previously
  leaked secret safe again.

### Privileged-role misuse

**Threat.** Administrative, issuer, or compliance operations may be exposed to a
caller that should only have read or investor capabilities. Client-side type and
factory restrictions can also be bypassed by dynamic JavaScript, unsafe casts,
or direct low-level client access.

**Mitigations.**

- Use the narrowest role-aware client surface appropriate for the workflow.
- Gate privileged UI actions using explicit application policy in addition to SDK
  capability hints.
- Require the correct signer for state-changing operations.
- Treat Soroban authorization as the final authority. SDK guards are preflight
  safety, not a replacement for contract checks.
- Keep high-impact actions behind operator confirmation, audit logging, and
  separation-of-duties controls where the deployment requires them.

### Compliance-state confusion

**Threat.** An application may interpret `unknown`, unavailable, stale, or
partially retrieved compliance state as approval, or present protocol state as a
legal KYC/AML determination.

**Mitigations.**

- Fail closed for restricted actions when required protocol state is unknown or
  unavailable.
- Preserve typed state and reason information instead of collapsing results to a
  permissive boolean.
- Distinguish protocol eligibility from legal, identity, sanctions, and policy
  review performed outside the SDK.
- Show operators when data is unavailable, stale, or derived from a degraded
  fallback path.
- Re-check time-sensitive state close to a state-changing operation when the
  application policy requires it.

### Transaction replay, duplication, and ambiguous completion

**Threat.** Network failures can leave a client uncertain whether a transaction
was accepted. Blindly retrying a mutating operation may create duplicate effects
or contradictory UI state.

**Mitigations.**

- Treat retries of state-changing operations differently from safe reads.
- Use transaction hashes and authoritative network/contract state to reconcile an
  ambiguous submission before issuing a replacement.
- Avoid interpreting transport timeout as proof that a transaction did not reach
  the network.
- Keep operation identifiers, hashes, and receipts correlated in application
  state so support tooling can distinguish retry from a new user intent.
- Make retry policy bounded and observable; do not create unbounded submission
  loops during RPC degradation.

### Network and contract configuration confusion

**Threat.** A valid-looking RPC URL, network passphrase, or contract identifier can
still refer to the wrong environment. A dashboard may display one environment
while signing against another.

**Mitigations.**

- Select network and contract configuration from an explicit deployment profile.
- Validate RPC URLs and contract identifiers before use.
- Display the selected environment and contract identity in privileged operator
  flows.
- Reject contradictory configuration rather than silently combining values from
  different environments.
- Keep local-development, testnet, and production configuration isolated in CI,
  secrets, and deployment tooling.

### RPC and dependency trust

**Threat.** RPC services can be unavailable, stale, inconsistent, rate-limited,
or maliciously incorrect. Package or transitive dependency compromise can also
alter SDK behavior.

**Mitigations.**

- Treat RPC failures and malformed responses as explicit error states.
- Use bounded timeouts and retry policy appropriate to the operation.
- Pin and review dependency updates; use lockfiles and automated vulnerability
  scanning as supporting controls.
- For high-assurance workflows, compare critical network state with an
  independently operated or otherwise trusted source.
- Do not place secrets in URLs or query strings sent to RPC infrastructure.

### Diagnostics and logging leakage

**Threat.** Support reports are often shared broadly and may accidentally retain
endpoint paths, query strings, secrets, raw transaction material, or private
application state.

**Mitigations.**

- Prefer an explicit diagnostics schema over dumping arbitrary objects.
- Report endpoint origins and health state instead of credentials or full URLs
  when the path/query is not required.
- Classify fields as safe-to-share before adding them to diagnostics.
- Make application logs structured and bounded, with retention appropriate to the
  deployment.
- Review support artifacts before attaching them to public issues.

### Dashboard and browser integration

**Threat.** A UI may treat disabled buttons, hidden controls, or stale SDK state as
security enforcement. Browser storage and injected scripts may expose secrets or
modify transaction intent.

**Mitigations.**

- Enforce authorization at the contract and application service boundary, not in
  presentation state.
- Avoid putting secret keys in browser storage.
- Re-render privileged confirmations from the exact operation that will be signed
  rather than from stale cached display state.
- Apply standard web protections such as restrictive content security policy,
  dependency hygiene, and origin validation in the consuming application.
- Present network, target, amount, asset, and privilege-sensitive context before
  requesting a signature.

## Secure integration checklist

Before a production deployment:

- [ ] Signing keys are stored outside normal logs, UI state, and support reports.
- [ ] Privileged operations use the narrowest client surface and an appropriate
      signer.
- [ ] Unknown or unavailable restricted-state checks fail closed where required.
- [ ] Network, RPC, and contract identifiers come from one explicit deployment
      profile.
- [ ] Mutating-operation retry behavior handles ambiguous submission safely.
- [ ] Diagnostics use an allowlist and have been reviewed for sensitive fields.
- [ ] Dashboard controls are treated as UX, not as the authorization boundary.
- [ ] High-impact actions have deployment-appropriate operator/audit controls.
- [ ] Contract authorization and deployment configuration have been reviewed
      independently of the SDK.
- [ ] Legal/compliance obligations have an explicit owner outside this SDK.

## Incident response guidance

If secret exposure or unauthorized activity is suspected, stop affected signing
workflows, preserve non-sensitive transaction identifiers and timestamps, rotate
or revoke compromised credentials using the deployment's custody process, and
reconcile authoritative contract/network state before resuming automated actions.
Do not paste private keys, seed phrases, raw credentials, or full private runtime
dumps into public issue reports.

## Reporting security issues

Do not publish exploitable private details, credentials, or sensitive user data in
a public issue. Use the repository owner's private security-reporting route when
available, and keep public reports limited to information that is safe to disclose.

This threat model should be revisited when the SDK adds new signing paths,
diagnostic surfaces, custody integrations, privileged modules, or network
configuration modes.
