import { Dsn } from './dsn';
import { CaptureContext, SentryEvent } from './event';
import { EventProcessor } from './eventprocessor';
import { OptionsV7 } from './options';
import { ScopeLike } from './scope';
import { Session } from './session';

/**
 * User-Facing Sentry SDK Client.
 *
 * This interface contains all methods to interface with the SDK once it has
 * been installed. It allows to send events to Sentry, record breadcrumbs and
 * set a context included in every event. Since the SDK mutates its environment,
 * there will only be one instance during runtime.
 *
 */
export interface ClientLike<O extends OptionsV7 = OptionsV7> {
  options: O;

  lastEventId(): string | undefined;
  getScope(): ScopeLike;
  addEventProcessor(callback: EventProcessor): void;
  // TODO: To be removed? Can be obtained from options
  getDsn(): Dsn | undefined;

  captureException(exception: unknown, captureContext?: CaptureContext): string | undefined;
  captureMessage(message: string, captureContext?: CaptureContext): string | undefined;
  captureEvent(event: SentryEvent, captureContext?: CaptureContext): string | undefined;
  captureSession(session: Session): void;

  flush(timeout?: number): PromiseLike<boolean>;
  close(timeout?: number): PromiseLike<boolean>;
}
