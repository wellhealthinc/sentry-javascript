import { Scope, Session } from '@sentry/scope';
import {
  CaptureContext,
  ClientLike,
  SentryEvent,
  EventProcessor,
  OptionsV7,
  ScopeLike,
  SessionStatus,
} from '@sentry/types';
import {
  dateTimestampInSeconds,
  getEventDescription,
  isPrimitive,
  isThenable,
  logger,
  normalize,
  SentryError,
  SyncPromise,
  truncate,
  uuid4,
} from '@sentry/utils';
import {
  Dsn,
  eventToTransportRequest,
  NoopTransport,
  sessionToTransportRequest,
  TransportRequest,
  Transport,
} from '@sentry/transport-base';
import { IntegrationIndex, setupIntegrations } from '@sentry/integration-base';

/**
 * Base implementation for all JavaScript SDK clients.
 *
 * Call the constructor with the corresponding backend constructor and options
 * specific to the client subclass. To access these options later, use
 * {@link Client.getOptions}. Also, the Backend instance is available via
 * {@link Client.getBackend}.
 *
 * If a Dsn is specified in the options, it will be parsed and stored. Use
 * {@link Client.getDsn} to retrieve the Dsn at any moment. In case the Dsn is
 * invalid, the constructor will throw a {@link SentryException}. Note that
 * without a valid Dsn, the SDK will not send any events to Sentry.
 *
 * Before sending an event via the backend, it is passed through
 * {@link BaseClient._prepareEvent} to add SDK information and scope data
 * (breadcrumbs and context). To add more custom information, override this
 * method and extend the resulting prepared event.
 *
 * To issue automatically created events (e.g. via instrumentation), use
 * {@link Client.captureEvent}. It will prepare the event and pass it through
 * the callback lifecycle. To issue auto-breadcrumbs, use
 * {@link Client.addBreadcrumb}.
 *
 * @example
 * class NodeClient extends BaseClient<NodeBackend, NodeOptions> {
 *   public constructor(options: NodeOptions) {
 *     super(NodeBackend, options);
 *   }
 *
 *   // ...
 * }
 */
// TODO: Allow for passing scope during construction for explicit `this._scope`
export abstract class BaseClient<O extends OptionsV7> implements ClientLike<O> {
  /** Options passed to the SDK. */
  public readonly options: O;

  /** The client Dsn, if specified in options. Without this Dsn, the SDK will be disabled. */
  protected readonly _dsn?: Dsn;

  /** Array of used integrations. */
  protected _integrations: IntegrationIndex = {};

  /** Number of call being processed */
  protected _processing: number = 0;

  protected _transport: Transport;

  protected _lastEventId?: string;

  protected _scope?: ScopeLike;

  protected _eventProcessors: EventProcessor[] = [];

  /**
   * Initializes this client instance.
   *
   * @param options Options for the client.
   */
  protected constructor(options: O) {
    this.options = options;

    if (options.dsn) {
      this._dsn = new Dsn(options.dsn);
    }

    this._transport = this._setupTransport();
    this._integrations = setupIntegrations(this);
  }

  public lastEventId(): string | undefined {
    return this._lastEventId;
  }

  public getScope(): ScopeLike | undefined {
    return this._scope;
  }

  // TODO: Run these during event processing
  public addEventProcessor(callback: EventProcessor): void {
    this._eventProcessors.push(callback);
  }

  // TODO: To be removed? Can be obtained from options
  public getDsn(): Dsn | undefined {
    return this._dsn;
  }

