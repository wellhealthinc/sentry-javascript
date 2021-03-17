import { User } from './user';

/**
 * @inheritdoc
 */
export interface Session extends SessionContext {
  /** @inheritdoc */
  started: number;
  /** @inheritdoc */
  errors: number;

  getSessionAttributes(withUserInfo: boolean): SessionAttributes;

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

/** JSDoc */
export interface SessionAttributes {
  environment?: string;
  ipAddress?: string;
  release?: string;
  userAgent?: string;
}
