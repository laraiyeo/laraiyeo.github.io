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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useBetData } from "../../context/BetDataContext";

// API endpoint - Update this with your bet-server Railway URL
const API_URL =
  "https://laraiyeogithubio-production-f5af.up.railway.app/api/auth";

const BetLoginScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const { fetchInitialData, isLoading } = useBetData();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load saved credentials on mount
  useEffect(() => {
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const savedUser = await AsyncStorage.getItem("@bet_user");
      const savedToken = await AsyncStorage.getItem("@bet_token");

      if (savedUser && savedToken) {
        const user = JSON.parse(savedUser);
        // Auto-fill credentials
        setUsername(user.username);

        // Optionally auto-login if token exists
        // You can verify the token with the backend first
        try {
          const response = await fetch(`${API_URL}/verify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${savedToken}`,
            },
          });

          if (response.ok) {
            // Token is valid, auto-login
            await fetchInitialData();
            navigation.navigate("BetMain");
          }
        } catch (error) {
          // Token verification failed, user needs to login
          console.log("Auto-login failed:", error);
        }
      }
    } catch (error) {
      console.error("Error loading saved credentials:", error);
    }
  };

  const saveCredentials = async (user, token) => {
    try {
      await AsyncStorage.setItem("@bet_user", JSON.stringify(user));
      await AsyncStorage.setItem("@bet_token", token);
    } catch (error) {
      console.error("Error saving credentials:", error);
    }
  };

  const handleSignup = async (username, password) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          credits: 1000, // Starting credits for new users
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Save credentials
        await saveCredentials(data.user, data.token);

        Alert.alert(
          "Success",
          `Account created! You've been given ${data.user.credits} credits to start.`,
          [
            {
              text: "OK",
              onPress: async () => {
                await fetchInitialData();
                navigation.navigate("BetMain");
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Signup Failed",
          data.message || "Could not create account"
        );
      }
    } catch (error) {
      console.error("Signup error:", error);
      Alert.alert("Error", "Failed to create account. Please try again.");
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
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Save credentials
        await saveCredentials(data.user, data.token);

        // Fetch initial data before navigating
        await fetchInitialData();

        // Navigate to BetMain
        navigation.navigate("BetMain");
      } else if (response.status === 404) {
        // User not found - offer to sign up
        Alert.alert(
          "Signup",
          "Account not found. Would you like to create a new account with these credentials?",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "OK",
              onPress: () => handleSignup(username, password),
            },
          ]
        );
      } else {
        Alert.alert("Error", data.message || "Invalid credentials");
      }
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert("Error", "Failed to login. Please check your connection.");
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
