// '@google-cloud/common' import is expected to be type-only so it's erased in the final .js file.
// When TypeScript compiler is upgraded, use `import type` syntax to explicitly assert that we don't want to load a module here.
import * as common from '@google-cloud/common';
import { getTransaction } from '@sentry/minimal';
import { ClientLike, Integration, Span } from '@sentry/types';
import { fill } from '@sentry/utils';

type RequestOptions = common.DecorateRequestOptions;
type ResponseCallback = common.BodyResponseCallback;
// This interace could be replaced with just type alias once the `strictBindCallApply` mode is enabled.
interface RequestFunction extends CallableFunction {
  (reqOpts: RequestOptions, callback: ResponseCallback): void;
}

/** Google Cloud Platform service requests tracking for RESTful APIs */
export class GoogleCloudHttp implements Integration {
  public name = this.constructor.name;

  private readonly _optional: boolean;

  public constructor(options: { optional?: boolean } = {}) {
    this._optional = options.optional || false;
  }

  /**
   * @inheritDoc
   */
  public install(_client: ClientLike): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const commonModule = require('@google-cloud/common') as typeof common;
      fill(commonModule.Service.prototype, 'request', wrapRequestFunction);
    } catch (e) {
      if (!this._optional) {
        throw e;
      }
    }
  }
}

/** Returns a wrapped function that makes a request with tracing enabled */
function wrapRequestFunction(orig: RequestFunction): RequestFunction {
  return function(this: common.Service, reqOpts: RequestOptions, callback: ResponseCallback): void {
    // TODO: Use clients scope instead of global call
    const transaction = getTransaction();
    let span: Span | undefined;
    if (transaction) {
      const httpMethod = reqOpts.method || 'GET';
      span = transaction.startChild({
        description: `${httpMethod} ${reqOpts.uri}`,
        op: `gcloud.http.${identifyService(this.apiEndpoint)}`,
      });
    }
    orig.call(this, reqOpts, (...args: Parameters<ResponseCallback>) => {
      if (span) {
        span.finish();
      }
      callback(...args);
    });
  };
}

/** Identifies service by its base url */
function identifyService(apiEndpoint: string): string {
  const match = apiEndpoint.match(/^https:\/\/(\w+)\.googleapis.com$/);
  return match ? match[1] : apiEndpoint.replace(/^(http|https)?:\/\//, '');
}
