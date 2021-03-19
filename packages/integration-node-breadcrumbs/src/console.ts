import * as util from 'util';

import { ClientLike, Integration, Severity } from '@sentry/types';
import { fill } from '@sentry/utils';

export class ConsoleBreadcrumbs implements Integration {
  public name = this.constructor.name;

  private _client!: ClientLike;

  /**
   * @inheritDoc
   */
  public install(client: ClientLike): void {
    this._client = client;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const consoleModule = require('console');
    for (const level of ['debug', 'info', 'warn', 'error', 'log']) {
      fill(consoleModule, level, createConsoleWrapper(level, this._client));
    }
  }
}

/**
 * Wrapper function that'll be used for every console level
 */
function createConsoleWrapper(level: string, client: ClientLike): (originalConsoleMethod: () => void) => void {
  return function consoleWrapper(originalConsoleMethod: () => void): () => void {
    let sentryLevel: Severity;

    switch (level) {
      case 'debug':
        sentryLevel = Severity.Debug;
        break;
      case 'error':
        sentryLevel = Severity.Error;
        break;
      case 'info':
        sentryLevel = Severity.Info;
        break;
      case 'warn':
        sentryLevel = Severity.Warning;
        break;
      default:
        sentryLevel = Severity.Log;
    }

    return function(this: typeof console, ...args: unknown[]): void {
      client.getScope()?.addBreadcrumb(
        {
          category: 'console',
          level: sentryLevel,
          message: util.format.apply(undefined, args),
        },
        {
          input: [...args],
          level,
        },
      );

      originalConsoleMethod.apply(this, args);
    };
  };
}
