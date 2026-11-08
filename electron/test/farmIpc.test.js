const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db/database');
const { createAuthService } = require('../src/auth/authService');
const { registerFarmHandlers } = require('../src/ipc/farmHandlers');
const accounting = require('../src/services/accountingService');

const SESSION = 'ipc-session-1';
let tmpDir;
let db;
let handlers;
let cashboxId;

function invoke(channel, payload) {
  return handlers.get(channel)({ sender: { id: SESSION } }, payload);
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-ipc-'));
  db = openDatabase(tmpDir).db;
  const auth = createAuthService(db);
  await auth.setupOwner(SESSION, { username: 'owner', displayName: 'المالك', password: 'owner-pass-1' });
  handlers = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  registerFarmHandlers(ipcMain, auth, () => db, () => tmpDir);
  const created = await invoke('treasury:createCashbox', { name: 'الرئيسية', openingBalance: 100000, date: '2024-01-01' });
  assert.equal(created.ok, true, created.error);
  cashboxId = created.data.id;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('listing active cashboxes over IPC returns the real cashbox ids', async () => {
  const res = await invoke('treasury:cashboxes');
  assert.equal(res.ok, true, res.error);
  assert.ok(res.data.some((box) => box.id === cashboxId && box.is_active === true));
});

test('an expense created over IPC is posted to SQLite with its cashbox and journal', async () => {
  const res = await invoke('expenses:create', {
    date: '2024-02-01', categoryId: 'ec_feed', amount: 25000, cashboxId, description: 'علف',
  });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.data.docNumber, 'EXP-00001');

  const row = db.prepare('SELECT amount, cashbox_id, journal_entry_id FROM expenses WHERE id = ?').get(res.data.id);
  assert.equal(row.amount, 25000);
  assert.equal(row.cashbox_id, cashboxId);
  assert.ok(row.journal_entry_id);
  assert.equal(accounting.trialBalance(db).isBalanced, true);
});

test('an expense with an unknown cashbox is refused with a readable message', async () => {
  const res = await invoke('expenses:create', { date: '2024-02-01', categoryId: 'ec_feed', amount: 100, cashboxId: 'cash-main' });
  assert.equal(res.ok, false);
  assert.match(res.error, /الخزينة/);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c, 0);
});

test('shared expense allocations are stored as basis points and shares sum to the amount', async () => {
  const res = await invoke('expenses:create', {
    date: '2024-02-01', categoryId: 'ec_utilities', amount: 1000, cashboxId,
    distributions: [
      { activityId: 'fattening', basisPoints: 3333 },
      { activityId: 'dairy', basisPoints: 3333 },
      { activityId: 'breeding', basisPoints: 3334 },
    ],
  });
  assert.equal(res.ok, true, res.error);
  const rows = db.prepare('SELECT basis_points, amount FROM expense_distributions WHERE expense_id = ?').all(res.data.id);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 1000);
  assert.deepEqual(rows.map((row) => row.basis_points).sort((a, b) => a - b), [3333, 3333, 3334]);
});

test('an income created over IPC increases the cashbox', async () => {
  const res = await invoke('incomes:create', { date: '2024-02-02', categoryId: 'ic_other', amount: 5000, cashboxId });
  assert.equal(res.ok, true, res.error);
  const cashboxes = (await invoke('treasury:cashboxes')).data;
  assert.equal(cashboxes.find((box) => box.id === cashboxId).balance, 105000);
});

test('an expense category can be created over IPC against an active expense account', async () => {
  const account = db.prepare("SELECT id FROM accounts WHERE type = 'expense' AND is_active = 1 LIMIT 1").get();
  const res = await invoke('expenses:createCategory', { name: 'مواصلات', accountId: account.id });
  assert.equal(res.ok, true, res.error);
  const categories = (await invoke('expenses:categories')).data;
  assert.ok(categories.expense.some((row) => row.id === res.data.id && row.name === 'مواصلات'));
});

test('an expense category rejects an account of the wrong type', async () => {
  const account = db.prepare("SELECT id FROM accounts WHERE type = 'revenue' AND is_active = 1 LIMIT 1").get();
  const res = await invoke('expenses:createCategory', { name: 'مواصلات', accountId: account.id });
  assert.equal(res.ok, false);
  assert.match(res.error, /الحساب المحاسبي/);
});

test('a duplicate income category name is refused', async () => {
  const account = db.prepare("SELECT id FROM accounts WHERE type = 'revenue' AND is_active = 1 LIMIT 1").get();
  const first = await invoke('incomes:createCategory', { name: 'إيجار أرض', accountId: account.id });
  assert.equal(first.ok, true, first.error);
  const second = await invoke('incomes:createCategory', { name: 'إيجار أرض', accountId: account.id });
  assert.equal(second.ok, false);
  assert.match(second.error, /بنفس الاسم/);
});
