import { ClientLike, Integration } from '@sentry/types';
import { addInstrumentationHandler, htmlTreeAsString } from '@sentry/utils';

export class DOMBreadcrumbs implements Integration {
  public name = this.constructor.name;

  public install(client: ClientLike): void {
    addInstrumentationHandler({
      type: 'dom',
      callback: (handlerData: {
        name: string;
        global: unknown;
        event: {
          target: unknown;
        };
      }) => {
        let target;

        // Accessing event.target can throw (see getsentry/raven-js#838, #768)
        try {
          target = handlerData.event.target
            ? htmlTreeAsString(handlerData.event.target as Node)
            : htmlTreeAsString((handlerData.event as unknown) as Node);
        } catch (e) {
          target = '<unknown>';
        }

        if (target.length === 0) {
          return;
        }

        client.getScope().addBreadcrumb(
          {
            category: `ui.${handlerData.name}`,
            message: target,
          },
          {
            event: handlerData.event,
            name: handlerData.name,
            global: handlerData.global,
          },
        );
      },
    });
  }
}
