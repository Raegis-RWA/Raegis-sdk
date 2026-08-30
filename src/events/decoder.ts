import { xdr } from '@stellar/stellar-sdk';
import { EventDecodeError } from '../errors/event';
import { AEGIS_EVENT_TOPICS, normalizeEventTopicName } from './topics';
import {
  decodeEventName,
  decodeScVal,
  normalizeAddress,
  normalizeAmount,
  readPayloadField,
} from '../soroban/scval';
import {
  AdminContractEvent,
  AegisContractEvent,
  AssetMetadataContractEvent,
  ComplianceContractEvent,
  ContractEventInput,
  ContractEventEnvelope,
  DecodeContractEventOptions,
  MintContractEvent,
  TransferContractEvent,
  UnknownContractEvent,
  RoleContractEvent,
} from '../types/contract-event';

/**
 * Decodes a single Soroban contract event into a typed Aegis event model.
 * Unrecognised topics and malformed payloads return `kind: 'unknown'` by default.
 */
export function decodeContractEvent(
  input: ContractEventInput,
  options: DecodeContractEventOptions = {}
): AegisContractEvent {
  if (!input || !Array.isArray(input.topic)) {
    if (options.strict) {
      throw new EventDecodeError('INVALID_EVENT_INPUT', 'Contract event input must include a topic array.');
    }
    return buildUnknownEvent(input, [], null, 'Invalid contract event input.');
  }

  if (input.topic.length === 0) {
    if (options.strict) {
      throw new EventDecodeError('EMPTY_TOPICS', 'Contract event topics must not be empty.');
    }
    return buildUnknownEvent(input, [], null, 'Event topics array was empty.');
  }

  const decodedTopics = decodeTopicArray(input.topic);
  const eventName = decodeEventName(input.topic[0]);
  const normalizedName = eventName ? normalizeEventTopicName(eventName) : null;

  let decodedValue: unknown;
  try {
    decodedValue = decodeScVal(input.value);
  } catch (error) {
    if (options.strict) {
      throw error;
    }
    return buildUnknownEvent(
      input,
      decodedTopics,
      eventName,
      'Failed to decode event value payload.'
    );
  }

  const envelope = buildEnvelope(input, eventName);

  if (!normalizedName) {
    if (options.strict) {
      throw new EventDecodeError('TOPIC_DECODE_FAILED', 'Unable to decode event topic name.');
    }
    return buildUnknownEvent(input, decodedTopics, eventName, 'Unable to decode event topic name.');
  }

  switch (normalizedName) {
    case AEGIS_EVENT_TOPICS.WHITELIST_ADD:
      return decodeComplianceEvent(envelope, 'whitelist_add', decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.WHITELIST_REMOVE:
      return decodeComplianceEvent(envelope, 'whitelist_remove', decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.MINT:
    case AEGIS_EVENT_TOPICS.MINT_ASSET:
      return decodeMintEvent(envelope, decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.TRANSFER:
      return decodeTransferEvent(envelope, decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.PROTOCOL_PAUSE:
      return decodeAdminEvent(envelope, 'protocol_pause', decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.PROTOCOL_UNPAUSE:
      return decodeAdminEvent(envelope, 'protocol_unpause', decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.ASSET_REGISTER:
      return decodeAdminEvent(envelope, 'asset_register', decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.ASSET_METADATA:
      return decodeAssetMetadataEvent(envelope, decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.ROLE_GRANT:
      return decodeRoleEvent(envelope, 'role_grant', decodedTopics, decodedValue, options);
    case AEGIS_EVENT_TOPICS.ROLE_REVOKE:
      return decodeRoleEvent(envelope, 'role_revoke', decodedTopics, decodedValue, options);
    default:
      if (options.strict) {
        throw new EventDecodeError(
          'UNSUPPORTED_EVENT',
          `Unsupported Aegis contract event topic: ${normalizedName}`
        );
      }
      return buildUnknownEvent(input, decodedTopics, eventName, 'Unsupported event topic.');
  }
}

/**
 * Decodes multiple contract events, preserving order.
 */
export function decodeContractEvents(
  inputs: ContractEventInput[],
  options: DecodeContractEventOptions = {}
): AegisContractEvent[] {
  return inputs.map((input) => decodeContractEvent(input, options));
}

function buildEnvelope(
  input: ContractEventInput,
  eventName: string | null
): ContractEventEnvelope {
  return {
    contractId: input.contractId,
    txHash: input.txHash,
    ledger: input.ledger,
    inSuccessfulContractCall: input.inSuccessfulContractCall ?? true,
    eventName,
    decodedAt: new Date().toISOString(),
  };
}

function decodeTopicArray(
  topics: Array<string | xdr.ScVal>
): unknown[] {
  return topics.map((topic) => {
    try {
      return decodeScVal(topic);
    } catch {
      return null;
    }
  });
}

function decodeComplianceEvent(
  envelope: ContractEventEnvelope,
  action: ComplianceContractEvent['action'],
  topics: unknown[],
  value: unknown,
  options: DecodeContractEventOptions
): ComplianceContractEvent | UnknownContractEvent {
  const address =
    normalizeAddress(topics[1]) ??
    normalizeAddress(readPayloadField(value, 'address')) ??
    normalizeAddress(readPayloadField(value, 'investor'));

  if (!address) {
    return failOrUnknown(
      envelope,
      topics,
      value,
      options,
      'Compliance event is missing investor address.'
    );
  }

  const admin =
    normalizeAddress(readPayloadField(value, 'admin')) ??
    normalizeAddress(readPayloadField(value, 'operator')) ??
    undefined;

  return {
    ...envelope,
    kind: 'compliance',
    action,
    address,
    ...(admin ? { admin } : {}),
  };
}

function decodeMintEvent(
  envelope: ContractEventEnvelope,
  topics: unknown[],
  value: unknown,
  options: DecodeContractEventOptions
): MintContractEvent | UnknownContractEvent {
  const to =
    normalizeAddress(topics[1]) ??
    normalizeAddress(readPayloadField(value, 'to')) ??
    normalizeAddress(readPayloadField(value, 'recipient'));

  const amount =
    normalizeAmount(value) ??
    normalizeAmount(readPayloadField(value, 'amount'));

  if (!to || amount === null) {
    return failOrUnknown(
      envelope,
      topics,
      value,
      options,
      'Mint event is missing recipient or amount.'
    );
  }

  const operator = normalizeAddress(readPayloadField(value, 'operator')) ?? undefined;
  const assetId =
    (readPayloadField(value, 'asset_id') as string | undefined) ??
    (readPayloadField(value, 'assetId') as string | undefined);

  return {
    ...envelope,
    kind: 'mint',
    to,
    amount,
    ...(operator ? { operator } : {}),
    ...(assetId ? { assetId } : {}),
  };
}

function decodeTransferEvent(
  envelope: ContractEventEnvelope,
  topics: unknown[],
  value: unknown,
  options: DecodeContractEventOptions
): TransferContractEvent | UnknownContractEvent {
  const from =
    normalizeAddress(topics[1]) ??
    normalizeAddress(readPayloadField(value, 'from'));

  const to =
    normalizeAddress(topics[2]) ??
    normalizeAddress(readPayloadField(value, 'to'));

  const amount =
    normalizeAmount(value) ??
    normalizeAmount(readPayloadField(value, 'amount'));

  if (!from || !to || amount === null) {
    return failOrUnknown(
      envelope,
      topics,
      value,
      options,
      'Transfer event is missing from, to, or amount.'
    );
  }

  return {
    ...envelope,
    kind: 'transfer',
    from,
    to,
    amount,
  };
}

function decodeAdminEvent(
  envelope: ContractEventEnvelope,
  action: AdminContractEvent['action'],
  topics: unknown[],
  value: unknown,
  options: DecodeContractEventOptions
): AdminContractEvent | UnknownContractEvent {
  const contractId =
    (readPayloadField(value, 'contract_id') as string | undefined) ??
    (readPayloadField(value, 'contractId') as string | undefined) ??
    decodeTopicIdentifier(topics[1]);

  const assetId =
    (readPayloadField(value, 'asset_id') as string | undefined) ??
    (readPayloadField(value, 'assetId') as string | undefined) ??
    decodeTopicIdentifier(topics[1]);

  const admin = normalizeAddress(readPayloadField(value, 'admin')) ?? undefined;

  if (action === 'asset_register' && !assetId) {
    return failOrUnknown(
      envelope,
      topics,
      value,
      options,
      'Asset registration event is missing asset identifier.'
    );
  }

  if (
    (action === 'protocol_pause' || action === 'protocol_unpause') &&
    !contractId
  ) {
    return failOrUnknown(
      envelope,
      topics,
      value,
      options,
      'Protocol admin event is missing contract identifier.'
    );
  }

  return {
    ...envelope,
    kind: 'admin',
    action,
    ...(contractId ? { contractId } : {}),
    ...(assetId ? { assetId } : {}),
    ...(admin ? { admin } : {}),
  };
}

function decodeTopicIdentifier(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const rendered = String(value);
    if (rendered && rendered !== '[object Object]') {
      return rendered;
    }
  }
  return undefined;
}

function decodeNumericField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function decodeAssetMetadataEvent(
  envelope: ContractEventEnvelope,
  topics: unknown[],
  value: unknown,
  options: DecodeContractEventOptions
): AssetMetadataContractEvent | UnknownContractEvent {
  const assetId =
    (readPayloadField(value, 'asset_id') as string | undefined) ??
    (readPayloadField(value, 'assetId') as string | undefined) ??
    decodeTopicIdentifier(topics[1]);

  const symbol = readPayloadField(value, 'symbol');
  const name = readPayloadField(value, 'name');
  const decimals = decodeNumericField(readPayloadField(value, 'decimals'));
  const category = readPayloadField(value, 'category');
  const isRwa = readPayloadField(value, 'is_rwa') ?? readPayloadField(value, 'isRwa');

  if (
    !assetId ||
    typeof symbol !== 'string' ||
    typeof name !== 'string' ||
    decimals === null
  ) {
    return failOrUnknown(
      envelope,
      topics,
      value,
      options,
      'Asset metadata event is missing required fields.'
    );
  }

  return {
    ...envelope,
    kind: 'asset_metadata',
    assetId,
    symbol,
    name,
    decimals,
    ...(typeof category === 'string' ? { category } : {}),
    ...(typeof isRwa === 'boolean' ? { isRwa } : {}),
  };
}

function decodeRoleEvent(
  envelope: ContractEventEnvelope,
  action: RoleContractEvent['action'],
  topics: unknown[],
  value: unknown,
  options: DecodeContractEventOptions
): RoleContractEvent | UnknownContractEvent {
  const address =
    normalizeAddress(topics[1]) ??
    normalizeAddress(topics[2]) ??
    normalizeAddress(readPayloadField(value, 'address')) ??
    normalizeAddress(readPayloadField(value, 'account'));

  let role = readPayloadField(value, 'role') as string | undefined;
  if (!role) {
    const t1 = decodeTopicIdentifier(topics[1]);
    const t2 = decodeTopicIdentifier(topics[2]);
    if (t1 && t1 !== address) role = t1;
    else if (t2 && t2 !== address) role = t2;
  }

  if (!address || !role) {
    return failOrUnknown(
      envelope,
      topics,
      value,
      options,
      'Role event is missing address or role.'
    );
  }

  const admin = normalizeAddress(readPayloadField(value, 'admin')) ?? undefined;

  return {
    ...envelope,
    kind: 'role',
    action,
    role,
    address,
    ...(admin ? { admin } : {}),
  };
}

function failOrUnknown(
  envelope: ContractEventEnvelope,
  topics: unknown[],
  value: unknown,
  options: DecodeContractEventOptions,
  reason: string
): UnknownContractEvent {
  if (options.strict) {
    throw new EventDecodeError('UNSUPPORTED_EVENT', reason);
  }

  return {
    ...envelope,
    kind: 'unknown',
    rawTopics: topics,
    rawValue: value,
    reason,
  };
}

function buildUnknownEvent(
  input: ContractEventInput,
  topics: unknown[],
  eventName: string | null,
  reason: string
): UnknownContractEvent {
  let rawValue: unknown = null;
  try {
    rawValue = decodeScVal(input.value);
  } catch {
    rawValue = null;
  }

  return {
    ...buildEnvelope(input, eventName),
    kind: 'unknown',
    rawTopics: topics,
    rawValue,
    reason,
  };
}
