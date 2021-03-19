/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ClientLike, SentryEvent, Integration, Primitive, Severity } from '@sentry/types';
import { addExceptionMechanism, addInstrumentationHandler, isPrimitive, logger } from '@sentry/utils';
import { eventFromUnknownInput } from '@sentry/eventbuilder-browser';

export class OnUnhandledRejection implements Integration {
  public name = this.constructor.name;

  public install(client: ClientLike): void {
    Error.stackTraceLimit = 50;

    addInstrumentationHandler({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (e: any) => {
        let error = e;

        // dig the object of the rejection out of known event types
        try {
          // PromiseRejectionEvents store the object of the rejection under 'reason'
          // see https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
          if ('reason' in e) {
            error = e.reason;
          }
          // something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
          // to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
          // the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
          // see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
          // https://github.com/getsentry/sentry-javascript/issues/2380
          else if ('detail' in e && 'reason' in e.detail) {
            error = e.detail.reason;
          }
        } catch (_oO) {
          // no-empty
        }

        // TODO: Restore this functinality based on some error metadata
        // if (shouldIgnoreOnError()) {
        //   return;
        // }

        if (error?.__sentry_own_request__) {
          return;
        }

        const event = isPrimitive(error)
          ? this._eventFromRejectionWithPrimitive(error)
          : eventFromUnknownInput(error, undefined, {
              attachStacktrace: client.options?.attachStacktrace,
              rejection: true,
            });

        event.level = Severity.Error;

        addExceptionMechanism(event, {
          handled: false,
          type: 'onunhandledrejection',
        });

        client.captureEvent(event, {
          hint: { originalException: error },
        });

        return;
      },
      type: 'unhandledrejection',
    });

    logger.log('Global Handler attached: onunhandledrejection');
  }

  /**
   * Create an event from a promise rejection where the `reason` is a primitive.
   *
   * @param reason: The `reason` property of the promise rejection
   * @returns An Event object with an appropriate `exception` value
   */
  private _eventFromRejectionWithPrimitive(reason: Primitive): SentryEvent {
    return {
      exception: {
        values: [
          {
            type: 'UnhandledRejection',
            // String() is needed because the Primitive type includes symbols (which can't be automatically stringified)
            value: `Non-Error promise rejection captured with value: ${String(reason)}`,
          },
        ],
      },
    };
  }
}
