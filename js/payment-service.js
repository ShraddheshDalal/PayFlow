/**
 * PayFlow payment service.
 *
 * Pure, DOM-free business logic for the simulated UPI payment flow.
 * Every function here is deterministic (time is always injected) so it can
 * be imported by the browser UI and by the Node.js test suite alike.
 *
 * All money values are stored as integer paise (1 rupee = 100 paise) to
 * avoid floating-point rounding errors.
 *
 * DEMO ONLY: nothing in this module contacts a bank, UPI network or payment
 * provider. No real money is ever transferred.
 */

export const PAISE_PER_RUPEE = 100;

/** Simulated wallet balance restored by "Reset Demo Data" (₹25,000.00). */
export const INITIAL_BALANCE_PAISE = 25000 * PAISE_PER_RUPEE;

/** Maximum amount allowed for a single demo payment (₹10,000.00). */
export const MAX_TRANSACTION_PAISE = 10000 * PAISE_PER_RUPEE;

/** Smallest payable amount (₹1.00). */
export const MIN_TRANSACTION_PAISE = 1 * PAISE_PER_RUPEE;

export const MAX_NAME_LENGTH = 50;
export const MAX_NOTE_LENGTH = 100;

export const STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED'
});

/**
 * Deliberately simple UPI ID format used for this demo:
 *   <identifier>@<handle>
 *   identifier: 2-64 characters, letters, digits, dot, underscore or hyphen
 *   handle:     2-32 characters, starting with a letter, letters/digits only
 * Real-world UPI addresses are governed by NPCI and individual PSP apps;
 * this pattern is a reasonable demo check, not an authoritative rule.
 */
export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,31}$/;

/**
 * Documented demo rule: payments to any UPI ID on the fictional
 * "@declinebank" handle are declined by the simulated bank. This gives a
 * predictable way to demonstrate the failure flow without random outcomes.
 */
export const DECLINE_HANDLE = 'declinebank';

/** Rupee amount typed by the user: digits with up to two decimal places. */
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

const REFERENCE_PREFIX = 'PF';
const REFERENCE_SEQUENCE_DIGITS = 6;

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * Format integer paise as Indian rupees, e.g. 2500000 -> "₹25,000.00".
 * @param {number} paise
 * @returns {string}
 */
export function formatINR(paise) {
  return inrFormatter.format(paise / PAISE_PER_RUPEE);
}

/**
 * Convert a user-entered rupee amount into integer paise.
 * Accepts finite numbers or strings such as "150" / "150.50".
 * @param {unknown} value
 * @returns {number|null} paise, or null if the value is not a valid amount
 */
export function parseAmountToPaise(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    const paise = Math.round(value * PAISE_PER_RUPEE);
    // Reject values with more than two decimal places (e.g. 10.005).
    return Math.abs(paise / PAISE_PER_RUPEE - value) < 1e-9 ? paise : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().replace(/,/g, '');
  // A single leading minus is parsed so callers can report "negative amount".
  const isNegative = trimmed.startsWith('-');
  const digits = isNegative ? trimmed.slice(1) : trimmed;
  if (!AMOUNT_PATTERN.test(digits)) {
    return null;
  }
  const [rupees, fraction = ''] = digits.split('.');
  const paise = Number(rupees) * PAISE_PER_RUPEE + Number(fraction.padEnd(2, '0'));
  return isNegative ? -paise : paise;
}

/**
 * @param {string} upiId
 * @returns {boolean}
 */
export function isValidUpiId(upiId) {
  return typeof upiId === 'string' && UPI_ID_PATTERN.test(upiId.trim());
}

/**
 * Validate payment details against the demo business rules.
 *
 * @param {{recipientName?: string, upiId?: string, amount?: unknown, note?: string}} input
 * @param {number} balancePaise current simulated wallet balance
 * @returns {{valid: boolean, errors: Record<string, string>, value: object|null}}
 */
