import { AegisSdkError } from './public';

export type EventDecodeErrorCode =
  | 'INVALID_EVENT_INPUT'
  | 'EMPTY_TOPICS'
  | 'TOPIC_DECODE_FAILED'
  | 'VALUE_DECODE_FAILED'
  | 'UNSUPPORTED_EVENT';

export class EventDecodeError extends AegisSdkError<EventDecodeErrorCode> {
  constructor(code: EventDecodeErrorCode, message: string) {
    super({
      code,
      category: 'soroban',
      message,
    });
    this.name = 'EventDecodeError';
  }
}
