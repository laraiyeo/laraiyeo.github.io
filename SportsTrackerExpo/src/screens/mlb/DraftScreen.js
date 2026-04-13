import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useTheme } from "../../context/ThemeContext";

const API_URL = "https://statsapi.mlb.com/api/v1/draft";

const DraftScreen = () => {
  const {
    theme,
    colors,
    isDarkMode,
    getTeamLogoUrl: getThemeTeamLogoUrl,
  } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedRound, setSelectedRound] = useState(null);

  const season = new Date().getFullYear();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const fields =
        "drafts,rounds,round,picks,person,currentAge,fullName,firstName,lastName,height,weight,primaryPosition,name,pickNumber,roundPickNumber,school,name,schoolClass,team,name,id,batSide,description,pitchHand,description,signingBonus";
      const res = await fetch(
        `${API_URL}/${season}?fields=${encodeURIComponent(fields)}`
      );
      const json = await res.json();
      setData(json);
      // default to first numeric round if available
      const numericRounds = (json?.drafts?.rounds || [])
        .map((r) => r.round)
        .filter((rr) => /^\d+$/.test(String(rr)));
      if (numericRounds && numericRounds.length)
        setSelectedRound(numericRounds[0]);
      else if (json?.drafts?.rounds && json.drafts.rounds.length)
        setSelectedRound(json.drafts.rounds[0].round);
    } catch (e) {
      console.error("Draft fetch error", e);
      setError("Failed to load draft");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const rounds = useMemo(() => {
    if (!data) return [];
    const r = data?.drafts?.rounds || [];
    return r
      .map((rr) => rr.round)
      .filter((rr) => /^\d+$/.test(String(rr)))
      .sort((a, b) => Number(a) - Number(b));
  }, [data]);

  const picksForRound = useMemo(() => {
    if (!data || !selectedRound) return [];
    const roundsArr = data?.drafts?.rounds || [];
    const roundObj = roundsArr.find(
      (r) => String(r.round) === String(selectedRound)
    );
    if (!roundObj) return [];
    const picks = roundObj.picks || [];
    return picks
      .slice()
      .sort((a, b) => Number(a.pickNumber || 0) - Number(b.pickNumber || 0));
  }, [data, selectedRound]);
  // hooks must be unconditional — declare them before any early returns
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (overall) => {
    setExpanded((s) => ({ ...s, [overall]: !s[overall] }));
  };

  // helper lookups
  const positionsMap = useMemo(() => {
    const m = {};
    (data?.positions || []).forEach((p) => {
      m[String(p.id)] = p;
    });
    return m;
  }, [data]);

  const teamsMap = useMemo(() => {
    const m = {};
    (data?.teams || []).forEach((t) => {
      m[String(t.id)] = t;
    });
    return m;
  }, [data]);

  // Helper: team ID -> abbreviation (copied from PlayerPageScreen mappings)
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

  // getTeamColor (copied from TeamPageScreen)
  const getTeamColor = (abbreviation) => {
    const normalizedAbbr = abbreviation === "AZ" ? "ARI" : abbreviation;
    const lightModeColors = {
      LAA: "#BA0021",
      HOU: "#002D62",
      OAK: "#003831",
      TOR: "#134A8E",
      ATL: "#CE1141",
      MIL: "#FFC52F",
      STL: "#C41E3A",
      CHC: "#0E3386",
      ARI: "#A71930",
      LAD: "#005A9C",
      SF: "#FD5A1E",
      CLE: "#E31937",
      SEA: "#C4CED4",
      MIA: "#00A3E0",
      NYM: "#002D72",
      WSH: "#AB0003",
      BAL: "#DF4601",
      SD: "#2F241D",
      PHI: "#E81828",
      PIT: "#FDB827",
      TEX: "#C0111F",
      TB: "#092C5C",
      BOS: "#BD3039",
      CIN: "#C6011F",
      COL: "#33006F",
      KC: "#004687",
      DET: "#0C2340",
      MIN: "#002B5C",
      CWS: "#27251F",
      NYY: "#132448",
    };
    const darkModeColors = {
      LAA: "#FF3366",
      HOU: "#4A90E2",
      OAK: "#00B359",
      TOR: "#4A7BC8",
      ATL: "#FF4466",
      MIL: "#FFD700",
      STL: "#FF4466",
      CHC: "#4A7BC8",
      ARI: "#FF4466",
      LAD: "#4A90E2",
      SF: "#FF8C42",
      CLE: "#FF4466",
      SEA: "#7FB3D3",
      MIA: "#42C5F0",
      NYM: "#4A7BC8",
      WSH: "#FF3344",
      BAL: "#FF7A33",
      SD: "#8B4513",
      PHI: "#FF4466",
      PIT: "#FFD700",
      TEX: "#FF3344",
      TB: "#4A7BC8",
      BOS: "#FF4466",
      CIN: "#FF3344",
      COL: "#8A2BE2",
      KC: "#4A90E2",
      DET: "#4A7BC8",
      MIN: "#4A7BC8",
      CWS: "#666666",
      NYY: "#4A7BC8",
    };
    const colorMap = isDarkMode ? darkModeColors : lightModeColors;
    return colorMap[normalizedAbbr] || colors.primary;
  };

  const getTeamLogoUrl = (abbrev) => {
    if (!abbrev) return "https://via.placeholder.com/40x40?text=MLB";
    return getThemeTeamLogoUrl
      ? getThemeTeamLogoUrl("mlb", abbrev)
      : `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/${abbrev.toLowerCase()}.png&w=200&h=200`;
  };

  if (loading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );

  if (error)
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, padding: 12 }}>
        <Text style={{ color: colors.primary }}>{error}</Text>
      </View>
    );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.roundsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.roundsScroll,
            { alignItems: "center" },
          ]}
        >
          {rounds.map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setSelectedRound(r)}
              style={[
                styles.roundBtn,
                selectedRound === r && { backgroundColor: colors.secondary },
              ]}
            >
              <Text
                style={[
                  styles.roundBtnText,
                  { color: selectedRound === r ? "#fff" : theme.text },
                ]}
              >{`Round ${r}`}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={picksForRound}
        keyExtractor={(it, idx) => `${it.overall}-${idx}`}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          // MLB draft pick item format (from MLB API)
          const overall =
            item.pickNumber || item.roundPickNumber || item.pickNumber;
          const person = item.person || {};
          const athleteName =
            person.fullName ||
            `${person.firstName || ""} ${person.lastName || ""}`.trim();
          const pos = person.primaryPosition?.name || "";
          const teamObj = item.team || {};
          const teamAbbr = getMLBTeamAbbreviation(teamObj);

          // headshot fallback: MLB rookies often don't have headshots — show initials circle with team color
          const headshot = person.headshot?.href || null;
          const initials =
            (
              (person.firstName || "").charAt(0) +
              (person.lastName || "").charAt(0)
            ).toUpperCase() ||
            (person.fullName || "")
              .split(" ")
              .map((s) => s.charAt(0))
              .slice(0, 2)
              .join("")
              .toUpperCase();

          const weight = person.weight || person.weight || "";
          const height = person.height || "";
          const age = person.currentAge || "";
          const schoolClass = item.school.schoolClass || "";
          const signingBonusRaw =
            item.signingBonus || item.signingBonusAmount || null;

          const formatSigning = (s) => {
            if (s === null || s === undefined || s === "") return "No Bonus";
            const cleaned = String(s).replace(/[^0-9.-]+/g, "");
            const n = Number(cleaned);
            if (!n || isNaN(n) || n <= 0) return "No Bonus";
            if (n >= 1000000) {
              const m = n / 1000000;
              const formatted =
                m >= 10 ? Math.round(m) : Math.round(m * 10) / 10;
              return `$${formatted}M`;
            }
            if (n >= 1000) {
              const k = Math.round(n / 1000);
              return `$${k}K`;
            }
            return `$${n}`;
          };

          const handLabel =
            pos && /pitcher/i.test(pos)
              ? person.pitchHand?.description || ""
              : person.batSide?.description || "";

          return (
            <View style={{ marginBottom: 8 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => toggleExpand(overall)}
                style={[styles.pickRow, { borderBottomColor: theme.border }]}
              >
                <View style={styles.pickLeft}>
                  <Text style={[styles.pickNum, { color: theme.text }]}>
                    {item.roundPickNumber || item.pickNumber || overall}
                    <Text style={{ color: theme.textSecondary }}>
                      {" ("}
                      {overall}
                      {")"}
                    </Text>
                  </Text>
                </View>

                <View
                  style={{
                    width: 48,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {headshot ? (
                    <Image cachePolicy="memory-disk"
                      source={{ uri: headshot }}
                      style={styles.headshotSmall}
                    />
                  ) : (
                    <View
                      style={[
                        styles.headshotSmall,
                        {
                          backgroundColor: getTeamColor(teamAbbr),
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700" }}>
                        {initials}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.pickMain}>
                  <View style={styles.nameRow}>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>
                      {athleteName}
                    </Text>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        marginLeft: 8,
                        fontSize: 13,
                      }}
                    >
                      {pos}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 6,
                    }}
                  >
                    {teamAbbr && (
                      <>
                        <Image cachePolicy="memory-disk"
                          source={{ uri: getTeamLogoUrl(teamAbbr) }}
                          style={styles.teamLogoLarge}
                        />
                        <Text
                          style={{ color: theme.textSecondary, marginLeft: 8 }}
                        >
                          {teamObj.name || teamAbbr}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              {expanded[overall] &&
                (() => {
                  const boxes = [
                    { value: age || "—", label: "AGE" },
                    { value: height || "—", label: "HT" },
                    { value: weight || "—", label: "WT" },
                    { value: schoolClass || "—", label: "CLASS" },
                  ];

                  const signing = formatSigning(signingBonusRaw);

                  return (
                    <View
                      style={[
                        styles.expandContainer,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          borderWidth: 1,
                          borderTopWidth: 0,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View style={styles.expandArrowRow}>
                        <Text style={{ color: theme.text, fontWeight: "600" }}>
                          {item.school.name || ""}
                        </Text>
                        <Text
                          style={{
                            color: theme.text,
                            marginHorizontal: 12,
                            fontSize: 16,
                          }}
                        >
                          {"→"}
                        </Text>
                        <Text style={{ color: theme.text, fontWeight: "600" }}>
                          {item.team.name || ""}
                        </Text>
                      </View>

                      <View style={styles.expandBottomRow}>
                        <View style={styles.leftBoxes}>
                          {boxes.map((b, idx) => (
                            <View
                              key={idx}
                              style={[
                                styles.boxCell,
                                idx === 0 || idx === 2
                                  ? { marginHorizontal: 6 }
                                  : { marginHorizontal: 0 },
                              ]}
                            >
                              <Text
                                style={[styles.boxValue, { color: theme.text }]}
                              >
                                {b.value}
                              </Text>
                              <Text
                                style={[
                                  styles.boxLabel,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {b.label}
                              </Text>
                            </View>
                          ))}
                        </View>

                        <View
                          style={[
                            styles.divider,
                            {
                              backgroundColor: theme.border,
                              alignSelf: "stretch",
                            },
                          ]}
                        />

                        <View style={styles.tradeColumn}>
                          <Text
                            style={{
                              color: theme.text,
                              textAlign: "center",
                              fontSize: 18,
                              fontWeight: "700",
                            }}
                          >
                            {signing}
                          </Text>
                          <Text
                            style={{
                              color: theme.textSecondary,
                              textAlign: "center",
                              marginTop: 8,
                            }}
                          >
                            {handLabel}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}
            </View>
          );
        }}
        ListEmptyComponent={() => (
          <Text style={{ color: theme.textSecondary, padding: 12 }}>
            No picks for this round.
          </Text>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  roundsRow: { flexDirection: "row", padding: 12, flexWrap: "wrap" },
  roundsContainer: { paddingVertical: 8, minHeight: 56 },
  roundsScroll: { paddingHorizontal: 12 },
  roundBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.04)",
  },
  roundBtnText: { fontSize: 14, lineHeight: 18 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickLeft: { width: 64, alignItems: "center", justifyContent: "center" },
  pickNum: { fontWeight: "700", fontSize: 14 },
  rankRow: { flexDirection: "row", marginTop: 6 },
  smallBox: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  smallBoxText: { fontSize: 12, fontWeight: "700" },
  headshotSmall: { width: 40, height: 40, borderRadius: 20 },
  pickMain: { flex: 1, paddingLeft: 12 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  teamLogoLarge: { width: 20, height: 20, borderRadius: 3 },

  expandContainer: { marginTop: 6, borderRadius: 8, overflow: "hidden" },
  expandArrowRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  expandInfoRow: { flexDirection: "row", padding: 8 },
  infoColumn: { flex: 1 },
  tradeColumn: { width: 160, paddingLeft: 12, justifyContent: "center" },
  infoBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.04)",
    marginRight: 8,
    marginBottom: 8,
  },
  infoText: { fontWeight: "700" },
  leftBoxes: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  boxCell: {
    width: "46%",
    padding: 10,
    marginBottom: 8,
    marginHorizontal: 6,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
  },
  boxValue: { fontWeight: "700", fontSize: 14 },
  boxLabel: { fontSize: 12, marginTop: 6 },
  divider: {
    width: 1,
    backgroundColor: "rgba(0, 0, 0, 0.88)",
    marginHorizontal: 12,
  },
  expandBottomRow: { flexDirection: "row", padding: 12, alignItems: "center" },
  expandBottomRowNoTrade: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
  },
  boxInline: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  rankText: { fontSize: 12, fontWeight: "700" },
});

export default DraftScreen;