export function validatePayment(input, balancePaise) {
  const errors = {};
  const source = input ?? {};

  const recipientName = typeof source.recipientName === 'string' ? source.recipientName.trim() : '';
  if (recipientName === '') {
    errors.recipientName = 'Recipient name is required.';
  } else if (recipientName.length > MAX_NAME_LENGTH) {
    errors.recipientName = `Recipient name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  } else if (!/\p{L}/u.test(recipientName)) {
    errors.recipientName = 'Recipient name must contain letters.';
  }

  const upiId = typeof source.upiId === 'string' ? source.upiId.trim().toLowerCase() : '';
  if (upiId === '') {
    errors.upiId = 'UPI ID is required.';
  } else if (!isValidUpiId(upiId)) {
    errors.upiId = 'Enter a UPI ID like name@bank (letters, digits, . _ - before @).';
  }

  const rawAmount = source.amount;
  const amountPaise = parseAmountToPaise(rawAmount);
  if (rawAmount === undefined || rawAmount === null || (typeof rawAmount === 'string' && rawAmount.trim() === '')) {
    errors.amount = 'Amount is required.';
  } else if (amountPaise === null) {
    errors.amount = 'Enter a valid amount with up to 2 decimal places.';
  } else if (amountPaise < 0) {
    errors.amount = 'Amount cannot be negative.';
  } else if (amountPaise === 0) {
    errors.amount = 'Amount must be greater than zero.';
  } else if (amountPaise < MIN_TRANSACTION_PAISE) {
    errors.amount = `Minimum payment is ${formatINR(MIN_TRANSACTION_PAISE)}.`;
  } else if (amountPaise > MAX_TRANSACTION_PAISE) {
    errors.amount = `Demo limit is ${formatINR(MAX_TRANSACTION_PAISE)} per payment.`;
  } else if (amountPaise > balancePaise) {
    errors.amount = `Insufficient demo balance. Available: ${formatINR(Math.max(0, balancePaise))}.`;
  }

  const note = typeof source.note === 'string' ? source.note.trim() : '';
  if (note.length > MAX_NOTE_LENGTH) {
    errors.note = `Note must be ${MAX_NOTE_LENGTH} characters or fewer.`;
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    value: valid ? { recipientName, upiId, amountPaise, note } : null
  };
}

function pad(value, length) {
  return String(value).padStart(length, '0');
}

/**
 * Build a unique demo transaction reference, e.g. "PF20261013000042".
 * Uniqueness comes from the monotonically increasing sequence number.
 * @param {Date} date
 * @param {number} sequence positive integer
 * @returns {string}
 */
export function generateReference(date, sequence) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('generateReference requires a valid Date.');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError('generateReference requires a positive integer sequence.');
  }
  const datePart = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}`;
  return `${REFERENCE_PREFIX}${datePart}${pad(sequence, REFERENCE_SEQUENCE_DIGITS)}`;
}

/**
 * Decide whether the simulated bank declines a validated payment.
 * @param {{upiId: string}} payment
 * @returns {string|null} decline reason or null if accepted
 */
export function getDeclineReason(payment) {
  const handle = payment.upiId.split('@')[1];
  if (handle === DECLINE_HANDLE) {
    return 'Declined by the simulated recipient bank (@declinebank demo rule).';
  }
  return null;
}

/**
 * Simulate a payment. Never mutates the given state.
 *
 * - Invalid details: rejected, no transaction is recorded, balance unchanged.
 * - Valid but declined by a demo rule: FAILED transaction recorded, balance unchanged.
 * - Otherwise: SUCCESS transaction recorded and the amount is deducted.
 *
 * @param {object} state current demo state
 * @param {object} input raw payment details
 * @param {{now?: Date}} [options]
 * @returns {{ok: boolean, errors: Record<string,string>, state: object, transaction: object|null}}
 */
export function processPayment(state, input, options = {}) {
  const now = options.now ?? new Date();
  const validation = validatePayment(input, state.balancePaise);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors, state, transaction: null };
  }

  const payment = validation.value;
  const declineReason = getDeclineReason(payment);
  const status = declineReason ? STATUS.FAILED : STATUS.SUCCESS;
  const sequence = state.nextSequence;

  const transaction = {
    id: `txn-${sequence}`,
    reference: generateReference(now, sequence),
    recipientName: payment.recipientName,
    upiId: payment.upiId,
    amountPaise: payment.amountPaise,
    note: payment.note,
    status,
    failureReason: declineReason ?? '',
    createdAt: now.toISOString(),
    isSample: false
  };

  const nextState = {
    ...state,
    balancePaise: status === STATUS.SUCCESS ? state.balancePaise - payment.amountPaise : state.balancePaise,
    transactions: [transaction, ...state.transactions],
    nextSequence: sequence + 1
  };

  return { ok: status === STATUS.SUCCESS, errors: {}, state: nextState, transaction };
}

/**
 * Dashboard statistics derived from the transaction list.
 * @param {object} state
 */
