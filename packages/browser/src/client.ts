import { BaseClient, SDK_VERSION } from '@sentry/core';
import { CaptureContext, SentryEvent, Options, ScopeLike } from '@sentry/types';
import { supportsFetch } from '@sentry/utils';
import { FetchTransport } from '@sentry/transport-fetch';
import { XHRTransport } from '@sentry/transport-xhr';
import { getCarrier } from '@sentry/minimal';
import { eventFromException, eventFromMessage } from '@sentry/eventbuilder-browser';

/**
 * Configuration options for the Sentry Browser SDK.
 * @see BrowserClient for more information.
 */
export interface BrowserOptions extends Options {
  /**
   * A pattern for error URLs which should exclusively be sent to Sentry.
   * This is the opposite of {@link Options.denyUrls}.
   * By default, all errors will be sent.
   */
  allowUrls?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should not be sent to Sentry.
   * To allow certain errors instead, use {@link Options.allowUrls}.
   * By default, all errors will be sent.
   */
  denyUrls?: Array<string | RegExp>;

  /**
   * A flag enabling Sessions Tracking feature.
   * By default Sessions Tracking is disabled.
   */
  autoSessionTracking?: boolean;
}

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BrowserClient extends BaseClient<BrowserOptions> {
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BrowserOptions = {}) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.browser',
      packages: [
        {
          name: 'npm:@sentry/browser',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };
    options.transport = options.transport ?? (supportsFetch() ? FetchTransport : XHRTransport);

    super(options);
  }

  public getScope(): ScopeLike | undefined {
    return this._scope || getCarrier().scope;
  }

  protected _eventFromException(exception: unknown, captureContext: CaptureContext): PromiseLike<SentryEvent> {
    return eventFromException(this.options, exception, captureContext);
  }

  protected _eventFromMessage(message: string, captureContext: CaptureContext): PromiseLike<SentryEvent> {
    return eventFromMessage(this.options, message, captureContext);
  }
}
