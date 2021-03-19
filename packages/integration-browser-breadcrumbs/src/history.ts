import { ClientLike, Integration } from '@sentry/types';
import { addInstrumentationHandler, getGlobalObject, parseUrl } from '@sentry/utils';

export class HistoryBreadcrumbs implements Integration {
  public name = this.constructor.name;

  public install(client: ClientLike): void {
    addInstrumentationHandler({
      type: 'history',
      callback: (handlerData: { from?: string; to?: string }) => {
        const global = getGlobalObject<Window>();
        let from = handlerData.from;
        let to = handlerData.to;
        const parsedLoc = parseUrl(global.location.href);
        let parsedFrom = parseUrl(from ?? '');
        const parsedTo = parseUrl(to ?? '');

        // Initial pushState doesn't provide `from` information
        if (!parsedFrom.path) {
          parsedFrom = parsedLoc;
        }

        // Use only the path component of the URL if the URL matches the current
        // document (almost all the time when using pushState)
        if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host) {
          to = parsedTo.relative;
        }
        if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host) {
          from = parsedFrom.relative;
        }

        client.getScope()?.addBreadcrumb({
          category: 'navigation',
          data: {
            from,
            to,
          },
        });
      },
    });
  }
}
