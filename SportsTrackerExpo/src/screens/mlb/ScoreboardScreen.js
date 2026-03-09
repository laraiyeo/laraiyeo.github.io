import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import { useFavorites } from "../../context/FavoritesContext";
import { MLBService } from "../../services/MLBService";
import { convertMLBIdToESPNId } from "../../utils/TeamIdMapping";
import { LiveViewerBadge } from "../../components/ViewerCounter";
import WBCService from "../../services/WBCService";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

// ─── Polling helpers ──────────────────────────────────────────────────────────

const INTERVAL_SLOW = 30 * 60 * 1000; // 30 minutes
const INTERVAL_FAST = 5 * 1000; // 5 seconds
const SOON_THRESHOLD = 5 * 60 * 1000; // 5 minutes before game time

/**
 * Returns desired polling interval (ms) or null if no polling needed.
 *  - FAST (5s) : any game is live, OR a scheduled game starts within 5 min
 *  - SLOW (30m): games exist but none are live/imminent
 *  - null      : no games
 */
const getPollingInterval = (groups) => {
  const allGames = groups.flatMap((g) => g.games);
  if (allGames.length === 0) return null;

  const now = Date.now();

  for (const game of allGames) {
    // Live game → fast
    if (game.isLive || game.statusType === "I") return INTERVAL_FAST;
    // Scheduled and starts within 5 min → fast
    const isScheduled =
      !game.isCompleted &&
      !game.isLive &&
      game.statusType !== "F" &&
      game.statusType !== "O" &&
      game.statusType !== "FT";
    if (isScheduled && game.date) {
      const msUntil = new Date(game.date).getTime() - now;
      if (msUntil >= 0 && msUntil <= SOON_THRESHOLD) return INTERVAL_FAST;
    }
  }
  return INTERVAL_SLOW;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getDatesForFilter = (filter) => {
  const today = new Date();
  if (filter === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { startDate: formatDate(d), endDate: formatDate(d) };
  }
  if (filter === "today") {
    return { startDate: formatDate(today), endDate: formatDate(today) };
  }
  // upcoming: tomorrow through tomorrow+6
  const start = new Date(today);
  start.setDate(today.getDate() + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

const formatTimeEST = (dateString) => {
  try {
    const date = new Date(dateString);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const parts = fmt.formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value || "";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    const ampm = parts.find((p) => p.type === "dayPeriod")?.value || "";
    return { time: `${hour}:${minute}`, ampm };
  } catch {
    return { time: "", ampm: "" };
  }
};

const formatDateGroupLabel = (dateString) => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

const groupGamesByDate = (events = []) => {
  const map = {};
  events.forEach((game) => {
    const d = new Date(game.date);
    const key = d.toDateString();
    if (!map[key]) {
      map[key] = {
        dateKey: key,
        dateTs: d.getTime(),
        label: formatDateGroupLabel(game.date),
        games: [],
      };
    }
    map[key].games.push(game);
  });
  return Object.values(map).sort((a, b) => a.dateTs - b.dateTs);
};

const getTeamAbbr = (team) => {
  if (!team) return "MLB";
  if (team.abbreviation) return team.abbreviation;
  return (
    team.shortDisplayName ||
    team.displayName?.substring(0, 3).toUpperCase() ||
    "MLB"
  );
};

// ─── BSO dot row ─────────────────────────────────────────────────────────────

const BSODots = ({ filled, total, filledColor, theme }) => (
  <View style={{ flexDirection: "row", gap: 3, justifyContent: "center" }}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: i < filled ? filledColor : "transparent",
          borderWidth: 1,
          borderColor: i < filled ? filledColor : theme.border,
        }}
      />
    ))}
  </View>
);

const LiveLinescoreStatus = ({
  inning,
  isTopInning,
  balls,
  strikes,
  outs,
  theme,
  colors,
}) => {
  const ordinal = MLBService.getOrdinalSuffix(inning || 0);
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: colors.primary,
          textAlign: "center",
        }}
      >
        {isTopInning ? "▲" : "▼"} {ordinal}
      </Text>
      <BSODots
        filled={balls ?? 0}
        total={4}
        filledColor={theme.success}
        theme={theme}
      />
      <BSODots
        filled={strikes ?? 0}
        total={3}
        filledColor={theme.warning}
        theme={theme}
      />
      <BSODots
        filled={outs ?? 0}
        total={3}
        filledColor={theme.error}
        theme={theme}
      />
    </View>
  );
};

// ─── Card gradient overlay (SVG) ─────────────────────────────────────────────

