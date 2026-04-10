import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../config/supabase";

const BetEntryScreen = ({ navigation }) => {
  const { theme, colors } = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setIsLoggedIn(!!data?.session);
      } catch (e) {
        if (mounted) setIsLoggedIn(false);
      }
    };

    loadSession();
    const { data } = supabase.auth.onAuthStateChange(() => {
      loadSession();
    });

    return () => {
      mounted = false;
      if (data && data.subscription) data.subscription.unsubscribe();
    };
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Enter Picks</Text>
        {!isLoggedIn && (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>
            Go to Settings to login or create an account
          </Text>
        )}
        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: isLoggedIn ? colors.primary : theme.border },
          ]}
          onPress={() => navigation.navigate("BetMain")}
          disabled={!isLoggedIn}
        >
          <Text style={styles.buttonText}>Open Picks</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  helperText: {
    marginBottom: 12,
    fontSize: 13,
    textAlign: "center",
  },
});

export default BetEntryScreen;
