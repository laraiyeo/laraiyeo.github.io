import React, { useState, useEffect } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useBetData } from "../../context/BetDataContext";
import { supabase } from "../../config/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

const BetLoginScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const { fetchScoreboard, fetchRosters, isLoading } = useBetData();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [phone, setPhone] = useState("");

  const CRED_KEY = "bet_credentials_v1";

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
        if (sPhone) setPhone(sPhone);
        if (sPass) setPassword(sPass);
      }
    } catch (e) {
      console.error("Failed to load saved credentials", e);
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
      await AsyncStorage.setItem(CRED_KEY, payload);
      // Read back immediately to verify
      const verify = await AsyncStorage.getItem(CRED_KEY);
      console.log("BetLogin: saved value verify:", verify);
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

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

      Alert.alert(
        "Success",
        "Account created! You've been given 2500 credits to start.",
        [
          {
            text: "OK",
            onPress: async () => {
              // Persist credentials locally so inputs stay filled
              await saveCredentials(signupUsername, signupPassword, phone);
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
              navigation.navigate("BetMain");
            },
          },
        ]
      );
    } catch (error) {
      console.error("Signup error:", error);
      Alert.alert("Signup Failed", error.message || "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Please enter both username and password");
      return;
    }

    try {
      setLoading(true);
      console.log("BetLogin: attempting login for username:", username);

      // Secure lookup: call RPC 'get_phone_by_username' which returns only the phone
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_phone_by_username",
        { uname: username }
      );

      console.log("BetLogin: rpc lookup result:", { rpcData, rpcError });

      if (rpcError) {
        throw rpcError;
      }

      // rpcData might be a scalar string, an array, or an object depending on function
      let userPhone = null;
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

      // Now sign in with the phone + password
      console.log("BetLogin: attempting phone sign-in with", userPhone);
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          phone: userPhone,
          password,
        });

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

      // Success - save credentials including the phone we looked up
      console.log("BetLogin: login successful");
      await saveCredentials(username, password, userPhone);
      // Trigger scoreboard + rosters fetch immediately from login
      try {
        console.log("BetLogin: login success - fetching scoreboard now");
        await fetchScoreboard();
        console.log("BetLogin: login - scoreboard fetch complete");
      } catch (e) {
        console.error("BetLogin: login - fetchScoreboard error", e);
      }
      if (fetchRosters) {
        fetchRosters()
          .then(() =>
            console.log("BetLogin: login - rosters fetch started/completed")
          )
          .catch((e) =>
            console.error("BetLogin: login - fetchRosters error", e)
          );
      }
      navigation.navigate("BetMain");
    } catch (error) {
      console.error("Login error (catch):", error);
      Alert.alert(
        "Login Failed",
        error.message || "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
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
          Welcome to Betting
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
    </KeyboardAvoidingView>
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
