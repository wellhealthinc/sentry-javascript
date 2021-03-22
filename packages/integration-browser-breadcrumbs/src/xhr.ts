import { ClientLike, Integration } from '@sentry/types';
import { addInstrumentationHandler } from '@sentry/utils';

export class XHRBreadcrumbs implements Integration {
  public name = this.constructor.name;

  public install(client: ClientLike): void {
    addInstrumentationHandler({
      type: 'xhr',
      callback: (handlerData: {
        endTimestamp: number;
        xhr: {
          __sentry_xhr__: {
            method: string;
            url: string;
            status_code: number;
            body: string;
          };
          __sentry_own_request__: boolean;
        };
      }) => {
        // We only capture complete, non-sentry requests
        if (!handlerData.endTimestamp || handlerData.xhr.__sentry_own_request__) {
          return;
        }

        const { method, url, status_code, body } = handlerData.xhr.__sentry_xhr__ || {};

        client.getScope().addBreadcrumb(
          {
            category: 'xhr',
            data: {
              method,
              url,
              status_code,
            },
            type: 'http',
          },
          {
            xhr: handlerData.xhr,
            input: body,
          },
        );
      },
    });
  }
}
