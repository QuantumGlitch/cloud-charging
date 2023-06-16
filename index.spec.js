jest.setTimeout(10000000);

const DEFAULT_BALANCE = 10000;
const TEST_ACCOUNT_ID = "test_account_random_key";

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

async function chargeRequestMemcached(accountId, serviceType) {
  return (
    await fetch(
      "https://05bvgcefaf.execute-api.us-east-1.amazonaws.com/prod/charge-request-memcached",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId, serviceType }),
      }
    )
  ).json();
}

async function resetRequestMemcached(accountId) {
  return (
    await fetch(
      "https://05bvgcefaf.execute-api.us-east-1.amazonaws.com/prod/reset-memcached",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId }),
      }
    )
  ).json();
}

async function chargeRequestRedis(accountId, serviceType) {
  return (
    await fetch(
      "https://ophdyftglc.execute-api.us-east-1.amazonaws.com/prod/charge-request-redis",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId, serviceType }),
      }
    )
  ).json();
}

async function resetRequestRedis(accountId) {
  return (
    await fetch(
      "https://ophdyftglc.execute-api.us-east-1.amazonaws.com/prod/reset-redis",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId }),
      }
    )
  ).json();
}

async function multipleConcurrentRequestsOnOneUserMemcached(
  simultaneousRequests
) {
  const { balance } = await resetRequestMemcached(TEST_ACCOUNT_ID);
  const promises = [];

  for (let i = 0; i < simultaneousRequests; i++) {
    promises.push(chargeRequestMemcached(TEST_ACCOUNT_ID, "message"));
  }

  const results = await Promise.all(promises);

  const minimumBalance = Math.min(...results.map((r) => r.remainingBalance));
  const avgComputationTime =
    results.reduce((pV, cV) => pV + cV.computationTime, 0) / results.length;

  console.log(
    "MemCached average computation time",
    avgComputationTime,
    "Simultaneous requests",
    simultaneousRequests
  );

  expect(minimumBalance).toBe(
    balance - simultaneousRequests * getChargeByServiceType("message")
  );

  return avgComputationTime;
}

async function multipleConcurrentRequestsOnOneUserRedis(simultaneousRequests) {
  const { balance } = await resetRequestRedis(TEST_ACCOUNT_ID);
  const promises = [];

  for (let i = 0; i < simultaneousRequests; i++) {
    promises.push(chargeRequestRedis(TEST_ACCOUNT_ID, "message"));
  }
  const results = await Promise.all(promises);

  const minimumBalance = Math.min(...results.map((r) => r.remainingBalance));
  const avgComputationTime =
    results.reduce((pV, cV) => pV + cV.computationTime, 0) / results.length;

  console.log(
    "Redis average computation time",
    avgComputationTime,
    "Simultaneous requests",
    simultaneousRequests
  );

  expect(minimumBalance).toBe(
    balance - simultaneousRequests * getChargeByServiceType("message")
  );

  return avgComputationTime.toFixed(2);
}

describe("memcached", () => {
  it("verify reset functionality", async () => {
    const { balance } = await resetRequestMemcached(TEST_ACCOUNT_ID);
    expect(balance).toBe(DEFAULT_BALANCE);
  });

  it("verify charge functionality", async () => {
    await resetRequestMemcached(TEST_ACCOUNT_ID, "voice");
    const { remainingBalance, computationTime } = await chargeRequestMemcached(
      TEST_ACCOUNT_ID,
      "voice"
    );
    console.log(computationTime);
    expect(remainingBalance).toBe(
      DEFAULT_BALANCE - getChargeByServiceType("voice")
    );
  });

  it("multiple concurrent requests on one user", async () => {
    const results = [];
    for (const i of [1, 2, 3, 4, 5, 8, 15, 25, 30]) {
      results.push([i, await multipleConcurrentRequestsOnOneUserMemcached(i)]);
    }

    console.log(
      "MEMCACHED RESULTS",
      results.map((v) => `(${v[0]}, ${v[1]})`).join(" ")
    );
  });
});

describe("redis", () => {
  it("verify reset functionality", async () => {
    const { balance } = await resetRequestRedis(TEST_ACCOUNT_ID);
    expect(balance).toBe(DEFAULT_BALANCE);
  });

  it("verify charge functionality", async () => {
    await resetRequestRedis(TEST_ACCOUNT_ID, "voice");
    const { remainingBalance, computationTime } = await chargeRequestRedis(
      TEST_ACCOUNT_ID,
      "voice"
    );
    console.log(computationTime);
    expect(remainingBalance).toBe(
      DEFAULT_BALANCE - getChargeByServiceType("voice")
    );
  });

  it("multiple concurrent requests on one user", async () => {
    const results = [];
    for (const i of [1, 2, 3, 4, 5, 8, 15, 25, 30]) {
      results.push([i, await multipleConcurrentRequestsOnOneUserRedis(i)]);
    }

    console.log(
      "REDIS RESULTS",
      results.map((v) => `(${v[0]}, ${v[1]})`).join(" ")
    );
  });
});
