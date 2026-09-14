const LOCK_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// One private Durable Object per keyed invitation fingerprint.
export class InviteLock {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/claim') {
      return new Response(null, { status: 404 });
    }
    let browser;
    try {
      const body = await request.json();
      browser = body.browser;
      if (typeof browser !== 'string' || !/^[a-f0-9]{64}$/.test(browser)) throw new Error('Invalid fingerprint');
    } catch { return new Response(null, { status: 400 }); }

    // Serialize first-use claims and alarm cleanup, including requests from different regions.
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      let lock = await this.ctx.storage.get('lock');
      if (!lock || lock.expires <= now) {
        lock = { browser, expires: now + LOCK_DURATION_MS };
        // Commit the record and cleanup alarm together, or neither, if storage fails.
        await this.ctx.storage.transaction(async () => {
          await this.ctx.storage.put('lock', lock);
          await this.ctx.storage.setAlarm(lock.expires);
        });
      }
      return Response.json(lock.browser === browser ? { allowed: true, expires: lock.expires } : { allowed: false });
    });
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const lock = await this.ctx.storage.get('lock');
      if (lock && lock.expires > Date.now()) {
        // A delayed old alarm must never erase a newly acquired reservation.
        await this.ctx.storage.setAlarm(lock.expires);
      } else {
        await this.ctx.storage.deleteAll();
      }
    });
  }
}

// No public API. Pages calls the object through a private namespace binding.
export default { fetch() { return new Response('Not found', { status: 404 }); } };
