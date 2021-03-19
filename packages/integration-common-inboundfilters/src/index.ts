import { ClientLike, SentryEvent, Integration } from '@sentry/types';
import { getEventDescription, isMatchingPattern, logger } from '@sentry/utils';

// "Script error." is hard coded into browsers for errors that it can't read.
// this is the result of a script being pulled in from an external domain and CORS.
const DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];

interface InboundFiltersOptions {
  allowUrls: Array<string | RegExp>;
  denyUrls: Array<string | RegExp>;
  ignoreErrors: Array<string | RegExp>;
  ignoreInternal: boolean;
}

/** Inbound filters configurable by the user */
export class InboundFilters implements Integration {
  public name = this.constructor.name;

  public constructor(private readonly _options: Partial<InboundFiltersOptions> = {}) {}

  /**
   * @inheritDoc
   */
  public install(client: ClientLike): void {
    client.addEventProcessor((event: SentryEvent) => {
      const clientOptions = client?.options ?? {};
      const options = this._mergeOptions(clientOptions);
      if (this._shouldDropEvent(event, options)) {
        return null;
      }
      return event;
    });
  }

  private _shouldDropEvent(event: SentryEvent, options: Partial<InboundFiltersOptions>): boolean {
    if (this._isSentryError(event, options)) {
      logger.warn(`Event dropped due to being internal Sentry Error.\nEvent: ${getEventDescription(event)}`);
      return true;
    }

    if (this._isIgnoredError(event, options)) {
      logger.warn(
        `Event dropped due to being matched by \`ignoreErrors\` option.\nEvent: ${getEventDescription(event)}`,
      );
      return true;
    }

    if (this._isDeniedUrl(event, options)) {
      logger.warn(
        `Event dropped due to being matched by \`denyUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this._getEventFilterUrl(event)}`,
      );
      return true;
    }

    if (!this._isAllowedUrl(event, options)) {
      logger.warn(
        `Event dropped due to not being matched by \`allowUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this._getEventFilterUrl(event)}`,
      );
      return true;
    }

    return false;
  }

  private _isSentryError(event: SentryEvent, options: Partial<InboundFiltersOptions>): boolean {
    if (!options.ignoreInternal) {
      return false;
    }

    try {
      return (
        (event &&
          event.exception &&
          event.exception.values &&
          event.exception.values[0] &&
          event.exception.values[0].type === 'SentryError') ||
        false
      );
    } catch (_oO) {
      return false;
    }
  }

  private _isIgnoredError(event: SentryEvent, options: Partial<InboundFiltersOptions>): boolean {
    if (!options.ignoreErrors || !options.ignoreErrors.length) {
      return false;
    }

    return this._getPossibleEventMessages(event).some(message =>
      // Not sure why TypeScript complains here...
      (options.ignoreErrors as Array<RegExp | string>).some(pattern => isMatchingPattern(message, pattern)),
    );
  }

  private _isDeniedUrl(event: SentryEvent, options: Partial<InboundFiltersOptions>): boolean {
    // TODO: Use Glob instead?
    if (!options.denyUrls || !options.denyUrls.length) {
      return false;
    }
    const url = this._getEventFilterUrl(event);
    return !url ? false : options.denyUrls.some(pattern => isMatchingPattern(url, pattern));
  }

  private _isAllowedUrl(event: SentryEvent, options: Partial<InboundFiltersOptions>): boolean {
    // TODO: Use Glob instead?
    if (!options.allowUrls || !options.allowUrls.length) {
      return true;
    }
    const url = this._getEventFilterUrl(event);
    return !url ? true : options.allowUrls.some(pattern => isMatchingPattern(url, pattern));
  }

  private _mergeOptions(clientOptions: Partial<InboundFiltersOptions> = {}): Partial<InboundFiltersOptions> {
    return {
      allowUrls: [...(this._options.allowUrls || []), ...(clientOptions.allowUrls || [])],
      denyUrls: [...(this._options.denyUrls || []), ...(clientOptions.denyUrls || [])],
      ignoreErrors: [
        ...(this._options.ignoreErrors || []),
        ...(clientOptions.ignoreErrors || []),
        ...DEFAULT_IGNORE_ERRORS,
      ],
      // TODO: Do we ever used it? Like ever? - https://github.com/getsentry/sentry-javascript/search?q=ignoreInternal
      ignoreInternal: typeof this._options.ignoreInternal !== 'undefined' ? this._options.ignoreInternal : true,
    };
  }

  private _getPossibleEventMessages(event: SentryEvent): string[] {
    if (event.message) {
      return [event.message];
    }
    if (event.exception) {
      try {
        const { type = '', value = '' } = (event.exception.values && event.exception.values[0]) || {};
        return [`${value}`, `${type}: ${value}`];
      } catch (oO) {
        logger.error(`Cannot extract message for event ${getEventDescription(event)}`);
        return [];
      }
    }
    return [];
  }

  private _getEventFilterUrl(event: SentryEvent): string | null {
    try {
      if (event.stacktrace) {
        const frames = event.stacktrace.frames;
        return (frames && frames[frames.length - 1].filename) || null;
      }
      if (event.exception) {
        const frames =
          event.exception.values && event.exception.values[0].stacktrace && event.exception.values[0].stacktrace.frames;
        return (frames && frames[frames.length - 1].filename) || null;
      }
      return null;
    } catch (oO) {
      logger.error(`Cannot extract url for event ${getEventDescription(event)}`);
      return null;
    }
  }
}
