import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper } from "../../services/ads";
import { useFavorites } from "../../context/FavoritesContext";
import { NFLService } from "../../services/NFLService";

// Helper to normalize API team info to what UI expects
const normalizeTeam = (entry) => {
  const team = entry.team || {};
  const stats = entry.stats || {};

  const statObj = stats;

  return {
    id: team.id?.toString() || undefined,
    abbreviation: team.abbreviation,
    displayName: team.displayName,
    shortDisplayName: team.shortDisplayName || team.displayName,
    logo: team.logo,
    seed: statObj.rank || statObj.seed || null,
    wins: statObj.wins || "0",
    losses: statObj.losses || "0",
    ties: statObj.ties || "0",
    winPercentage: statObj.winPercent || statObj.winPercentage || "0.000",
    pointsFor: statObj.pointsFor || statObj.pf || "0",
    pointsAgainst: statObj.pointsAgainst || statObj.pa || "0",
    differential: statObj.differential || statObj.diff || "0",
    streak: statObj.streak || "",
    conferenceName: team.conferenceName,
    divisionName: team.divisionName,
    clinchIndicator: team.clincher || null,
  };
};

const TeamLogo = ({ teamAbbreviation, size, style, iconStyle }) => {
  const { colors, getTeamLogoUrl } = useTheme();
  const [imageError, setImageError] = useState(false);

  const logoUri = getTeamLogoUrl("nfl", teamAbbreviation);

  if (!logoUri || imageError) {
    return (
      <Ionicons
        name="football"
        size={size}
        color={colors.primary}
        style={iconStyle}
      />
    );
  }

  return (
    <Image
      source={{ uri: logoUri }}
      style={style}
      onError={() => setImageError(true)}
    />
  );
};

