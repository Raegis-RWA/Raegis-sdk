import {
  TransactionSimulationError,
  mapSimulationReadiness,
  simulateTransactionReadiness,
} from '../src';

describe('transaction simulation readiness', () => {
  it('maps a successful invocation to a ready result', () => {
    expect(
      mapSimulationReadiness(
        {
          latestLedger: 123,
          transactionData: {},
          result: { auth: [], retval: {} },
        },
        'mint',
      ),
    ).toEqual({
      operation: 'mint',
      state: 'success',
      ready: true,
      code: 'READY',
      message:
        'The transaction simulation is ready for the next submission step.',
      latestLedger: 123,
    });
  });

  it('maps restore preambles to a non-ready warning', () => {
    expect(
      mapSimulationReadiness(
        {
          latestLedger: 124,
          transactionData: {},
          result: {},
          restorePreamble: { transactionData: {}, minResourceFee: '100' },
        },
        'transfer',
      ),
    ).toMatchObject({
      operation: 'transfer',
      state: 'warning',
      ready: false,
      code: 'RESTORE_REQUIRED',
    });
  });

  it.each([
    [
      'Error(UnauthorizedInvocation): private-token',
      'unauthorised',
      'UNAUTHORISED',
    ],
    [
      'KYC compliance check blocked: secret payload',
      'blocked',
      'COMPLIANCE_BLOCKED',
    ],
    ['host function trapped: secret payload', 'failed', 'SIMULATION_FAILED'],
  ] as const)(
    'classifies error responses safely as %s',
    (rawError, state, code) => {
      const readiness = mapSimulationReadiness(
        { error: rawError, latestLedger: 125 },
        'compliance',
      );

      expect(readiness).toMatchObject({
        operation: 'compliance',
        state,
        ready: false,
        code,
      });
      expect(JSON.stringify(readiness)).not.toContain('secret');
      expect(JSON.stringify(readiness)).not.toContain('private-token');
    },
  );

  it('uses an unknown state for unrecognised responses', () => {
    expect(mapSimulationReadiness({}, 'portfolio')).toEqual({
      operation: 'portfolio',
      state: 'unknown',
      ready: false,
      code: 'UNKNOWN_SIMULATION_STATE',
      message: 'The transaction simulation returned an unknown response.',
    });
  });

  it('collapses thrown transport failures to a safe failed readiness result', async () => {
    const readiness = await simulateTransactionReadiness(
      {
        simulateTransaction: async () => {
          throw new Error('Bearer secret-provider-token');
        },
      },
      {},
      'mint',
    );

    expect(readiness).toEqual({
      operation: 'mint',
      state: 'failed',
      ready: false,
      code: 'SIMULATION_FAILED',
      message: 'The transaction simulation failed.',
    });

    const error = new TransactionSimulationError(readiness);
    expect(error).toMatchObject({
      name: 'TransactionSimulationError',
      state: 'failed',
      code: 'SIMULATION_FAILED',
    });
  });
});
