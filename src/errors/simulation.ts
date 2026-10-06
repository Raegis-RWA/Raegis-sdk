import {
  SimulationReadiness,
  SimulationReadinessCode,
  SimulationReadinessState,
} from '../transactions/simulation';

export class TransactionSimulationError extends Error {
  public readonly code: SimulationReadinessCode;
  public readonly state: SimulationReadinessState;
  public readonly readiness: SimulationReadiness;

  constructor(readiness: SimulationReadiness) {
    super(readiness.message);
    this.name = 'TransactionSimulationError';
    this.code = readiness.code;
    this.state = readiness.state;
    this.readiness = Object.freeze({ ...readiness });
    Object.setPrototypeOf(this, TransactionSimulationError.prototype);
  }
}
