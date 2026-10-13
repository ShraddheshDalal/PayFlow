/**
 * PayFlow demo data persistence.
 *
 * Stores ONLY non-sensitive, fictional demonstration data (simulated balance
 * and sample transactions) in the browser's localStorage so it survives page
 * refreshes. No credentials, PINs, OTPs or real financial data are stored.
 *
 * The storage object is injectable so this module can be tested in Node.js.
 */

import { createInitialState, isValidState } from './payment-service.js';

export const STORAGE_KEY = 'payflow.demoState.v1';

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Accessing localStorage can throw when storage is disabled by the browser.
    return null;
  }
}

/**
 * Load the saved demo state, falling back to fresh sample data when nothing
 * is saved or the saved data is unreadable.
 * @param {Storage|null} [storage]
 * @returns {object}
 */
export function loadState(storage = getDefaultStorage()) {
  if (!storage) {
    return createInitialState();
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidState(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Corrupted JSON or blocked storage: fall through to a fresh demo state.
  }
  return createInitialState();
}

/**
 * Persist demo state. Returns false if the browser refused to store it.
 * @param {object} state
 * @param {Storage|null} [storage]
 * @returns {boolean}
 */
export function saveState(state, storage = getDefaultStorage()) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * Restore the original fictional balance and sample transactions.
 * @param {Storage|null} [storage]
 * @returns {object} the fresh state
 */
export function resetState(storage = getDefaultStorage()) {
  const fresh = createInitialState();
  saveState(fresh, storage);
  return fresh;
}