const CardGradient = ({
  gradId,
  awayColor,
  homeColor,
  fallbackColor,
  theme,
}) => {
  const top = awayColor || fallbackColor;
  const bot = homeColor || fallbackColor;
  return (
    <>
      <Svg
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        width="100%"
        height={48}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient
            id={`topGrad_${gradId}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <Stop offset="0%" stopColor={top} stopOpacity="0.18" />
            <Stop
              offset="100%"
              stopColor={theme.surfaceSecondary}
              stopOpacity="0"
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#topGrad_${gradId})`} />
      </Svg>
      <Svg
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        width="100%"
        height={48}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient
            id={`botGrad_${gradId}`}
            x1="0%"
            y1="100%"
            x2="0%"
            y2="0%"
          >
            <Stop offset="0%" stopColor={bot} stopOpacity="0.18" />
            <Stop
              offset="100%"
              stopColor={theme.surfaceSecondary}
              stopOpacity="0"
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#botGrad_${gradId})`} />
      </Svg>
    </>
  );
};

// ─── Grid-view constants ──────────────────────────────────────────────────────
const MLB_GRID_H_PAD = 16;
const MLB_GRID_GAP = 8;
const MLB_CARD_WIDTH = (width - MLB_GRID_H_PAD * 2 - MLB_GRID_GAP) / 2;

// ─── Grid left–right gradient ─────────────────────────────────────────────────
const MLBGridCardGradient = ({ gradId, awayColor, homeColor, fallbackColor }) => {
  const left = awayColor || fallbackColor;
  const right = homeColor || fallbackColor;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={`mgL_${gradId}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={left} stopOpacity="0.35" />
          <Stop offset="30%" stopColor={left} stopOpacity="0" />
          <Stop offset="70%" stopColor={right} stopOpacity="0" />
          <Stop offset="100%" stopColor={right} stopOpacity="0.35" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#mgL_${gradId})`} />
    </Svg>
  );
};

