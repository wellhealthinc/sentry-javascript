import { ScopeLike } from '@sentry/types';

import { getCurrentClient } from './carrier';

export {
  addGlobalEventProcessor,
  getCarrier,
  getCurrentClient,
  getCurrentScope,
  getGlobalEventProcessors,
} from './carrier';
export { captureException, captureMessage, captureEvent, close, flush, lastEventId } from './client';
export {
  addBreadcrumb,
  getSpan,
  getTransaction,
  setContext,
  setExtra,
  setExtras,
  setSpan,
  setTag,
  setTags,
  setUser,
} from './scope';

export function configureScope(callback: (scope: ScopeLike) => void): void {
  const scope = getCurrentClient()?.getScope();
  if (scope) {
    callback(scope);
  }
}

export function withScope(callback: (scope: ScopeLike) => void): void {
  const scope = getCurrentClient()
    ?.getScope()
    ?.clone();

  if (scope) {
    try {
      callback(scope);
    } catch (_oO) {
      // no-empty
    }
  }
}
