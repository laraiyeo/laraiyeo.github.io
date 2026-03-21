import React, { useState, useEffect, useRef } from "react";
import { View, Image, StyleSheet, Dimensions, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../context/ThemeContext";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

const SplashScreen = ({ onFinish }) => {
  const [isFinished, setIsFinished] = useState(false);
  const videoRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current; // for fade-in

  // Get current theme
  const { currentColorPalette, isDarkMode } = useTheme();

  // Define splash assets based on theme
  const getSplashAssets = () => {
    const colorTheme = currentColorPalette || "blue";
    const mode = isDarkMode ? "dark" : "light";

    // Asset structure: mode/color/files
    const assetSets = {
      // Dark mode assets
      "dark/blue": {
        image: require("../../assets/dark/blue/splash_image.png"),
        video: require("../../assets/dark/blue/splash_video.mp4"),
      },
      "dark/red": {
        image: require("../../assets/dark/red/splash_image.png"),
        video: require("../../assets/dark/red/splash_video.mp4"),
      },
      "dark/green": {
        image: require("../../assets/dark/green/splash_image.png"),
        video: require("../../assets/dark/green/splash_video.mp4"),
      },
      "dark/purple": {
        image: require("../../assets/dark/purple/splash_image.png"),
        video: require("../../assets/dark/purple/splash_video.mp4"),
      },
      "dark/custom": {
        image: require("../../assets/dark/custom/splash_image.png"),
        video: require("../../assets/dark/custom/splash_video.mp4"),
      },
      "dark/gold": {
        image: require("../../assets/dark/gold/splash_image.png"),
        video: require("../../assets/dark/gold/splash_video.mp4"),
      },

      // Light mode assets
      "light/blue": {
        image: require("../../assets/light/blue/splash_image.png"),
        video: require("../../assets/light/blue/splash_video.mp4"),
      },
      "light/red": {
        image: require("../../assets/light/red/splash_image.png"),
        video: require("../../assets/light/red/splash_video.mp4"),
      },
      "light/green": {
        image: require("../../assets/light/green/splash_image.png"),
        video: require("../../assets/light/green/splash_video.mp4"),
      },
      "light/purple": {
        image: require("../../assets/light/purple/splash_image.png"),
        video: require("../../assets/light/purple/splash_video.mp4"),
      },
      "light/custom": {
        image: require("../../assets/light/custom/splash_image.png"),
        video: require("../../assets/light/custom/splash_video.mp4"),
      },
      "light/gold": {
        image: require("../../assets/light/gold/splash_image.png"),
        video: require("../../assets/light/gold/splash_video.mp4"),
      },
    };

    // Build the asset key: mode/color
    const assetKey = `${mode}/${colorTheme}`;

    // Return specific theme assets, fallback to dark/red if not found
    return assetSets[assetKey] || assetSets["dark/red"];
  };

  const splashAssets = getSplashAssets();

  const aspectRatio = 9 / 16;
  const videoWidth = screenWidth;
  const videoHeight = screenWidth / aspectRatio;
  const finalWidth =
    videoHeight > screenHeight ? screenHeight * aspectRatio : videoWidth;
  const finalHeight = videoHeight > screenHeight ? screenHeight : videoHeight;

  // When video was removed, we keep a short fade + timeout so we don't
  // steal audio focus from background music by creating any audio/video
  // player. This avoids instantiating expo-video or similar players.
  useEffect(() => {
    let timer;

    // Fade in quickly
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    // Short splash delay before finishing
    timer = setTimeout(() => {
      if (!isFinished) {
        setIsFinished(true);
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => onFinish());
      }
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Load the user's preference for showing the splash video
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("@showSplashVideo");
        // If the user previously disabled the video, respect that preference
        // but we no longer create a video player so nothing needs to change
        // at runtime here.
        if (stored === "false") {
          // no-op: preference respected, splash behavior unchanged
        }
      } catch (error) {
        console.error("Error reading splash preference:", error);
      }
    })();
  }, []);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? "#000000" : "#ffffff" },
      ]}
    >
        <Image
          source={splashAssets.image}
          style={{ width: finalWidth, height: finalHeight }}
          resizeMode="contain"
        />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  media: {
    backgroundColor: "transparent",
  },
});

export default SplashScreen;
