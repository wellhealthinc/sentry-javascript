import { Integration } from '@sentry/types';
import { fill, getFunctionName, getGlobalObject } from '@sentry/utils';

import { wrap } from './wrap';

type TimersWrapOptions = {
  setTimeout?: boolean;
  setInterval?: boolean;
  requestAnimationFrame?: boolean;
};

export class TimersWrap implements Integration {
  public name = this.constructor.name;

  private _setTimeout: boolean;
  private _setInterval: boolean;
  private _requestAnimationFrame: boolean;

  public constructor({ setTimeout, setInterval, requestAnimationFrame }: TimersWrapOptions = {}) {
    this._setTimeout = setTimeout ?? true;
    this._setInterval = setInterval ?? true;
    this._requestAnimationFrame = requestAnimationFrame ?? true;
  }

  public install(): void {
    const global = getGlobalObject();

    if (this._setTimeout) {
      fill(global, 'setTimeout', this._wrapTimeFunction.bind(this));
    }

    if (this._setInterval) {
      fill(global, 'setInterval', this._wrapTimeFunction.bind(this));
    }

    if (this._requestAnimationFrame) {
      fill(global, 'requestAnimationFrame', this._wrapRAF.bind(this));
    }
  }

  private _wrapTimeFunction(original: () => void): () => number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function(this: any, ...args: any[]): number {
      const originalCallback = args[0];
      args[0] = wrap(originalCallback, {
        // TODO: Change to `handler` and add `setTimeout/setInterval` as function name.
        data: { function: getFunctionName(original) },
        handled: true,
        type: 'instrument',
      });
      return original.apply(this, args);
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _wrapRAF(original: any): (callback: () => void) => any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function(this: any, callback: () => void): () => void {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return original.call(
        this,
        wrap(callback, {
          data: {
            function: 'requestAnimationFrame',
            handler: getFunctionName(original),
          },
          handled: true,
          type: 'instrument',
        }),
      );
    };
  }
}
