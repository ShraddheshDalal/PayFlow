import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_BALANCE_PAISE,
  MAX_TRANSACTION_PAISE,
  STATUS,
  createInitialState,
  filterTransactions,
  formatINR,
  generateReference,
  getFrequentRecipients,
  getStats,
  isValidState,
  isValidUpiId,
  parseAmountToPaise,
  processPayment,
  validatePayment
} from '../js/payment-service.js';
import { STORAGE_KEY, loadState, resetState, saveState } from '../js/storage.js';

const FIXED_NOW = new Date('2026-10-13T10:30:00.000Z');
const BALANCE = 2500000; // ₹25,000.00

function validInput(overrides = {}) {
  return {
    recipientName: 'Ananya Rao',
    upiId: 'ananya.rao@okpayflow',
    amount: '1500.50',
    note: 'Lunch share',
    ...overrides
  };
}

function stateWithBalance(balancePaise) {
  return { ...createInitialState(), balancePaise };
}

/** Minimal in-memory implementation of the Web Storage API. */
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
}

describe('validatePayment', () => {
  it('accepts a valid recipient, UPI ID and positive amount', () => {
    const result = validatePayment(validInput(), BALANCE);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.value, {
      recipientName: 'Ananya Rao',
      upiId: 'ananya.rao@okpayflow',
      amountPaise: 150050,
      note: 'Lunch share'
    });
  });

  it('accepts numeric amounts and trims/normalises text fields', () => {
    const result = validatePayment(validInput({ recipientName: '  Ananya Rao ', upiId: ' Ananya.Rao@OkPayFlow ', amount: 250 }), BALANCE);
    assert.equal(result.valid, true);
    assert.equal(result.value.recipientName, 'Ananya Rao');
    assert.equal(result.value.upiId, 'ananya.rao@okpayflow');
    assert.equal(result.value.amountPaise, 25000);
  });

  it('rejects an empty recipient name', () => {
    for (const recipientName of ['', '   ', undefined]) {
      const result = validatePayment(validInput({ recipientName }), BALANCE);
      assert.equal(result.valid, false);
      assert.equal(result.errors.recipientName, 'Recipient name is required.');
      assert.equal(result.value, null);
    }
  });

  it('rejects a recipient name without letters or that is too long', () => {
    assert.ok(validatePayment(validInput({ recipientName: '12345' }), BALANCE).errors.recipientName);
    assert.ok(validatePayment(validInput({ recipientName: 'A'.repeat(51) }), BALANCE).errors.recipientName);
  });

  it('rejects an empty UPI ID', () => {
    const result = validatePayment(validInput({ upiId: '  ' }), BALANCE);
    assert.equal(result.valid, false);
    assert.equal(result.errors.upiId, 'UPI ID is required.');
  });

  it('rejects invalid UPI ID formats', () => {
    const invalid = ['ananya', 'ananya@', '@okpayflow', 'an@@bank', 'a@bank', 'ananya rao@bank', 'ananya@ok-bank', 'ananya@1bank', 'ananya@bank.com'];
    for (const upiId of invalid) {
      const result = validatePayment(validInput({ upiId }), BALANCE);
      assert.equal(result.valid, false, `${upiId} should be rejected`);
      assert.match(result.errors.upiId, /UPI ID like name@bank/);
    }
  });

  it('accepts reasonable UPI ID formats', () => {
    for (const upiId of ['ananya@okpayflow', 'a.rao_99@demobank', '9876543210@upi', 'shop-23@ybl']) {
      assert.equal(isValidUpiId(upiId), true, `${upiId} should be accepted`);
    }
  });

  it('rejects a zero amount', () => {
    for (const amount of [0, '0', '0.00']) {
      const result = validatePayment(validInput({ amount }), BALANCE);
      assert.equal(result.valid, false);
      assert.equal(result.errors.amount, 'Amount must be greater than zero.');
    }
  });

  it('rejects negative amounts', () => {
    for (const amount of [-100, '-100', '-0.50']) {
      const result = validatePayment(validInput({ amount }), BALANCE);
      assert.equal(result.valid, false);
      assert.equal(result.errors.amount, 'Amount cannot be negative.');
    }
  });

  it('rejects non-numeric, NaN, Infinity and malformed amounts', () => {
    const invalid = ['abc', '12abc', '1e3', '10.005', '1.2.3', '--5', NaN, Infinity, -Infinity, {}, true];
    for (const amount of invalid) {
      const result = validatePayment(validInput({ amount }), BALANCE);
      assert.equal(result.valid, false, `${String(amount)} should be rejected`);
      assert.equal(result.errors.amount, 'Enter a valid amount with up to 2 decimal places.');
    }
  });

  it('requires an amount', () => {
    for (const amount of ['', '  ', undefined, null]) {
      assert.equal(validatePayment(validInput({ amount }), BALANCE).errors.amount, 'Amount is required.');
    }
  });

  it('rejects amounts below the ₹1.00 minimum', () => {
    assert.match(validatePayment(validInput({ amount: '0.50' }), BALANCE).errors.amount, /Minimum payment/);
  });

  it('rejects an amount above the per-payment transaction limit', () => {
    const atLimit = validatePayment(validInput({ amount: '10000' }), BALANCE);
    assert.equal(atLimit.valid, true, 'exactly ₹10,000 is allowed');

    const overLimit = validatePayment(validInput({ amount: '10000.01' }), BALANCE);
    assert.equal(overLimit.valid, false);
    assert.equal(overLimit.errors.amount, `Demo limit is ${formatINR(MAX_TRANSACTION_PAISE)} per payment.`);
  });

  it('rejects an amount above the simulated wallet balance', () => {
    const result = validatePayment(validInput({ amount: '500.01' }), 50000);
    assert.equal(result.valid, false);
    assert.match(result.errors.amount, /Insufficient demo balance/);
    assert.equal(validatePayment(validInput({ amount: '500' }), 50000).valid, true, 'exact balance is allowed');
  });

  it('rejects notes longer than 100 characters', () => {
    assert.ok(validatePayment(validInput({ note: 'x'.repeat(101) }), BALANCE).errors.note);
    assert.equal(validatePayment(validInput({ note: '' }), BALANCE).valid, true);
  });

  it('reports every invalid field at once', () => {
    const result = validatePayment({ recipientName: '', upiId: 'bad', amount: '-1' }, BALANCE);
    assert.deepEqual(Object.keys(result.errors).sort(), ['amount', 'recipientName', 'upiId']);
  });
});

