import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getDatabase, ref, get, set, update, push, onValue, onChildAdded, onDisconnect,
} from 'firebase/database';
import type { Transport } from './transport';

export function createFirebaseTransport(config: Record<string, string>): Transport {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getDatabase(app);
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), s => (offset = s.val() ?? 0));
  let uidPromise: Promise<string> | null = null;

  return {
    uid() {
      uidPromise ??= signInAnonymously(auth).then(c => c.user.uid);
      return uidPromise;
    },
    serverNow: () => Date.now() + offset,
    get: async path => (await get(ref(db, path))).val(),
    set: (path, v) => set(ref(db, path), v),
    update: (path, v) => update(ref(db, path), v),
    push: async (path, v) => {
      await push(ref(db, path), v);
    },
    on: (path, cb) => onValue(ref(db, path), s => cb(s.val())),
    onChildAdded: (path, cb) => onChildAdded(ref(db, path), s => cb(s.val())),
    onDisconnectSet: (path, v) => {
      void onDisconnect(ref(db, path)).set(v);
    },
  };
}
