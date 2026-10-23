import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('a delayed save response preserves a newer unsent draft', async () => {
  const elements = Object.fromEntries(['#note-form', '#note', '#simulate', '#save', '#error', '#status', '#notes', '#empty'].map(key => [key, {
    value: '', checked: false, disabled: false, textContent: '', hidden: false,
    replaceChildren() {}, focus() {}, addEventListener(event, handler) { this.handler = handler; },
  }]));
  let release;
  const responseReady = new Promise(resolve => { release = resolve; });
  const requests = [];
  // Focused UI unit test with controlled transport. Real API/DB browser tests stay unmocked.
  runInNewContext(await readFile('pilot/public/app.js', 'utf8'), {
    document: { querySelector: selector => elements[selector] },
    crypto: { randomUUID: () => 'operation-1' },
    fetch: async (url, options) => {
      if (options?.method === 'POST') {
        requests.push(JSON.parse(options.body));
        await responseReady;
        return { ok: true, json: async () => ({ note: { text: 'Draft A' } }) };
      }
      return { ok: true, json: async () => ({ notes: [] }) };
    },
  });
  elements['#note'].value = 'Draft A';
  const saving = elements['#note-form'].handler({ preventDefault() {} });
  elements['#note'].value = 'Draft B edited during save';
  release();
  await saving;
  assert.deepEqual(requests, [{ text: 'Draft A' }]);
  assert.equal(elements['#note'].value, 'Draft B edited during save');
  assert.equal(elements['#status'].textContent, 'Đã lưu ghi chú.');
});
