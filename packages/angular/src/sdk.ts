import { BrowserOptions, init as browserInit, SDK_VERSION } from '@sentry/browser';
import { ClientLike } from '@sentry/types';

/**
 * Inits the Angular SDK
 */
export function init(options: BrowserOptions): ClientLike {
  options._metadata = options._metadata || {};
  options._metadata.sdk = {
    name: 'sentry.javascript.angular',
    packages: [
      {
        name: 'npm:@sentry/angular',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };
  return browserInit(options);
}
