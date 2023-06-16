"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { setAccountBalance, lockAccountBalance } = require("../lib/memcached");

const DEFAULT_BALANCE = 100;

/**
 * @param {Object} payload
 * @param {string} payload.accountId the identifier of the user account
 */
exports.resetMemcached = async function (payload) {
  // We don't handle errors for the moment, we want the expected payload
  if (!payload.accountId) {
    return;
  }

  const { accountId } = payload;

  // This portion of code can be executed safely
  // Other requests will not interfere with the account balance change
  return lockAccountBalance(accountId, async () => {
    await setAccountBalance(payload.accountId, DEFAULT_BALANCE);
  });
};
