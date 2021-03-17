import {
  AggregatedSessions,
  AggregationCounts,
  Session,
  SessionAttributes,
  SessionFlusher as SessionFlusherInterface,
  SessionStatus,
  Transport,
} from '@sentry/types';
import { logger } from '@sentry/utils';

/**
 * @inheritdoc
 */
export class SessionFlusher implements SessionFlusherInterface {
  private _pendingAggregates: { [key: number]: AggregationCounts } = {};
  private _sessionAttrs: SessionAttributes | undefined;
  private _intervalId: any;

  constructor(private _transport: Transport, public readonly flushTimeout: number = 10) {
    this._intervalId = setInterval(this.flush.bind(this), this.flushTimeout * 1000);
  }

  /** JSDoc */
  public sendSessions(aggregatedSession: AggregatedSessions): void {
    if (!this._transport.sendSessions) {
      logger.warn("Dropping session because custom transport doesn't implement sendSession");
      return;
    }
    this._transport.sendSessions(aggregatedSession).then(null, reason => {
      logger.error(`Error while sending session: ${reason}`);
    });
  }

  /** JSDoc */
  flush(): void {
    if (Object.keys(this._pendingAggregates).length === 0) {
      return;
    }
    const aggregates: AggregationCounts[] = Object.keys(this._pendingAggregates).map((key: string) => {
      return this._pendingAggregates[parseInt(key)];
    });
    this._pendingAggregates = {};
    const aggregatedSessions: AggregatedSessions = {
      attrs: this._sessionAttrs,
      aggregates: aggregates,
    };
    this._sessionAttrs = undefined;
    this.sendSessions(aggregatedSessions);
  }

  /** JSDoc */
  close(): void {
    clearTimeout(this._intervalId);
    this.flush();
  }

  /** JSDoc */
  addSession(session: Session): void {
    // If Session attrs don't already exist in the pendingAggregates buffer, then set them from the Session passed
    if (!this._sessionAttrs) {
      this._sessionAttrs = session.getSessionAttributes(false);
    }

    // Truncate minutes and seconds on Session Started attribute to have one minute bucket keys
    const sessionStartedTrunc: number = new Date(session.started).setMinutes(0, 0, 0);

    this._pendingAggregates[sessionStartedTrunc] = this._pendingAggregates[sessionStartedTrunc] || {};

    // corresponds to aggregated sessions in one specific minute bucket
    // for example, {"started":"2021-03-16T08:00:00.000Z","exited":4, "errored": 1}
    const aggregationCounts: AggregationCounts = this._pendingAggregates[sessionStartedTrunc];

    if (!aggregationCounts.started) {
      aggregationCounts.started = new Date(sessionStartedTrunc).toISOString();
    }
    if (session.status == SessionStatus.Crashed) {
      aggregationCounts.crashed = aggregationCounts.crashed !== undefined ? aggregationCounts.crashed + 1 : 1;
    } else if (session.status == SessionStatus.Abnormal) {
      aggregationCounts.abnormal = aggregationCounts.abnormal !== undefined ? aggregationCounts.abnormal + 1 : 1;
    } else if (session.errors > 0) {
      aggregationCounts.errored = aggregationCounts.errored !== undefined ? aggregationCounts.errored + 1 : 1;
    } else {
      aggregationCounts.exited = aggregationCounts.exited !== undefined ? aggregationCounts.exited + 1 : 1;
    }
  }
}
