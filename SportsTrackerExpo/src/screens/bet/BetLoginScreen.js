import React, { useState } from "react";
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

const BetLoginScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const { fetchInitialData, isLoading } = useBetData();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Please enter both username and password");
      return;
    }

    // Validate credentials
    if (username === "username" && password === "password") {
      // Fetch initial data before navigating
      await fetchInitialData();

      // Navigate to BetMain (which is in the MainStackNavigator)
      navigation.navigate("BetMain");
    } else {
      Alert.alert(
        "Error",
        'Invalid username or password. Use "username" and "password"'
      );
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
          Demo Mode - Enter any credentials
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
              isLoading && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.demoNote, { color: theme.textTertiary }]}>
            This is a demo feature with placeholder data
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
