import React, { useState, useEffect, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
  InteractionManager,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useBetData } from "../../context/BetDataContext";
import { supabase } from "../../config/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import OddsDisplayContext from "../../context/OddsDisplayContext";
import {
  initPurchases,
  getCustomerInfo,
  isEntitled,
} from "../../services/revenuecat";
import { useBetSlip } from "../../context/BetSlipContext";
import {
  registerForPushNotifications,
  API_URL,
} from "../../services/notificationService";
// daily reward handled in BetHomeScreen
import { useFocusEffect } from "@react-navigation/native";

// Helper to add client-side timeouts to promises (prevents 30-60s TCP hangs)
const withTimeout = (promise, ms = 8000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
// Helper to batch AsyncStorage writes (reduces native IO roundtrips)
const batchSet = async (pairs = []) => {
  try {
    if (!Array.isArray(pairs) || pairs.length === 0) return;
    await AsyncStorage.multiSet(pairs);
  } catch (e) {
    try {
      // Fallback to individual sets for resilience
      for (const [k, v] of pairs) {
        await AsyncStorage.setItem(k, v);
      }
    } catch (ee) {
      console.warn("batchSet failed", ee);
    }
  }
};
// In-memory cache to avoid AsyncStorage round-trips on subsequent logins
// Keep this at module scope so it survives component re-mounts.
const PHONE_CACHE_MAP = {};
const BetLoginScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const { fetchScoreboard, fetchRosters, isLoading } = useBetData();
  const { setIsPro } = useBetSlip();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [phone, setPhone] = useState("");

  const CRED_KEY = "bet_credentials_v1";
  const PHONE_CACHE_KEY = "bet_phone_cache_v1";
  const oddsContext = useContext(OddsDisplayContext);
  // daily reward UI is shown on the home screen after login

  const loadSavedCredentials = async () => {
    try {
      const json = await AsyncStorage.getItem(CRED_KEY);
      console.log("BetLogin: loadSavedCredentials raw:", json);
      if (json) {
        const {
          username: sUser,
          phone: sPhone,
          password: sPass,
        } = JSON.parse(json);
        console.log("BetLogin: loaded creds:", {
          sUser,
          sPhone,
          sPass: sPass ? "***" : null,
        });
        if (sUser) setUsername(sUser);
        if (sPhone) {
          setPhone(sPhone);
          // populate in-memory cache for immediate subsequent lookups
          try {
            PHONE_CACHE_MAP[sUser] = sPhone;
          } catch (e) {}
        }
        if (sPass) setPassword(sPass);
      }
    } catch (e) {
      console.error("Failed to load saved credentials", e);
    }
  };

  const getCachedPhoneForUser = async (uname) => {
    try {
      // Check in-memory first
      if (PHONE_CACHE_MAP[uname]) return PHONE_CACHE_MAP[uname];
      const raw = await AsyncStorage.getItem(PHONE_CACHE_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw || "{}") || {};
      // Merge persisted map into in-memory cache for faster subsequent lookups
      Object.assign(PHONE_CACHE_MAP, map);
      return PHONE_CACHE_MAP[uname] || null;
    } catch (e) {
      return null;
    }
  };

  const setCachedPhoneForUser = async (uname, ph) => {
    try {
      // Update in-memory first for immediate effect
      PHONE_CACHE_MAP[uname] = ph;
      const raw = await AsyncStorage.getItem(PHONE_CACHE_KEY);
      const map = JSON.parse(raw || "{}") || {};
      map[uname] = ph;
      await AsyncStorage.setItem(PHONE_CACHE_KEY, JSON.stringify(map));
    } catch (e) {
      /* ignore cache failures */
    }
  };

  const saveCredentials = async (u, p, ph) => {
    try {
      const payload = JSON.stringify({
        username: u || "",
        password: p || "",
        phone: ph || "",
      });
      console.log("BetLogin: saving credentials payload:", {
        username: u,
        phone: ph,
        password: p ? "***" : null,
      });
      // Batch write the credential payload and a last-login timestamp to reduce
      // native IO roundtrips. Verification is omitted to avoid extra reads.
      await batchSet([
        [CRED_KEY, payload],
        ["@last_login", String(Date.now())],
      ]);
    } catch (e) {
      console.error("Failed to save credentials", e);
    }
  };

  // Load saved credentials when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      console.log("BetLogin: focused, loading saved credentials");
      loadSavedCredentials();
      setLoading(false);
    }, [])
  );

  const checkSession = async () => {
    try {
      const sessionRes = await withTimeout(supabase.auth.getSession(), 8000);
      const session =
        sessionRes?.data?.session ||
        sessionRes?.session ||
        sessionRes?.data ||
        null;

      if (session) {
        // User is already logged in, navigate to BetMain
        await fetchInitialData();
        navigation.navigate("BetMain");
      }
    } catch (error) {
      console.error("Session check error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Note: phone is entered by the user. Placeholder below shows a test number.

  const handleSignup = async (signupUsername, signupPassword) => {
    Keyboard.dismiss();
    try {
      setLoading(true);

      // Use the provided phone. Require phone to be entered.
      const signupPhone = phone;

      if (!signupPhone) {
        Alert.alert(
          "Signup Failed",
          "Please enter a phone number before creating an account."
        );
        return;
      }

      // Check username uniqueness in profiles
      const { data: existingUser, error: existingErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", signupUsername)
        .maybeSingle();

      if (existingErr) {
        throw existingErr;
      }

      if (existingUser) {
        Alert.alert("Signup Failed", "Username is already taken.");
        return;
      }

      // Sign up the user with phone. Your Supabase project must have
      // phone auth enabled (you mentioned SMS confirmation disabled).
      const { data: authData, error: authError } = await supabase.auth.signUp({
        phone: signupPhone,
        password: signupPassword,
      });

      if (authError) {
        // Common case: phone already registered
        const msg = authError.message || "Phone signup failed";
        if (
          msg.toLowerCase().includes("phone") ||
          msg.toLowerCase().includes("already")
        ) {
          Alert.alert("Signup Failed", "Phone number is already in use.");
          return;
        }
        throw authError;
      }

      // Create profile with initial credits
      const { error: profileError } = await supabase.from("profiles").insert({
        id: authData.user.id,
        username: signupUsername,
        phone: signupPhone,
        credits: 2500,
      });

      if (profileError) {
        // username duplicate (race)
        if (
          profileError.message &&
          profileError.message.toLowerCase().includes("duplicate")
        ) {
          Alert.alert("Signup Failed", "Username is already taken.");
          return;
        }
        throw profileError;
      }

      // New users are not Pro by default — persist local flag and update context
      try {
        await batchSet([["@is_pro", "0"]]);
        if (setIsPro) setIsPro(false);
      } catch (e) {}

      Alert.alert(
        "Success",
        "Account created! You've been given 2500 credits to start.",
        [
          {
            text: "OK",
            onPress: async () => {
              // Persist credentials locally so inputs stay filled
              await saveCredentials(signupUsername, signupPassword, phone);
              // Prompt for push notifications during signup onboarding
              try {
                registerForPushNotifications().catch((e) =>
                  console.warn(
                    "registerForPushNotifications (signup) failed",
                    e
                  )
                );
              } catch (e) {
                console.warn("registerForPushNotifications (signup) error", e);
              }
              try {
                console.log(
                  "BetLogin: signup success - fetching scoreboard now"
                );
                await fetchScoreboard();
                console.log("BetLogin: signup - scoreboard fetch complete");
              } catch (e) {
                console.error("BetLogin: signup - fetchScoreboard error", e);
              }
              // Start rosters fetch in background
              if (fetchRosters) {
                fetchRosters()
                  .then(() =>
                    console.log(
                      "BetLogin: signup - rosters fetch started/completed"
                    )
                  )
                  .catch((e) =>
                    console.error("BetLogin: signup - fetchRosters error", e)
                  );
              }
              InteractionManager.runAfterInteractions(() => {
                navigation.navigate("BetMain");
              });
            },
          },
        ]
      );
    } catch (error) {
      console.error("Signup error:", error);
      Alert.alert("Signup Failed", error.message || "Could not create account");
    } finally {
      // Only stop loading if still on login screen
      InteractionManager.runAfterInteractions(() => {
        setLoading(false);
      });
    }
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!username || !password) {
      Alert.alert("Error", "Please enter both username and password");
      return;
    }

    try {
      setLoading(true);
      console.log("BetLogin: attempting login for username:", username);

      // Try a local in-memory cache of username->phone first to avoid RPC/AsyncStorage
      // During login we must avoid AsyncStorage IO. Use module-scoped `PHONE_CACHE_MAP`.
      let userPhone = null;
      let authData = null;
      let authError = null;
      let navigated = false;
      try {
        const cached = PHONE_CACHE_MAP[username] || null;
        if (cached) {
          console.log(
            "BetLogin: found cached phone for user, attempting fast sign-in",
            cached
          );
          try {
            ({ data: authData, error: authError } = await withTimeout(
              supabase.auth.signInWithPassword({ phone: cached, password }),
              8000
            ));
          } catch (e) {
            console.warn("BetLogin: fast sign-in timed out or failed", e);
            authError = e;
            authData = null;
          }
          console.log("BetLogin: fast sign-in result:", {
            authData,
            authError,
          });
          if (!authError && authData) {
            userPhone = cached;
            try {
              InteractionManager.runAfterInteractions(() => {
                navigation.navigate("BetMain");
              });
              navigated = true;
            } catch (e) {
              console.warn("BetLogin: navigate error", e);
            }
            // Persist credentials + phone cache asynchronously (non-blocking)
            setTimeout(() => {
              try {
                const payload = JSON.stringify({
                  username,
                  password,
                  phone: userPhone,
                });
                batchSet([
                  [CRED_KEY, payload],
                  [PHONE_CACHE_KEY, JSON.stringify({ [username]: userPhone })],
                ]).catch(() => {});
              } catch (e) {}
            }, 0);
          } else if (
            authError &&
            authError.message &&
            (authError.message.includes("Invalid") ||
              authError.message.includes("credentials"))
          ) {
            console.warn(
              "BetLogin: fast sign-in invalid credentials",
              authError
            );
            Alert.alert("Login Failed", "Invalid password. Please try again.");
            setLoading(false);
            return;
          } else {
            // If cache exists but fast sign-in fails for another reason, abort without calling RPC
            console.log(
              "BetLogin: fast sign-in failed and cache exists — aborting without RPC",
              authError
            );
            Alert.alert(
              "Login Failed",
              authError?.message || "Failed to login"
            );
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("BetLogin: cache fast-path error", e);
      }

      // If cache didn't produce a phone or sign-in, perform secure RPC lookup
      if (!userPhone) {
        // Secure lookup: call RPC 'get_phone_by_username' which returns only the phone
        let rpcData = null;
        try {
          console.time("rpc");
          const res = await withTimeout(
            supabase.rpc("get_phone_by_username", { uname: username }),
            8000
          );
          console.timeEnd("rpc");
          rpcData = res.data || res;
          console.log("BetLogin: rpc lookup result:", { rpcData });
        } catch (rpcError) {
          console.warn(
            "BetLogin: rpc lookup failed or timed out",
            rpcError?.message || rpcError
          );
          throw rpcError;
        }

        // rpcData might be a scalar string, an array, or an object depending on function
        if (!rpcData) {
          Alert.alert(
            "Account Not Found",
            "No account exists with that username. Please create an account."
          );
          setShowPhoneForm(true);
          setLoading(false);
          return;
        }

        if (typeof rpcData === "string") {
          userPhone = rpcData;
        } else if (Array.isArray(rpcData) && rpcData.length > 0) {
          userPhone = rpcData[0];
        } else if (rpcData.phone) {
          userPhone = rpcData.phone;
        }

        if (!userPhone) {
          // Profile exists but no phone stored - ask user to enter it
          Alert.alert(
            "Phone Required",
            "Please enter the phone number you used to sign up."
          );
          setShowPhoneForm(true);
          setLoading(false);
          return;
        }

        // store fresh phone in in-memory cache immediately (best-effort)
        try {
          PHONE_CACHE_MAP[username] = userPhone;
        } catch (e) {}
        // Persist credentials + phone cache asynchronously (non-blocking)
        setTimeout(() => {
          try {
            const payload = JSON.stringify({
              username,
              password,
              phone: userPhone,
            });
            batchSet([
              [CRED_KEY, payload],
              [PHONE_CACHE_KEY, JSON.stringify({ [username]: userPhone })],
            ]).catch(() => {});
          } catch (e) {}
        }, 0);

        // Now sign in with the phone + password (with timeout)
        console.log("BetLogin: attempting phone sign-in with", userPhone);
        try {
          ({ data: authData, error: authError } = await withTimeout(
            supabase.auth.signInWithPassword({ phone: userPhone, password }),
            8000
          ));
        } catch (e) {
          console.warn("BetLogin: signInWithPassword timed out or failed", e);
          authError = e;
          authData = null;
        }

        console.log("BetLogin: sign-in result:", { authData, authError });

        if (authError) {
          console.warn("BetLogin: sign-in error", authError);
          if (
            authError.message &&
            (authError.message.includes("Invalid") ||
              authError.message.includes("credentials"))
          ) {
            Alert.alert("Login Failed", "Invalid password. Please try again.");
          } else {
            Alert.alert("Login Failed", authError.message || "Failed to login");
          }
          setLoading(false);
          return;
        }
      }

      // Success - login succeeded
      console.log("BetLogin: login successful");
      // Update in-memory cache and persist non-blocking after navigation
      try {
        if (userPhone) PHONE_CACHE_MAP[username] = userPhone;
      } catch (e) {}
      // Prompt for push notifications immediately (best-effort).
      try {
        registerForPushNotifications().catch((e) =>
          console.warn("registerForPushNotifications (login) failed", e)
        );
      } catch (e) {
        console.warn("registerForPushNotifications (login) error", e);
      }

      // Navigate immediately for faster perceived login (do this before any slow background work)
      try {
        if (!navigated) navigation.navigate("BetMain");
      } catch (e) {
        console.warn("BetLogin: navigate error", e);
      }

      // Defer RevenueCat initialization out of the critical login path.
      // Run after navigation and don't await; use timeout wrapper for safety.
      setTimeout(() => {
        (async () => {
          try {
            const userId =
              authData?.user?.id ||
              (await withTimeout(supabase.auth.getUser(), 8000))?.data?.user
                ?.id;
            if (!userId) return;
            try {
              // Don't await this on the main path; wrap in timeout so it can't stall forever
              await withTimeout(
                initPurchases("appl_mdoICWLxVPeKJjUzLbFUKhMrXAT", userId),
                10000
              );
              console.log("BetLogin: RevenueCat identify called", userId);
              try {
                const info = await withTimeout(getCustomerInfo(), 8000);
                const entitled = isEntitled(info, "SportsHeart Pro");
                console.log("BetLogin: RevenueCat entitlement:", !!entitled);
                if (entitled) {
                  // persist quick-lookup and set context to true
                  await batchSet([["@is_pro", "1"]]);
                  try {
                    if (setIsPro) setIsPro(true);
                  } catch (e) {}
                } else {
                  // If RevenueCat reports not entitled, avoid immediately forcing
                  // the app-wide `isPro` to false (this can create a flip when
                  // profile-based pro status is authoritative). Instead, try to
                  // refresh profile and only update context from the server
                  // truth. Remove the quick AsyncStorage flag so next app start
                  // will re-evaluate from profile.
                  await AsyncStorage.multiRemove(["@is_pro"]).catch(() => {});
                  try {
                    const refreshed = await withTimeout(
                      supabase.auth.getUser(),
                      8000
                    );
                    // attempt to refresh profile from server
                    try {
                      const prof = await getUserProfile();
                      if (prof && prof.success && prof.profile) {
                        if (setIsPro) setIsPro(!!prof.profile.is_pro);
                        await batchSet([
                          ["@is_pro", prof.profile.is_pro ? "1" : "0"],
                        ]).catch(() => {});
                      }
                    } catch (e) {
                      console.warn(
                        "BetLogin: failed to refresh profile after RevenueCat not-entitled",
                        e?.message || e
                      );
                    }
                  } catch (e) {
                    // ignore failures to refresh user here
                  }
                }
              } catch (e) {
                console.warn(
                  "BetLogin: getCustomerInfo failed",
                  e?.message || e
                );
              }
            } catch (e) {
              console.warn(
                "BetLogin: RevenueCat identify failed",
                e?.message || e
              );
            }
          } catch (e) {
            console.warn(
              "BetLogin: initPurchases identify error",
              e?.message || e
            );
          }
        })();
      }, 1000);
      // Prefer token returned from signIn; do NOT call getSession() here (can hang)
      const accessToken = authData?.session?.access_token || null;

      const headers = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const maskedToken = accessToken
        ? `${accessToken.slice(0, 8)}...<masked>`
        : null;
      const requestBody = JSON.stringify({ username });

      // Run server auth exchange in background (does not block navigation)
      (async () => {
        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers,
            body: requestBody,
          });
          let body = null;
          try {
            body = await res.json().catch(() => null);
          } catch (e) {
            body = null;
          }
          if (res.ok && body && body.token) {
            // Batch store server token and last-server-auth timestamp to reduce IO
            await batchSet([
              ["@bet_token", body.token],
              ["@last_server_auth", String(Date.now())],
            ]);
            console.log(
              "BetLogin: stored server auth token",
              (body.token || "").length
            );
            try {
              await registerForPushNotifications(body.token);
            } catch (e) {
              console.error("Push registration after login failed:", e);
            }
          } else {
            console.log("BetLogin: server exchange returned no token", {
              status: res.status,
              body,
            });
          }
        } catch (err) {
          console.error("BetLogin: server auth exchange error", err);
        }
      })();

      // Start scoreboard and rosters in background; do not await before navigation
      // Start scoreboard fetch in next tick so it cannot block UI/navigation
      setTimeout(() => {
        (async () => {
          try {
            await fetchScoreboard();
            console.log("BetLogin: background fetchScoreboard completed");
          } catch (e) {
            console.error("BetLogin: background fetchScoreboard error", e);
          }
        })();
      }, 0);

      if (fetchRosters) {
        // Defer rosters fetch to avoid any chance of blocking the login flow/UI
        setTimeout(() => {
          fetchRosters()
            .then(() =>
              console.log("BetLogin: background fetchRosters completed")
            )
            .catch((e) =>
              console.error("BetLogin: background fetchRosters error", e)
            );
        }, 0);
      }

      // Initialize odds display in background
      (async () => {
        try {
          const stored = await AsyncStorage.getItem("@odds_display");
          if (stored === "decimal" || stored === "american") {
            if (oddsContext && oddsContext.setOddsDisplay) {
              oddsContext.setOddsDisplay(stored);
              console.log(
                "BetLogin: initialized OddsDisplayContext to",
                stored
              );
            }
          }
        } catch (e) {
          console.error("BetLogin: error initializing odds display context", e);
        }
      })();

      // Refresh profile `is_pro` from Supabase so app immediately knows Pro status
      // Run in background so it doesn't block navigation/perceived login time.
      (async () => {
        try {
          const userId =
            authData?.user?.id ||
            (await withTimeout(supabase.auth.getUser(), 8000))?.data?.user?.id;
          if (userId) {
            const { data: profileRow, error: pErr } = await supabase
              .from("profiles")
              .select("is_pro")
              .eq("id", userId)
              .maybeSingle();
            if (!pErr && profileRow) {
              try {
                await batchSet([["@is_pro", profileRow.is_pro ? "1" : "0"]]);
                if (setIsPro) setIsPro(!!profileRow.is_pro);
              } catch (e) {}
            }
          }
        } catch (e) {
          console.warn("BetLogin: failed to refresh is_pro", e);
        }
      })();

      // navigation already performed earlier; nothing to do here
    } catch (error) {
      console.error("Login error (catch):", error);
      Alert.alert(
        "Login Failed",
        error.message || "An unexpected error occurred"
      );
    }
  };

  return (
    <View
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        {/* Logo/Icon */}
        <View
          style={[styles.logoContainer, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="cash" size={48} color="white" />
        </View>

        <Text style={[styles.title, { color: theme.text }]}>
          Welcome to SportsHeart Picks
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Login or create a new account
        </Text>

        {/* Form */}
        <View style={styles.form}>
          {showPhoneForm && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 8 }}>Phone</Text>
              <View
                style={[
                  styles.inputContainer,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={theme.textSecondary}
                />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="+12345678910"
                  placeholderTextColor={theme.textSecondary}
                  value={phone}
                  onChangeText={setPhone}
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
            </View>
          )}
          <View
            style={[
              styles.inputContainer,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Ionicons
              name="person-outline"
              size={20}
              color={theme.textSecondary}
            />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Username"
              placeholderTextColor={theme.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          <View
            style={[
              styles.inputContainer,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={theme.textSecondary}
            />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Password"
              placeholderTextColor={theme.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-outline" : "eye-off-outline"}
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {showPhoneForm ? (
            <>
              <TouchableOpacity
                style={[
                  styles.loginButton,
                  { backgroundColor: colors.primary },
                  loading && styles.loginButtonDisabled,
                ]}
                onPress={() => handleSignup(username, password)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.loginButtonText}>Create account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.loginButton,
                  { backgroundColor: theme.surface, marginTop: 8 },
                ]}
                onPress={() => setShowPhoneForm(false)}
                disabled={loading}
              >
                <Text
                  style={[styles.loginButtonText, { color: colors.primary }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[
                styles.loginButton,
                { backgroundColor: colors.primary },
                loading && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.loginButtonText}>Login</Text>
              )}
            </TouchableOpacity>
          )}

          <Text style={[styles.demoNote, { color: theme.textTertiary }]}>
            New users will be prompted to create an account
          </Text>
        </View>
      </View>
      {/* daily reward modal moved to BetHomeScreen */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  loginButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  demoNote: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
    fontStyle: "italic",
  },
});

export default BetLoginScreen;
