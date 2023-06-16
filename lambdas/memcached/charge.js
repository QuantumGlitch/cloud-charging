"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const {
  disconnectMemcached,
  getAccountBalance,
  getChargeByServiceType,
  lockAccountBalance,
  setAccountBalance,
} = require("../lib/memcached");

function isChargeAuthorized(balance, charge) {
  return charge <= balance;
}

async function canChargeAccount(accountId, serviceType) {
  const currentBalance = await getAccountBalance(accountId);

  // How much money is needed for the current service request
  const charge = await getChargeByServiceType(serviceType);

  return {
    authorized: isChargeAuthorized(currentBalance, charge),
    currentBalance,
    charge,
  };
}

/**
 * @param {Object} payload
 * @param {string} payload.accountId the identifier of the user account
 * @param {"voice" | "data" | "message"} payload.serviceType the type of charge
 */
exports.chargeRequestMemcached = async function (payload) {
  // We don't handle errors for the moment, we want the expected payload
  if (!payload.accountId || !payload.serviceType) {
    return;
  }

  const { accountId, serviceType } = payload;

  const start = Date.now();

  // This portion of code can be executed safely
  // Other requests will not interfere with the account balance change
  const res = await lockAccountBalance(accountId, async () => {
    // Check if the balance can be charged
    const { authorized, charge, currentBalance } = await canChargeAccount(
      accountId,
      serviceType
    );

    if (authorized) {
      try {
        await setAccountBalance(accountId, currentBalance - charge);
      } catch (e) {
        // Too many concurrent requests, for the moment the charge cannot be disposed
        return {
          remainingBalance: currentBalance,
          charges: 0,
          authorized: false,
        };
      }

      return {
        remainingBalance: currentBalance - charge,
        charges: charge,
        isAuthorized: authorized,
      };
    }

    return {
      remainingBalance: currentBalance,
      charges: 0,
      isAuthorized: authorized,
    };
  });

  await disconnectMemcached();

  const end = Date.now();

  return { ...res, computationTime: end - start };
};
