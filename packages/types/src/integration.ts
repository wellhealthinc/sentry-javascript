import { ClientLike } from './client';

/** Integration interface */
export interface Integration {
  name: string;
  install(client: ClientLike): void;
}
