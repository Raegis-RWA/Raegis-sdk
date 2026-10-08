import { AegisClient } from '../client';
import type { AegisReadOnlyClient } from '../client-factory';
import { diagnoseConfig, ConfigDiagnostics } from './config';
import { buildRuntimeDiagnostics, RuntimeDiagnostics } from './runtime';
import { classifyComplianceFailure, ComplianceFailureClassification } from './compliance';

export interface AegisDiagnosticsReport {
  generatedAt: string;
  config: ConfigDiagnostics;
  runtime: RuntimeDiagnostics;
  complianceFailure?: ComplianceFailureClassification;
}

export interface DiagnosticsReportInput {
  /** The same config object passed to the client constructor / factory function. */
  config?: unknown;
  /** A constructed `AegisClient`, or a role-aware client from `client-factory`. */
  client?: AegisClient | AegisReadOnlyClient;
  /** An error caught from a compliance-sensitive operation, to classify alongside the report. */
  complianceError?: unknown;
}

const UNPROBED_RUNTIME: RuntimeDiagnostics = Object.freeze({
  rpcReachability: 'unknown',
  role: 'unspecified',
  signerConfigured: false,
});

/**
 * Builds a full, redacted diagnostics report for Aegis SDK support requests:
 * config validity, RPC reachability, declared role, signer presence, and
 * (optionally) a classified compliance failure.
 *
 * Redaction is structural, not a final pass: `diagnoseConfig` and
 * `buildRuntimeDiagnostics` each build their own allowlisted result, and this
 * function only ever assembles those results — it never has access to the
 * raw config object's unlisted fields or to the client's keypair, so there is
 * no step here that could leak either.
 */
export async function buildDiagnosticsReport(
  input: DiagnosticsReportInput,
): Promise<AegisDiagnosticsReport> {
  const config = diagnoseConfig(input.config);

  let runtime = UNPROBED_RUNTIME;
  if (input.client) {
    const client = input.client;
    runtime = isRoleAwareClient(client)
      ? await buildRuntimeDiagnostics(client.client, { role: client.role })
      : await buildRuntimeDiagnostics(client);
  }

  const complianceFailure =
    input.complianceError !== undefined
      ? classifyComplianceFailure(input.complianceError)
      : undefined;

  return Object.freeze({
    generatedAt: new Date().toISOString(),
    config,
    runtime,
    ...(complianceFailure ? { complianceFailure } : {}),
  });
}

/**
 * Distinguishes a role-aware client (from `client-factory`) from a plain
 * `AegisClient`. Both classes have a `.role` property, but they mean
 * different things: on `AegisClient` it's the `RoleModule` instance, on a
 * role-aware client it's the declared `ClientRole` string — so the check
 * must inspect the value's type, not just the property's presence.
 */
function isRoleAwareClient(
  target: AegisClient | AegisReadOnlyClient,
): target is AegisReadOnlyClient {
  return typeof (target as AegisReadOnlyClient).role === 'string';
}
