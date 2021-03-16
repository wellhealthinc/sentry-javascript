import { User } from './user';

/**
 * @inheritdoc
 */
export interface Session extends SessionContext {
  /** JSDoc */
  update(context?: SessionContext): void;

  /** JSDoc */
  close(status?: SessionStatus): void;

  /** JSDoc */
  toJSON(): {
    init: boolean;
    sid: string;
    did?: string;
    timestamp: string;
    started: string;
    duration: number;
    status: SessionStatus;
    session_mode?: SessionMode;
    errors: number;
    attrs?: {
      release?: string;
      environment?: string;
      user_agent?: string;
      ip_address?: string;
    };
  };
}

/**
 * Session Context
 */
export interface SessionContext {
  sid?: string;
  did?: string;
  init?: boolean;
  timestamp?: number;
  started?: number;
  duration?: number;
  status?: SessionStatus;
  release?: string;
  environment?: string;
  userAgent?: string;
  ipAddress?: string;
  errors?: number;
  user?: User | null;
  sessionMode?: SessionMode;
}

/**
 * Session Status
 */
export enum SessionStatus {
  /** JSDoc */
  Ok = 'ok',
  /** JSDoc */
  Exited = 'exited',
  /** JSDoc */
  Crashed = 'crashed',
  /** JSDoc */
  Abnormal = 'abnormal',
}

/**
 * Session Mode
 */
export enum SessionMode {
  /** JSDoc */
  Application = 'application',
  /** JSDoc */
  Request = 'request',
}

export interface SessionFlusher {
  readonly maxItemsInEnvelope: number;
  readonly flushTimeout: number;

  /** Aggregates the Session in its corresponding Aggregate Bucket */
  addSession(session: Session): void;

  /** Submits the session to Sentry */
  sendSession(session: Session): void;

  /** Empties Aggregate Buckets and Sends them to Transport Buffer */
  flush(): void;

  /** Clears setInterval and calls flush */
  close(): void;
}

export interface AggregateSessionBucket {
  started: string;
  errored?: number;
  exited?: number;
  crashed?: number;
  abnormal?: number;
}

/** JSDoc */
export interface SessionAttributesContext {
  environment?: string;
  ipAddress?: string;
  release?: string;
  userAgent?: string;
}

/** JSDoc */
export interface SessionAttributes extends SessionAttributesContext {
  /** JSDoc */
  update(context?: SessionAttributesContext): void;

  /** JSDoc */
  toJSON(): {
    environment?: string;
    ip_address?: string;
    release?: string;
    user_agent?: string;
  };
}
