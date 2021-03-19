import { ClientLike, Integration, SentryEvent } from '@sentry/types';

export class SessionTiming implements Integration {
  public name = this.constructor.name;

  protected readonly _startTime: number = Date.now();

  public install(client: ClientLike): void {
    client.addEventProcessor(event => this.process(event));
  }

  public process(event: SentryEvent): SentryEvent {
    const now = Date.now();

    return {
      ...event,
      extra: {
        ...event.extra,
        ['session:start']: this._startTime,
        ['session:duration']: now - this._startTime,
        ['session:end']: now,
      },
    };
  }
}
