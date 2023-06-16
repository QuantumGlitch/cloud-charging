"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { wait } = require("./utils");
const redis = require("redis");
const util = require("util");

//#region Client handlers
let client;

async function setupRedisClient() {
  return new Promise((resolve, reject) => {
    try {
      const _client = new redis.RedisClient({
        host: process.env.ENDPOINT,
        port: parseInt(process.env.PORT || "6379"),
      });
      _client.on("ready", () => {
        console.log("redis client ready");
        client = _client;
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function disconnectRedisClient() {
  return new Promise((resolve, reject) => {
    client.quit((error, res) => {
      if (error) {
        reject(error);
      } else if (res == "OK") {
        console.log("redis client disconnected");
        resolve(res);
      } else {
        reject("unknown error closing redis connection.");
      }
    });
  });
}
//#endregion

function getChargeByServiceType(serviceType) {
  switch (serviceType) {
    case "voice":
      return 5;
    case "message":
      return 1;
    case "data":
      return 2;
  }
}

//#region Utilities to better handle account's data
function getAccountBalanceKey(accountId) {
  return `${accountId}/balance`;
}

async function getAccountBalance(accountId) {
  const res = await util
    .promisify(client.get)
    .bind(client)
    .call(client, getAccountBalanceKey(accountId));

  return res ? parseFloat(res) : 0;
}

async function setAccountBalance(accountId, balance) {
  const res = await util
    .promisify(client.set)
    .bind(client)
    .call(client, getAccountBalanceKey(accountId), String(balance));

  return res;
}
//#endregion

//#region Lock functionalities
function getAccountBalanceLockKey(accountId) {
  return `${accountId}/balance/locked`;
}

async function isAccountBalanceLocked(accountId) {
  const res = await util
    .promisify(client.get)
    .bind(client)
    .call(client, getAccountBalanceLockKey(accountId));

  console.log(res);

  return res ? res === "1" : false;
}

async function setAccountBalanceLock(accountId, value) {
  if (value) {
    const res = await util
      .promisify(client.setnx)
      .bind(client)
      .call(client, getAccountBalanceLockKey(accountId), "1");
    console.log(res);

    if (res === 0 || res === "0") {
      throw "LOCKED";
    }

    return res;
  } else {
    const res = await util
      .promisify(client.del)
      .bind(client)
      .call(client, getAccountBalanceLockKey(accountId));
    console.log(res);
    return res;
  }
}

// When we call this function, it waits until the balance is free to be modified
async function waitAccountBalanceToBeUnlocked(accountId) {
  const MAX_RETRIES = 100;
  let tries = 0;
  let locked;
  do {
    locked = await isAccountBalanceLocked(accountId);
    console.log(locked);

    if (!locked) {
      return;
    }

    // Wait 10ms and check if the account balance is still locked
    // Randomize the retry time (so concurrent requests will check at different times)
    wait(10);
    tries++;

    if (tries > MAX_RETRIES) {
      throw "MAX_RETRIES";
    }
  } while (locked);
}

// When we call this function, we want that any operation on the account balance, will be locked until the current one is finished
async function lockAccountBalance(accountId, lockReleaser) {
  console.log(accountId);
  const MAX_RETRIES = 100;
  let tries = 0;

  // Wait until the lock is released
  while (true) {
    tries++;

    if (tries > MAX_RETRIES) {
      throw "MAX_RETRIES";
    }

    await waitAccountBalanceToBeUnlocked(accountId);

    try {
      // Setup the lock, so only the 'lockReleaser' can do operations on it
      await setAccountBalanceLock(accountId, true);
      break;
    } catch (e) {
      if (e === "LOCKED") {
        // Someone took the lock before this process, retry after
        continue;
      } else throw e;
    }
  }

  // Call the operation
  const res = await lockReleaser();

  try {
    // Free the lock
    await setAccountBalanceLock(accountId, false);
  } catch (e) {
    throw "CANNOT_FREE_LOCK";
  }

  return res;
}
//#endregion

exports.setupRedisClient = setupRedisClient;
exports.disconnectRedisClient = disconnectRedisClient;
exports.getChargeByServiceType = getChargeByServiceType;
exports.getAccountBalance = getAccountBalance;
exports.lockAccountBalance = lockAccountBalance;
exports.setAccountBalance = setAccountBalance;
