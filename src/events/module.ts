import { rpc } from '@stellar/stellar-sdk';
import { AegisClient } from '../client';
import {
  AegisContractEvent,
  ContractEventInput,
  DecodeContractEventOptions,
} from '../types/contract-event';
import { PaginationValidationError } from '../errors/pagination';
import {
  PaginationContinuation,
  PaginationPageInfo,
  PaginationRequest,
} from '../types/pagination';
import { resolvePaginationRequest } from '../utils/pagination';
import { decodeContractEvent, decodeContractEvents } from './decoder';

export type FetchContractEventsRequest = Parameters<rpc.Server['getEvents']>[0];

export interface FetchContractEventsOptions
  extends DecodeContractEventOptions,
    PaginationRequest {
  startLedger?: number;
}

export interface FetchContractEventsResult {
  latestLedger: number;
  events: AegisContractEvent[];
  cursor?: string;
  pagination: PaginationPageInfo;
}

/**
 * Module for fetching and decoding Aegis contract events from Soroban RPC.
 */
export class EventsModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Decodes a raw or parsed Soroban contract event.
   */
  public decode(
    input: ContractEventInput,
    options?: DecodeContractEventOptions
  ): AegisContractEvent {
    return decodeContractEvent(input, options);
  }

  /**
   * Fetches contract events from RPC and decodes them into typed Aegis events.
   * Pagination options override the same fields in `request` when provided.
   */
  public async fetchAndDecode(
    request: FetchContractEventsRequest,
    options: FetchContractEventsOptions = {}
  ): Promise<FetchContractEventsResult> {
    const startLedger = options.startLedger ?? request.startLedger;
    const pagination = resolvePaginationRequest({
      cursor: options.cursor ?? request.cursor,
      limit: options.limit ?? request.limit,
    });

    if (startLedger !== undefined && pagination.cursor !== undefined) {
      throw new PaginationValidationError(
        'INVALID_CURSOR',
        'cursor',
        'Event pagination cursor cannot be combined with startLedger.'
      );
    }

    const response = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.getEvents({
        ...request,
        startLedger,
        cursor: pagination.cursor,
        limit: pagination.limit,
      })
    );

    const inputs: ContractEventInput[] = response.events.map((event) => ({
      contractId: event.contractId?.toString(),
      txHash: event.txHash,
      ledger: event.ledger,
      inSuccessfulContractCall: event.inSuccessfulContractCall,
      topic: event.topic,
      value: event.value,
    }));
    const events = decodeContractEvents(inputs, options);
    const cursor = response.events.at(-1)?.pagingToken;
    const continuation: PaginationContinuation =
      cursor === undefined
        ? { state: 'complete' }
        : { state: 'unknown', cursor };

    return {
      latestLedger: response.latestLedger,
      events,
      cursor,
      pagination: {
        request: pagination,
        continuation,
      },
    };
  }
}
