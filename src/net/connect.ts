import { firebaseConfig } from './firebaseConfig';
import type { Transport } from './transport';

let transport: Promise<Transport> | null = null;

export const onlineAvailable = () => firebaseConfig !== null;

/** Firebase は使うときだけ読み込む（オンライン以外の画面を軽くするため） */
export function getTransport(): Promise<Transport> {
  if (!firebaseConfig) return Promise.reject(new Error('not_configured'));
  const config = firebaseConfig;
  transport ??= import('./firebaseTransport').then(m => m.createFirebaseTransport(config));
  return transport;
}
