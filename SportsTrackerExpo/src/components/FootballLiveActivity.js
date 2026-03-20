import React from "react";
import { Text, HStack, VStack, Image } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity } from "expo-widgets";

// Minimal Live Activity layout for football fixtures.
const FootballLiveActivity = (props) => {
  "widget";

  const home = props.home || {};
  const away = props.away || {};
  const status = props.status || {};

  return (
    <VStack spacing={6} style={{ padding: 10 }}>
      <HStack spacing={8} align="center">
        <VStack spacing={2} align="center">
          <Text modifiers={[font({ size: 14, weight: "bold" })]}>
            {home.name ?? ""}
          </Text>
          <Text modifiers={[font({ size: 20, weight: "bold" })]}>
            {String(home.score ?? "")}
          </Text>
        </VStack>

        <VStack spacing={2} align="center">
          <Text modifiers={[font({ size: 12 })]}>vs</Text>
          <Text modifiers={[font({ size: 12 })]}>
            {status.short_name ?? ""}
          </Text>
        </VStack>

        <VStack spacing={2} align="center">
          <Text modifiers={[font({ size: 14, weight: "bold" })]}>
            {away.name ?? ""}
          </Text>
          <Text modifiers={[font({ size: 20, weight: "bold" })]}>
            {String(away.score ?? "")}
          </Text>
        </VStack>
      </HStack>
    </VStack>
  );
};

export default createLiveActivity("FootballLiveActivity", FootballLiveActivity);
