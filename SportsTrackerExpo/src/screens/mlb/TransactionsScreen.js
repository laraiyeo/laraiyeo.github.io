import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";

const API_URL = "https://statsapi.mlb.com/api/v1/transactions";

const TransactionsScreen = ({ navigation }) => {
  const {
    theme,
    colors,
    isDarkMode,
    getTeamLogoUrl: getThemeTeamLogoUrl,
  } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cache, setCache] = useState({}); // cache pages

  const fetchPage = async () => {
    if (cache["last"]) return; // already cached
    setLoading(true);
    setError(null);
    try {
      const year = new Date().getFullYear();
      const res = await fetch(
        `${API_URL}?startDate=${year}-01-01&endDate=${year}-12-31&leagueId=104,103&order=desc&sortBy=date&limit=100&fields=transactions,fromTeam,id,name,toTeam,id,name,date,typeDesc,description`
      );
      const json = await res.json();
      setCache((c) => ({ ...c, ["last"]: json }));
    } catch (e) {
      console.error("Transactions fetch error", e);
      setError("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage();
  }, []);

  const data = cache["last"]?.transactions || [];

  // helper: get MLB team abbreviation mapping (copied from PlayerPageScreen)
  const getMLBTeamAbbreviation = (team) => {
    const teamMapping = {
      108: "LAA",
      117: "HOU",
      133: "OAK",
      141: "TOR",
      144: "ATL",
      158: "MIL",
      138: "STL",
      112: "CHC",
      109: "ARI",
      119: "LAD",
      137: "SF",
      114: "CLE",
      136: "SEA",
      146: "MIA",
      121: "NYM",
      120: "WSH",
      110: "BAL",
      135: "SD",
      143: "PHI",
      134: "PIT",
      140: "TEX",
      139: "TB",
      111: "BOS",
      113: "CIN",
      115: "COL",
      118: "KC",
      116: "DET",
      142: "MIN",
      145: "CWS",
      147: "NYY",
      11: "OAK",
    };
    if (!team) return "MLB";
    if (team.abbreviation) return team.abbreviation;
    const id = Number(team.id || team.teamId || team.team?.id);
    return (
      teamMapping[id] ||
      (team.name ? String(team.name).substring(0, 3).toUpperCase() : "MLB")
    );
  };

  const getTeamLogoUrl = (abbrev) => {
    if (!abbrev) return "https://via.placeholder.com/48x48?text=MLB";
    return getThemeTeamLogoUrl
      ? getThemeTeamLogoUrl("mlb", abbrev)
      : `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/${abbrev.toLowerCase()}.png&w=200&h=200`;
  };

  const renderItem = ({ item }) => {
    const d = new Date(item.date);
    const dateStr = `${d.toLocaleString("en-US", {
      month: "short",
    })} ${d.getDate()}, ${d.getFullYear()}`;
    const typeDesc = item.typeDescription || item.typeDesc || item.type || "";
    const toTeam = item.toTeam || item.to || null;
    const fromTeam = item.fromTeam || item.from || null;
    const toAbbr = getMLBTeamAbbreviation(toTeam);
    const fromAbbr = getMLBTeamAbbreviation(fromTeam);

    return (
      <View style={[styles.row, { borderBottomColor: theme.border }]}>
        <View style={styles.left}>
          <Text
            style={[styles.date, { color: theme.textSecondary }]}
            allowFontScaling={false}
          >
            {dateStr} - {typeDesc}
          </Text>
          <Text
            style={[styles.desc, { color: theme.text }]}
            allowFontScaling={false}
          >
            {item.description}
          </Text>
        </View>

        <View style={{ marginLeft: 8, width: 56, height: 56 }}>
          <Image source={{ uri: getTeamLogoUrl(toAbbr) }} style={styles.logo} />
          {fromAbbr ? (
            <Image
              source={{ uri: getTeamLogoUrl(fromAbbr) }}
              style={{
                position: "absolute",
                left: -6,
                top: -6,
                width: 27.5,
                height: 27.5,
              }}
            />
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.pager,
          { borderTopColor: theme.border, justifyContent: "center" },
        ]}
      >
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
          Last 100
        </Text>
      </View>

      {loading && !data.length ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={{ color: colors.primary, padding: 12 }}>{error}</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it, idx) => `${it.id || "last"}-${idx}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  left: { flex: 1, paddingRight: 8 },
  date: { fontSize: 12 },
  desc: { marginTop: 6, fontSize: 14 },
  logo: { width: 48, height: 48, marginLeft: 8, borderRadius: 6 },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  pagerBtn: { padding: 8 },
});

export default TransactionsScreen;
