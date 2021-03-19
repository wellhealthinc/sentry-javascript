import { ClientLike, Integration, ScopeContext } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

import { logAndExitProcess } from './exit';

type UnhandledRejectionMode = 'none' | 'warn' | 'strict';
type OnUncaughtExceptionOptions = {
  mode?: UnhandledRejectionMode;
};
type PromiseRejectionWithDomainContext = {
  domain?: { sentryContext?: ScopeContext };
};

const DEFAULT_REJECTION_MODE = 'warn';

export class OnUnhandledRejection implements Integration {
  public name = this.constructor.name;

  public constructor(private _options: OnUncaughtExceptionOptions = {}) {}

  public install(client: ClientLike): void {
    const handler = this._makeRejectionHandler(client);
    global.process.on('unhandledRejection', handler);
  }

  public _makeRejectionHandler(
    client: ClientLike,
  ): (reason: { stack?: string }, promise: PromiseRejectionWithDomainContext) => void {
    return (reason: { stack?: string }, promise: PromiseRejectionWithDomainContext): void => {
      const context = promise.domain?.sentryContext ?? {};

      const scope: ScopeContext = { extra: { unhandledPromiseRejection: true } };

      // TODO: Validate whether its still necessary to keep it
      // Preserve backwards compatibility with raven-node for now
      if (context.user) {
        scope.user = context.user;
      }
      if (context.tags) {
        scope.tags = context.tags;
      }
      if (context.extra) {
        scope.extra = {
          ...scope.extra,
          ...context.extra,
        };
      }

      client.captureException(reason, { hint: { originalException: promise }, scope });

      this._handleRejection(client, reason);
    };
  }

  private _handleRejection(client: ClientLike, reason: { stack?: string }): void {
    // https://github.com/nodejs/node/blob/7cf6f9e964aa00772965391c23acda6d71972a9a/lib/internal/process/promises.js#L234-L240
    const rejectionWarning =
      'This error originated either by ' +
      'throwing inside of an async function without a catch block, ' +
      'or by rejecting a promise which was not handled with .catch().' +
      ' The promise rejected with the reason:';

    const mode = this._options.mode ?? DEFAULT_REJECTION_MODE;

    /* eslint-disable no-console */
    if (mode === 'warn') {
      consoleSandbox(() => {
        console.warn(rejectionWarning);
        console.error(reason?.stack ?? reason);
      });
    } else if (mode === 'strict') {
      consoleSandbox(() => {
        console.warn(rejectionWarning);
      });
      logAndExitProcess(client)(reason);
    }
    /* eslint-enable no-console */
  }
}
