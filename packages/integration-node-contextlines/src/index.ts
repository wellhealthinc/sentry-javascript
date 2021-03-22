import { readFile } from 'fs';

import { ClientLike, Integration, StackFrame } from '@sentry/types';
import { snipLine, SyncPromise } from '@sentry/utils';
import { LRUMap } from 'lru_map';

const DEFAULT_LINES_OF_CONTEXT: number = 7;
const FILE_CONTENT_CACHE = new LRUMap<string, string | null>(100);

/**
 * Resets the file cache. Exists for testing purposes.
 * @hidden
 */
export function resetFileContentCache(): void {
  FILE_CONTENT_CACHE.clear();
}

/** Add node modules / packages to the event */
export class ContextLines implements Integration {
  public name = this.constructor.name;

  // private _moduleCache?: { [key: string]: string };

  public install(client: ClientLike): void {
    const linesOfContext =
      (client.options as { frameContextLines?: number }).frameContextLines ?? DEFAULT_LINES_OF_CONTEXT;

    client.addEventProcessor(event => {
      const stacktrace = event.exception?.values?.[0].stacktrace as StackFrame[];

      if (stacktrace) {
        const filenames: string[] = [];

        for (const frame of stacktrace) {
          if (frame.filename && !filenames.includes(frame.filename)) {
            filenames.push(frame.filename);
          }
        }

        return readSourceFiles(filenames).then(sourceFiles => {
          for (const frame of stacktrace) {
            if (frame.filename && sourceFiles[frame.filename]) {
              try {
                const lines = (sourceFiles[frame.filename] as string).split('\n');
                addContextToFrame(lines, frame, linesOfContext);
              } catch (e) {
                // anomaly, being defensive in case
                // unlikely to ever happen in practice but can definitely happen in theory
              }
            }
          }

          return event;
        });
      }

      return event;
    });
  }
}

/**
 * This function adds context (pre/post/line) lines to the provided frame
 *
 * @param lines string[] containing all lines
 * @param frame StackFrame that will be mutated
 * @param linesOfContext number of context lines we want to add pre/post
 */
function addContextToFrame(lines: string[], frame: StackFrame, linesOfContext: number = 5): void {
  const lineno = frame.lineno || 0;
  const maxLines = lines.length;
  const sourceLine = Math.max(Math.min(maxLines, lineno - 1), 0);

  frame.pre_context = lines
    .slice(Math.max(0, sourceLine - linesOfContext), sourceLine)
    .map((line: string) => snipLine(line, 0));

  frame.context_line = snipLine(lines[Math.min(maxLines - 1, sourceLine)], frame.colno || 0);

  frame.post_context = lines
    .slice(Math.min(sourceLine + 1, maxLines), sourceLine + 1 + linesOfContext)
    .map((line: string) => snipLine(line, 0));
}

/**
 * This function reads file contents and caches them in a global LRU cache.
 * Returns a Promise filepath => content array for all files that we were able to read.
 *
 * @param filenames Array of filepaths to read content from.
 */
function readSourceFiles(filenames: string[]): PromiseLike<{ [key: string]: string | null }> {
  // we're relying on filenames being de-duped already
  if (filenames.length === 0) {
    return SyncPromise.resolve({});
  }

  return new SyncPromise<{
    [key: string]: string | null;
  }>(resolve => {
    const sourceFiles: {
      [key: string]: string | null;
    } = {};

    let count = 0;
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < filenames.length; i++) {
      const filename = filenames[i];

      const cache = FILE_CONTENT_CACHE.get(filename);
      // We have a cache hit
      if (cache !== undefined) {
        // If it's not null (which means we found a file and have a content)
        // we set the content and return it later.
        if (cache !== null) {
          sourceFiles[filename] = cache;
        }
        // eslint-disable-next-line no-plusplus
        count++;
        // In any case we want to skip here then since we have a content already or we couldn't
        // read the file and don't want to try again.
        if (count === filenames.length) {
          resolve(sourceFiles);
        }
        continue;
      }

      readFile(filename, (err: Error | null, data: Buffer) => {
        const content = err ? null : data.toString();
        sourceFiles[filename] = content;

        // We always want to set the cache, even to null which means there was an error reading the file.
        // We do not want to try to read the file again.
        FILE_CONTENT_CACHE.set(filename, content);
        // eslint-disable-next-line no-plusplus
        count++;
        if (count === filenames.length) {
          resolve(sourceFiles);
        }
      });
    }
  });
}
