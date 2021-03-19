/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ClientLike, SentryEvent, Integration } from '@sentry/types';
import {
  addExceptionMechanism,
  addInstrumentationHandler,
  getLocationHref,
  isErrorEvent,
  isPrimitive,
  isString,
  logger,
} from '@sentry/utils';
import { eventFromUnknownInput } from '@sentry/eventbuilder-browser';

export class OnError implements Integration {
  public name = this.constructor.name;

  public install(client: ClientLike): void {
    Error.stackTraceLimit = 50;

    addInstrumentationHandler({
      callback: ({ msg, url, line, column, error }) => {
        // TODO: Restore this functinality based on some error metadata
        // if (shouldIgnoreOnError()) {
        //   return;
        // }

        if (error?.__sentry_own_request__) {
          return;
        }

        const event = isPrimitive(error)
          ? this._eventFromIncompleteOnError(msg, url, line, column)
          : this._enhanceEventWithInitialFrame(
              eventFromUnknownInput(error, undefined, {
                attachStacktrace: client.options?.attachStacktrace,
                rejection: false,
              }),
              url,
              line,
              column,
            );

        addExceptionMechanism(event, {
          handled: false,
          type: 'onerror',
        });

        client.captureEvent(event, { hint: { originalException: error } });
      },
      type: 'error',
    });

    logger.log('Global Handler attached: onerror');
  }

  /**
   * This function creates a stack from an old, error-less onerror handler.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _eventFromIncompleteOnError(msg: any, url: any, line: any, column: any): SentryEvent {
    const ERROR_TYPES_RE = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/i;

    // If 'message' is ErrorEvent, get real message from inside
    let message = isErrorEvent(msg) ? msg.message : msg;
    let name;

    if (isString(message)) {
      const groups = message.match(ERROR_TYPES_RE);
      if (groups) {
        name = groups[1];
        message = groups[2];
      }
    }

    const event = {
      exception: {
        values: [
          {
            type: name || 'Error',
            value: message,
          },
        ],
      },
    };

    return this._enhanceEventWithInitialFrame(event, url, line, column);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _enhanceEventWithInitialFrame(event: SentryEvent, url: any, line: any, column: any): SentryEvent {
    event.exception = event.exception || {};
    event.exception.values = event.exception.values || [];
    event.exception.values[0] = event.exception.values[0] || {};
    event.exception.values[0].stacktrace = event.exception.values[0].stacktrace || {};
    event.exception.values[0].stacktrace.frames = event.exception.values[0].stacktrace.frames || [];

    if (event.exception.values[0].stacktrace.frames.length === 0) {
      const colno = isNaN(parseInt(column, 10)) ? undefined : column;
      const lineno = isNaN(parseInt(line, 10)) ? undefined : line;
      const filename = isString(url) && url.length > 0 ? url : getLocationHref();

      event.exception.values[0].stacktrace.frames.push({
        colno,
        filename,
        function: '?',
        in_app: true,
        lineno,
      });
    }

    return event;
  }
}