const NFLStandingsScreen = () => {
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;
  const { isFavorite } = useFavorites();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [standings, setStandings] = useState(null);
  const [intervalId, setIntervalId] = useState(null);

  // NFL team abbreviation -> id mapping for navigation
  const abbrToIdMap = {
    buf: "2",
    mia: "15",
    ne: "17",
    nyj: "20",
    bal: "33",
    cin: "4",
    cle: "5",
    pit: "23",
    hou: "34",
    ind: "11",
    jax: "30",
    ten: "10",
    den: "7",
    kc: "12",
    lv: "13",
    lac: "24",
    dal: "6",
    nyg: "19",
    phi: "21",
    was: "28",
    chi: "3",
    det: "8",
    gb: "9",
    min: "16",
    atl: "1",
    car: "29",
    no: "18",
    tb: "27",
    ari: "22",
    lar: "14",
    sf: "25",
    sea: "26",
  };

  const mapAbbrToId = (abbr) => {
    if (!abbr) return null;
    return abbrToIdMap[String(abbr).toLowerCase()] || null;
  };

  useEffect(() => {
    let mounted = true;
    const load = async (silent = false) => {
      try {
        if (!silent && mounted) {
          setLoading(true);
        }

        const data = await NFLService.getStandings();
        if (!mounted) return;
        const formattedData = NFLService.formatStandingsForMobile(data);
        setStandings(formattedData);
      } catch (e) {
        console.error("Failed to load NFL standings", e);
      } finally {
        if (mounted && !silent) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
    };
  }, []);

  if (loading)
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  if (!standings)
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>No standings available</Text>
      </View>
    );

  // Team navigation function with proper ID handling
  const navigateToTeam = (team) => {
    const safeId = team.id || mapAbbrToId(team.abbreviation) || team;
    navigation.navigate("TeamPage", { teamId: safeId, sport: "nfl" });
  };

  // Helper function to get NFL team ID for favorites
  const getNFLTeamId = (team) => {
    return team?.id || mapAbbrToId(team?.abbreviation) || null;
  };

  // Helper to render a single team row
  const renderTeamRow = (entry, index) => {
    const team = normalizeTeam(entry);
    const teamId = getNFLTeamId(team);
    const isFav = teamId && isFavorite(teamId, "nfl");

    const diffValue = parseInt(team.differential);
    const diffFormatted =
      diffValue > 0 ? `${team.differential}` : team.differential;

    // Clinch indicator styling
    const clinchCode = team.clinchIndicator
      ? team.clinchIndicator.toUpperCase()
      : null;
    const clinchColor =
      clinchCode === "X"
        ? theme.success
        : clinchCode === "*"
          ? colors.primary
          : clinchCode === "Z"
            ? theme.warning
            : clinchCode === "E"
              ? theme.error
              : clinchCode === "Y"
                ? theme.info
                : null;

    return (
      <TouchableOpacity
        key={`${team.id || team.abbreviation}-${index}`}
        style={[
          styles.teamRow,
          { backgroundColor: theme.surface },
          clinchCode
            ? { borderLeftWidth: 4, borderLeftColor: clinchColor }
            : null,
        ]}
        onPress={() => navigateToTeam(team)}
        activeOpacity={0.7}
      >
        <View style={styles.teamRank}>
          <Text
            allowFontScaling={false}
            style={[styles.rankText, { color: theme.textSecondary }]}
          >
            {team.seed || index + 1}
          </Text>
        </View>

        <TeamLogo
          teamAbbreviation={team.abbreviation}
          size={28}
          style={styles.teamLogo}
          iconStyle={{ marginHorizontal: 8 }}
        />

        <View style={styles.teamInfo}>
          <View style={styles.teamNameContainer}>
            {isFav && (
              <Ionicons
                name="star"
                size={16}
                color={colors.primary}
                style={styles.favoriteIcon}
              />
            )}
            <Text
              allowFontScaling={false}
              style={[
                styles.teamName,
                { color: isFav ? colors.primary : theme.text },
              ]}
              numberOfLines={1}
            >
              {team.displayName}
            </Text>
          </View>
          <View style={styles.recordStreakContainer}>
            <Text
              allowFontScaling={false}
              style={[styles.teamRecord, { color: theme.textSecondary }]}
            >
              {team.wins}-{team.losses}
              {team.ties !== "0" ? `-${team.ties}` : ""} ({team.winPercentage})
            </Text>
            {team.streak && (
              <Text
                allowFontScaling={false}
                style={[
                  styles.teamStreak,
                  {
                    color:
                      team.streak.charAt(0) === "W"
                        ? theme.success
                        : team.streak.charAt(0) === "L"
                          ? theme.error
                          : theme.textSecondary,
                  },
                ]}
              >
                {team.streak}
              </Text>
            )}
          </View>
          <View style={styles.ppgContainer}>
            <Text
              allowFontScaling={false}
              style={[styles.ppgText, { color: theme.textSecondary }]}
            >
              PF: {team.pointsFor} | PA: {team.pointsAgainst} |
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.diffText,
                {
                  color:
                    diffValue > 0
                      ? theme.success
                      : diffValue < 0
                        ? theme.error
                        : theme.textSecondary,
                },
              ]}
            >
              &nbsp;{diffFormatted}
            </Text>
          </View>
        </View>

        <View style={styles.teamStats}>
          {team.clinchIndicator && (
            <Text
              allowFontScaling={false}
              style={[styles.clinchText, { color: clinchColor }]}
            >
              {team.clinchIndicator}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Helper to render a division section
  const renderDivision = (
    divisionName,
    teams,
    conferenceIndex,
    divisionIndex,
  ) => {
    if (!teams || teams.length === 0) return null;

    return (
      <View
        key={`${conferenceIndex}-${divisionIndex}`}
        style={styles.divisionContainer}
      >
        {divisionName !== "teams" && (
          <View
            style={[styles.divisionHeader, { backgroundColor: theme.surface }]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.divisionTitle, { color: theme.text }]}
            >
              {divisionName}
            </Text>
          </View>
        )}
        {teams.map((teamEntry, teamIndex) =>
          renderTeamRow(teamEntry, teamIndex),
        )}
      </View>
    );
  };

  // Helper to render a conference
  const renderConference = (conferenceName, divisions, conferenceIndex) => {
    return (
      <View key={conferenceIndex} style={styles.conferenceContainer}>
        <View
          style={[styles.conferenceHeader, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.conferenceTitle}>
            {conferenceName}
          </Text>
        </View>
        {Object.entries(divisions).map(([divisionName, teams], divisionIndex) =>
          renderDivision(divisionName, teams, conferenceIndex, divisionIndex),
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isPro ? 16 : 16 + AD_SPACE },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {Object.entries(standings).map(
          ([conferenceName, divisions], conferenceIndex) =>
            renderConference(conferenceName, divisions, conferenceIndex),
        )}

        {/* Legend for clinch colors */}
        <View
          style={[
            styles.legendContainer,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.legendTitle, { color: colors.primary }]}
          >
            Legend
          </Text>
          <View style={styles.legendItems}>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendSwatch,
                  { backgroundColor: colors.primary },
                ]}
              />
              <Text
                allowFontScaling={false}
                style={[styles.legendLabel, { color: theme.text }]}
              >
                * - Clinched Division and Home Field
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendSwatch,
                  { backgroundColor: theme.success },
                ]}
              />
              <Text
                allowFontScaling={false}
                style={[styles.legendLabel, { color: theme.text }]}
              >
                X - Clinched Playoffs
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendSwatch,
                  { backgroundColor: theme.warning },
                ]}
              />
              <Text
                allowFontScaling={false}
                style={[styles.legendLabel, { color: theme.text }]}
              >
                Z - Clinched Division
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendSwatch, { backgroundColor: theme.info }]}
              />
              <Text
                allowFontScaling={false}
                style={[styles.legendLabel, { color: theme.text }]}
              >
                Y - Clinched Wild Card
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendSwatch, { backgroundColor: theme.error }]}
              />
              <Text
                allowFontScaling={false}
                style={[styles.legendLabel, { color: theme.text }]}
              >
                E - Eliminated
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: 16,
  },
  conferenceContainer: {
    marginBottom: 24,
  },
  conferenceHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  conferenceTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  divisionContainer: {
    marginBottom: 16,
  },
  divisionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginBottom: 4,
  },
  divisionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 2,
    borderRadius: 8,
  },
  teamRank: {
    width: 30,
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
  },
  teamNameContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamName: {
    fontSize: 16,
    fontWeight: "600",
  },
  favoriteIcon: {
    marginRight: 6,
  },
  recordStreakContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  teamRecord: {
    fontSize: 12,
    marginRight: 8,
  },
  teamStreak: {
    fontSize: 12,
    fontWeight: "600",
  },
  ppgContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  ppgText: {
    fontSize: 11,
  },
  diffText: {
    fontSize: 11,
    fontWeight: "600",
  },
  teamStats: {
    alignItems: "flex-end",
    minWidth: 40,
  },
  clinchText: {
    fontSize: 14,
    fontWeight: "700",
  },
  legendContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  legendItems: {
    flexDirection: "column",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  legendSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
  },
  legendLabel: {
    fontSize: 12,
  },
});

export default NFLStandingsScreen;
