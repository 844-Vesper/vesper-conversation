import { InviteLock } from '../../workers/invite-locks/index.js';

// In-memory implementation of the storage contract, using the real lock handler.
// Runtime integration is additionally checked with Cloudflare's local runtime.
export function lockNamespace() {
  const objects = new Map();
  return {
    objects,
    idFromName(name) { return name; },
    get(name) {
      if (!objects.has(name)) {
        const entries = new Map();
        let queue = Promise.resolve();
        const storage = {
          alarm: null,
          async get(key) { return structuredClone(entries.get(key)); },
          async put(key, value) { entries.set(key, structuredClone(value)); },
          async setAlarm(value) { this.alarm = value; },
          async deleteAll() { entries.clear(); this.alarm = null; },
          async transaction(callback) {
            const before = structuredClone(entries);
            const alarm = this.alarm;
            try { return await callback(); }
            catch (error) {
              entries.clear();
              for (const [key, value] of before) entries.set(key, value);
              this.alarm = alarm;
              throw error;
            }
          },
        };
        const ctx = {
          storage,
          blockConcurrencyWhile(callback) {
            const result = queue.then(callback);
            queue = result.catch(() => {});
            return result;
          },
        };
        objects.set(name, { handler: new InviteLock(ctx), storage, entries });
      }
      const object = objects.get(name);
      return { fetch(url, init) { return object.handler.fetch(new Request(url, init)); } };
    },
  };
}
