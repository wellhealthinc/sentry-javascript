import { ClientLike, Integration } from '@sentry/types';
import { dynamicRequire, fill, logger } from '@sentry/utils';

interface MysqlConnection {
  prototype: {
    query: () => void;
  };
}

/** Tracing integration for node-mysql package */
export class Mysql implements Integration {
  public name = this.constructor.name;

  public install(client: ClientLike): void {
    let connection: MysqlConnection;

    try {
      // Unfortunatelly mysql is using some custom loading system and `Connection` is not exported directly.
      connection = dynamicRequire(module, 'mysql/lib/Connection.js');
    } catch (e) {
      logger.error('Mysql Integration was unable to require `mysql` package.');
      return;
    }

    // The original function will have one of these signatures:
    //    function (callback) => void
    //    function (options, callback) => void
    //    function (options, values, callback) => void
    fill(connection.prototype, 'query', function(orig: () => void) {
      return function(this: unknown, options: unknown, values: unknown, callback: unknown) {
        const parentSpan = client.getScope()?.getSpan();
        const span = parentSpan?.startChild({
          description: typeof options === 'string' ? options : (options as { sql: string }).sql,
          op: `db`,
        });

        if (typeof callback === 'function') {
          return orig.call(this, options, values, function(err: Error, result: unknown, fields: unknown) {
            span?.finish();
            callback(err, result, fields);
          });
        }

        if (typeof values === 'function') {
          return orig.call(this, options, function(err: Error, result: unknown, fields: unknown) {
            span?.finish();
            values(err, result, fields);
          });
        }

        return orig.call(this, options, values, callback);
      };
    });
  }
}
