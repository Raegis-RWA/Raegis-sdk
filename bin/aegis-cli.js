#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { Keypair } = require('@stellar/stellar-sdk');
const { AegisClient } = require('../dist/index.js');

function usage() {
  return [
    'Usage:',
    '  aegis-cli [--env-file <path>] whitelist <address>',
    '  aegis-cli [--env-file <path>] mint <address> <amount>',
    '',
    'Environment:',
    '  AEGIS_ADMIN_SECRET        Stellar secret key used to sign admin operations',
    '  AEGIS_CONTRACT_ID         Aegis Soroban contract id',
    '  AEGIS_ENVIRONMENT         testnet | local | mainnet (default: testnet)',
    '  AEGIS_RPC_URL             optional RPC override',
    '  AEGIS_NETWORK_PASSPHRASE  optional network-passphrase override',
    '  AEGIS_ALLOW_MAINNET       true/1/yes to opt into the mainnet preset',
  ].join('\n');
}

function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();

    const splitAt = line.indexOf('=');
    if (splitAt <= 0) continue;

    const key = line.slice(0, splitAt).trim();
    let value = line.slice(splitAt + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }

    values[key] = value;
  }
  return values;
}

function loadEnvironment(envFile, explicit) {
  const resolved = path.resolve(process.cwd(), envFile);
  let fileValues = {};

  try {
    fileValues = parseDotEnv(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    if (explicit || !error || error.code !== 'ENOENT') {
      throw new Error(`Unable to read env file: ${resolved}`);
    }
  }

  return { ...fileValues, ...process.env };
}

function requireValue(env, key) {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value.trim();
}

function parseBoolean(value) {
  return /^(1|true|yes)$/i.test(value || '');
}

function buildClient(env) {
  const secret = requireValue(env, 'AEGIS_ADMIN_SECRET');
  const contractId = requireValue(env, 'AEGIS_CONTRACT_ID');

  let keypair;
  try {
    keypair = Keypair.fromSecret(secret);
  } catch {
    throw new Error('AEGIS_ADMIN_SECRET is not a valid Stellar secret key');
  }

  const config = {
    contractId,
    environment: (env.AEGIS_ENVIRONMENT || 'testnet').trim(),
    keypair,
  };

  if (env.AEGIS_RPC_URL && env.AEGIS_RPC_URL.trim()) {
    config.rpcUrl = env.AEGIS_RPC_URL.trim();
  }
  if (env.AEGIS_NETWORK_PASSPHRASE && env.AEGIS_NETWORK_PASSPHRASE.trim()) {
    config.networkPassphrase = env.AEGIS_NETWORK_PASSPHRASE.trim();
  }
  if (parseBoolean(env.AEGIS_ALLOW_MAINNET)) {
    config.allowMainnet = true;
  }

  return { client: new AegisClient(config), secret };
}

function requireAddress(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('address is required');
  }
  return value.trim();
}

function requireAmount(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive integer');
  }
  return amount;
}

async function main() {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      'env-file': { type: 'string' },
    },
  });

  if (parsed.values.help) {
    console.log(usage());
    return;
  }

  const [command, ...args] = parsed.positionals;
  if (!command || !['whitelist', 'mint'].includes(command)) {
    throw new Error(usage());
  }

  const envFile = parsed.values['env-file'] || '.env';
  const env = loadEnvironment(envFile, Boolean(parsed.values['env-file']));
  const { client, secret } = buildClient(env);

  try {
    let hash;
    if (command === 'whitelist') {
      if (args.length !== 1) throw new Error(usage());
      hash = await client.compliance.whitelist(requireAddress(args[0]));
    } else {
      if (args.length !== 2) throw new Error(usage());
      hash = await client.asset.mint(requireAddress(args[0]), requireAmount(args[1]));
    }

    console.log(hash);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.split(secret).join('[redacted]'));
  }
}

main().catch((error) => {
  console.error(`aegis-cli: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
