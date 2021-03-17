import { Session, SessionAttributes } from './session';

/** JSDoc */
export interface AggregatedSessions {
  attrs?: SessionAttributes;
  aggregates?: Array<AggregationCounts>;
}

export interface SessionFlusher {
  readonly flushTimeout: number;

  /** Aggregates the Session in its corresponding Aggregate Bucket */
  addSession(session: Session): void;

  /** Submits the session to Sentry */
  sendSessions(aggregatedSession: AggregatedSessions): void;

  /** Empties Aggregate Buckets and Sends them to Transport Buffer */
  flush(): void;

  /** Clears setInterval and calls flush */
  close(): void;
}

export interface AggregationCounts {
  started: string;
  errored?: number;
  exited?: number;
  crashed?: number;
  abnormal?: number;
}
