import { ClientLike, Integration, Severity } from '@sentry/types';
import { addInstrumentationHandler, safeJoin } from '@sentry/utils';

export class ConsoleBreadcrumbs implements Integration {
  public name = this.constructor.name;

  public install(client: ClientLike): void {
    addInstrumentationHandler({
      type: 'console',
      callback: (handlerData: { level: string; args: unknown[] }) => {
        const breadcrumb = {
          category: 'console',
          data: {
            arguments: handlerData.args,
            logger: 'console',
          },
          level: Severity.fromString(handlerData.level),
          message: safeJoin(handlerData.args, ' '),
        };

        if (handlerData.level === 'assert') {
          if (handlerData.args[0] === false) {
            breadcrumb.message = `Assertion failed: ${safeJoin(handlerData.args.slice(1), ' ') || 'console.assert'}`;
            breadcrumb.data.arguments = handlerData.args.slice(1);
          } else {
            // Don't capture a breadcrumb for passed assertions
            return;
          }
        }

        client.getScope()?.addBreadcrumb(breadcrumb, {
          input: handlerData.args,
          level: handlerData.level,
        });
      },
    });
  }
}
