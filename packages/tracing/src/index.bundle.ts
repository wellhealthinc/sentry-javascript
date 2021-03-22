export {
  Breadcrumb,
  Request,
  SdkInfo,
  SentryEvent,
  Exception,
  Response,
  Severity,
  StackFrame,
  Stacktrace,
  Status,
  Thread,
  User,
} from '@sentry/types';

export {
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '@sentry/browser';

export { BrowserOptions } from '@sentry/browser';
export { BrowserClient } from '@sentry/browser';
export { ReportDialogOptions } from '@sentry/transport-base';
export {
  defaultIntegrations,
  forceLoad,
  init,
  lastEventId,
  onLoad,
  showReportDialog,
  flush,
  close,
  wrap,
} from '@sentry/browser';
export { SDK_NAME, SDK_VERSION } from '@sentry/browser';

import { Integrations as BrowserIntegrations } from '@sentry/browser';
import { getGlobalObject } from '@sentry/utils';

import { BrowserTracing } from './browser';
import { registerErrorInstrumentation } from './errors';

export { Span } from './span';

let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
const _window = getGlobalObject<Window>();
if (_window.Sentry && _window.Sentry.Integrations) {
  windowIntegrations = _window.Sentry.Integrations;
}

const INTEGRATIONS = {
  ...windowIntegrations,
  ...BrowserIntegrations,
  BrowserTracing,
};

export { INTEGRATIONS as Integrations };

// If an error happens globally, we should make sure transaction status is set to error.
registerErrorInstrumentation();
