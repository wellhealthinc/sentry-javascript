import { ClientLike, EventHint, Exception, ExtendedError, Integration, SentryEvent } from '@sentry/types';
import { isInstanceOf, SyncPromise } from '@sentry/utils';
import { getExceptionFromError } from '@sentry/eventbuilder-node';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

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
        return SyncPromise.resolve(event);
      }

      return new SyncPromise<SentryEvent>(resolve => {
        this._walkErrorTree(hint.originalException as Error, this._key)
          .then((linkedErrors: Exception[]) => {
            if (event && event.exception && event.exception.values) {
              event.exception.values = [...linkedErrors, ...event.exception.values];
            }
            resolve(event);
          })
          .then(null, () => {
            resolve(event);
          });
      });
    });
  }

  private _walkErrorTree(error: ExtendedError, key: string, stack: Exception[] = []): PromiseLike<Exception[]> {
    if (!isInstanceOf(error[key], Error) || stack.length + 1 >= this._limit) {
      return SyncPromise.resolve(stack);
    }
    return new SyncPromise<Exception[]>((resolve, reject) => {
      getExceptionFromError(error[key])
        .then((exception: Exception) => {
          this._walkErrorTree(error[key], key, [exception, ...stack])
            .then(resolve)
            .then(null, () => {
              reject();
            });
        })
        .then(null, () => {
          reject();
        });
    });
  }
}
