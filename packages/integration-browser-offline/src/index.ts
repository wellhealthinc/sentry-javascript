import { SentryEvent, ClientLike, Integration } from '@sentry/types';
import { getGlobalObject, logger, normalize, uuid4 } from '@sentry/utils';

import * as localForageType from 'localforage';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const localForage = require('localforage');

type OfflineOptions = {
  maxStoredEvents?: number;
};

export class Offline implements Integration {
  public name = this.constructor.name;

  /**
   * the global instance
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public global: any;

  /**
   * maximum number of events to store while offline
   */
  public maxStoredEvents: number;

  /**
   * event cache
   */
  public offlineEventStore: typeof localForageType; // type imported from localforage

  private _client!: ClientLike;

  /**
   * @inheritDoc
   */
  public constructor(options: OfflineOptions = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.global = getGlobalObject<any>();
    this.maxStoredEvents = options.maxStoredEvents ?? 30; // set a reasonable default
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.offlineEventStore = localForage.createInstance({
      name: 'sentry/offlineEventStore',
    });
  }

  /**
   * @inheritDoc
   */
  public install(client: ClientLike): void {
    this._client = client;

    if ('addEventListener' in this.global) {
      this.global.addEventListener('online', () => {
        this._sendEvents().catch(() => {
          logger.warn('could not send cached events');
        });
      });
    }

    client.addEventProcessor((event: SentryEvent) => {
      // cache if we are positively offline
      if ('navigator' in this.global && 'onLine' in this.global.navigator && !this.global.navigator.onLine) {
        this._cacheEvent(event)
          .then((_event: SentryEvent): Promise<void> => this._enforceMaxEvents())
          .catch((_error): void => {
            logger.warn('could not cache event while offline');
          });

        // return null on success or failure, because being offline will still result in an error
        return null;
      }

      return event;
    });

    // if online now, send any events stored in a previous offline session
    if ('navigator' in this.global && 'onLine' in this.global.navigator && this.global.navigator.onLine) {
      this._sendEvents().catch(() => {
        logger.warn('could not send cached events');
      });
    }
  }

  /**
   * cache an event to send later
   * @param event an event
   */
  private async _cacheEvent(event: SentryEvent): Promise<SentryEvent> {
    return this.offlineEventStore.setItem<SentryEvent>(uuid4(), normalize(event));
  }

  /**
   * purge excess events if necessary
   */
  private async _enforceMaxEvents(): Promise<void> {
    const events: Array<{ event: SentryEvent; cacheKey: string }> = [];

    return this.offlineEventStore
      .iterate<SentryEvent, void>((event: SentryEvent, cacheKey: string, _index: number): void => {
        // aggregate events
        events.push({ cacheKey, event });
      })
      .then(
        (): Promise<void> =>
          // this promise resolves when the iteration is finished
          this._purgeEvents(
            // purge all events past maxStoredEvents in reverse chronological order
            events
              .sort((a, b) => (b.event.timestamp || 0) - (a.event.timestamp || 0))
              .slice(this.maxStoredEvents < events.length ? this.maxStoredEvents : events.length)
              .map(event => event.cacheKey),
          ),
      )
      .catch((_error): void => {
        logger.warn('could not enforce max events');
      });
  }

  /**
   * purge event from cache
   */
  private async _purgeEvent(cacheKey: string): Promise<void> {
    return this.offlineEventStore.removeItem(cacheKey);
  }

  /**
   * purge events from cache
   */
  private async _purgeEvents(cacheKeys: string[]): Promise<void> {
    // trail with .then to ensure the return type as void and not void|void[]
    return Promise.all(cacheKeys.map(cacheKey => this._purgeEvent(cacheKey))).then();
  }

  /**
   * send all events
   */
  private async _sendEvents(): Promise<void> {
    return this.offlineEventStore.iterate<SentryEvent, void>(
      (event: SentryEvent, cacheKey: string, _index: number): void => {
        this._client.captureEvent(event);

        this._purgeEvent(cacheKey).catch((_error): void => {
          logger.warn('could not purge event from cache');
        });
      },
    );
  }
}
