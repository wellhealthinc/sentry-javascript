import { SentryEvent, StackFrame, Stacktrace, ClientLike, Integration } from '@sentry/types';
import { basename, relative } from '@sentry/utils';

type StackFrameIteratee = (frame: StackFrame) => StackFrame;
type RewriteFramesOptions = {
  root?: string;
  iteratee?: StackFrameIteratee;
};

export class RewriteFrames implements Integration {
  public name = this.constructor.name;

  private readonly _root?: string;

  public constructor(options: RewriteFramesOptions = {}) {
    if (options.root) {
      this._root = options.root;
    }
    if (options.iteratee) {
      this._iteratee = options.iteratee;
    }
  }

  public install(client: ClientLike): void {
    client.addEventProcessor(event => this.process(event));
  }

  public process(event: SentryEvent): SentryEvent {
    if (event.exception && Array.isArray(event.exception.values)) {
      return this._processExceptionsEvent(event);
    }

    if (event.stacktrace) {
      return this._processStacktraceEvent(event);
    }

    return event;
  }

  /**
   * @inheritDoc
   */
  private readonly _iteratee: StackFrameIteratee = (frame: StackFrame) => {
    if (!frame.filename) {
      return frame;
    }
    // Check if the frame filename begins with `/` or a Windows-style prefix such as `C:\`
    const isWindowsFrame = /^[A-Z]:\\/.test(frame.filename);
    const startsWithSlash = /^\//.test(frame.filename);
    if (isWindowsFrame || startsWithSlash) {
      const filename = isWindowsFrame
        ? frame.filename
            .replace(/^[A-Z]:/, '') // remove Windows-style prefix
            .replace(/\\/g, '/') // replace all `\\` instances with `/`
        : frame.filename;
      const base = this._root ? relative(this._root, filename) : basename(filename);
      frame.filename = `app:///${base}`;
    }
    return frame;
  };

  private _processExceptionsEvent(event: SentryEvent): SentryEvent {
    try {
      return {
        ...event,
        exception: {
          ...event.exception,
          // The check for this is performed inside `process` call itself, safe to skip here
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          values: event.exception!.values!.map(value => ({
            ...value,
            stacktrace: this._processStacktrace(value.stacktrace),
          })),
        },
      };
    } catch (_oO) {
      return event;
    }
  }

  private _processStacktraceEvent(event: SentryEvent): SentryEvent {
    try {
      return {
        ...event,
        stacktrace: this._processStacktrace(event.stacktrace),
      };
    } catch (_oO) {
      return event;
    }
  }

  private _processStacktrace(stacktrace?: Stacktrace): Stacktrace {
    return {
      ...stacktrace,
      frames: stacktrace && stacktrace.frames && stacktrace.frames.map(f => this._iteratee(f)),
    };
  }
}
