import React, { useState } from "react";
import { Image, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

/**
 * TeamLogoImage – drop-in replacement for <Image> when rendering team logos.
 * Shows a baseball icon (Ionicons) in colors.primary when the image fails to load
 * or when no valid URI is provided.
 *
 * Usage:
 *   <TeamLogoImage
 *     source={{ uri: getTeamLogoUrl("mlb", abbreviation) }}
 *     style={styles.teamLogo}
 *   />
 */
const TeamLogoImage = ({ source, style, ...props }) => {
  const [hasError, setHasError] = useState(false);
  const { colors } = useTheme();

  const flatStyle = StyleSheet.flatten(style) || {};
  const dim = flatStyle.width ?? flatStyle.height ?? 40;
  const iconSize = Math.round(dim * 0.72);

  if (hasError || !source?.uri) {
    return (
      <View
        style={[
          style,
          styles.placeholder,
          { width: flatStyle.width, height: flatStyle.height },
        ]}
      >
        <Ionicons name="baseball" size={iconSize} color={colors.primary} />
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={style}
      onError={() => setHasError(true)}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "transparent",
  },
});

export default TeamLogoImage;
