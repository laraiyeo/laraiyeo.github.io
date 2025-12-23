import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import UpdateService from "../services/UpdateService";

const KEY = "@show_bet_tab";

const AppSettingsContext = createContext();

export const AppSettingsProvider = ({ children }) => {
  const [showBetTab, setShowBetTabState] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!mounted) return;
        if (raw == null) {
          await AsyncStorage.setItem(KEY, "1");
          setShowBetTabState(true);
        } else {
          setShowBetTabState(raw === "1");
        }
      } catch (e) {
        console.warn("AppSettings: failed to load", e?.message || e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setShowBetTab = async (v) => {
    try {
      await AsyncStorage.setItem(KEY, v ? "1" : "0");
    } catch (e) {
      console.warn(
        "AppSettings: failed to persist showBetTab",
        e?.message || e
      );
    }
    setShowBetTabState(!!v);

    // Restart app so navigation (tabs) is recreated with new config —
    // mirror the behavior used when applying an update.
    try {
      // markForFeaturePopup = false (no feature popup needed)
      await UpdateService.restartApp(false);
    } catch (e) {
      console.warn("AppSettings: failed to restart app after toggling bet tab", e?.message || e);
    }
  };

  return (
    <AppSettingsContext.Provider value={{ showBetTab, setShowBetTab }}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const ctx = useContext(AppSettingsContext);
  if (!ctx)
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  return ctx;
};

export default AppSettingsContext;
