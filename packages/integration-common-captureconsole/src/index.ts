import { ClientLike, Integration, ScopeContext, Severity } from '@sentry/types';
import { fill, getGlobalObject, safeJoin } from '@sentry/utils';

type Level = typeof LEVELS[number];
const LEVELS = ['log', 'info', 'warn', 'error', 'debug', 'assert'] as const;

type CaptoreConsoleOptions = {
  levels?: Level[];
};

export class CaptureConsole implements Integration {
  public name = this.constructor.name;

  private _levels: Level[];

  public constructor(options: CaptoreConsoleOptions = {}) {
    this._levels = options.levels ?? ((LEVELS as unknown) as Level[]);
  }

  public install(client: ClientLike): void {
    const global = getGlobalObject();

    if (!('console' in global)) {
      return;
    }

    this._levels.forEach((level: string) => {
      if (!(level in global.console)) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fill(global.console, level, (originalConsoleLevel: () => unknown) => (...args: unknown[]): void => {
        const scope: ScopeContext = {
          level: Severity.fromString(level),
          extra: {
            arguments: args,
          },
        };

        // TODO: Allow capture methods to accept a Scope instance so we can use things like
        //       `const scope = client.getScope().clone();` to mimick `withScope` per-client?
        // scope.addEventProcessor(event => {
        //   event.logger = 'console';
        //   return event;
        // });

        let message = safeJoin(args, ' ');
        if (level === 'assert') {
          if (args[0] === false) {
            message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
            scope.extra = {
              ...scope.extra,
              arguments: args.slice(1),
            };
            client.captureMessage(message, { scope });
          }
        } else {
          client.captureMessage(message, { scope });
        }

        // this fails for some browsers. :(
        if (originalConsoleLevel) {
          Function.prototype.apply.call(originalConsoleLevel, global.console, args);
        }
      });
    });
  }
}
