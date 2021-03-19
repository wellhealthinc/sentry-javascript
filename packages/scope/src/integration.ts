import { ClientLike, Integration } from '@sentry/types';
import { getCurrentScope } from '@sentry/minimal';

export class ScopeIntegration implements Integration {
  public name = this.constructor.name;

  /**
   * @inheritDoc
   */
  public install(client: ClientLike): void {
    client.addEventProcessor(event => {
      return getCurrentScope()?.applyToEvent(event) || event;
    });
  }
}
