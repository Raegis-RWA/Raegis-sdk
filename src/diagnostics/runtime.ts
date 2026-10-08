import { AegisClient } from '../client';
import { ClientRole } from '../types/client-factory';
import { buildNetworkFailureDiagnostic, NetworkFailureDiagnostic } from './network';

export type RpcReachability = 'reachable' | 'unreachable' | 'unknown';

export interface RuntimeDiagnostics {
  rpcReachability: RpcReachability;
  rpcFailure?: NetworkFailureDiagnostic;
  role: ClientRole | 'unspecified';
  signerConfigured: boolean;
}

/**
 * Probes live runtime state for a constructed `AegisClient`: whether the RPC
 * endpoint responds, the declared role (if known), and whether a signer is
 * configured. Never returns the signer itself — only its presence — and any
 * RPC failure is passed through the existing redacted network-failure
 * diagnostic rather than the raw error.
 */
export async function buildRuntimeDiagnostics(
  client: AegisClient,
  opts: { role?: ClientRole } = {},
): Promise<RuntimeDiagnostics> {
  let rpcReachability: RpcReachability = 'unknown';
  let rpcFailure: NetworkFailureDiagnostic | undefined;

  try {
    await client.runNetworkOperation(() => client.rpcServer.getHealth());
    rpcReachability = 'reachable';
  } catch (error) {
    rpcReachability = 'unreachable';
    rpcFailure = buildNetworkFailureDiagnostic(error);
  }

  return Object.freeze({
    rpcReachability,
    ...(rpcFailure ? { rpcFailure } : {}),
    role: opts.role ?? 'unspecified',
    signerConfigured: !!client.keypair,
  });
}
