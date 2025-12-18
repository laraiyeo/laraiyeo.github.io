import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Button,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../config/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BetSettingsScreen = ({ navigation }) => {
  const { theme, colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("username, credits, created_at")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data || null);
    } catch (e) {
      console.error("Failed to load profile", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      // Clear saved credentials for convenience/security
      try {
        await AsyncStorage.removeItem("bet_credentials_v1");
      } catch (e) {}
      navigation.navigate("BetLogin");
    } catch (e) {
      console.error("Sign out failed", e);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.text }]}>Username</Text>
        <Text style={[styles.value, { color: theme.textSecondary }]}>
          {profile?.username || "—"}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.text }]}>Credits</Text>
        <Text style={[styles.value, { color: theme.textSecondary }]}>
          {profile?.credits ?? "—"}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.text }]}>
          Account created
        </Text>
        <Text style={[styles.value, { color: theme.textSecondary }]}>
          {profile?.created_at
            ? new Date(profile.created_at).toLocaleString()
            : "—"}
        </Text>
      </View>

      <View style={{ marginTop: 24 }}>
        <Button title="Refresh" onPress={fetchProfile} color={colors.primary} />
      </View>

      <View style={{ marginTop: 12 }}>
        <Button
          title="Sign out"
          onPress={handleSignOut}
          color={colors.primary}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  row: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
  },
});

export default BetSettingsScreen;