// ─── Individual MLB grid card ─────────────────────────────────────────────────
const MLBGridCard = ({ game, navigation, theme, colors, isDarkMode, isFavorite }) => {
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  const awayColor = away.color || MLBService.getTeamColor(away.displayName || "");
  const homeColor = home.color || MLBService.getTeamColor(home.displayName || "");
  const awayLogo = MLBService.getTeamLogo(away.id, isDarkMode) ||
    WBCService.getTeamLogo(away.id, isDarkMode);
  const homeLogo = MLBService.getTeamLogo(home.id, isDarkMode) ||
    WBCService.getTeamLogo(home.id, isDarkMode);
  const awayAbbr = (away.abbreviation ||
    MLBService.getTeamAbbrById(away.id) ||
    (away.displayName || "AWY").slice(0, 3)).toUpperCase();
  const homeAbbr = (home.abbreviation ||
    MLBService.getTeamAbbrById(home.id) ||
    (home.displayName || "HME").slice(0, 3)).toUpperCase();

  const { time, ampm } = formatTimeEST(game.date);
  const isLive = game.isLive || game.statusType === "I";
  const isFinished = !isLive &&
    (game.isCompleted || ["F", "O", "FT", "D", "C", "Q", "R", "FM"].includes(game.statusType));
  const isScheduled = !isLive && !isFinished;

  const awayScore = away.score;
  const homeScore = home.score;
  const awayWins =
    isFinished &&
    awayScore != null &&
    homeScore != null &&
    parseInt(awayScore, 10) > parseInt(homeScore, 10);
  const homeWins =
    isFinished &&
    awayScore != null &&
    homeScore != null &&
    parseInt(homeScore, 10) > parseInt(awayScore, 10);

  const awayFav = isFavorite(
    convertMLBIdToESPNId(away.id?.toString()) || away.id?.toString(), "mlb"
  );
  const homeFav = isFavorite(
    convertMLBIdToESPNId(home.id?.toString()) || home.id?.toString(), "mlb"
  );

  const gradId = `mg_${game.id}`;

  return (
    <TouchableOpacity
      style={[mlbGridStyles.card, { backgroundColor: theme.surfaceSecondary, width: MLB_CARD_WIDTH }]}
      onPress={() => navigation.navigate("GameDetails", { gamePk: game.id, sport: "mlb" })}
      activeOpacity={0.8}
    >
      <MLBGridCardGradient gradId={gradId} awayColor={awayColor} homeColor={homeColor} fallbackColor={colors.primary} />

      {/* Status / Time */}
      <View style={mlbGridStyles.cardTop}>
        {isLive ? (
          <Text style={[mlbGridStyles.statusLive, { color: colors.primary }]}>
            {game.inningState === "Top" ? "▲" : "▼"} {MLBService.getOrdinalSuffix(game.inning || 0)}
          </Text>
        ) : isFinished ? (
          <Text style={[mlbGridStyles.statusText, { color: theme.textSecondary }]} numberOfLines={1}>
            {(game.status || "Final").slice(0, 9)}
          </Text>
        ) : (
          <Text style={[mlbGridStyles.statusText, { color: theme.text }]} numberOfLines={1}>
            {time} <Text style={{ color: theme.textTertiary }}>{ampm}</Text>
          </Text>
        )}
        <LiveViewerBadge
          gameId={game.id}
          status={game.status}
          scale={0.7}
          style={mlbGridStyles.cardBadge}
        />
      </View>

      {/* Teams side by side */}
      <View style={mlbGridStyles.teamsRow}>
        {/* Away */}
        <View style={mlbGridStyles.teamSide}>
          {isScheduled ? (
            awayLogo ? (
              <Image source={{ uri: awayLogo }} style={mlbGridStyles.teamLogo} resizeMode="contain" />
            ) : (
              <View style={[mlbGridStyles.teamLogoPlaceholder, { backgroundColor: awayColor || colors.primary }]}>
                <Text style={mlbGridStyles.teamLogoPlaceholderText}>{(away.displayName || "A")[0]}</Text>
              </View>
            )
          ) : (
            <View style={mlbGridStyles.scoreCell}>
              <Text
                style={[
                  mlbGridStyles.scoreText,
                  {
                    color: awayFav ? colors.primary : awayWins ? colors.primary : theme.text,
                    fontWeight: awayWins ? "700" : "400",
                    opacity: isFinished && !awayWins ? 0.55 : 1,
                  },
                ]}
              >
                {awayScore ?? "—"}
              </Text>
              {awayLogo && (
                <Image source={{ uri: awayLogo }} style={mlbGridStyles.scoreLogoOverlay} resizeMode="contain" />
              )}
            </View>
          )}
          <Text style={[mlbGridStyles.teamAbbr, { color: awayFav ? colors.primary : theme.text }]}>
            {awayFav ? "★ " : ""}{awayAbbr}
          </Text>
          {away.record ? (
            <Text style={[mlbGridStyles.teamRecord, { color: theme.textSecondary }]}>{away.record}</Text>
          ) : null}
        </View>

        <View style={[mlbGridStyles.divider, { backgroundColor: theme.border }]} />

        {/* Home */}
        <View style={mlbGridStyles.teamSide}>
          {isScheduled ? (
            homeLogo ? (
              <Image source={{ uri: homeLogo }} style={mlbGridStyles.teamLogo} resizeMode="contain" />
            ) : (
              <View style={[mlbGridStyles.teamLogoPlaceholder, { backgroundColor: homeColor || colors.secondary }]}>
                <Text style={mlbGridStyles.teamLogoPlaceholderText}>{(home.displayName || "H")[0]}</Text>
              </View>
            )
          ) : (
            <View style={mlbGridStyles.scoreCell}>
              <Text
                style={[
                  mlbGridStyles.scoreText,
                  {
                    color: homeFav ? colors.primary : homeWins ? colors.primary : theme.text,
                    fontWeight: homeWins ? "700" : "400",
                    opacity: isFinished && !homeWins ? 0.55 : 1,
                  },
                ]}
              >
                {homeScore ?? "—"}
              </Text>
              {homeLogo && (
                <Image source={{ uri: homeLogo }} style={mlbGridStyles.scoreLogoOverlay} resizeMode="contain" />
              )}
            </View>
          )}
          <Text style={[mlbGridStyles.teamAbbr, { color: homeFav ? colors.primary : theme.text }]}>
            {homeFav ? "★ " : ""}{homeAbbr}
          </Text>
          {home.record ? (
            <Text style={[mlbGridStyles.teamRecord, { color: theme.textSecondary }]}>{home.record}</Text>
          ) : null}
        </View>
      </View>

      {/* Footer: venue or BSO */}
      <View style={[mlbGridStyles.cardFooter, { borderTopColor: theme.border }]}>
        {isLive ? (
          <View style={mlbGridStyles.bsoContainer}>
            {/* Top line: outs centered */}
            <View style={mlbGridStyles.bsoRow}>
              <BSODots filled={game.outs ?? 0} total={3} filledColor={theme.error} theme={theme} />
            </View>
            {/* Bottom line: balls + strikes */}
            <View style={mlbGridStyles.bsoRow}>
              <BSODots filled={game.balls ?? 0} total={4} filledColor={theme.success} theme={theme} />
              <View style={{ width: 15 }} />
              <BSODots filled={game.strikes ?? 0} total={3} filledColor={theme.warning} theme={theme} />
            </View>
          </View>
        ) : (
          <Text style={[mlbGridStyles.venueText, { color: theme.textSecondary }]} numberOfLines={1}>
            {game.venue || ""}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── MLB Grid section (floating bubble headers + 2-col cards) ─────────────────
const MLBGridSection = ({ groups, navigation, theme, colors, isDarkMode, isFavorite, activeFilter, collapsedGroups, toggleCollapse }) => (
  <View style={mlbGridStyles.container}>
    {groups.map((group) => (
      <View key={group.dateKey} style={mlbGridStyles.groupWrapper}>
        {/* Floating bubble group label */}
        <TouchableOpacity
          style={[mlbGridStyles.groupBubble, { backgroundColor: theme.surfaceSecondary }]}
          activeOpacity={activeFilter === "upcoming" ? 0.7 : 1}
          onPress={() => activeFilter === "upcoming" && toggleCollapse(group.dateKey)}
        >
          <Image
            source={require("../../../assets/mlb.png")}
            style={mlbGridStyles.groupBubbleLogo}
            resizeMode="contain"
          />
          <Text style={[mlbGridStyles.groupBubbleName, { color: theme.text }]} numberOfLines={1}>
            {group.label}
          </Text>
          <Text style={[mlbGridStyles.groupBubbleCount, { color: theme.textTertiary }]}>
            {" "}{group.games.length}
          </Text>
          {activeFilter === "upcoming" && (
            <Text style={[{ color: theme.textTertiary, marginLeft: 4, fontSize: 12 }]}>
              {collapsedGroups[group.dateKey] ? "▶" : "▼"}
            </Text>
          )}
        </TouchableOpacity>
        {/* 2-column card grid */}
        {(() => {
          const isCollapsed = activeFilter === "upcoming" && !!collapsedGroups[group.dateKey];
          const displayedGames = isCollapsed ? group.games.slice(0, 2) : group.games;
          return (
            <View style={mlbGridStyles.cardsRow}>
              {displayedGames.map((game) => (
                <MLBGridCard
                  key={game.id}
                  game={game}
                  navigation={navigation}
                  theme={theme}
                  colors={colors}
                  isDarkMode={isDarkMode}
                  isFavorite={isFavorite}
                />
              ))}
            </View>
          );
        })()}
      </View>
    ))}
  </View>
);

// ─── Scoreboard section ───────────────────────────────────────────────────────

const ScoreboardSection = ({
  groups,
  navigation,
  theme,
  isDarkMode,
  colors,
  isFavorite,
  getTeamLogoUrl,
  activeFilter,
  collapsedGroups,
  toggleCollapse,
}) => (
  <View style={styles.scoreboardContainer}>
    {groups.map((group, gIdx) => (
      <View
        key={group.dateKey}
        style={[
          styles.eventContainer,
          { backgroundColor: theme.surfaceSecondary },
        ]}
      >
        {/* Date header (tappable to collapse/expand when upcoming) */}
        <TouchableOpacity
          style={styles.eventHeaderContainer}
          activeOpacity={0.8}
          onPress={() => activeFilter === "upcoming" && toggleCollapse(group.dateKey)}
        >
          <View style={styles.eventLogoContainer}>
            <Image
              source={require("../../../assets/mlb.png")}
              style={styles.eventLogoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.eventInfo}>
            <Text
              style={[styles.eventName, { color: theme.text }]}
              numberOfLines={1}
            >
              {group.label}
            </Text>
            <Text style={[styles.eventSubLabel, { color: theme.textTertiary }]}> 
              MLB
            </Text>
          </View>
          <View style={styles.eventHeaderRight} pointerEvents="none">
            <Text style={[styles.eventCount, { color: theme.textTertiary }]}> {group.games.length} </Text>
            {activeFilter === "upcoming" && (
              <Text style={[styles.eventArrow, { color: theme.textTertiary }]}> {collapsedGroups[group.dateKey] ? "▶" : "▼"} </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Match rows */}
        <View style={styles.matchesList}>
          {(() => {
            const isCollapsed = activeFilter === "upcoming" && !!collapsedGroups[group.dateKey];
            const displayedGames = isCollapsed ? group.games.slice(0, 1) : group.games;
            return displayedGames.map((game, idx) => {
            const away = game.awayTeam || {};
            const home = game.homeTeam || {};
            const awayAbbr = getTeamAbbr(away);
            const homeAbbr = getTeamAbbr(home);
            const awayColor =
              away.color || MLBService.getTeamColor(away.displayName || "");
            const homeColor =
              home.color || MLBService.getTeamColor(home.displayName || "");
            // prefer the pre-computed logo from MLBService (built from full team name map)
            const awayLogo = WBCService.getTeamLogo(away?.id, isDarkMode);
            const homeLogo = WBCService.getTeamLogo(home?.id, isDarkMode);

            const isLive = game.isLive || game.statusType === "I";
            const isFinished =
              game.isCompleted ||
              ["S", "F", "O", "FT", "D", "C", "Q", "R", "FM"].includes(game.statusType);

            const inning = game.inning || 0;
            const show = inning !== 9;

            const awayScore = game.awayTeam?.score;
            const homeScore = game.homeTeam?.score;
            const awayWins =
              isFinished &&
              awayScore != null &&
              homeScore != null &&
              parseInt(awayScore) > parseInt(homeScore);
            const homeWins =
              isFinished &&
              awayScore != null &&
              homeScore != null &&
              parseInt(homeScore) > parseInt(awayScore);

            // Status column text (non-live only; live shows LiveLinescoreStatus)
            let statusLine1 = "";
            let statusLine2 = "";
            if (isFinished) {
              const { time, ampm } = formatTimeEST(game.date);
              statusLine1 = show ? `Final/${inning}` : "Final";
              statusLine2 = `${time} ${ampm}`;
            } else if (!isLive) {
              const { time, ampm } = formatTimeEST(game.date);
              statusLine1 = time;
              statusLine2 = ampm;
            }

            // Favorites
            const awayEspnId =
              convertMLBIdToESPNId(away.id?.toString()) || away.id?.toString();
            const homeEspnId =
              convertMLBIdToESPNId(home.id?.toString()) || home.id?.toString();
            const awayFav = isFavorite(awayEspnId, "mlb");
            const homeFav = isFavorite(homeEspnId, "mlb");

            return (
              <TouchableOpacity key={game.id || idx} style={styles.gameRow} 
                  onPress={() =>
                    navigation.navigate("GameDetails", {
                      gamePk: game.id,
                      sport: "mlb",
                    })
                  }>
                <CardGradient
                  gradId={`${gIdx}_${idx}`}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  fallbackColor={colors.primary}
                  theme={theme}
                />

                <View
                  style={styles.matchRow}
                >
                  {/* Status column */}
                  <View style={styles.statusContainer}>
                    {isLive ? (
                      <LiveLinescoreStatus
                        inning={game.inning}
                        isTopInning={game.inningState === "Top"}
                        balls={game.balls}
                        strikes={game.strikes}
                        outs={game.outs}
                        theme={theme}
                        colors={colors}
                      />
                    ) : (
                      <>
                        <Text
                          style={[
                            styles.statusLine1,
                            {
                              color: isFinished
                                ? theme.textSecondary
                                : theme.text,
                              fontWeight: "500",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {statusLine1}
                        </Text>
                        {!!statusLine2 && (
                          <Text
                            style={[
                              styles.statusLine2,
                              { color: theme.textTertiary },
                            ]}
                            numberOfLines={1}
                          >
                            {statusLine2}
                          </Text>
                        )}
                      </>
                    )}
                  </View>

                  {/* Stacked teams */}
                  <View style={styles.stackedTeams}>
                    {/* Away */}
                    <View style={styles.teamWithLogo}>
                      <View style={styles.teamLogoSmall}>
                        {awayLogo ? (
                          <Image
                            source={{ uri: awayLogo }}
                            style={styles.teamLogoSmallImg}
                            resizeMode="contain"
                          />
                        ) : (
                          <View
                            style={[
                              styles.teamLogoSmallImg,
                              {
                                backgroundColor: awayColor || colors.primary,
                                justifyContent: "center",
                                alignItems: "center",
                              },
                            ]}
                          >
                            <Text style={styles.teamLogoFallback}>
                              {awayAbbr.substring(0, 1)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.teamName,
                            {
                              color: awayFav ? colors.primary : theme.text,
                              fontWeight: awayWins ? "700" : "400",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {awayFav ? "★ " : ""}
                          {away.displayName || "Away"}
                        </Text>
                        {away.record ? (
                          <Text
                            style={[
                              styles.teamRecord,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {away.record}
                          </Text>
                        ) : null}
                      </View>
                      {(isLive || isFinished) && awayScore != null && (
                        <Text
                          style={[
                            styles.scoreText,
                            {
                              color: awayWins ? colors.primary : theme.text,
                              fontWeight: awayWins ? "700" : "400",
                              opacity: !awayWins && isFinished ? 0.55 : 1,
                            },
                          ]}
                        >
                          {awayScore}
                        </Text>
                      )}
                    </View>

                    {/* Home */}
                    <View style={styles.teamWithLogo}>
                      <View style={styles.teamLogoSmall}>
                        {homeLogo ? (
                          <Image
                            source={{ uri: homeLogo }}
                            style={styles.teamLogoSmallImg}
                            resizeMode="contain"
                          />
                        ) : (
                          <View
                            style={[
                              styles.teamLogoSmallImg,
                              {
                                backgroundColor: homeColor || colors.primary,
                                justifyContent: "center",
                                alignItems: "center",
                              },
                            ]}
                          >
                            <Text style={styles.teamLogoFallback}>
                              {homeAbbr.substring(0, 1)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.teamName,
                            {
                              color: homeFav ? colors.primary : theme.text,
                              fontWeight: homeWins ? "700" : "400",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {homeFav ? "★ " : ""}
                          {home.displayName || "Home"}
                        </Text>
                        {home.record ? (
                          <Text
                            style={[
                              styles.teamRecord,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {home.record}
                          </Text>
                        ) : null}
                      </View>
                      {(isLive || isFinished) && homeScore != null && (
                        <Text
                          style={[
                            styles.scoreText,
                            {
                              color: homeWins ? colors.primary : theme.text,
                              fontWeight: homeWins ? "700" : "400",
                              opacity: !homeWins && isFinished ? 0.55 : 1,
                            },
                          ]}
                        >
                          {homeScore}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* Footer: venue + live viewer badge */}
                <View
                  style={[styles.gameFooter, { borderTopColor: theme.border }]}
                >
                  <View style={styles.gameFooterLeft}>
                    {game.venue ? (
                      <Text
                        style={[styles.venue, { color: theme.textSecondary }]}
                      >
                        {game.venue}
                      </Text>
                    ) : null}
                    {game.notes1 || (game.notes && game.gameType !== "R") ? (
                      <Text
                        style={[
                          styles.broadcast,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {game.notes && game.notes1 ? `${game.notes} · ${game.notes1}` : game.notes1 || game.notes}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.gameFooterRight}>
                    <LiveViewerBadge
                      gameId={game.id}
                      status={game.status}
                      style={styles.viewerBadge}
                    />
                  </View>
                </View>

                {idx < group.games.length - 1 && (
                  <View
                    style={[
                      styles.matchSeparator,
                      { backgroundColor: theme.border },
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
            });
          })()}
        </View>
      </View>
    ))}
  </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────

const MLBScoreboardScreen = ({ navigation }) => {
  const { colors, theme, isDarkMode, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();

  const [groups, setGroups] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("today");
  const [isGridView, setIsGridView] = useState(false);

  // Persist grid/list preference
  useEffect(() => {
    AsyncStorage.getItem("viewMode_mlb").then((val) => {
      if (val !== null) setIsGridView(val === "grid");
    });
  }, []);

  const toggleViewMode = () => {
    setIsGridView((v) => {
      const next = !v;
      AsyncStorage.setItem("viewMode_mlb", next ? "grid" : "list");
      return next;
    });
  };

  const intervalRef = useRef(null);
  const currentIntervalMs = useRef(null);
  const isFocusedRef = useRef(false);
  const lastLoadedFilterRef = useRef(null);
  const fetchCacheRef = useRef({});
  const inFlightRef = useRef({});
  const IN_MEMORY_CACHE_MS = 10 * 1000; // 10s UI-level cache to avoid rapid refetches

  const loadData = useCallback(
    async (filter, silent = false, background = false) => {
      // UI-level dedupe: return cached groups if very recently loaded
      const now = Date.now();
      const cacheEntry = fetchCacheRef.current[filter];
      if (cacheEntry && now - cacheEntry.ts < IN_MEMORY_CACHE_MS) {
        // Use cached data, don't refetch
        setGroups(cacheEntry.groups);
        lastLoadedFilterRef.current = filter;
        return cacheEntry.groups;
      }

      // If there's an in-flight fetch for the same filter, reuse it
      if (inFlightRef.current[filter]) return inFlightRef.current[filter];

      const promise = (async () => {
        if (!silent) setLoading(true);
        else if (!background) setFetching(true);
        try {
          const { startDate, endDate } = getDatesForFilter(filter);
          const data = await MLBService.getScoreboard(startDate, endDate);

          let events = data?.events || [];

          // Sort: live → scheduled → finished, then by time within group
          const getStatusPriority = (game) => {
            if (game.isLive || game.statusType === "I") return 1;
            if (
              game.isCompleted ||
              ["S", "F", "O", "FT", "D", "C", "Q", "R", "FM"].includes(game.statusType)
            )
              return 3;
            return 2;
          };
          events = [...events].sort((a, b) => {
            const pa = getStatusPriority(a);
            const pb = getStatusPriority(b);
            if (pa !== pb) return pa - pb;
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          });

          const nextGroups = groupGamesByDate(events);
          setGroups(nextGroups);
          // Track last loaded filter to avoid unnecessary reloads on focus
          lastLoadedFilterRef.current = filter;
          // Cache results at UI level to prevent rapid repeated fetches
          fetchCacheRef.current[filter] = { groups: nextGroups, ts: Date.now() };

          // For upcoming filter, default groups to collapsed (unless user toggled before)
          if (filter === "upcoming") {
            setCollapsedGroups((prev) => {
              const map = { ...prev };
              nextGroups.forEach((g) => {
                if (map[g.dateKey] === undefined) map[g.dateKey] = true;
              });
              return map;
            });
          }

          return nextGroups;
        } catch (err) {
          console.error("MLB scoreboard fetch error:", err);
          setGroups([]);
          return [];
        } finally {
          setLoading(false);
          if (!background) setFetching(false);
        }
      })();

      inFlightRef.current[filter] = promise;
      try {
        const res = await promise;
        return res;
      } finally {
        delete inFlightRef.current[filter];
      }
    },
    [],
  );

  const toggleCollapse = (dateKey) =>
    setCollapsedGroups((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));

  const schedulePolling = useCallback(
    (filter, latestGroups) => {
      // Don't schedule if screen is not focused
      if (!isFocusedRef.current) return;

      // Only auto-poll for "today"
      if (filter !== "today") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
        return;
      }

      const desired = getPollingInterval(latestGroups);

      if (!desired) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
        return;
      }

      if (currentIntervalMs.current === desired && intervalRef.current) return;

      if (intervalRef.current) clearInterval(intervalRef.current);

      currentIntervalMs.current = desired;
      intervalRef.current = setInterval(async () => {
        const fresh = await loadData(filter, true, true);
        schedulePolling(filter, fresh);
      }, desired);
    },
    [loadData],
  );

  // Start/stop polling based on screen focus
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      // Only reload on focus when we don't have data or the filter changed.
      if (groups.length === 0 || lastLoadedFilterRef.current !== activeFilter) {
        loadData(activeFilter, false).then((fresh) =>
          schedulePolling(activeFilter, fresh),
        );
      } else {
        // We already have data for this filter — reattach polling without refetch.
        schedulePolling(activeFilter, groups);
      }

      return () => {
        // Stop polling immediately when screen loses focus
        isFocusedRef.current = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
      };
    }, [activeFilter, loadData, schedulePolling, groups]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    const fresh = await loadData(activeFilter, true);
    schedulePolling(activeFilter, fresh);
    setRefreshing(false);
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    loadData(filter, true).then((fresh) => schedulePolling(filter, fresh));
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading MLB Scoreboard…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            MLB Scoreboard
          </Text>
          <TouchableOpacity onPress={toggleViewMode} style={styles.gridToggleBtn}>
            <Ionicons
              name={isGridView ? "list-outline" : "grid-outline"}
              size={22}
              color={theme.text}
            />
          </TouchableOpacity>
        </View>

        {/* Section title + date filters */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Games
            </Text>
            {fetching && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>

          <View style={styles.filtersRow}>
            {["yesterday", "today", "upcoming"].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterButton,
                  {
                    backgroundColor:
                      activeFilter === filter
                        ? colors.primary
                        : theme.surfaceSecondary,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => handleFilterChange(filter)}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: activeFilter === filter ? "white" : theme.text,
                    },
                  ]}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Games or empty state */}
        <View style={{ opacity: fetching ? 0.45 : 1 }}>
          {groups.length > 0 ? (
            isGridView ? (
              <MLBGridSection
                groups={groups}
                navigation={navigation}
                theme={theme}
                colors={colors}
                isDarkMode={isDarkMode}
                isFavorite={isFavorite}
                activeFilter={activeFilter}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
              />
            ) : (
              <View style={styles.listContainer}>
                <ScoreboardSection
                  groups={groups}
                  navigation={navigation}
                  theme={theme}
                  colors={colors}
                  isDarkMode={isDarkMode}
                  isFavorite={isFavorite}
                  getTeamLogoUrl={getTeamLogoUrl}
                  activeFilter={activeFilter}
                  collapsedGroups={collapsedGroups}
                  toggleCollapse={toggleCollapse}
                />
              </View>
            )
          ) : (
            <View style={styles.emptyState}>
              <Text
                style={[styles.emptyStateText, { color: theme.textSecondary }]}
              >
                No games for {activeFilter}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    flex: 1,
  },
  gridToggleBtn: {
    padding: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  filtersRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: "center",
  },
  bottomPadding: { height: 32 },
  listContainer: {
    paddingHorizontal: 16,
  },
  scoreboardContainer: {
    marginBottom: 24,
  },
  eventContainer: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  eventHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  eventLogoContainer: {
    marginRight: 12,
  },
  eventLogoImage: {
    width: 50,
    height: 32,
  },
  eventHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    paddingRight: 5,
  },
  eventCount: {
    fontSize: 13.5,
  },
  eventArrow: {
    marginLeft: 2,
    fontSize: 16,
    fontWeight: "700",
  },
  eventInfo: { flex: 1 },
  eventName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  eventSubLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  matchesList: {},
  gameRow: {
    position: "relative",
    overflow: "hidden",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statusContainer: {
    width: 46,
    marginRight: 14,
    alignItems: "center",
  },
  statusLine1: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  statusLine2: {
    fontSize: 11,
    opacity: 0.7,
    textAlign: "center",
  },
  stackedTeams: { flex: 1 },
  teamWithLogo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamLogoSmall: {
    width: 35,
    height: 35,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  teamLogoSmallImg: {
    width: 35,
    height: 35,
    borderRadius: 3,
  },
  teamLogoFallback: {
    fontSize: 8,
    fontWeight: "bold",
    color: "white",
  },
  teamName: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  teamRecord: {
    fontSize: 11,
    marginTop: 1,
  },
  scoreText: {
    fontSize: 16,
    marginLeft: 8,
    minWidth: 22,
    textAlign: "right",
  },
  gameFooter: {
    marginTop: -8,
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gameFooterLeft: { flex: 1 },
  gameFooterRight: { alignItems: "flex-end" },
  viewerBadge: { marginTop: 2 },
  venue: {
    fontSize: 12,
    marginBottom: 2,
  },
  broadcast: {
    fontSize: 12,
    fontStyle: "italic",
  },
  matchSeparator: {
    height: 1,
    opacity: 0.3,
  },
});

// ─── MLB Grid-view styles ──────────────────────────────────────────────────────
const mlbGridStyles = StyleSheet.create({
  container: {
    paddingHorizontal: MLB_GRID_H_PAD,
    marginBottom: 24,
  },
  groupWrapper: {
    marginBottom: 16,
  },
  groupBubble: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  groupBubbleLogo: {
    width: 28,
    height: 18,
    marginRight: 6,
  },
  groupBubbleName: {
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 200,
  },
  groupBubbleCount: {
    marginLeft: 6,
    fontSize: 12,
  },
  cardsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: MLB_GRID_GAP,
  },
  card: {
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 2,
  },
  cardTop: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    minHeight: 30,
    justifyContent: "center",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  statusLive: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  teamsRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 10,
    alignItems: "flex-start",
  },
  teamSide: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: 4,
    opacity: 0.35,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginBottom: 5,
  },
  teamLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  teamLogoPlaceholderText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "white",
  },
  scoreCell: {
    width: 52,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
    position: "relative",
  },
  scoreText: {
    fontSize: 38,
    lineHeight: 50,
  },
  scoreLogoOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    opacity: 0.75,
  },
  teamAbbr: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
  },
  teamRecord: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 1,
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    minHeight: 30,
    justifyContent: "center",
  },
  venueText: {
    fontSize: 9,
    textAlign: "center",
  },
  bsoContainer: {
    alignItems: "center",
    gap: 3,
  },
  bsoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadge: {
    position: "absolute",
    top: 4,
    right: 4,
  },
});

export default MLBScoreboardScreen;
