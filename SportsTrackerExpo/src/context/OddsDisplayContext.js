import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@odds_display";

export const OddsDisplayContext = createContext(null);

export const OddsDisplayProvider = ({ children }) => {
  const [oddsDisplay, setOddsDisplay] = useState("american");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;
        if (v === "decimal" || v === "american") setOddsDisplay(v);
      } catch (e) {
        // ignore
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, oddsDisplay).catch(() => {});
  }, [oddsDisplay]);

  return (
    <OddsDisplayContext.Provider value={{ oddsDisplay, setOddsDisplay }}>
      {children}
    </OddsDisplayContext.Provider>
  );
};

export default OddsDisplayContext;