export function getStats(state) {
  const transactions = state.transactions;
  const successful = transactions.filter((txn) => txn.status === STATUS.SUCCESS);
  return {
    balancePaise: state.balancePaise,
    total: transactions.length,
    successful: successful.length,
    failed: transactions.filter((txn) => txn.status === STATUS.FAILED).length,
    totalSentPaise: successful.reduce((sum, txn) => sum + txn.amountPaise, 0)
  };
}

/**
 * Search, filter and sort transactions. All criteria combine.
 * @param {object[]} transactions
 * @param {{query?: string, status?: 'ALL'|'SUCCESS'|'FAILED', sort?: 'newest'|'oldest'}} [criteria]
 * @returns {object[]} new array
 */
export function filterTransactions(transactions, criteria = {}) {
  const query = (criteria.query ?? '').trim().toLowerCase();
  const status = criteria.status ?? 'ALL';
  const direction = criteria.sort === 'oldest' ? 1 : -1;

  return transactions
    .filter((txn) => status === 'ALL' || txn.status === status)
    .filter((txn) => query === ''
      || txn.recipientName.toLowerCase().includes(query)
      || txn.upiId.toLowerCase().includes(query)
      || txn.reference.toLowerCase().includes(query))
    .sort((a, b) => direction * (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
}

/**
 * Unique recent recipients, newest first (used for quick-fill contacts).
 * @param {object[]} transactions
 * @param {number} limit
 */
export function getFrequentRecipients(transactions, limit) {
  const seen = new Map();
  const ordered = filterTransactions(transactions, { sort: 'newest' });
  for (const txn of ordered) {
    if (!seen.has(txn.upiId) && seen.size < limit) {
      seen.set(txn.upiId, { recipientName: txn.recipientName, upiId: txn.upiId });
    }
  }
  return [...seen.values()];
}

const SAMPLE_TRANSACTIONS = [
  ['Aarav Sharma', 'aarav.demo@okpayflow', 120000, 'Dinner split', STATUS.SUCCESS, '', '2026-10-12T14:20:00.000Z'],
  ['Priya Nair', 'priya.nair@demobank', 45000, 'Movie tickets', STATUS.SUCCESS, '', '2026-10-11T09:05:00.000Z'],
  ['Rohan Mehta', 'rohan.m@declinebank', 300000, 'Rent share', STATUS.FAILED,
    'Declined by the simulated recipient bank (@declinebank demo rule).', '2026-10-10T18:42:00.000Z'],
  ['Campus Café', 'campuscafe@okpayflow', 18050, 'Coffee and snacks', STATUS.SUCCESS, '', '2026-10-09T05:30:00.000Z'],
  ['Sneha Iyer', 'sneha.iyer@demobank', 250000, 'Project supplies', STATUS.SUCCESS, '', '2026-10-07T11:15:00.000Z'],
  ['Kabir Singh', 'kabir.s@declinebank', 80000, 'Cricket kit', STATUS.FAILED,
    'Declined by the simulated recipient bank (@declinebank demo rule).', '2026-10-05T16:00:00.000Z']
];

/**
 * Fresh demo state with clearly fictional sample transactions.
 * @returns {object}
 */
export function createInitialState() {
  const transactions = SAMPLE_TRANSACTIONS.map(
    ([recipientName, upiId, amountPaise, note, status, failureReason, createdAt], index) => {
      const sequence = SAMPLE_TRANSACTIONS.length - index;
      return {
        id: `sample-${sequence}`,
        reference: generateReference(new Date(createdAt), sequence),
        recipientName,
        upiId,
        amountPaise,
        note,
        status,
        failureReason,
        createdAt,
        isSample: true
      };
    }
  );
  return {
    version: 1,
    balancePaise: INITIAL_BALANCE_PAISE,
    transactions,
    nextSequence: SAMPLE_TRANSACTIONS.length + 1
  };
}

/**
 * Structural check used before trusting data loaded from storage.
 * @param {unknown} state
 * @returns {boolean}
 */
export function isValidState(state) {
  if (!state || typeof state !== 'object') {
    return false;
  }
  const { version, balancePaise, transactions, nextSequence } = state;
  return version === 1
    && Number.isInteger(balancePaise)
    && balancePaise >= 0
    && Number.isInteger(nextSequence)
    && nextSequence >= 1
    && Array.isArray(transactions)
    && transactions.every((txn) => txn
      && typeof txn.id === 'string'
      && typeof txn.reference === 'string'
      && typeof txn.recipientName === 'string'
      && typeof txn.upiId === 'string'
      && Number.isInteger(txn.amountPaise)
      && (txn.status === STATUS.SUCCESS || txn.status === STATUS.FAILED)
      && !Number.isNaN(Date.parse(txn.createdAt)));
}
