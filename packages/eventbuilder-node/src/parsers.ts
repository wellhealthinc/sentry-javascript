import { SentryEvent, Exception, ExtendedError, StackFrame } from '@sentry/types';
import { basename, dirname, SyncPromise } from '@sentry/utils';

import * as stacktrace from './stacktrace';

function getFunction(frame: stacktrace.StackFrame): string {
  try {
    return frame.functionName || `${frame.typeName}.${frame.methodName || '<anonymous>'}`;
  } catch (e) {
    // This seems to happen sometimes when using 'use strict',
    // stemming from `getTypeName`.
    // [TypeError: Cannot read property 'constructor' of undefined]
    return '<anonymous>';
  }
}

const mainModule: string = `${(require.main && require.main.filename && dirname(require.main.filename)) ||
  global.process.cwd()}/`;

function getModule(filename: string, base?: string): string {
  if (!base) {
    // eslint-disable-next-line no-param-reassign
    base = mainModule;
  }

  // It's specifically a module
  const file = basename(filename, '.js');
  // eslint-disable-next-line no-param-reassign
  filename = dirname(filename);
  let n = filename.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
    return `${filename.substr(n + 14).replace(/\//g, '.')}:${file}`;
  }
  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = `${filename}/`.lastIndexOf(base, 0);
  if (n === 0) {
    let moduleName = filename.substr(base.length).replace(/\//g, '.');
    if (moduleName) {
      moduleName += ':';
    }
    moduleName += file;
    return moduleName;
  }
  return file;
}

/**
 * @hidden
 */
export function extractStackFromError(error: Error): stacktrace.StackFrame[] {
  const stack = stacktrace.parse(error);
  if (!stack) {
    return [];
  }
  return stack;
}

/**
 * @hidden
 */
export function parseStack(stack: stacktrace.StackFrame[]): PromiseLike<StackFrame[]> {
  const frames: StackFrame[] = stack.map(frame => {
    const parsedFrame: StackFrame = {
      colno: frame.columnNumber,
      filename: frame.fileName?.startsWith('file://') ? frame.fileName.substr(7) : frame.fileName || '',
      function: getFunction(frame),
      lineno: frame.lineNumber,
    };

    const isInternal =
      frame.native ||
      (parsedFrame.filename &&
        !parsedFrame.filename.startsWith('/') &&
        !parsedFrame.filename.startsWith('.') &&
        parsedFrame.filename.indexOf(':\\') !== 1);

    // in_app is all that's not an internal Node function or a module within node_modules
    // note that isNative appears to return true even for node core libraries
    // see https://github.com/getsentry/raven-node/issues/176
    parsedFrame.in_app =
      !isInternal && parsedFrame.filename !== undefined && parsedFrame.filename.indexOf('node_modules/') === -1;

    // Extract a module name based on the filename
    if (parsedFrame.filename) {
      parsedFrame.module = getModule(parsedFrame.filename);
    }

    return parsedFrame;
  });

  return SyncPromise.resolve(frames);
}

/**
 * @hidden
 */
export function getExceptionFromError(error: Error): PromiseLike<Exception> {
  const name = error.name || error.constructor.name;
  const stack = extractStackFromError(error);
  return new SyncPromise<Exception>(resolve =>
    parseStack(stack).then(frames => {
      const result = {
        stacktrace: {
          frames: prepareFramesForEvent(frames),
        },
        type: name,
        value: error.message,
      };
      resolve(result);
    }),
  );
}

/**
 * @hidden
 */
export function parseError(error: ExtendedError): PromiseLike<SentryEvent> {
  return new SyncPromise<SentryEvent>(resolve =>
    getExceptionFromError(error).then((exception: Exception) => {
      resolve({
        exception: {
          values: [exception],
        },
      });
    }),
  );
}

/**
 * @hidden
 */
export function prepareFramesForEvent(stack: StackFrame[]): StackFrame[] {
  if (!stack || !stack.length) {
    return [];
  }

  let localStack = stack;
  const firstFrameFunction = localStack[0].function || '';

  if (firstFrameFunction.indexOf('captureMessage') !== -1 || firstFrameFunction.indexOf('captureException') !== -1) {
    localStack = localStack.slice(1);
  }

  // The frame where the crash happened, should be the last entry in the array
  return localStack.reverse();
}
