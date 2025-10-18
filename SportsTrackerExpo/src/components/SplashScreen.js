import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Dimensions, Animated } from 'react-native';
import { Video } from 'expo-av';
import { useTheme } from '../context/ThemeContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const SplashScreen = ({ onFinish }) => {
  const [isFinished, setIsFinished] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current; // for fade-in
  
  // Get current theme
  const { currentColorPalette, isDarkMode } = useTheme();

  // Define splash assets based on theme
  const getSplashAssets = () => {
    const colorTheme = currentColorPalette || 'blue';
    const mode = isDarkMode ? 'dark' : 'light';
    
    // Asset structure: mode/color/files
    const assetSets = {
      // Dark mode assets
      'dark/blue': {
        image: require('../../assets/dark/blue/splash_image.png'),
        video: require('../../assets/dark/blue/splash_video.mp4'),
      },
      'dark/red': {
        image: require('../../assets/dark/red/splash_image.png'),
        video: require('../../assets/dark/red/splash_video.mp4'),
      },
      'dark/green': {
        image: require('../../assets/dark/green/splash_image.png'),
        video: require('../../assets/dark/green/splash_video.mp4'),
      },
      'dark/purple': {
        image: require('../../assets/dark/purple/splash_image.png'),
        video: require('../../assets/dark/purple/splash_video.mp4'),
      },
      'dark/gold': {
        image: require('../../assets/dark/gold/splash_image.png'),
        video: require('../../assets/dark/gold/splash_video.mp4'),
      },
      
      // Light mode assets
      'light/blue': {
        image: require('../../assets/light/blue/splash_image.png'),
        video: require('../../assets/light/blue/splash_video.mp4'),
      },
      'light/red': {
        image: require('../../assets/light/red/splash_image.png'),
        video: require('../../assets/light/red/splash_video.mp4'),
      },
      'light/green': {
        image: require('../../assets/light/green/splash_image.png'),
        video: require('../../assets/light/green/splash_video.mp4'),
      },
      'light/purple': {
        image: require('../../assets/light/purple/splash_image.png'),
        video: require('../../assets/light/purple/splash_video.mp4'),
      },
      'light/gold': {
        image: require('../../assets/light/gold/splash_image.png'),
        video: require('../../assets/light/gold/splash_video.mp4'),
      },
    };
    
    // Build the asset key: mode/color
    const assetKey = `${mode}/${colorTheme}`;
    
    // Return specific theme assets, fallback to light/blue if not found
    return assetSets[assetKey] || assetSets['light/blue'];
  };

  const splashAssets = getSplashAssets();

  const aspectRatio = 9 / 16;
  const videoWidth = screenWidth;
  const videoHeight = screenWidth / aspectRatio;
  const finalWidth = videoHeight > screenHeight ? screenHeight * aspectRatio : videoWidth;
  const finalHeight = videoHeight > screenHeight ? screenHeight : videoHeight;

  const handleVideoLoad = async () => {
    setVideoReady(true);

    // Fade in the video instantly (or over 100ms for smoothness)
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();

    // Start video playback immediately
    try {
      await videoRef.current?.playAsync();
    } catch (error) {
      console.log('Error playing video:', error);
      handleVideoEnd();
    }
  };

  const handleVideoEnd = () => {
    if (!isFinished) {
      setIsFinished(true);
      
      // Add a small delay to prevent flash, then fade out smoothly
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Call onFinish after fade out completes
        onFinish();
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#000000' : '#ffffff' }]}>
      {/* Static splash image stays visible underneath */}
      <Image
        source={splashAssets.image}
        style={[styles.media, { width: finalWidth, height: finalHeight, position: 'absolute' }]}
        resizeMode="contain"
      />

      {/* Fade-in video over the image */}
      <Animated.View
        style={{
          opacity: fadeAnim,
          width: finalWidth,
          height: finalHeight,
          position: 'absolute',
        }}
      >
        <Video
          ref={videoRef}
          source={splashAssets.video}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
          shouldPlay={false} // we'll call playAsync() manually
          isLooping={false}
          isMuted={false}
          onLoad={handleVideoLoad}
          onPlaybackStatusUpdate={(status) => {
            if (status.didJustFinish) handleVideoEnd();
          }}
          onError={(error) => {
            console.log('Video error:', error);
            handleVideoEnd();
          }}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    backgroundColor: 'transparent',
  },
});

export default SplashScreen;
