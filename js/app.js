/**
 * PayFlow browser UI: rendering, navigation and event handling.
 * All payment rules live in payment-service.js; persistence in storage.js.
 */

import {
  MAX_TRANSACTION_PAISE,
  STATUS,
  filterTransactions,
  formatINR,
  getFrequentRecipients,
  getStats,
  parseAmountToPaise,
  processPayment,
  validatePayment
} from './payment-service.js';
import { loadState, resetState, saveState } from './storage.js';

const RECENT_LIMIT = 5;
const CONTACT_LIMIT = 6;
const PROCESSING_DELAY_MS = 1200;
const TOAST_DURATION_MS = 3500;
const DEFAULT_VIEW = 'overview';

const VIEWS = {
  overview: { title: 'Overview', subtitle: 'Your simulated payment activity', search: true },
  send: { title: 'Send Money', subtitle: 'Simulate a UPI payment to a demo recipient', search: false },
  transactions: { title: 'Transactions', subtitle: 'Search, filter and review your demo history', search: true },
  about: { title: 'About Project', subtitle: 'Agile Software Development · FA2 demonstration', search: false }
};

const FORM_FIELDS = {
  recipientName: { input: 'recipient-name', error: 'recipient-name-error' },
  upiId: { input: 'upi-id', error: 'upi-id-error' },
  amount: { input: 'amount', error: 'amount-error' },
  note: { input: 'note', error: 'note-error' }
};

const dateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const $ = (id) => {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`PayFlow: missing element #${id}`);
  }
  return node;
};

let state = loadState();
const filters = { query: '', status: 'ALL', sort: 'newest' };
const touchedFields = new Set();
let pendingPayment = null;
let isProcessing = false;
let toastTimer = 0;

/* ---------------- Helpers ---------------- */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      node.className = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child !== null && child !== undefined) {
      node.append(child);
    }
  }
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function formatDate(iso) {
  return dateFormatter.format(new Date(iso));
}

function statusBadge(status) {
  const isSuccess = status === STATUS.SUCCESS;
  return el('span', {
    className: `badge ${isSuccess ? 'badge-success' : 'badge-failed'}`,
    text: isSuccess ? 'Success' : 'Failed'
  });
}

function persist() {
  if (!saveState(state)) {
    showToast('Demo data could not be saved in this browser. Changes last until you refresh.');
  }
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, TOAST_DURATION_MS);
}

/* ---------------- Rendering ---------------- */

function renderStats() {
  const stats = getStats(state);
  $('stat-balance').textContent = formatINR(stats.balancePaise);
  $('stat-total').textContent = String(stats.total);
  $('stat-success').textContent = String(stats.successful);
  $('stat-failed').textContent = String(stats.failed);
  $('stat-sent').textContent = `${formatINR(stats.totalSentPaise)} sent (simulated)`;
  $('send-balance').textContent = formatINR(stats.balancePaise);
  $('amount-hint').textContent =
    `Demo limit ${formatINR(MAX_TRANSACTION_PAISE)} per payment · Available ${formatINR(stats.balancePaise)}`;
  $('rule-limit').textContent = `Maximum ${formatINR(MAX_TRANSACTION_PAISE)} per payment`;
}

function emptyState(title, message, action) {
  return el('div', { className: 'empty-state' }, [
    icon('inbox'),
    el('p', { text: title, className: 'card-title' }),
    el('p', { text: message, className: 'muted small' }),
    action ?? null
  ]);
}

function transactionRow(txn) {
  const row = el('tr', {
    tabindex: '0',
    'aria-label': `View details: ${txn.status === STATUS.SUCCESS ? 'successful' : 'failed'} payment of ${formatINR(txn.amountPaise)} to ${txn.recipientName}`
  }, [
    el('td', { className: 'col-recipient' }, el('div', { className: 'recipient-cell' }, [
      el('span', { className: 'initials', 'aria-hidden': 'true', text: initials(txn.recipientName) }),
      el('span', { className: 'cell-stack' }, [
        el('strong', { text: txn.recipientName }),
        el('span', { className: 'cell-sub', text: txn.upiId })
      ])
    ])),
    el('td', { className: 'col-date' }, el('span', { className: 'cell-stack' }, [
      el('span', { className: 'txn-date', text: formatDate(txn.createdAt) }),
      el('span', { className: 'cell-sub mono', text: txn.reference })
    ])),
    el('td', { className: 'col-status' }, statusBadge(txn.status)),
    el('td', { className: 'num', text: formatINR(txn.amountPaise) })
  ]);
  row.addEventListener('click', () => openDetail(txn.id));
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetail(txn.id);
    }
  });
  return row;
}

