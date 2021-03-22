import {
  Breadcrumb,
  Context,
  Contexts,
  SentryEvent,
  EventHint,
  EventProcessor,
  Extra,
  Extras,
  Primitive,
  ScopeLike,
  ScopeContext,
  Severity,
  Span,
  Transaction,
  User,
  BreadcrumbHint,
} from '@sentry/types';
import { dateTimestampInSeconds, isPlainObject, isThenable, SyncPromise } from '@sentry/utils';

import { Session } from './session';

/**
 * Default maximum number of breadcrumbs added to an event. Can be overwritten
 * with {@link Options.maxBreadcrumbs}.
 */
const DEFAULT_BREADCRUMBS = 100;

/**
 * Absolute maximum number of breadcrumbs added to an event. The
 * `maxBreadcrumbs` option cannot be higher than this value.
 */
const MAX_BREADCRUMBS = 100;

type ScopeOptions = {
  maxBreadcrumbs?: number;
  beforeBreadcrumb?(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): Breadcrumb | null;
};

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export class Scope implements ScopeLike {
  /** Array of breadcrumbs. */
  public breadcrumbs: Breadcrumb[] = [];

  /** User */
  public user: User = {};

  /** Tags */
  public tags: { [key: string]: Primitive } = {};

  /** Extra */
  public extra: Extras = {};

  /** Contexts */
  public contexts: Contexts = {};

  /** Fingerprint */
  public fingerprint?: string[];

  /** Severity */
  public level?: Severity;

  /** Transaction Name */
  public transactionName?: string;

  /** Span */
  public span?: Span;

  /** Session */
  public session?: Session;

  /** Flag if notifiying is happening. */
  private _notifyingListeners: boolean = false;

  /** Callback for client to receive scope changes. */
  private _scopeListeners: Array<(scope: Scope) => void> = [];

  /** Callback list that will be called after {@link applyToEvent}. */
  private _eventProcessors: EventProcessor[] = [];

  private _maxBreadcrumbs: number;
  private _beforeBreadcrumb: (breadcrumb: Breadcrumb, hint?: BreadcrumbHint) => Breadcrumb | null;

  public constructor({ maxBreadcrumbs, beforeBreadcrumb }: ScopeOptions = {}) {
    this._maxBreadcrumbs = maxBreadcrumbs ?? DEFAULT_BREADCRUMBS;
    this._beforeBreadcrumb = beforeBreadcrumb ?? (breadcrumb => breadcrumb);
  }

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  public clone(): Scope {
    const newScope = new Scope();
    newScope.breadcrumbs = [...this.breadcrumbs];
    newScope.tags = { ...this.tags };
    newScope.extra = { ...this.extra };
    newScope.contexts = { ...this.contexts };
    newScope.user = this.user;
    newScope.level = this.level;
    newScope.span = this.span;
    newScope.session = this.session;
    newScope.transactionName = this.transactionName;
    newScope.fingerprint = this.fingerprint;
    newScope._eventProcessors = [...this._eventProcessors];
    return newScope;
  }

  /**
   * Add internal on change listener. Used for sub SDKs that need to store the scope.
   * @hidden
   */
  public addScopeListener(callback: (scope: Scope) => void): void {
    this._scopeListeners.push(callback);
  }

  /**
   * @inheritDoc
   */
  public addEventProcessor(callback: EventProcessor): this {
    this._eventProcessors.push(callback);
    return this;
  }

  /**
   * @inheritDoc
   */
  public setUser(user: User | null): this {
    this.user = user || {};
    if (this.session) {
      this.session.update({ user });
    }
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public getUser(): User | undefined {
    return this.user;
  }

  /**
   * @inheritDoc
   */
  public setTags(tags: { [key: string]: Primitive }): this {
    this.tags = {
      ...this.tags,
      ...tags,
    };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: Primitive): this {
    this.tags = { ...this.tags, [key]: value };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setExtras(extras: Extras): this {
    this.extra = {
      ...this.extra,
      ...extras,
    };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setExtra(key: string, extra: Extra): this {
    this.extra = { ...this.extra, [key]: extra };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setFingerprint(fingerprint: string[]): this {
    this.fingerprint = fingerprint;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setLevel(level: Severity): this {
    this.level = level;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setTransactionName(name?: string): this {
    this.transactionName = name;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Can be removed in major version.
   * @deprecated in favor of {@link this.setTransactionName}
   */
  public setTransaction(name?: string): this {
    return this.setTransactionName(name);
  }

  /**
   * @inheritDoc
   */
  public setContext(key: string, context: Context | null): this {
    if (context === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.contexts[key];
    } else {
      this.contexts = { ...this.contexts, [key]: context };
    }

    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setSpan(span?: Span): this {
    this.span = span;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public getSpan(): Span | undefined {
    return this.span;
  }

  /**
   * @inheritDoc
   */
  public getTransaction(): Transaction | undefined {
    // often, this span will be a transaction, but it's not guaranteed to be
    const span = this.getSpan() as undefined | (Span & { spanRecorder: { spans: Span[] } });

    // try it the new way first
    if (span?.transaction) {
      return span?.transaction;
    }

    // fallback to the old way (known bug: this only finds transactions with sampled = true)
    if (span?.spanRecorder?.spans[0]) {
      return span.spanRecorder.spans[0] as Transaction;
    }

    // neither way found a transaction
    return undefined;
  }

  /**
   * @inheritDoc
   */
  public setSession(session?: Session): this {
    if (!session) {
      delete this.session;
    } else {
      this.session = session;
    }
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public getSession(): Session | undefined {
    return this.session;
  }

  /**
   * @inheritDoc
   */
  public update(captureContext?: ScopeContext): this {
    if (!captureContext) {
      return this;
    }

    if (typeof captureContext === 'function') {
      const updatedScope = (captureContext as <T>(scope: T) => T)(this);
      return updatedScope instanceof Scope ? updatedScope : this;
    }

    if (captureContext instanceof Scope) {
      this.tags = { ...this.tags, ...captureContext.tags };
      this.extra = { ...this.extra, ...captureContext.extra };
      this.contexts = { ...this.contexts, ...captureContext.contexts };
      if (captureContext.user && Object.keys(captureContext.user).length) {
        this.user = captureContext.user;
      }
      if (captureContext.level) {
        this.level = captureContext.level;
      }
      if (captureContext.fingerprint) {
        this.fingerprint = captureContext.fingerprint;
      }
    } else if (isPlainObject(captureContext)) {
      // eslint-disable-next-line no-param-reassign
      captureContext = captureContext as ScopeContext;
      this.tags = { ...this.tags, ...captureContext.tags };
      this.extra = { ...this.extra, ...captureContext.extra };
      this.contexts = { ...this.contexts, ...captureContext.contexts };
      if (captureContext.user) {
        this.user = captureContext.user;
      }
      if (captureContext.level) {
        this.level = captureContext.level;
      }
      if (captureContext.fingerprint) {
        this.fingerprint = captureContext.fingerprint;
      }
    }

    return this;
  }

  /**
   * @inheritDoc
   */
  public clear(): this {
    this.breadcrumbs = [];
    this.tags = {};
    this.extra = {};
    this.user = {};
    this.contexts = {};
    this.level = undefined;
    this.transactionName = undefined;
    this.fingerprint = undefined;
    this.span = undefined;
    this.session = undefined;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): this {
    let preparedBreadcrumb: Breadcrumb | null = {
      timestamp: dateTimestampInSeconds(),
      ...breadcrumb,
    };

    preparedBreadcrumb = this._beforeBreadcrumb(preparedBreadcrumb, hint);

    if (preparedBreadcrumb !== null) {
      const maxBreadcrumbs = Math.min(this._maxBreadcrumbs, MAX_BREADCRUMBS);
      this.breadcrumbs = [...this.breadcrumbs, preparedBreadcrumb].slice(-maxBreadcrumbs);
      this._notifyScopeListeners();
    }

    return this;
  }

  /**
   * @inheritDoc
   */
  public clearBreadcrumbs(): this {
    this.breadcrumbs = [];
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * Also if the event has already breadcrumbs on it, we do not merge them.
   * @param event Event
   * @param hint May contain additional informartion about the original exception.
   * @hidden
   */
  public applyToEvent(event: SentryEvent, hint?: EventHint): PromiseLike<SentryEvent | null> {
    if (this.extra && Object.keys(this.extra).length) {
      event.extra = { ...this.extra, ...event.extra };
    }
    if (this.tags && Object.keys(this.tags).length) {
      event.tags = { ...this.tags, ...event.tags };
    }
    if (this.user && Object.keys(this.user).length) {
      event.user = { ...this.user, ...event.user };
    }
    if (this.contexts && Object.keys(this.contexts).length) {
      event.contexts = { ...this.contexts, ...event.contexts };
    }
    if (this.level) {
      event.level = this.level;
    }
    if (this.transactionName) {
      event.transaction = this.transactionName;
    }
    // We want to set the trace context for normal events only if there isn't already
    // a trace context on the event. There is a product feature in place where we link
    // errors with transaction and it relys on that.
    if (this.span) {
      event.contexts = { trace: this.span.getTraceContext(), ...event.contexts };
      const transactionName = this.span.transaction?.name;
      if (transactionName) {
        event.tags = { transaction: transactionName, ...event.tags };
      }
    }

    this._applyFingerprint(event);

    event.breadcrumbs = [...(event.breadcrumbs || []), ...this.breadcrumbs];
    event.breadcrumbs = event.breadcrumbs.length > 0 ? event.breadcrumbs : undefined;

    return this._notifyEventProcessors(this._eventProcessors, event, hint);
  }

  /**
   * This will be called after {@link applyToEvent} is finished.
   */
  protected _notifyEventProcessors(
    processors: EventProcessor[],
    event: SentryEvent | null,
    hint?: EventHint,
    index: number = 0,
  ): PromiseLike<SentryEvent | null> {
    return new SyncPromise<SentryEvent | null>((resolve, reject) => {
      const processor = processors[index];
      if (event === null || typeof processor !== 'function') {
        resolve(event);
      } else {
        const result = processor({ ...event }, hint) as SentryEvent | null;
        if (isThenable(result)) {
          (result as PromiseLike<SentryEvent | null>)
            .then(final => this._notifyEventProcessors(processors, final, hint, index + 1).then(resolve))
            .then(null, reject);
        } else {
          this._notifyEventProcessors(processors, result, hint, index + 1)
            .then(resolve)
            .then(null, reject);
        }
      }
    });
  }

  /**
   * This will be called on every set call.
   */
  protected _notifyScopeListeners(): void {
    // We need this check for this._notifyingListeners to be able to work on scope during updates
    // If this check is not here we'll produce endless recursion when something is done with the scope
    // during the callback.
    if (!this._notifyingListeners) {
      this._notifyingListeners = true;
      this._scopeListeners.forEach(callback => {
        callback(this);
      });
      this._notifyingListeners = false;
    }
  }

  /**
   * Applies fingerprint from the scope to the event if there's one,
   * uses message if there's one instead or get rid of empty fingerprint
   */
  private _applyFingerprint(event: SentryEvent): void {
    // Make sure it's an array first and we actually have something in place
    event.fingerprint = event.fingerprint
      ? Array.isArray(event.fingerprint)
        ? event.fingerprint
        : [event.fingerprint]
      : [];

    // If we have something on the scope, then merge it with event
    if (this.fingerprint) {
      event.fingerprint = event.fingerprint.concat(this.fingerprint);
    }

    // If we have no data at all, remove empty array default
    if (event.fingerprint && !event.fingerprint.length) {
      delete event.fingerprint;
    }
  }
}
