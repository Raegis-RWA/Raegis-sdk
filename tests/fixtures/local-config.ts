import { Networks } from '@stellar/stellar-sdk';

/** Valid StrKey contract ID used across local-config fixtures (not a real deploy). */
export const LOCAL_FIXTURE_CONTRACT_ID =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

export const LOCAL_FIXTURE_RPC_URL = 'http://localhost:8000/soroban/rpc';

export const localEnvValid = Object.freeze({
  AEGIS_CONTRACT_ID: LOCAL_FIXTURE_CONTRACT_ID,
  AEGIS_LOCAL_RPC_URL: LOCAL_FIXTURE_RPC_URL,
  AEGIS_LOCAL_NETWORK_PASSPHRASE: Networks.STANDALONE,
  AEGIS_LOCAL_HORIZON_URL: 'http://localhost:8000',
  AEGIS_LOCAL_FRIENDBOT_URL: 'http://localhost:8000/friendbot',
});

export const localEnvMissingContract = Object.freeze({
  AEGIS_LOCAL_RPC_URL: LOCAL_FIXTURE_RPC_URL,
});

export const localEnvNonLoopback = Object.freeze({
  AEGIS_CONTRACT_ID: LOCAL_FIXTURE_CONTRACT_ID,
  AEGIS_LOCAL_RPC_URL: 'http://rpc.example.com/soroban/rpc',
});

export const localEnvDockerHost = Object.freeze({
  AEGIS_CONTRACT_ID: LOCAL_FIXTURE_CONTRACT_ID,
  AEGIS_LOCAL_RPC_URL: 'http://host.docker.internal:8000/soroban/rpc',
});

export const localEnvMalformedUrl = Object.freeze({
  AEGIS_CONTRACT_ID: LOCAL_FIXTURE_CONTRACT_ID,
  AEGIS_LOCAL_RPC_URL: 'not-a-url',
});

export const localEnvWhitespace = Object.freeze({
  AEGIS_CONTRACT_ID: '   ',
  AEGIS_LOCAL_RPC_URL: '  ',
  AEGIS_LOCAL_SECRET_KEY: '   ',
});
