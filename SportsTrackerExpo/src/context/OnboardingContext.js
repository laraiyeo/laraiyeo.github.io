import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "@onboarding_complete";
const LOGIN_DONT_SHOW_KEY = "@login_dont_show";

const OnboardingContext = createContext(null);

export const OnboardingProvider = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [loginDontShow, setLoginDontShow] = useState(false);
  const [loginDismissedThisSession, setLoginDismissedThisSession] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [onboardingRaw, loginRaw] = await AsyncStorage.multiGet([
          ONBOARDING_KEY,
          LOGIN_DONT_SHOW_KEY,
        ]);
        if (!mounted) return;
        const onboardingValue = onboardingRaw?.[1] === "1";
        const loginValue = loginRaw?.[1] === "1";
        setIsOnboardingComplete(onboardingValue);
        setLoginDontShow(loginValue);
      } catch (e) {
        console.warn("OnboardingContext: load failed", e?.message || e);
      } finally {
        if (mounted) setIsReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const completeOnboarding = async () => {
    setIsOnboardingComplete(true);
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    } catch (e) {
      console.warn(
        "OnboardingContext: save onboarding failed",
        e?.message || e,
      );
    }
  };

  const dismissLoginForSession = () => {
    setLoginDismissedThisSession(true);
  };

  const disableLogin = async () => {
    setLoginDontShow(true);
    setLoginDismissedThisSession(true);
    try {
      await AsyncStorage.setItem(LOGIN_DONT_SHOW_KEY, "1");
    } catch (e) {
      console.warn(
        "OnboardingContext: save login hide failed",
        e?.message || e,
      );
    }
  };

  const resetOnboarding = async () => {
    setIsOnboardingComplete(false);
    setLoginDismissedThisSession(false);
    try {
      await AsyncStorage.removeItem(ONBOARDING_KEY);
    } catch (e) {
      console.warn(
        "OnboardingContext: reset onboarding failed",
        e?.message || e,
      );
    }
  };

  const value = {
    isReady,
    isOnboardingComplete,
    loginDontShow,
    loginDismissedThisSession,
    completeOnboarding,
    dismissLoginForSession,
    disableLogin,
    resetOnboarding,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const ctx = useContext(OnboardingContext);
  if (!ctx)
    throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
};

export default OnboardingContext;
