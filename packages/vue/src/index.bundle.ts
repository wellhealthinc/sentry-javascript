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
  BrowserClient,
  BrowserOptions,
  defaultIntegrations,
  forceLoad,
  lastEventId,
  onLoad,
  showReportDialog,
  flush,
  close,
  wrap,
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
  SDK_NAME,
  SDK_VERSION,
} from '@sentry/browser';
export { ReportDialogOptions } from '@sentry/transport-base';

import { Integrations as BrowserIntegrations } from '@sentry/browser';
import { getGlobalObject } from '@sentry/utils';

export { init } from './sdk';

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
