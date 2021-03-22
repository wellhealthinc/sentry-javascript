import { BrowserOptions, init as browserInit, SDK_VERSION } from '@sentry/browser';
import { ClientLike } from '@sentry/types';

/**
 * Inits the React SDK
 */
export function init(options: BrowserOptions): ClientLike {
  options._metadata = options._metadata || {};
  if (options._metadata.sdk === undefined) {
    options._metadata.sdk = {
      name: 'sentry.javascript.react',
      packages: [
        {
          name: 'npm:@sentry/react',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };
  }

  return browserInit(options);
}
