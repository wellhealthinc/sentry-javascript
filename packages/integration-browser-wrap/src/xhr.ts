import { WrappedFunction, Integration } from '@sentry/types';
import { fill, getFunctionName, getGlobalObject } from '@sentry/utils';

import { wrap } from './wrap';

type XMLHttpRequestProp = 'onload' | 'onerror' | 'onprogress' | 'onreadystatechange';

export class XHRWrap implements Integration {
  public name = this.constructor.name;

  public install(): void {
    if (!('XMLHttpRequest' in getGlobalObject())) {
      return;
    }

    fill(XMLHttpRequest.prototype, 'send', (originalSend: () => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function(this: XMLHttpRequest, ...args: any[]): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const xhr = this;
        const xmlHttpRequestProps: XMLHttpRequestProp[] = ['onload', 'onerror', 'onprogress', 'onreadystatechange'];

        xmlHttpRequestProps.forEach(prop => {
          if (prop in xhr && typeof xhr[prop] === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fill(xhr, prop, function(original: WrappedFunction): () => any {
              const mechanism = {
                data: {
                  function: prop,
                  handler: getFunctionName(original),
                },
                handled: true,
                type: 'instrument',
              };

              // If Instrument integration has been called before TryCatch, get the name of original function
              if (original.__sentry_original__) {
                mechanism.data.handler = getFunctionName(original.__sentry_original__);
              }

              // Otherwise wrap directly
              return wrap(original, mechanism);
            });
          }
        });

        return originalSend.apply(this, args);
      };
    });
  }
}
