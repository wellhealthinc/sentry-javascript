import { ClientLike, Integration } from '@sentry/types';
import { dynamicRequire, fill, logger } from '@sentry/utils';

interface PgClient {
  prototype: {
    query: () => void | Promise<unknown>;
  };
}

/** Tracing integration for node-postgres package */
export class Postgres implements Integration {
  public name = this.constructor.name;

  public install(client: ClientLike): void {
    let pgClient: PgClient;

    try {
      const pgModule = dynamicRequire(module, 'pg') as { Client: PgClient };
      pgClient = pgModule.Client;
    } catch (e) {
      logger.error('Postgres Integration was unable to require `pg` package.');
      return;
    }

    /**
     * function (query, callback) => void
     * function (query, params, callback) => void
     * function (query) => Promise
     * function (query, params) => Promise
     */
    fill(pgClient.prototype, 'query', function(orig: () => void | Promise<unknown>) {
      return function(this: unknown, config: unknown, values: unknown, callback: unknown) {
        const parentSpan = client.getScope().getSpan();
        const span = parentSpan?.startChild({
          description: typeof config === 'string' ? config : (config as { text: string }).text,
          op: `db`,
        });

        if (typeof callback === 'function') {
          return orig.call(this, config, values, function(err: Error, result: unknown) {
            span?.finish();
            callback(err, result);
          });
        }

        if (typeof values === 'function') {
          return orig.call(this, config, function(err: Error, result: unknown) {
            span?.finish();
            values(err, result);
          });
        }

        return (orig.call(this, config, values) as Promise<unknown>).then((res: unknown) => {
          span?.finish();
          return res;
        });
      };
    });
  }
}
