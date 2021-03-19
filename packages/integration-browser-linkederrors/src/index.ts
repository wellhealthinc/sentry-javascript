import { ClientLike, EventHint, Exception, ExtendedError, Integration, SentryEvent } from '@sentry/types';
import { isInstanceOf } from '@sentry/utils';
import { computeStackTrace, exceptionFromStacktrace } from '@sentry/eventbuilder-browser';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

// TODO: Make this (and node version) built-in (?)
export class LinkedErrors implements Integration {
  public name = this.constructor.name;

  private readonly _key: string;
  private readonly _limit: number;

  public constructor(options: { key?: string; limit?: number } = {}) {
    this._key = options.key ?? DEFAULT_KEY;
    this._limit = options.limit ?? DEFAULT_LIMIT;
  }

  public install(client: ClientLike): void {
    client.addEventProcessor((event: SentryEvent, hint?: EventHint) => {
      if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
        return event;
      }
      const linkedErrors = this._walkErrorTree(hint.originalException as ExtendedError, this._key);
      event.exception.values = [...linkedErrors, ...event.exception.values];
      return event;
    });
  }

  private _walkErrorTree(error: ExtendedError, key: string, stack: Exception[] = []): Exception[] {
    if (!isInstanceOf(error[key], Error) || stack.length + 1 >= this._limit) {
      return stack;
    }
    const stacktrace = computeStackTrace(error[key]);
    const exception = exceptionFromStacktrace(stacktrace);
    return this._walkErrorTree(error[key], key, [exception, ...stack]);
  }
}
