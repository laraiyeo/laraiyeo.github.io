import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import WBCService from "../../services/WBCService";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper } from "../../services/ads";

// Expected-record helper: find the xWinLoss entry
const getXR = (teamRecord) => {
  const xwl = teamRecord.records?.expectedRecords?.find(
    (r) => r.type === "xWinLoss",
  );
  if (!xwl) return null;
  return `${xwl.wins}-${xwl.losses}`;
};

// ─── Team row ─────────────────────────────────────────────────────────────────
const TeamRow = ({ teamRecord, isDarkMode, theme, route, navigation }) => {
  const {
    team,
    streak,
    divisionRank,
    leagueGamesBack,
    wins,
    losses,
    runsScored,
    runsAllowed,
  } = teamRecord;

  const teamColor = WBCService.getTeamColor(team.id);
  const logoUri = WBCService.getTeamLogo(team.id, isDarkMode);
  const xr = getXR(teamRecord);
  const streakCode = streak?.streakCode ?? "";
  const gb = leagueGamesBack === "-" ? "—" : leagueGamesBack;
  const runDiff = runsScored - runsAllowed;

  return (
    <TouchableOpacity
      style={[
        styles.teamRow,
        { backgroundColor: theme.surface },
        teamColor ? { borderLeftColor: teamColor, borderLeftWidth: 3 } : null,
      ]}
      onPress={() => {
        navigation.navigate("TeamPage", {
          teamId: team.id,
          teamName: team.name,
          sport: "wbc",
        });
      }}
      activeOpacity={0.7}
    >
      {/* Rank */}
      <View style={styles.rankCol}>
        <Text style={[styles.rankText, { color: theme.textSecondary }]}>
          {divisionRank}
        </Text>
      </View>

      {/* Logo */}
      {logoUri ? (
        <Image
          source={{ uri: logoUri }}
          style={styles.teamLogo}
          resizeMode="contain"
        />
      ) : (
        <View
          style={[
            styles.teamLogoPlaceholder,
            { backgroundColor: theme.border },
          ]}
        >
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 9,
              fontWeight: "700",
            }}
          >
            {team.name.slice(0, 3).toUpperCase()}
          </Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.teamInfo}>
        <Text
          style={[styles.teamName, { color: theme.text }]}
          numberOfLines={1}
        >
          {team.name}
        </Text>
        <View style={styles.recordRow}>
          <Text style={[styles.recordText, { color: theme.textSecondary }]}>
            {wins}-{losses} {xr ? `(xWL: ${xr})` : ""}
          </Text>
          {!!streakCode && (
            <Text
              style={[
                styles.streakText,
                {
                  color: streakCode.startsWith("W")
                    ? theme.success
                    : streakCode.startsWith("L")
                      ? theme.error
                      : theme.textSecondary,
                },
              ]}
            >
              {streakCode}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.xrText, { color: theme.textSecondary }]}>
            RS: {runsScored} | RA: {runsAllowed} |
            <Text
              style={[
                {
                  color:
                    runDiff > 0
                      ? theme.success
                      : runDiff < 0
                        ? theme.error
                        : theme.textSecondary,
                },
              ]}
            >
              &nbsp;{runDiff > 0 ? `+${runDiff}` : runDiff < 0 ? runDiff : ""}
            </Text>
          </Text>
        </View>
      </View>

      {/* GB */}
      <View style={styles.rightCol}>
        <Text style={[styles.gbValue, { color: theme.textSecondary }]}>
          {gb}
        </Text>
        <Text style={[styles.gbLabel, { color: theme.textSecondary }]}>GB</Text>
      </View>
    </TouchableOpacity>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────
const WBCStandingsScreen = ({ route, navigation }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;
  const [selectedLeague, setSelectedLeague] = useState("WBC");
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const loadStandings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setStandings(null);
    try {
      const leagueId = selectedLeague === "WBC" ? 160 : 159;
      const res = await WBCService.getStandings(leagueId);

      // Handle "no standings" API message
      if (res?.message) {
        setMessage(res.message);
        return;
      }

      const records = res?.data?.records ?? res?.records ?? [];
      if (!records.length) {
        setMessage("No standings found");
        return;
      }
      setStandings(records);
    } catch (e) {
      console.error("WBC standings error:", e);
      setMessage("Failed to load standings");
    } finally {
      setLoading(false);
    }
  }, [selectedLeague]);

  useEffect(() => {
    loadStandings();
  }, [loadStandings]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── League selector (same pill style as StatsScreen) ── */}
      <View
        style={[
          styles.tabSelector,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {["WBC", "WBCQ"].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabButton,
              {
                backgroundColor:
                  selectedLeague === tab ? colors.primary : "transparent",
                borderColor: colors.primary,
              },
            ]}
            onPress={() => setSelectedLeague(tab)}
            activeOpacity={0.75}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.tabButtonText,
                { color: selectedLeague === tab ? "#fff" : colors.primary },
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Loading ── */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* ── No data / error message ── */}
      {!loading && !!message && (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {message}
          </Text>
        </View>
      )}

      {/* ── Standings list ── */}
      {!loading && standings && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: isPro ? 32 : 32 + AD_SPACE },
          ]}
        >
          {standings.map((record, divIdx) => (
            <View key={divIdx} style={styles.divisionContainer}>
              {/* Division header */}
              <View
                style={[
                  styles.divisionHeader,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.divisionTitle}>
                  {record.division?.name}
                </Text>
              </View>

              {/* Team rows */}
              {(record.teamRecords ?? []).map((tr, i) => (
                <TeamRow
                  key={`${tr.team?.id}-${i}`}
                  teamRecord={tr}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  route={route}
                  navigation={navigation}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
      {!isPro && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
          }}
        >
          <BannerAdWrapper />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },

  // ── Tab selector (mirrors StatsScreen) ──
  tabSelector: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 40,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 60,
    alignItems: "center",
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },

  scrollContent: {
    paddingVertical: 8,
    paddingBottom: 32,
  },

  // ── Division ──
  divisionContainer: {
    marginBottom: 16,
  },
  divisionHeader: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  divisionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },

  // ── Team row ──
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 10,
    marginHorizontal: 12,
    marginBottom: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  rankCol: {
    width: 22,
    marginRight: 8,
    alignItems: "center",
  },
  rankText: {
    fontSize: 13,
    fontWeight: "600",
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginRight: 10,
  },
  teamLogoPlaceholder: {
    width: 32,
    height: 32,
    marginRight: 10,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 15,
    fontWeight: "600",
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  recordText: {
    fontSize: 12,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "600",
  },
  xrText: {
    fontSize: 11,
    marginTop: 2,
  },
  rightCol: {
    alignItems: "flex-end",
    minWidth: 44,
  },
  gbValue: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  gbLabel: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 1,
  },
});

export default WBCStandingsScreen;
