import * as domain from 'domain';

import { getCarrier } from '@sentry/minimal';
import { getGlobalObject } from '@sentry/utils';
import { InboundFilters } from '@sentry/integration-common-inboundfilters';
import { LinkedErrors } from '@sentry/integration-node-linkederrors';
import { OnUncaughtException, OnUnhandledRejection } from '@sentry/integration-node-globalhandlers';
import { ConsoleBreadcrumbs, HTTPBreadcrumbs } from '@sentry/integration-node-breadcrumbs';

import { NodeClient, NodeOptions } from './client';

export const defaultIntegrations = [
  new ConsoleBreadcrumbs(),
  new HTTPBreadcrumbs(),
  new LinkedErrors(),
  new InboundFilters(),
  new OnUncaughtException(),
  new OnUnhandledRejection(),
];

/**
 * The Sentry Node SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * ```
 *
 * const { init } = require('@sentry/node');
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const { configureScope } = require('@sentry/node');
 * configureScope((scope: Scope) => {
 *   scope.setExtra({ battery: 0.7 });
 *   scope.setTag({ user_mode: 'admin' });
 *   scope.setUser({ id: '4711' });
 * });
 * ```
 *
 * @example
 * ```
 *
 * const { addBreadcrumb } = require('@sentry/node');
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const Sentry = require('@sentry/node');
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 * ```
 *
 * @see {@link NodeOptions} for documentation on configuration options.
 */
export function init(options: NodeOptions = {}): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }

  if (options.dsn === undefined && process.env.SENTRY_DSN) {
    options.dsn = process.env.SENTRY_DSN;
  }

  if (options.tracesSampleRate === undefined && process.env.SENTRY_TRACES_SAMPLE_RATE) {
    const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE);
    if (isFinite(tracesSampleRate)) {
      options.tracesSampleRate = tracesSampleRate;
    }
  }

  if (options.release === undefined) {
    const global = getGlobalObject<Window>();
    // Prefer env var over global
    if (process.env.SENTRY_RELEASE) {
      options.release = process.env.SENTRY_RELEASE;
    }
    // This supports the variable that sentry-webpack-plugin injects
    else if (global.SENTRY_RELEASE && global.SENTRY_RELEASE.id) {
      options.release = global.SENTRY_RELEASE.id;
    }
  }

  if (options.environment === undefined && process.env.SENTRY_ENVIRONMENT) {
    options.environment = process.env.SENTRY_ENVIRONMENT;
  }

  // TODO: Reevaluate whether stickin it on the domain is still necessary
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const carrier = (domain as any).active ? getCarrier((domain as any).active) : getCarrier();
  const client = new NodeClient(options);
  carrier.client = client;
  // TODO: Should we return client here instead of void?
}