  /**
   * @inheritDoc
   */
  public captureException(exception: unknown, captureContext: CaptureContext = {}): string | undefined {
    // TODO: This is broken. a) we dont pass event_id in hint anymore, b) its sync value assigned in async callback
    let eventId = captureContext.hint?.event_id;

    this._process(
      this._eventFromException(exception, captureContext)
        .then(event => this._captureEvent(event, captureContext))
        .then(result => {
          eventId = result;
        }),
    );

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureMessage(message: string, captureContext: CaptureContext = {}): string | undefined {
    let eventId = captureContext.hint?.event_id;

    const promisedEvent = isPrimitive(message)
      ? this._eventFromMessage(String(message), captureContext)
      : this._eventFromException(message, captureContext);

    this._process(
      promisedEvent
        .then(event => this._captureEvent(event, captureContext))
        .then(result => {
          eventId = result;
        }),
    );

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: SentryEvent, captureContext: CaptureContext = {}): string | undefined {
    let eventId = captureContext.hint?.event_id;

    this._process(
      this._captureEvent(event, captureContext).then(result => {
        eventId = result;
      }),
    );

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureSession(session: Session): void {
    if (!session.release) {
      logger.warn('Discarded session because of missing release');
    } else {
      this._sendSession(session);
      // After sending, we set init false to inidcate it's not the first occurence
      session.update({ init: false });
    }
  }

  /**
   * @inheritDoc
   */
  public flush(timeout?: number): PromiseLike<boolean> {
    return this._isClientProcessing(timeout).then(ready => {
      return this._transport.flush(timeout ?? 0).then(transportFlushed => ready && transportFlushed);
    });
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this.flush(timeout).then(result => {
      this.options.enabled = false;
      return result;
    });
  }

  protected _setupTransport(): Transport {
    // TODO: This whole function should be unnecessary and moved to client construction
    if (!this.options.dsn || !this.options.transport) {
      return new NoopTransport();
    }

    return new this.options.transport({
      dsn: this.options.dsn,
      ...this.options.transportOptions,
      // TODO: Deprecate these options and move to `transportOptions`
      // ...(this.options.httpProxy && { httpProxy: this.options.httpProxy }),
      // ...(this.options.httpsProxy && { httpsProxy: this.options.httpsProxy }),
      // ...(this.options.caCerts && { caCerts: this.options.caCerts }),
    });
  }

  /**
   * @inheritDoc
   */
  // TODO: Do we need generic here?
  protected _sendRequest<T>(request: TransportRequest<T>): void {
    this._transport.sendRequest(request).then(null, reason => {
      logger.error(`Failed sending request: ${reason}`);
    });
  }

  /** Updates existing session based on the provided event */
  protected _updateSessionFromEvent(session: Session, event: SentryEvent): void {
    let crashed = false;
    let errored = false;
    let userAgent;
    const exceptions = event.exception && event.exception.values;

    if (exceptions) {
      errored = true;

      for (const ex of exceptions) {
        const mechanism = ex.mechanism;
        if (mechanism && mechanism.handled === false) {
          crashed = true;
          break;
        }
      }
    }

    const user = event.user;
    if (!session.userAgent) {
      const headers = event.request ? event.request.headers : {};
      for (const key in headers) {
        if (key.toLowerCase() === 'user-agent') {
          userAgent = headers[key];
          break;
        }
      }
    }

    session.update({
      ...(crashed && { status: SessionStatus.Crashed }),
      user,
      userAgent,
      errors: session.errors + Number(errored || crashed),
    });
    this.captureSession(session);
  }

  /** Deliver captured session to Sentry */
  protected _sendSession(session: Session): void {
    this._sendRequest(sessionToTransportRequest(session));
  }

  /** Waits for the client to be done with processing. */
  protected _isClientProcessing(timeout?: number): PromiseLike<boolean> {
    return new SyncPromise(resolve => {
      let ticked: number = 0;
      const tick: number = 1;

      const interval = setInterval(() => {
        if (this._processing == 0) {
          clearInterval(interval);
          resolve(true);
        } else {
          ticked += tick;
          if (timeout && ticked >= timeout) {
            clearInterval(interval);
            resolve(false);
          }
        }
      }, tick);
    });
  }

  /** Determines whether this SDK is enabled and a valid Dsn is present. */
  protected _isEnabled(): boolean {
    return this.options.enabled !== false && this._dsn !== undefined;
  }

  /**
   * Adds common information to events.
   *
   * The information includes release and environment from `options`,
   * breadcrumbs and context (extra, tags and user) from the scope.
   *
   * Information that is already present in the event is never overwritten. For
   * nested objects, such as the context, keys are merged.
   *
   * @param event The original event.
   * @param hint May contain additional information about the original exception.
   * @param scope A scope containing event metadata.
   * @returns A new event with more information.
   */
  protected _prepareEvent(event: SentryEvent, captureContext: CaptureContext): PromiseLike<SentryEvent | null> {
    const { normalizeDepth = 3 } = this.options;
    const prepared: SentryEvent = {
      ...event,
      event_id: event.event_id ?? captureContext?.hint?.event_id ?? uuid4(),
      timestamp: event.timestamp ?? dateTimestampInSeconds(),
    };

    this._applyClientOptions(prepared);
    this._applyIntegrationsMetadata(prepared);

    // If we have scope given to us, use it as the base for further modifications.
    // This allows us to prevent unnecessary copying of data if `captureContext` is not provided.

    // TODO: We should be able to remove scope as dependency here somehow
    let finalScope = this.getScope() || new Scope();
    if (captureContext?.scope) {
      finalScope = (finalScope?.clone() || new Scope()).update(captureContext?.scope);
    }

    // We prepare the result here with a resolved Event.
    let result = SyncPromise.resolve<SentryEvent | null>(prepared);

    // This should be the last thing called, since we want that
    // {@link Hub.addEventProcessor} gets the finished prepared event.
    if (finalScope) {
      // In case we have a hub we reassign it.
      result = finalScope.applyToEvent(prepared, captureContext?.hint);
    }

    return result.then(evt => {
      if (typeof normalizeDepth === 'number' && normalizeDepth > 0) {
        return this._normalizeEvent(evt, normalizeDepth);
      }
      return evt;
    });
  }

  /**
   * Applies `normalize` function on necessary `Event` attributes to make them safe for serialization.
   * Normalized keys:
   * - `breadcrumbs.data`
   * - `user`
   * - `contexts`
   * - `extra`
   * @param event Event
   * @returns Normalized event
   */
  protected _normalizeEvent(event: SentryEvent | null, depth: number): SentryEvent | null {
    if (!event) {
      return null;
    }

    const normalized = {
      ...event,
      ...(event.breadcrumbs && {
        breadcrumbs: event.breadcrumbs.map(b => ({
          ...b,
          ...(b.data && {
            data: normalize(b.data, depth),
          }),
        })),
      }),
      ...(event.user && {
        user: normalize(event.user, depth),
      }),
      ...(event.contexts && {
        contexts: normalize(event.contexts, depth),
      }),
      ...(event.extra && {
        extra: normalize(event.extra, depth),
      }),
    };
    // event.contexts.trace stores information about a Transaction. Similarly,
    // event.spans[] stores information about child Spans. Given that a
    // Transaction is conceptually a Span, normalization should apply to both
    // Transactions and Spans consistently.
    // For now the decision is to skip normalization of Transactions and Spans,
    // so this block overwrites the normalized event to add back the original
    // Transaction information prior to normalization.
    if (event.contexts && event.contexts.trace) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      normalized.contexts.trace = event.contexts.trace;
    }
    return normalized;
  }

  /**
   *  Enhances event using the client configuration.
   *  It takes care of all "static" values like environment, release and `dist`,
   *  as well as truncating overly long values.
   * @param event event instance to be enhanced
   */
  protected _applyClientOptions(event: SentryEvent): void {
    const options = this.options;
    const { environment, release, dist, maxValueLength = 250 } = options;

    if (!('environment' in event)) {
      event.environment = 'environment' in options ? environment : 'production';
    }

    if (event.release === undefined && release !== undefined) {
      event.release = release;
    }

    if (event.dist === undefined && dist !== undefined) {
      event.dist = dist;
    }

    if (event.message) {
      event.message = truncate(event.message, maxValueLength);
    }

    const exception = event.exception && event.exception.values && event.exception.values[0];
    if (exception && exception.value) {
      exception.value = truncate(exception.value, maxValueLength);
    }

    const request = event.request;
    if (request && request.url) {
      request.url = truncate(request.url, maxValueLength);
    }
  }

  /**
   * This function adds all used integrations to the SDK info in the event.
   * @param event The event that will be filled with all integrations.
   */
  protected _applyIntegrationsMetadata(event: SentryEvent): void {
    const sdkInfo = event.sdk;
    const integrationsArray = Object.keys(this._integrations);
    if (sdkInfo && integrationsArray.length > 0) {
      sdkInfo.integrations = integrationsArray;
    }
  }

  /**
   * Tells the backend to send this event
   * @param event The Sentry event to send
   */
  protected _sendEvent(event: SentryEvent): void {
    this._sendRequest(eventToTransportRequest(event));
  }

  /**
   * Processes the event and logs an error in case of rejection
   * @param event
   * @param hint
   * @param scope
   */
  protected _captureEvent(event: SentryEvent, captureContext: CaptureContext): PromiseLike<string | undefined> {
    return this._processEvent(event, captureContext).then(
      finalEvent => {
        // TODO: Make it configurable or move to @sentry/integration-browser-breadcrumbs
        const eventType = finalEvent.type === 'transaction' ? 'transaction' : 'event';
        this.getScope().addBreadcrumb(
          {
            category: `sentry.${eventType}`,
            event_id: finalEvent.event_id,
            level: finalEvent.level,
            message: getEventDescription(finalEvent),
          },
          {
            event: finalEvent,
          },
        );
        return finalEvent.event_id;
      },
      reason => {
        logger.error(reason);
        return undefined;
      },
    );
  }

  /**
   * Processes an event (either error or message) and sends it to Sentry.
   *
   * This also adds breadcrumbs and context information to the event. However,
   * platform specific meta data (such as the User's IP address) must be added
   * by the SDK implementor.
   *
   *
   * @param event The event to send to Sentry.
   * @param hint May contain additional information about the original exception.
   * @param scope A scope containing event metadata.
   * @returns A SyncPromise that resolves with the event or rejects in case event was/will not be send.
   */
  protected _processEvent(event: SentryEvent, captureContext: CaptureContext): PromiseLike<SentryEvent> {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { beforeSend, sampleRate } = this.options;

    if (!this._isEnabled()) {
      return SyncPromise.reject(new SentryError('SDK not enabled, will not send event.'));
    }

    const isTransaction = event.type === 'transaction';
    // 1.0 === 100% events are sent
    // 0.0 === 0% events are sent
    // Sampling for transaction happens somewhere else
    if (!isTransaction && typeof sampleRate === 'number' && Math.random() > sampleRate) {
      return SyncPromise.reject(
        new SentryError(
          `Discarding event because it's not included in the random sample (sampling rate = ${sampleRate})`,
        ),
      );
    }

    return this._prepareEvent(event, captureContext)
      .then(prepared => {
        if (prepared === null) {
          throw new SentryError('An event processor returned null, will not send event.');
        }

        const isInternalException =
          captureContext?.hint &&
          captureContext?.hint?.data &&
          (captureContext?.hint?.data as { __sentry__: boolean }).__sentry__ === true;
        if (isInternalException || isTransaction || !beforeSend) {
          return prepared;
        }

        const beforeSendResult = beforeSend(prepared, captureContext?.hint);
        if (typeof beforeSendResult === 'undefined') {
          throw new SentryError('`beforeSend` method has to return `null` or a valid event.');
        } else if (isThenable(beforeSendResult)) {
          return (beforeSendResult as PromiseLike<SentryEvent | null>).then(
            event => event,
            e => {
              throw new SentryError(`beforeSend rejected with ${e}`);
            },
          );
        }
        return beforeSendResult;
      })
      .then(processedEvent => {
        if (processedEvent === null) {
          throw new SentryError('`beforeSend` returned `null`, will not send event.');
        }

        const session = this.getScope()?.getSession();
        if (!isTransaction && session) {
          this._updateSessionFromEvent(session as Session, processedEvent);
        }

        this._sendEvent(processedEvent);
        return processedEvent;
      })
      .then(null, reason => {
        if (reason instanceof SentryError) {
          throw reason;
        }

        this.captureException(reason, {
          hint: {
            data: {
              __sentry__: true,
            },
            originalException: reason as Error,
          },
        });
        throw new SentryError(
          `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.\nReason: ${reason}`,
        );
      });
  }

  /**
   * Occupies the client with processing and event
   */
  protected _process<T>(promise: PromiseLike<T>): void {
    this._processing += 1;
    promise.then(
      value => {
        this._processing -= 1;
        return value;
      },
      reason => {
        this._processing -= 1;
        return reason;
      },
    );
  }

  protected abstract _eventFromException(exception: unknown, captureContext: CaptureContext): PromiseLike<SentryEvent>;
  protected abstract _eventFromMessage(message: string, captureContext: CaptureContext): PromiseLike<SentryEvent>;
}
