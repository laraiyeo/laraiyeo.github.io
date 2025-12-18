const axios = require("axios");
const base = "http://localhost:3000";
(async () => {
  try {
    console.log("Health:");
    let r = await axios.get(base + "/health");
    console.log(r.data);

    const username = "test_agent";
    const password = "secret";

    console.log("\nAttempting login...");
    let token = null;
    try {
      r = await axios.post(base + "/api/auth/login", { username, password });
      console.log("Login response:", r.data.message);
      token = r.data.token;
    } catch (e) {
      console.log("Login failed, attempting signup...");
      r = await axios.post(base + "/api/auth/signup", { username, password });
      console.log("Signup:", r.data.message || r.data);
      token = r.data.token;
    }

    if (!token) {
      console.error("No token obtained, aborting tests");
      return;
    }

    console.log("\nVerify token...");
    r = await axios.post(
      base + "/api/auth/verify",
      {},
      { headers: { Authorization: "Bearer " + token } }
    );
    console.log("Verify returned user:", r.data.user.username);

    console.log("\nUpserting push token...");
    const sampleExpo = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";
    r = await axios.post(
      base + "/api/profile/push-token",
      { pushToken: sampleExpo, platform: "ios" },
      { headers: { Authorization: "Bearer " + token } }
    );
    console.log("Push-token upsert response:", r.data);

    console.log("\nGet betslips (should be empty)");
    r = await axios.get(base + "/api/betslips", {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("Betslips count:", (r.data.betslips || []).length);

    console.log("\nPlacing a simple bet...");
    const betPayload = {
      betslipData: { bets: [] },
      totalStake: 1,
      potentialPayout: 1.8,
    };
    r = await axios.post(base + "/api/betslips", betPayload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("Place bet response:", r.data);

    const betslipId = r.data.betslipId;
    console.log("\nStart watcher for betslip via API");
    r = await axios.post(
      base + `/api/betslips/${betslipId}/watch`,
      {},
      { headers: { Authorization: "Bearer " + token } }
    );
    console.log("Start watch response:", r.data);

    console.log(
      "\nAll tests requested. Check server logs for Supabase push token upsert and any push attempts."
    );
  } catch (e) {
    console.error(
      "Test script error",
      e.response ? e.response.data : e.message
    );
  }
})();
