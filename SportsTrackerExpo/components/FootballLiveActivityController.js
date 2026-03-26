// components/FootballLiveActivityController.js
import React, { useState, useEffect, useRef } from "react";
import { View, Button, Alert, Text } from "react-native";
import { useRoute } from "@react-navigation/native";
import FootballLiveActivity from "../widgets/FootballLiveActivity"; // direct import
import { API_URL } from "../src/services/notificationService";

console.log(
  "[FootballLiveActivityController] Controller imported, FootballLiveActivity:",
  FootballLiveActivity,
);

export default function FootballLiveActivityController() {
  const route = useRoute();
  const fixtureId = route.params?.fixtureId;

  const [liveActivityActive, setLiveActivityActive] = useState(false);
  const [activityInstance, setActivityInstance] = useState(null);

  const startLiveActivity = async () => {
    try {
      console.log("[Controller] startLiveActivity called");
      if (!FootballLiveActivity)
        throw new Error("LiveActivity factory unavailable");

      const payload = {
        home: { name: "Team A", score: 1 },
        away: { name: "Team B", score: 2 },
        status: { short_name: "LIVE" },
        league: { name: "Premier League" },
      };

      console.log("[Controller] Payload to start activity:", payload);

      const url = `sportsheart://football/fixture/${fixtureId}`;
      console.log("[Controller] Deep link URL (using app scheme):", url);

      // Also log the payload and intended deep link for debugging in the native widget
      console.log(
        "[Controller] Starting FootballLiveActivity with payload and url",
        {
          payload,
          url,
        },
      );

      // Start locally but hidden so server can reveal when appropriate
      const instance = await FootballLiveActivity.start({
        ...payload,
        url,
        fixtureId: fixtureId,
        id: fixtureId,
        hidden: true,
      });
      console.log("[Controller] Live Activity started. Instance:", instance);

      // Optional: Immediately update to verify update path works
      try {
        await instance.update?.({
          home: { name: "Team A", score: 3 },
          away: { name: "Team B", score: 2 },
        });
        console.log("[Controller] Live Activity update called successfully");
      } catch (updateErr) {
        console.warn("[Controller] Live Activity update failed:", updateErr);
      }

      setActivityInstance(instance);
      setLiveActivityActive(true);

      // Register the per-activity push token with our backend so server can send updates/end
      try {
        const pushToken = await instance.getPushToken();
        console.log("[Controller] activity push token:", pushToken);
        if (pushToken) {
          try {
            const res = await fetch(
              `${API_URL}/live-activity/register-activity-token`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fixtureId: fixtureId,
                  token: pushToken,
                }),
              },
            );
            const text = await res.text().catch(() => "");
            console.log(
              `[Controller] register-activity-token response: ${res.status}`,
              text,
            );
          } catch (e) {
            console.warn(
              "[Controller] Failed to POST register-activity-token",
              e?.message || e,
            );
          }
        } else {
          console.warn(
            "[Controller] No activity push token available to register",
          );
        }
        // Subscribe to token updates for this instance and re-register if it changes
        try {
          const sub = instance.addPushTokenListener(async (ev) => {
            try {
              const newToken = ev?.pushToken;
              if (newToken) {
                console.log(
                  "[Controller] instance push token updated:",
                  newToken,
                );
                try {
                  const r = await fetch(
                    `${API_URL}/live-activity/register-activity-token`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        fixtureId: fixtureId,
                        token: newToken,
                      }),
                    },
                  );
                  const body = await r.text().catch(() => "");
                  console.log(
                    `[Controller] re-register response: ${r.status}`,
                    body,
                  );
                } catch (e) {
                  console.warn(
                    "Failed to re-register activity token",
                    e?.message || e,
                  );
                }
              }
            } catch (e) {
              console.warn(
                "Failed to re-register activity token",
                e?.message || e,
              );
            }
          });
          // store subscription to remove later with the instance
          instance._activityPushTokenSub = sub;
        } catch (e) {
          // addPushTokenListener may not be available on all SDKs — ignore
        }
      } catch (e) {
        console.warn(
          "Failed to get/register activity push token:",
          e?.message || e,
        );
      }

      console.log("[Controller] Live activity state updated: active = true");
    } catch (err) {
      console.error("[Controller] Failed to start Live Activity:", err);
      Alert.alert("Live Activity", `Failed to start: ${err.message}`);
    }
  };

  const stopLiveActivity = async () => {
    try {
      console.log("[Controller] stopLiveActivity called");
      await activityInstance?.end?.();
      console.log("[Controller] Live Activity ended");

      setActivityInstance(null);
      setLiveActivityActive(false);
      console.log("[Controller] Live activity state updated: active = false");
    } catch (err) {
      console.error("[Controller] Failed to stop Live Activity:", err);
      Alert.alert("Live Activity", `Failed to stop: ${err.message}`);
    }
  };

  // Listen for a route param toggle so an external floating button
  // can request start/stop. Supports either a numeric `liveActivityToggleId`
  // that increments on each press, or a boolean `toggleLiveActivity`.
  const togglePrevRef = useRef(undefined);
  useEffect(() => {
    const params = route.params || {};
    const signal = params.liveActivityToggleId ?? params.toggleLiveActivity;

    // Ignore undefined signals
    if (typeof signal === "undefined") return;

    // If signal hasn't changed, do nothing
    if (togglePrevRef.current === signal) return;
    togglePrevRef.current = signal;

    // Toggle activity: if active, stop — otherwise start
    (async () => {
      try {
        if (liveActivityActive) {
          await stopLiveActivity();
        } else {
          await startLiveActivity();
        }
      } catch (err) {
        console.error(
          "[Controller] Error toggling live activity from route param:",
          err,
        );
      }
    })();
  }, [route.params]);

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ marginBottom: 12, fontWeight: "700" }}>
        Live Activity Controller
      </Text>
      <Button
        title={
          liveActivityActive ? "Stop Live Activity" : "Start Live Activity"
        }
        onPress={liveActivityActive ? stopLiveActivity : startLiveActivity}
      />
    </View>
  );
}
