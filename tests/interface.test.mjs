import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('successful invitation changes state and moves focus without a decorative delay', async () => {
  const elements = new Map();
  const timers = [];
  let focused = null;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: id !== 'invitation-state', disabled: false, value: '', textContent: '',
      attributes: new Map(), listeners: {},
      setAttribute(name, value) { this.attributes.set(name, value); },
      removeAttribute(name) { this.attributes.delete(name); },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      querySelector() { return { focus() { focused = id; } }; },
      focus() { focused = id; },
    });
    return elements.get(id);
  }
  const context = {
    document: { getElementById: element },
    window: { addEventListener() {} },
    AbortSignal, URL,
    fetch: async (_path, options) => ({ ok: true, status: 200, json: async () => ({ valid: options.method === 'POST' }) }),
    setTimeout(callback, milliseconds) { timers.push(milliseconds); queueMicrotask(callback); return 1; },
    clearTimeout() {},
    matchMedia: () => ({ matches: false }),
  };
  vm.runInNewContext(await readFile('script.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  element('invitation-code').value = 'synthetic-test-only';
  await element('invitation-form').listeners.submit({ preventDefault() {} });
  assert.equal(element('invitation-state').hidden, true);
  assert.equal(element('scheduling-state').hidden, false);
  assert.equal(focused, 'scheduling-state');
  assert.equal(element('invitation-code').value, '');
  assert.equal(element('continue-button').disabled, false);
  assert.equal(element('continue-button').textContent, 'Continue');
  assert.equal(element('invitation-form').attributes.has('aria-busy'), false);
  assert.deepEqual(timers, []);
});

test('all referenced canonical design tokens have local definitions', async () => {
  const tokens = await readFile('tokens.css', 'utf8');
  const styles = await readFile('styles.css', 'utf8');
  const defined = new Set([...tokens.matchAll(/(--vesper-[\w-]+)\s*:/g)].map(match => match[1]));
  for (const match of (tokens + styles).matchAll(/var\((--vesper-[\w-]+)/g)) assert.ok(defined.has(match[1]), match[1]);
});
