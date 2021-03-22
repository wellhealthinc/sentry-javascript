export { Scope } from '@sentry/scope';
export { configureScope, withScope } from '@sentry/minimal';
export { SDK_VERSION } from '@sentry/core';
export {
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  close,
  flush,
  lastEventId,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
} from '@sentry/minimal';

export { BrowserClient, BrowserOptions } from './client';
export { defaultIntegrations, forceLoad, init, onLoad, showReportDialog, wrap } from './sdk';
export { SDK_NAME } from './version';

import { getGlobalObject } from '@sentry/utils';

// TODO: Expose all integrations through `Sentry.Integrations` again?
// import * as BrowserIntegrations from './integrations';
const BrowserIntegrations = {};
let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
const _window = getGlobalObject<Window>();
if (_window.Sentry && _window.Sentry.Integrations) {
  windowIntegrations = _window.Sentry.Integrations;
}

const INTEGRATIONS = {
  ...windowIntegrations,
  ...BrowserIntegrations,
};

export { INTEGRATIONS as Integrations };
