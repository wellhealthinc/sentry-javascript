import { SentryEvent, EventHint, ExtendedError, ClientLike, Integration } from '@sentry/types';
import { isError, isPlainObject, logger, normalize } from '@sentry/utils';

interface ExtraErrorDataOptions {
  depth?: number;
}

export class ExtraErrorData implements Integration {
  public name = this.constructor.name;

  public constructor(private readonly _options: ExtraErrorDataOptions = { depth: 3 }) {}

  /**
   * @inheritDoc
   */
  public install(client: ClientLike): void {
    client.addEventProcessor((event: SentryEvent, hint?: EventHint) => this.enhanceEventWithErrorData(event, hint));
  }

  /**
   * Attaches extracted information from the Error object to extra field in the Event
   */
  public enhanceEventWithErrorData(event: SentryEvent, hint?: EventHint): SentryEvent {
    if (!hint || !hint.originalException || !isError(hint.originalException)) {
      return event;
    }
    const name =
      (hint.originalException as ExtendedError).name || (hint.originalException as ExtendedError).constructor.name;

    const errorData = this._extractErrorData(hint.originalException as ExtendedError);

    if (errorData) {
      let contexts = {
        ...event.contexts,
      };

      const normalizedErrorData = normalize(errorData, this._options.depth);
      if (isPlainObject(normalizedErrorData)) {
        contexts = {
          ...event.contexts,
          [name]: {
            ...normalizedErrorData,
          },
        };
      }

      return {
        ...event,
        contexts,
      };
    }

    return event;
  }

  /**
   * Extract extra information from the Error object
   */
  private _extractErrorData(error: ExtendedError): { [key: string]: unknown } | null {
    let result = null;
    // We are trying to enhance already existing event, so no harm done if it won't succeed
    try {
      const nativeKeys = ['name', 'message', 'stack', 'line', 'column', 'fileName', 'lineNumber', 'columnNumber'];
      const errorKeys = Object.getOwnPropertyNames(error).filter(key => nativeKeys.indexOf(key) === -1);

      if (errorKeys.length) {
        const extraErrorInfo: { [key: string]: unknown } = {};
        for (const key of errorKeys) {
          let value = error[key];
          if (isError(value)) {
            value = (value as Error).toString();
          }
          extraErrorInfo[key] = value;
        }
        result = extraErrorInfo;
      }
    } catch (oO) {
      logger.error('Unable to extract extra data from the Error object:', oO);
    }

    return result;
  }
}