describe('parseAmountToPaise', () => {
  it('converts rupee strings and numbers to integer paise without float errors', () => {
    assert.equal(parseAmountToPaise('0.1'), 10);
    assert.equal(parseAmountToPaise('19.99'), 1999);
    assert.equal(parseAmountToPaise('1,500.5'), 150050);
    assert.equal(parseAmountToPaise(0.1 + 0.2), 30, 'tolerates binary floating-point noise');
    assert.equal(parseAmountToPaise(10.005), null, 'more than 2 decimal places');
    assert.equal(parseAmountToPaise(10.1), 1010);
  });
});

describe('processPayment', () => {
  it('deducts the exact amount from the balance for a successful payment', () => {
    const state = stateWithBalance(BALANCE);
    const result = processPayment(state, validInput({ amount: '1500.50' }), { now: FIXED_NOW });

    assert.equal(result.ok, true);
    assert.equal(result.transaction.status, STATUS.SUCCESS);
    assert.equal(result.state.balancePaise, BALANCE - 150050);
    assert.equal(formatINR(result.state.balancePaise), '₹23,499.50');
    assert.equal(result.state.transactions.length, state.transactions.length + 1);
    assert.equal(result.state.transactions[0], result.transaction, 'new transaction is listed first');
  });

  it('does not mutate the original state', () => {
    const state = stateWithBalance(BALANCE);
    const snapshot = structuredClone(state);
    processPayment(state, validInput(), { now: FIXED_NOW });
    assert.deepEqual(state, snapshot);
  });

  it('rejects invalid details without deducting or recording anything', () => {
    const state = stateWithBalance(BALANCE);
    const result = processPayment(state, validInput({ amount: '-50' }), { now: FIXED_NOW });

    assert.equal(result.ok, false);
    assert.equal(result.transaction, null);
    assert.equal(result.state, state);
    assert.equal(result.state.balancePaise, BALANCE);
    assert.ok(result.errors.amount);
  });

  it('rejects payments above the balance without deducting', () => {
    const state = stateWithBalance(100000);
    const result = processPayment(state, validInput({ amount: '1000.01' }), { now: FIXED_NOW });
    assert.equal(result.transaction, null);
    assert.equal(result.state.balancePaise, 100000);
  });

  it('records a FAILED transaction for the @declinebank demo rule without deducting', () => {
    const state = stateWithBalance(BALANCE);
    const result = processPayment(state, validInput({ upiId: 'rohan@declinebank', amount: '2000' }), { now: FIXED_NOW });

    assert.equal(result.ok, false);
    assert.equal(result.transaction.status, STATUS.FAILED);
    assert.match(result.transaction.failureReason, /declinebank/);
    assert.equal(result.state.balancePaise, BALANCE, 'failed payment must not deduct');
    assert.equal(result.state.transactions.length, state.transactions.length + 1);
  });

  it('is deterministic: identical inputs give identical outcomes', () => {
    const first = processPayment(stateWithBalance(BALANCE), validInput(), { now: FIXED_NOW });
    const second = processPayment(stateWithBalance(BALANCE), validInput(), { now: FIXED_NOW });
    assert.deepEqual(first, second);
  });

  it('creates transaction records containing all required fields', () => {
    const state = createInitialState();
    const { transaction } = processPayment(state, validInput(), { now: FIXED_NOW });

    assert.deepEqual(transaction, {
      id: `txn-${state.nextSequence}`,
      reference: generateReference(FIXED_NOW, state.nextSequence),
      recipientName: 'Ananya Rao',
      upiId: 'ananya.rao@okpayflow',
      amountPaise: 150050,
      note: 'Lunch share',
      status: STATUS.SUCCESS,
      failureReason: '',
      createdAt: '2026-10-13T10:30:00.000Z',
      isSample: false
    });
  });

  it('generates unique references across consecutive payments', () => {
    let state = createInitialState();
    const references = new Set(state.transactions.map((txn) => txn.reference));
    for (let i = 0; i < 5; i += 1) {
      const result = processPayment(state, validInput({ amount: '100' }), { now: FIXED_NOW });
      state = result.state;
      assert.equal(references.has(result.transaction.reference), false);
      references.add(result.transaction.reference);
    }
    assert.equal(state.balancePaise, INITIAL_BALANCE_PAISE - 5 * 10000);
  });

  it('prevents overdrawing the balance over several payments', () => {
    let state = stateWithBalance(1500000); // ₹15,000
    state = processPayment(state, validInput({ amount: '10000' }), { now: FIXED_NOW }).state;
    const second = processPayment(state, validInput({ amount: '6000' }), { now: FIXED_NOW });
    assert.equal(second.transaction, null);
    assert.equal(second.state.balancePaise, 500000);
  });
});

