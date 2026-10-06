export type SimulationOperation =
  | 'compliance'
  | 'mint'
  | 'transfer'
  | 'portfolio'
  | 'unknown';

export type SimulationReadinessState =
  | 'success'
  | 'warning'
  | 'failed'
  | 'unauthorised'
  | 'blocked'
  | 'unknown';

export type SimulationReadinessCode =
  | 'READY'
  | 'RESTORE_REQUIRED'
  | 'UNAUTHORISED'
  | 'COMPLIANCE_BLOCKED'
  | 'SIMULATION_FAILED'
  | 'UNKNOWN_SIMULATION_STATE';

export interface SimulationReadiness {
  operation: SimulationOperation;
  state: SimulationReadinessState;
  ready: boolean;
  code: SimulationReadinessCode;
  message: string;
  latestLedger?: number;
}

export interface SimulationTransport {
  simulateTransaction(transaction: any): Promise<unknown>;
}

const UNAUTHORISED_PATTERN =
  /unauthori[sz]ed|not authori[sz]ed|missing auth|auth(?:orization)? required|invalid auth/i;
const BLOCKED_PATTERN =
  /blocked|blacklist|not whitelisted|whitelist required|compliance|kyc|transfer restriction/i;

/**
 * Simulates a transaction and returns only the stable readiness surface.
 * Transport exceptions are intentionally collapsed to a safe failed state.
 */
export async function simulateTransactionReadiness(
  transport: SimulationTransport,
  transaction: any,
  operation: SimulationOperation = 'unknown',
): Promise<SimulationReadiness> {
  try {
    const response = await transport.simulateTransaction(transaction);
    return mapSimulationReadiness(response, operation);
  } catch {
    return result(
      operation,
      'failed',
      false,
      'SIMULATION_FAILED',
      'The transaction simulation failed.',
    );
  }
}

/**
 * Maps a parsed Soroban simulation response to a stable, user-safe readiness
 * result. Raw RPC error strings are used only for classification and are never
 * copied into the returned result.
 */
export function mapSimulationReadiness(
  response: unknown,
  operation: SimulationOperation = 'unknown',
): SimulationReadiness {
  if (!isRecord(response)) {
    return result(
      operation,
      'unknown',
      false,
      'UNKNOWN_SIMULATION_STATE',
      'The transaction simulation returned an unknown response.',
    );
  }

  const latestLedger = readFiniteNumber(response.latestLedger);
  const error = typeof response.error === 'string' ? response.error : '';

  if (error) {
    if (BLOCKED_PATTERN.test(error)) {
      return result(
        operation,
        'blocked',
        false,
        'COMPLIANCE_BLOCKED',
        'The simulated operation is blocked by protocol or compliance rules.',
        latestLedger,
      );
    }

    if (UNAUTHORISED_PATTERN.test(error)) {
      return result(
        operation,
        'unauthorised',
        false,
        'UNAUTHORISED',
        'The simulated operation is not authorised.',
        latestLedger,
      );
    }

    return result(
      operation,
      'failed',
      false,
      'SIMULATION_FAILED',
      'The transaction simulation failed.',
      latestLedger,
    );
  }

  if (response.restorePreamble !== undefined) {
    return result(
      operation,
      'warning',
      false,
      'RESTORE_REQUIRED',
      'Ledger entry restoration is required before submission.',
      latestLedger,
    );
  }

  if (
    response.transactionData !== undefined ||
    response.result !== undefined ||
    response.results !== undefined
  ) {
    return result(
      operation,
      'success',
      true,
      'READY',
      'The transaction simulation is ready for the next submission step.',
      latestLedger,
    );
  }

  return result(
    operation,
    'unknown',
    false,
    'UNKNOWN_SIMULATION_STATE',
    'The transaction simulation returned an unknown response.',
    latestLedger,
  );
}

function result(
  operation: SimulationOperation,
  state: SimulationReadinessState,
  ready: boolean,
  code: SimulationReadinessCode,
  message: string,
  latestLedger?: number,
): SimulationReadiness {
  return Object.freeze({
    operation,
    state,
    ready,
    code,
    message,
    ...(latestLedger !== undefined ? { latestLedger } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