function transactionTable(transactions, caption) {
  const headers = ['Recipient / UPI ID', 'Date & reference', 'Status', 'Amount'];
  const table = el('table', { className: 'txn-table' }, [
    el('caption', { className: 'visually-hidden', text: caption }),
    el('thead', {}, el('tr', {}, headers.map((label, index) => el('th', {
      scope: 'col',
      className: index === headers.length - 1 ? 'num' : '',
      text: label
    })))),
    el('tbody', {}, transactions.map(transactionRow))
  ]);
  return el('div', { className: 'table-wrap' }, table);
}

function renderRecent() {
  const container = $('recent-list');
  const recent = filterTransactions(state.transactions, { sort: 'newest' }).slice(0, RECENT_LIMIT);
  container.replaceChildren(recent.length > 0
    ? transactionTable(recent, 'Five most recent simulated transactions')
    : emptyState('No transactions yet', 'Make your first demo payment to see it here.',
      el('a', { className: 'btn btn-primary', href: '#send', text: 'Make a Payment' })));
}

function renderTransactions() {
  const container = $('txn-list');
  const results = filterTransactions(state.transactions, filters);
  const total = state.transactions.length;
  $('txn-count').textContent = results.length === total
    ? `${total} simulated transaction${total === 1 ? '' : 's'}`
    : `Showing ${results.length} of ${total} simulated transactions`;

  for (const button of document.querySelectorAll('.seg-btn')) {
    button.setAttribute('aria-pressed', String(button.dataset.status === filters.status));
  }
  $('txn-search').value = filters.query;
  $('txn-sort').value = filters.sort;

  if (results.length > 0) {
    container.replaceChildren(transactionTable(results, 'Simulated transaction history'));
    return;
  }
  const clearButton = el('button', { type: 'button', className: 'btn btn-ghost', text: 'Clear Filters' });
  clearButton.addEventListener('click', clearFilters);
  container.replaceChildren(total === 0
    ? emptyState('No transactions yet', 'Your simulated payments will appear here.')
    : emptyState('No matching transactions', 'Try a different search term or status filter.', clearButton));
}

function renderContacts() {
  const row = $('contact-row');
  const contacts = getFrequentRecipients(state.transactions, CONTACT_LIMIT);
  if (contacts.length === 0) {
    row.replaceChildren(el('p', { className: 'muted small', text: 'Recipients you pay will appear here.' }));
    return;
  }
  row.replaceChildren(...contacts.map((contact) => {
    const button = el('button', {
      type: 'button',
      className: 'contact',
      'aria-label': `Pay ${contact.recipientName} (${contact.upiId})`
    }, [
      el('span', { className: 'initials', 'aria-hidden': 'true', text: initials(contact.recipientName) }),
      el('span', { className: 'contact-name', text: contact.recipientName.split(' ')[0] })
    ]);
    button.addEventListener('click', () => {
      $('recipient-name').value = contact.recipientName;
      $('upi-id').value = contact.upiId;
      touchedFields.add('recipientName').add('upiId');
      updateFieldErrors();
      $('amount').focus();
    });
    return button;
  }));
}

function renderAll() {
  renderStats();
  renderRecent();
  renderTransactions();
  renderContacts();
}

/* ---------------- Navigation ---------------- */

function currentView() {
  const name = window.location.hash.slice(1);
  return Object.hasOwn(VIEWS, name) ? name : DEFAULT_VIEW;
}

