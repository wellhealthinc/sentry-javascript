// TODO: All these functions are confusing af. They _have_ to be unified and become more descriptive in one way or another.

import { CaptureContext, SentryEvent, Mechanism, OptionsV7, Severity } from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  extractExceptionKeysForMessage,
  isError,
  isPlainObject,
  normalizeToSize,
  SyncPromise,
} from '@sentry/utils';

import { extractStackFromError, parseError, parseStack, prepareFramesForEvent } from './parsers';
export { getExceptionFromError } from './parsers';

export function eventFromException(
  options: OptionsV7,
  exception: unknown,
  captureContext: CaptureContext,
): PromiseLike<SentryEvent> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ex: any = exception;
  const mechanism: Mechanism = {
    handled: true,
    type: 'generic',
  };
  let shouldSerializeException = false;

  if (!isError(exception)) {
    if (isPlainObject(exception)) {
      // This will allow us to group events based on top-level keys
      // which is much better than creating new group when any key/value change
      const message = `Non-Error exception captured with keys: ${extractExceptionKeysForMessage(exception)}`;
      shouldSerializeException = true;
      ex = captureContext.hint?.syntheticException || new Error(message);
      (ex as Error).message = message;
    } else {
      // This handles when someone does: `throw "something awesome";`
      // We use synthesized Error here so we can extract a (rough) stack trace.
      ex = captureContext.hint?.syntheticException || new Error(exception as string);
      (ex as Error).message = exception as string;
    }
    mechanism.synthetic = true;
  }

  return new SyncPromise<SentryEvent>((resolve, reject) =>
    parseError(ex as Error)
      .then(event => {
        addExceptionTypeValue(event, undefined, undefined);
        addExceptionMechanism(event, mechanism);
        if (captureContext.hint?.event_id) {
          event.event_id = captureContext.hint?.event_id;
        }
        event.platform = 'node';
        // TODO: Fix options type - we dont want to have a circular dependency on @sentry/node here
        if ((options as { serverName?: string }).serverName) {
          event.server_name = (options as { serverName?: string }).serverName;
        }
        if (shouldSerializeException) {
          event.extra = event.extra ?? {};
          event.extra.__serialized__ = normalizeToSize(exception as Record<string, unknown>);
        }
        resolve(event);
      })
      .then(null, reject),
  );
}

export function eventFromMessage(
  options: OptionsV7,
  message: string,
  captureContext: CaptureContext,
): PromiseLike<SentryEvent> {
  const event: SentryEvent = {
    level: captureContext.scope?.level ?? Severity.Info,
    message,
    platform: 'node',
  };

  if (captureContext.hint?.event_id) {
    event.event_id = captureContext.hint?.event_id;
  }

  return new SyncPromise<SentryEvent>(resolve => {
    if (options.attachStacktrace && captureContext.hint?.syntheticException) {
      const stack = extractStackFromError(captureContext.hint?.syntheticException);
      parseStack(stack)
        .then(frames => {
          event.stacktrace = {
            frames: prepareFramesForEvent(frames),
          };
          resolve(event);
        })
        .then(null, () => {
          resolve(event);
        });
    } else {
      resolve(event);
    }
  });
}
