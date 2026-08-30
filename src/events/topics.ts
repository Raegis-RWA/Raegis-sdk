/**
 * Known Aegis contract event topic names.
 *
 * These names align with the Aegis Soroban contract event catalogue and the
 * admin receipt operations documented in the SDK. Additional aliases are accepted
 * by the decoder for forward compatibility.
 */
export const AEGIS_EVENT_TOPICS = {
  WHITELIST_ADD: 'whitelist_add',
  WHITELIST_REMOVE: 'whitelist_remove',
  MINT: 'mint',
  MINT_ASSET: 'mint_asset',
  TRANSFER: 'transfer',
  PROTOCOL_PAUSE: 'protocol_pause',
  PROTOCOL_UNPAUSE: 'protocol_unpause',
  ASSET_REGISTER: 'asset_register',
  ASSET_METADATA: 'asset_metadata',
  ROLE_GRANT: 'role_grant',
  ROLE_REVOKE: 'role_revoke',
} as const;

export type AegisEventTopicName =
  (typeof AEGIS_EVENT_TOPICS)[keyof typeof AEGIS_EVENT_TOPICS];

const EVENT_NAME_ALIASES: Readonly<Record<string, AegisEventTopicName>> = {
  whitelist_add: AEGIS_EVENT_TOPICS.WHITELIST_ADD,
  whitelist_added: AEGIS_EVENT_TOPICS.WHITELIST_ADD,
  add_to_whitelist: AEGIS_EVENT_TOPICS.WHITELIST_ADD,
  whitelist_remove: AEGIS_EVENT_TOPICS.WHITELIST_REMOVE,
  whitelist_removed: AEGIS_EVENT_TOPICS.WHITELIST_REMOVE,
  remove_from_whitelist: AEGIS_EVENT_TOPICS.WHITELIST_REMOVE,
  mint: AEGIS_EVENT_TOPICS.MINT,
  mint_asset: AEGIS_EVENT_TOPICS.MINT_ASSET,
  transfer: AEGIS_EVENT_TOPICS.TRANSFER,
  protocol_pause: AEGIS_EVENT_TOPICS.PROTOCOL_PAUSE,
  pause: AEGIS_EVENT_TOPICS.PROTOCOL_PAUSE,
  protocol_unpause: AEGIS_EVENT_TOPICS.PROTOCOL_UNPAUSE,
  unpause: AEGIS_EVENT_TOPICS.PROTOCOL_UNPAUSE,
  asset_register: AEGIS_EVENT_TOPICS.ASSET_REGISTER,
  register_asset: AEGIS_EVENT_TOPICS.ASSET_REGISTER,
  asset_metadata: AEGIS_EVENT_TOPICS.ASSET_METADATA,
  metadata_update: AEGIS_EVENT_TOPICS.ASSET_METADATA,
  role_grant: AEGIS_EVENT_TOPICS.ROLE_GRANT,
  grant_role: AEGIS_EVENT_TOPICS.ROLE_GRANT,
  role_revoke: AEGIS_EVENT_TOPICS.ROLE_REVOKE,
  revoke_role: AEGIS_EVENT_TOPICS.ROLE_REVOKE,
};

/**
 * Normalises a raw event topic name to a canonical Aegis topic when possible.
 */
export function normalizeEventTopicName(eventName: string): string {
  const key = eventName.trim().toLowerCase();
  return EVENT_NAME_ALIASES[key] ?? eventName;
}

/**
 * Returns true when the topic name is a known Aegis event.
 */
export function isKnownAegisEventTopic(eventName: string): boolean {
  const key = eventName.trim().toLowerCase();
  return key in EVENT_NAME_ALIASES;
}