describe('generateReference', () => {
  it('formats PF + UTC date + zero-padded sequence', () => {
    assert.equal(generateReference(FIXED_NOW, 42), 'PF20261013000042');
    assert.match(generateReference(FIXED_NOW, 1), /^PF\d{8}\d{6}$/);
  });

  it('throws for invalid arguments', () => {
    assert.throws(() => generateReference(new Date('invalid'), 1), TypeError);
    assert.throws(() => generateReference(FIXED_NOW, 0), RangeError);
    assert.throws(() => generateReference(FIXED_NOW, 1.5), RangeError);
  });
});

describe('dashboard statistics and history', () => {
  it('derives counts and totals from the transaction list', () => {
    const state = createInitialState();
    const stats = getStats(state);
    assert.equal(stats.total, state.transactions.length);
    assert.equal(stats.successful + stats.failed, stats.total);
    assert.equal(stats.successful, 4);
    assert.equal(stats.failed, 2);
    assert.equal(stats.balancePaise, INITIAL_BALANCE_PAISE);
  });

  it('updates statistics after a payment', () => {
    const before = getStats(createInitialState());
    const after = getStats(processPayment(createInitialState(), validInput(), { now: FIXED_NOW }).state);
    assert.equal(after.total, before.total + 1);
    assert.equal(after.successful, before.successful + 1);
    assert.equal(after.failed, before.failed);
  });

  it('combines search, status filter and sort order', () => {
    const { transactions } = createInitialState();
    assert.equal(filterTransactions(transactions, { status: 'FAILED' }).length, 2);
    assert.deepEqual(filterTransactions(transactions, { query: 'PRIYA' }).map((t) => t.recipientName), ['Priya Nair']);
    assert.equal(filterTransactions(transactions, { query: '@declinebank', status: 'SUCCESS' }).length, 0);
    assert.equal(filterTransactions(transactions, { query: transactions[0].reference }).length, 1);

    const newest = filterTransactions(transactions, { sort: 'newest' });
    const oldest = filterTransactions(transactions, { sort: 'oldest' });
    assert.deepEqual(oldest, [...newest].reverse());
    assert.ok(Date.parse(newest[0].createdAt) > Date.parse(newest[1].createdAt));
  });

  it('lists unique recent recipients', () => {
    const { transactions } = createInitialState();
    const contacts = getFrequentRecipients(transactions, 3);
    assert.equal(contacts.length, 3);
    assert.equal(new Set(contacts.map((c) => c.upiId)).size, 3);
  });
});

describe('storage', () => {
  it('returns fresh sample data when nothing is stored', () => {
    assert.deepEqual(loadState(memoryStorage()), createInitialState());
    assert.deepEqual(loadState(null), createInitialState());
  });

  it('round-trips saved state', () => {
    const storage = memoryStorage();
    const { state } = processPayment(createInitialState(), validInput(), { now: FIXED_NOW });
    assert.equal(saveState(state, storage), true);
    assert.deepEqual(loadState(storage), state);
  });

  it('ignores corrupted or tampered data', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    assert.deepEqual(loadState(storage), createInitialState());
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, balancePaise: -5, transactions: [], nextSequence: 1 }));
    assert.deepEqual(loadState(storage), createInitialState());
  });

  it('reset restores the original balance and sample transactions', () => {
    const storage = memoryStorage();
    const { state } = processPayment(createInitialState(), validInput(), { now: FIXED_NOW });
    saveState(state, storage);
    const fresh = resetState(storage);
    assert.equal(fresh.balancePaise, INITIAL_BALANCE_PAISE);
    assert.deepEqual(loadState(storage), createInitialState());
  });

  it('reports failure when the browser refuses to store data', () => {
    const fullStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    assert.equal(saveState(createInitialState(), fullStorage), false);
  });

  it('initial state is structurally valid', () => {
    assert.equal(isValidState(createInitialState()), true);
    assert.equal(isValidState(null), false);
  });
});