function showView({ moveFocus }) {
  const name = currentView();
  const config = VIEWS[name];
  for (const view of document.querySelectorAll('[data-view]')) {
    view.hidden = view.dataset.view !== name;
  }
  for (const link of document.querySelectorAll('[data-view-link]')) {
    const isActive = link.dataset.viewLink === name;
    link.classList.toggle('active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
  $('page-title').textContent = config.title;
  $('page-subtitle').textContent = config.subtitle;
  $('topbar-search').hidden = !config.search;
  document.title = `${config.title} · PayFlow (Demo)`;
  setSidebar(false);
  if (moveFocus) {
    $('main-content').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function navigate(name) {
  if (currentView() === name && window.location.hash === `#${name}`) {
    showView({ moveFocus: true });
  } else {
    window.location.hash = name;
  }
}

function setSidebar(open) {
  $('sidebar').classList.toggle('open', open);
  $('scrim').hidden = !open;
  $('menu-btn').setAttribute('aria-expanded', String(open));
  $('menu-btn').setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
}

/* ---------------- Filters ---------------- */

function setQuery(query) {
  filters.query = query;
  $('global-search').value = query;
  renderTransactions();
}

function clearFilters() {
  filters.query = '';
  filters.status = 'ALL';
  filters.sort = 'newest';
  $('global-search').value = '';
  renderTransactions();
  $('txn-search').focus();
}

/* ---------------- Payment form ---------------- */

function readForm() {
  return {
    recipientName: $('recipient-name').value,
    upiId: $('upi-id').value,
    amount: $('amount').value,
    note: $('note').value
  };
}

function updateFieldErrors({ showAll = false } = {}) {
  const { errors } = validatePayment(readForm(), state.balancePaise);
  for (const [field, ids] of Object.entries(FORM_FIELDS)) {
    const message = showAll || touchedFields.has(field) ? errors[field] ?? '' : '';
    $(ids.error).textContent = message;
    $(ids.input).setAttribute('aria-invalid', String(message !== ''));
  }
  return errors;
}

function handleSubmit(event) {
  event.preventDefault();
  Object.keys(FORM_FIELDS).forEach((field) => touchedFields.add(field));
  const errors = updateFieldErrors({ showAll: true });
  const firstInvalid = Object.keys(FORM_FIELDS).find((field) => errors[field]);
  if (firstInvalid) {
    $(FORM_FIELDS[firstInvalid].input).focus();
    return;
  }
  pendingPayment = readForm();
  openConfirm(pendingPayment);
}

function resetForm() {
  $('payment-form').reset();
  touchedFields.clear();
  updateFieldErrors();
}

/* ---------------- Dialogs ---------------- */

function openConfirm(payment) {
  const { value } = validatePayment(payment, state.balancePaise);
  $('confirm-amount').textContent = formatINR(value.amountPaise);
  $('confirm-name').textContent = value.recipientName;
  $('confirm-upi').textContent = value.upiId;
  $('confirm-note').textContent = value.note || '—';
  $('confirm-balance-after').textContent = formatINR(state.balancePaise - value.amountPaise);
  $('confirm-content').hidden = false;
  $('processing-content').hidden = true;
  $('confirm-pay-btn').disabled = false;
  $('confirm-dialog').showModal();
  $('confirm-pay-btn').focus();
}

function confirmPayment() {
  if (isProcessing || !pendingPayment) {
    return;
  }
  isProcessing = true;
  $('confirm-pay-btn').disabled = true;
  $('confirm-content').hidden = true;
  $('processing-content').hidden = false;

  window.setTimeout(() => {
    const result = processPayment(state, pendingPayment, { now: new Date() });
    isProcessing = false;
    pendingPayment = null;
    $('confirm-dialog').close();

    if (!result.transaction) {
      // Details became invalid (e.g. balance changed in another tab).
      updateFieldErrors({ showAll: true });
      showToast('Payment was not processed. Please review the highlighted details.');
      return;
    }
    state = result.state;
    persist();
    renderAll();
    resetForm();
    showResult(result.transaction);
  }, PROCESSING_DELAY_MS);
}

function showResult(txn) {
  const isSuccess = txn.status === STATUS.SUCCESS;
  const iconWrap = $('result-icon');
  iconWrap.classList.toggle('is-failed', !isSuccess);
  iconWrap.replaceChildren(icon(isSuccess ? 'check' : 'x'));
  $('result-title').textContent = isSuccess ? 'Payment Successful' : 'Payment Failed';
  $('result-amount').textContent = formatINR(txn.amountPaise);
  $('result-reason').textContent = isSuccess
    ? `${formatINR(txn.amountPaise)} deducted from your demo wallet.`
    : `${txn.failureReason} Your demo balance was not deducted.`;
  $('result-name').textContent = `${txn.recipientName} (${txn.upiId})`;
  $('result-status').replaceChildren(statusBadge(txn.status));
  $('result-ref').textContent = txn.reference;
  $('result-date').textContent = formatDate(txn.createdAt);
  $('result-dialog').showModal();
  $('result-dashboard-btn').focus();
}

function openDetail(id) {
  const txn = state.transactions.find((item) => item.id === id);
  if (!txn) {
    return;
  }
  $('detail-amount').textContent = formatINR(txn.amountPaise);
  const rows = [
    ['Status', statusBadge(txn.status)],
    ['Recipient', txn.recipientName],
    ['UPI ID', txn.upiId],
    ['Reference', el('span', { className: 'mono', text: txn.reference })],
    ['Date & time', formatDate(txn.createdAt)],
    ['Note', txn.note || '—']
  ];
  if (txn.failureReason) {
    rows.push(['Reason', txn.failureReason]);
  }
  if (txn.isSample) {
    rows.push(['Data', el('span', { className: 'badge badge-sample', text: 'Fictional sample' })]);
  }
  $('detail-list').replaceChildren(...rows.map(([label, value]) => el('div', {}, [
    el('dt', { text: label }),
    el('dd', {}, value)
  ])));
  $('detail-dialog').showModal();
}

/* ---------------- Event wiring ---------------- */

function bindEvents() {
  window.addEventListener('hashchange', () => {
    // Don't steal focus from the top search box while the user is typing.
    showView({ moveFocus: document.activeElement !== $('global-search') });
  });

  $('menu-btn').addEventListener('click', () => setSidebar(!$('sidebar').classList.contains('open')));
  $('scrim').addEventListener('click', () => setSidebar(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('sidebar').classList.contains('open')) {
      setSidebar(false);
      $('menu-btn').focus();
    }
  });

  // Global search drives the transaction search.
  $('topbar-search').addEventListener('submit', (event) => {
    event.preventDefault();
    navigate('transactions');
  });
  $('global-search').addEventListener('input', (event) => {
    setQuery(event.target.value);
    if (currentView() !== 'transactions' && event.target.value.trim() !== '') {
      window.location.hash = 'transactions';
    }
  });

  // Transaction filters.
  $('txn-search').addEventListener('input', (event) => setQuery(event.target.value));
  $('txn-sort').addEventListener('change', (event) => {
    filters.sort = event.target.value === 'oldest' ? 'oldest' : 'newest';
    renderTransactions();
  });
  for (const button of document.querySelectorAll('.seg-btn')) {
    button.addEventListener('click', () => {
      filters.status = button.dataset.status;
      renderTransactions();
    });
  }
  $('clear-filters-btn').addEventListener('click', clearFilters);

  // Payment form.
  const form = $('payment-form');
  form.addEventListener('submit', handleSubmit);
  form.addEventListener('reset', () => {
    touchedFields.clear();
    window.requestAnimationFrame(() => updateFieldErrors());
  });
  for (const [field, ids] of Object.entries(FORM_FIELDS)) {
    const input = $(ids.input);
    input.addEventListener('blur', () => {
      if (input.value.trim() !== '') {
        touchedFields.add(field);
      }
      updateFieldErrors();
    });
    input.addEventListener('input', () => updateFieldErrors());
  }
  $('amount').addEventListener('blur', () => {
    const paise = parseAmountToPaise($('amount').value);
    if (paise !== null && paise > 0) {
      $('amount').value = (paise / 100).toFixed(2);
    }
  });

  // Dialogs: generic close buttons and backdrop clicks.
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && !isProcessing) {
        dialog.close();
      }
    });
    for (const closer of dialog.querySelectorAll('[data-close]')) {
      closer.addEventListener('click', () => dialog.close());
    }
  }
  $('confirm-dialog').addEventListener('cancel', (event) => {
    if (isProcessing) {
      event.preventDefault();
    }
  });
  $('confirm-dialog').addEventListener('close', () => {
    if (!isProcessing) {
      pendingPayment = null;
    }
  });
  $('confirm-pay-btn').addEventListener('click', confirmPayment);

  $('result-dashboard-btn').addEventListener('click', () => {
    $('result-dialog').close();
    navigate('overview');
  });
  $('result-history-btn').addEventListener('click', () => {
    $('result-dialog').close();
    filters.query = '';
    filters.status = 'ALL';
    filters.sort = 'newest';
    $('global-search').value = '';
    renderTransactions();
    navigate('transactions');
  });

  // Reset demo data (with confirmation).
  $('reset-btn').addEventListener('click', () => $('reset-dialog').showModal());
  $('reset-confirm-btn').addEventListener('click', () => {
    state = resetState();
    $('reset-dialog').close();
    resetForm();
    renderAll();
    showToast('Demo data reset: sample balance and transactions restored.');
  });

  // Keep multiple open tabs consistent.
  window.addEventListener('storage', () => {
    state = loadState();
    renderAll();
  });
}

bindEvents();
renderAll();
showView({ moveFocus: false });
