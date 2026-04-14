import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import {
  useGamePresence,
  useGamePresenceReadOnly,
  useMultipleGamePresence,
} from "../hooks/useGamePresence";

const ViewerCounter = ({
  gameId,
  style,
  showIcon = true,
  compact = false,
  preferPeak = false,
}) => {
  const { theme, colors } = useTheme();
  const { viewerCount, isJoined, peak } = useGamePresence(gameId);

  if (!gameId) return null;

  const formatViewerCount = (count) => {
    if (count >= 1000000) {
      // Format as "1.01M" with 2 decimals
      return (count / 1000000).toFixed(2).replace(/\.00$/, "") + "M";
    } else if (count >= 1000) {
      // Format as "100.1K" with 1 decimal
      return (count / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    }
    return count.toString();
  };

  if (compact) {
    const displayCount =
      preferPeak &&
      (viewerCount === 0 || viewerCount == null) &&
      peak &&
      peak.count
        ? peak.count
        : viewerCount;

    return (
      <View style={[styles.compactContainer, style]}>
        {showIcon && (
          <View
            style={[styles.liveIndicator, { backgroundColor: theme.success }]}
          >
            <Ionicons name="eye" size={12} color="#fff" />
          </View>
        )}
        <Text style={[styles.compactText, { color: theme.text }]}>
          {formatViewerCount(displayCount)}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        style,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {showIcon && (
        <View
          style={[styles.liveIndicator, { backgroundColor: theme.success }]}
        />
      )}
      <Ionicons name="eye-outline" size={16} color={theme.textSecondary} />
      <Text style={[styles.viewerText, { color: theme.text }]}>
        {formatViewerCount(
          preferPeak &&
            (viewerCount === 0 || viewerCount == null) &&
            peak &&
            peak.count
            ? peak.count
            : viewerCount,
        )}
      </Text>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {preferPeak &&
        (viewerCount === 0 || viewerCount == null) &&
        peak &&
        peak.count
          ? "peak"
          : viewerCount === 1
            ? "viewer"
            : "viewers"}
      </Text>
    </View>
  );
};

const LiveViewerBadge = ({ gameId, style, status = {}, scale = 1 }) => {
  const { theme, colors } = useTheme();
  // Use a read-only subscription that doesn't join the game
  const { viewerCount, peak } = useGamePresenceReadOnly(gameId);

  if (!gameId) return null;

  // Determine game finished state from provided status (accept string or object)
  let statusStr = "";
  if (typeof status === "string") {
    statusStr = status;
  } else if (status && typeof status === "object") {
    statusStr = String(status.status || status.state || "");
  }
  const isCompletedFlag =
    !!(status && status.isCompleted) ||
    /final|post|completed|over|off/i.test(statusStr);

  // If game is completed/finished, prefer showing peak (if present)
  const hasPeak = peak && peak.count;
  const shouldShowPeak = isCompletedFlag && hasPeak;

  // Prefer peak for completed games even if there are live viewers.
  const effectiveCount = shouldShowPeak
    ? peak.count
    : viewerCount > 0
      ? viewerCount
      : 0;
  if (effectiveCount === 0) return null;

  const formatViewerCount = (count) => {
    if (count >= 1000000) {
      // Format as "1.01M" with 2 decimals
      return (count / 1000000).toFixed(2).replace(/\.00$/, "") + "M";
    } else if (count >= 1000) {
      // Format as "100.1K" with 1 decimal
      return (count / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    }
    return count.toString();
  };

  return (
    <View
      style={[
        styles.badge,
        style,
        {
          backgroundColor: theme.surface,
          borderColor: shouldShowPeak ? theme.textSecondary : colors.primary,
          minWidth: 40 * scale,
          minHeight: 20 * scale,
          paddingHorizontal: 8 * scale,
          paddingVertical: 4 * scale,
          borderRadius: 12 * scale,
        },
      ]}
    >
      <Ionicons
        name="eye"
        size={18 * scale}
        color={shouldShowPeak ? theme.textSecondary : colors.primary}
      />
      <Text
        style={[
          styles.badgeText,
          {
            color: shouldShowPeak ? theme.textSecondary : colors.primary,
            fontSize: 14 * scale,
            marginLeft: 4 * scale,
          },
        ]}
      >
        {formatViewerCount(effectiveCount)}
      </Text>
    </View>
  );
};

// Component for showing multiple game viewer counts (for scoreboards)
const GameViewerList = ({ gameIds, style }) => {
  const { theme } = useTheme();
  const gameViewers = useMultipleGamePresence(gameIds);

  if (!gameIds || gameIds.length === 0) return null;

  return (
    <View style={[styles.gameListContainer, style]}>
      {gameIds.map((gameId) => {
        const viewerData = gameViewers[gameId];
        const count = viewerData?.count || 0;

        if (count === 0) return null;

        return (
          <View
            key={gameId}
            style={[styles.gameViewerItem, { borderColor: theme.border }]}
          >
            <ViewerCounter gameId={gameId} compact={true} />
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  viewerText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  compactText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  label: {
    fontSize: 12,
    marginLeft: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
  gameListContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gameViewerItem: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
});

export { ViewerCounter, LiveViewerBadge, GameViewerList };
export default ViewerCounter;
