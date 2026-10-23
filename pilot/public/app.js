const form = document.querySelector('#note-form');
const input = document.querySelector('#note');
const simulate = document.querySelector('#simulate');
const save = document.querySelector('#save');
const error = document.querySelector('#error');
const status = document.querySelector('#status');
let pending;

function showError(message) { error.textContent = message; error.hidden = !message; }
async function refresh() {
  const response = await fetch('/api/notes');
  if (!response.ok) throw new Error('Không tải được lịch sử. Hãy tải lại trang.');
  const { notes } = await response.json();
  const list = document.querySelector('#notes');
  list.replaceChildren();
  for (const note of notes) {
    const item = document.createElement('li');
    const text = document.createElement('p'); text.textContent = note.text;
    const time = document.createElement('time'); time.dateTime = note.createdAt;
    time.textContent = new Date(note.createdAt).toLocaleString('vi-VN');
    item.append(text, time); list.append(item);
  }
  document.querySelector('#empty').hidden = notes.length > 0;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (save.disabled) return;
  const text = input.value.trim();
  if (!text) { showError('Hãy nhập nội dung ghi chú.'); input.focus(); return; }
  if (!pending || pending.text !== text) pending = { key: crypto.randomUUID(), text };
  const operation = pending;
  const triggerFailure = simulate.checked; simulate.checked = false;
  save.disabled = true; save.textContent = 'Đang lưu…'; showError(''); status.textContent = '';
  try {
    const response = await fetch('/api/notes', {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': operation.key,
        ...(triggerFailure ? { 'x-pilot-simulate-failure': '1' } : {}) },
      body: JSON.stringify({ text: operation.text }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? 'Không lưu được. Hãy thử lại.');
    pending = null; input.value = ''; status.textContent = 'Đã lưu ghi chú.';
    await refresh(); input.focus();
  } catch (failure) {
    showError(failure instanceof TypeError ? 'Mất kết nối. Hãy bấm Lưu ghi chú để đối chiếu và thử lại.' : failure.message);
  } finally { save.disabled = false; save.textContent = 'Lưu ghi chú'; }
});
refresh().catch(failure => showError(failure.message));
