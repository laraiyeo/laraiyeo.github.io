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
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper } from "../../services/ads";
import { useFavorites } from "../../context/FavoritesContext";
import { convertMLBIdToESPNId } from "../../utils/TeamIdMapping";
import { MLBService } from "../../services/MLBService";

// Fallback division name map
const DIVISION_NAMES = {
  200: "American League West",
  201: "American League East",
  202: "American League Central",
  203: "National League West",
  204: "National League East",
  205: "National League Central",
};

// Display order: AL divisions first, then NL
const DIVISION_ORDER = [201, 202, 200, 204, 205, 203];

const AL_DIVISIONS = [200, 201, 202];
const NL_DIVISIONS = [203, 204, 205];

// MLB team ID → ESPN abbreviation
const MLB_TEAM_ID_TO_ABBR = {
  108: "LAA",
  117: "HOU",
  133: "ATH",
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
  11: "ATH",
};

// Sort-by options — `source` tells us which records array to look in
const SORT_OPTIONS = [
  { label: "Home Record", type: "home", source: "splitRecords" },
  { label: "Away Record", type: "away", source: "splitRecords" },
  { label: "Last Ten", type: "lastTen", source: "splitRecords" },
  { label: "Extra Innings", type: "extraInning", source: "splitRecords" },
  { label: "One Run", type: "oneRun", source: "splitRecords" },
  { label: "Expected Record", type: "xWinLossSeason", source: "expectedRecords" },
];

// Shorten "American League" → "AL", "National League" → "NL" in division names
const abbrevLeagueName = (name = "") =>
  name.replace("American League", "AL").replace("National League", "NL");

// Look up a record from either splitRecords or expectedRecords
const getRecordForSort = (teamRecord, sortOption) => {
  if (!sortOption) return null;
  const arr = teamRecord?.records?.[sortOption.source] ?? [];
  return arr.find((r) => r.type === sortOption.type) ?? null;
};

// Win-pct string ".xxx"
const calcPct = (w, l) => {
  const total = (w ?? 0) + (l ?? 0);
  return total > 0 ? ((w ?? 0) / total).toFixed(3).replace(/^0/, "") : ".000";
};

// ─── Division records sub-row ─────────────────────────────────────────────────
const DivisionRecordsRow = ({ divRecords, theme }) => {
  if (!divRecords || divRecords.length === 0) return null;
  const shown = divRecords.slice(0, 3);
  return (
    <View style={styles.divRecordsRow}>
      {shown.map((dr, i) => (
        <View key={i} style={styles.divRecordItem}>
          <Text style={[styles.divRecordValue, { color: theme.text }]}>
            {dr.wins ?? 0}-{dr.losses ?? 0}
          </Text>
          <Text style={[styles.divRecordLabel, { color: theme.textSecondary }]}>
            {abbrevLeagueName(dr.division?.name ?? "")}
          </Text>
        </View>
      ))}
    </View>
  );
};

// ─── Team row ─────────────────────────────────────────────────────────────────
const TeamRow = ({
  teamRecord,
  theme,
  colors,
  isFav,
  onPress,
  getTeamLogoUrl,
  rank,
  sortByOpt,
  showDivRecords,
}) => {
  const {
    team,
    streak,
    divisionRank,
    leagueGamesBack,
    wins,
    losses,
    runsScored,
    runsAllowed,
    clinchIndicator,
  } = teamRecord;

  const abbr = MLB_TEAM_ID_TO_ABBR[team?.id] ?? team?.abbreviation ?? "";
  const streakCode = streak?.streakCode ?? "";
  const gb = leagueGamesBack === "-" ? "—" : (leagueGamesBack ?? "—");
  const runDiff = (runsScored ?? 0) - (runsAllowed ?? 0);
  const pct = calcPct(wins, losses);

  const GP = wins + losses;

  // Record for sort mode (handles both splitRecords and expectedRecords)
  const split = sortByOpt ? getRecordForSort(teamRecord, sortByOpt) : null;
  const splitW = split?.wins ?? 0;
  const splitL = split?.losses ?? 0;
  const splitPct = calcPct(splitW, splitL);

  const displayRank = rank ?? divisionRank;

  // Clinch border color
  const clinchColor =
    clinchIndicator === "z"
      ? theme.success
      : clinchIndicator === "y"
        ? theme.warning
        : clinchIndicator === "w"
          ? theme.info
          : !clinchIndicator && GP === 162
            ? theme.error
            : null;

  const logoUri = getTeamLogoUrl ? getTeamLogoUrl("mlb", abbr) : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.teamRow,
        { backgroundColor: theme.surface },
        clinchColor
          ? { borderLeftColor: clinchColor, borderLeftWidth: 3 }
          : null,
      ]}
    >
      {/* Rank */}
      <View style={styles.rankCol}>
        <Text style={[styles.rankText, { color: theme.textSecondary }]}>
          {displayRank}
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
            {team?.name?.slice(0, 3).toUpperCase()}
          </Text>
        </View>
      )}

      {/* Team info */}
      <View style={styles.teamInfo}>
        <Text
          style={[
            styles.teamName,
            { color: isFav ? colors.primary : theme.text },
          ]}
          numberOfLines={1}
        >
          {isFav ? "★ " : ""}
          {team.name}
        </Text>

        {sortByOpt ? (
          /* Sort mode: show only the selected category W-L (PCT) */
          <Text
            style={[
              styles.recordText,
              { color: theme.textSecondary, marginTop: 2 },
            ]}
          >
            {splitW}-{splitL} ({splitPct})
          </Text>
        ) : (
          /* Normal mode: full stats */
          <>
            <View style={styles.recordRow}>
              <Text style={[styles.recordText, { color: theme.textSecondary }]}>
                {wins ?? 0}-{losses ?? 0} ({pct})
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
            <View style={{ flexDirection: "row" }}>
              <Text style={[styles.xrText, { color: theme.textSecondary }]}>
                RS: {runsScored ?? 0} | RA: {runsAllowed ?? 0} |{" "}
              </Text>
              <Text
                style={[
                  styles.xrText,
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
                {runDiff > 0 ? `+${runDiff}` : runDiff}
              </Text>
            </View>
            {showDivRecords && (
              <DivisionRecordsRow
                divRecords={teamRecord.records?.divisionRecords ?? []}
                theme={theme}
              />
            )}
          </>
        )}
      </View>

      {/* GB — hidden in sort mode */}
      {!sortByOpt && (
        <View style={styles.rightCol}>
          <Text style={[styles.gbValue, { color: theme.textSecondary }]}>
            {gb}
          </Text>
          <Text style={[styles.gbLabel, { color: theme.textSecondary }]}>
            GB
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

const StandingsScreen = ({ route }) => {
  const navigation = useNavigation();
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;
  const { isFavorite } = useFavorites();
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Sort By: null = default, or one of SORT_OPTIONS
  const [sortBy, setSortBy] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Show mode: null (default division) | 'byLeague' | 'byTotal'
  const [showMode, setShowMode] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await MLBService.getStandings();
      const records = res?.data?.records ?? res?.records ?? [];
      if (!records.length) {
        setMessage("No standings available");
        return;
      }
      setStandings(records);
    } catch (e) {
      console.error("MLB Standings error:", e);
      setMessage("Failed to load standings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Flatten all team records with their division id attached
  const allTeams = standings
    ? standings.flatMap((divRecord) =>
        (divRecord.teamRecords ?? []).map((tr) => ({
          ...tr,
          _divisionId: divRecord.division?.id,
        })),
      )
    : [];

  // Shared TeamRow renderer
  const renderTeamRow = (tr, rank) => {
    const mlbId = tr.team?.id?.toString();
    const espnId = convertMLBIdToESPNId(mlbId) ?? mlbId;
    return (
      <TeamRow
        key={`${tr.team?.id}-${rank}`}
        teamRecord={tr}
        theme={theme}
        colors={colors}
        isFav={isFavorite(espnId, "mlb")}
        getTeamLogoUrl={getTeamLogoUrl}
        rank={rank}
        sortByOpt={sortBy ?? null}
        showDivRecords={!sortBy && showMode === "division"}
        onPress={() =>
          navigation.navigate("TeamPage", { teamId: mlbId, sport: "mlb" })
        }
      />
    );
  };

  // ── Sort By view: flat list of all teams sorted by split record ──────────
  const renderSortedView = () => {
    const sorted = [...allTeams].sort((a, b) => {
      const ra = getRecordForSort(a, sortBy);
      const rb = getRecordForSort(b, sortBy);
      const wA = ra?.wins ?? 0,
        lA = ra?.losses ?? 0;
      const wB = rb?.wins ?? 0,
        lB = rb?.losses ?? 0;
      const pctA = wA / Math.max(1, wA + lA);
      const pctB = wB / Math.max(1, wB + lB);
      if (pctB !== pctA) return pctB - pctA;
      return wB - wA;
    });
    return (
      <View style={styles.divisionContainer}>
        <View
          style={[styles.divisionHeader, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.divisionTitle}>
            {sortBy.label}
          </Text>
        </View>
        {sorted.map((tr, i) => renderTeamRow(tr, i + 1))}
      </View>
    );
  };

  // ── Division view ────────────────────────────────────────────────────────
  const renderDivisionView = () => {
    const orderedDivisions = DIVISION_ORDER.map((id) =>
      standings?.find((r) => r.division?.id === id),
    )
      .filter(Boolean)
      .concat(
        (standings ?? []).filter(
          (r) => !DIVISION_ORDER.includes(r.division?.id),
        ),
      );

    return orderedDivisions.map((record, divIdx) => {
      const divName =
        record.division?.name ??
        DIVISION_NAMES[record.division?.id] ??
        "Division";
      return (
        <View key={divIdx} style={styles.divisionContainer}>
          <View
            style={[styles.divisionHeader, { backgroundColor: colors.primary }]}
          >
            <Text allowFontScaling={false} style={styles.divisionTitle}>
              {divName}
            </Text>
          </View>
          {(record.teamRecords ?? []).map((tr) =>
            renderTeamRow(tr, tr.divisionRank),
          )}
        </View>
      );
    });
  };

  // ── By League view ───────────────────────────────────────────────────────
  const renderByLeagueView = () => {
    const alTeams = allTeams
      .filter((tr) => AL_DIVISIONS.includes(tr._divisionId))
      .sort(
        (a, b) => parseInt(a.leagueRank ?? 99) - parseInt(b.leagueRank ?? 99),
      );
    const nlTeams = allTeams
      .filter((tr) => NL_DIVISIONS.includes(tr._divisionId))
      .sort(
        (a, b) => parseInt(a.leagueRank ?? 99) - parseInt(b.leagueRank ?? 99),
      );

    return [
      { label: "American League", teams: alTeams },
      { label: "National League", teams: nlTeams },
    ].map(({ label, teams }) => (
      <View key={label} style={styles.divisionContainer}>
        <View
          style={[styles.divisionHeader, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.divisionTitle}>
            {label}
          </Text>
        </View>
        {teams.map((tr) => renderTeamRow(tr, parseInt(tr.leagueRank ?? 0)))}
      </View>
    ));
  };

  // ── By Total view ────────────────────────────────────────────────────────
  const renderByTotalView = () => {
    const sorted = [...allTeams].sort((a, b) => {
      if (a.sportRank && b.sportRank) {
        return parseInt(a.sportRank) - parseInt(b.sportRank);
      }
      const pctA = (a.wins ?? 0) / Math.max(1, (a.wins ?? 0) + (a.losses ?? 0));
      const pctB = (b.wins ?? 0) / Math.max(1, (b.wins ?? 0) + (b.losses ?? 0));
      return pctB - pctA;
    });
    return (
      <View style={styles.divisionContainer}>
        <View
          style={[styles.divisionHeader, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.divisionTitle}>
            MLB Standings
          </Text>
        </View>
        {sorted.map((tr, i) => renderTeamRow(tr, i + 1))}
      </View>
    );
  };

  const hasData = !loading && !message && standings;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Sort By bar ── */}
      <View
        style={[
          styles.sortByBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <Text style={[styles.sortByLabel, { color: theme.text }]}>Sort By</Text>
        <TouchableOpacity
          onPress={() => setDropdownOpen((v) => !v)}
          style={[
            styles.sortByButton,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.sortByButtonText,
              { color: sortBy ? colors.primary : theme.textSecondary },
            ]}
          >
            {sortBy ? sortBy.label : "Default"}
          </Text>
          <Text
            style={{ color: theme.textSecondary, marginLeft: 4, fontSize: 11 }}
          >
            {dropdownOpen ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>
        {!!sortBy && (
          <TouchableOpacity
            onPress={() => setSortBy(null)}
            style={styles.clearSortBtn}
          >
            <Text
              style={{
                color: theme.error ?? "#e55",
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              ✕ CLEAR
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Sort dropdown ── */}
      {dropdownOpen && (
        <View
          style={[
            styles.dropdown,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.type}
              style={[
                styles.dropdownItem,
                sortBy?.type === opt.type && {
                  backgroundColor: colors.primary + "22",
                },
              ]}
              onPress={() => {
                setSortBy(opt);
                setDropdownOpen(false);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  {
                    color:
                      sortBy?.type === opt.type ? colors.primary : theme.text,
                  },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Loading ── */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* ── Error ── */}
      {!loading && !!message && (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {message}
          </Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Standings list ── */}
      {hasData && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: isPro ? 16 : 16 + AD_SPACE }]}
          onScrollBeginDrag={() => dropdownOpen && setDropdownOpen(false)}
        >
          {sortBy
            ? renderSortedView()
            : showMode === "byLeague"
              ? renderByLeagueView()
              : showMode === "byTotal"
                ? renderByTotalView()
                : renderDivisionView()}

          {/* Legend */}
          <View
            style={[styles.legendContainer, { backgroundColor: theme.surface }]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.legendTitle, { color: colors.primary }]}
            >
              Legend
            </Text>
            <View style={styles.legendItems}>
              {[
                {
                  color: theme.success,
                  label: "z - Clinched Division and Best Record",
                },
                { color: theme.warning, label: "y - Clinched Division" },
                { color: theme.info, label: "w - Clinched Wild Card" },
                { color: theme.error, label: "e - Eliminated" },
              ].map(({ color, label }) => (
                <View key={label} style={styles.legendItem}>
                  <View
                    style={[styles.legendSwatch, { backgroundColor: color }]}
                  />
                  <Text
                    allowFontScaling={false}
                    style={[styles.legendLabel, { color: theme.text }]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      {!isPro && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" }}>
          <BannerAdWrapper />
        </View>
      )}
      )}

      {/* ── Show mode bar (sticky bottom) ── */}
      {hasData && (
        <View
          style={[
            styles.showBar,
            { backgroundColor: theme.surface, borderTopColor: theme.border },
          ]}
        >
          <Text style={[styles.showLabel, { color: theme.textSecondary }]}>
            Show
          </Text>
          {[
            { key: "division", label: "Division Records" },
            { key: "byLeague", label: "By League" },
            { key: "byTotal", label: "By MLB" },
          ].map(({ key, label }) => {
            // Show buttons appear unselected when Sort By is active
            const isActive = !sortBy && showMode === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  setShowMode(showMode === key ? null : key);
                  setSortBy(null);
                }}
                style={[
                  styles.showButton,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : {
                        backgroundColor: "transparent",
                        borderColor: theme.border,
                        borderWidth: 1,
                      },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.showButtonText,
                    { color: isActive ? "#fff" : theme.text },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, textAlign: "center" },

  // ── Sort By bar ──
  sortByBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  sortByLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  sortByButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortByButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
  clearSortBtn: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  // ── Dropdown ──
  dropdown: {
    marginHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 10,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dropdownItemText: {
    fontSize: 14,
  },

  // ── Scroll content ──
  scrollContent: { paddingVertical: 8, paddingBottom: 16 },
  divisionContainer: { marginBottom: 16 },
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
  rankCol: { width: 22, marginRight: 8, alignItems: "center" },
  rankText: { fontSize: 13, fontWeight: "600" },
  teamLogo: { width: 32, height: 32, marginRight: 10 },
  teamLogoPlaceholder: {
    width: 32,
    height: 32,
    marginRight: 10,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  teamInfo: { flex: 1 },
  teamName: { fontSize: 15, fontWeight: "600" },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  recordText: { fontSize: 12 },
  streakText: { fontSize: 12, fontWeight: "600" },
  xrText: { fontSize: 11, marginTop: 2 },
  rightCol: { alignItems: "flex-end", minWidth: 44 },
  gbValue: { fontSize: 14, fontWeight: "600", textAlign: "right" },
  gbLabel: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 1,
  },

  // ── Division records sub-row ──
  divRecordsRow: {
    flexDirection: "row",
    marginTop: 6,
    gap: 12,
  },
  divRecordItem: { alignItems: "center" },
  divRecordValue: { fontSize: 12, fontWeight: "600" },
  divRecordLabel: { fontSize: 10, marginTop: 1 },

  // ── Legend ──
  legendContainer: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  legendTitle: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  legendItems: { flexDirection: "column" },
  legendItem: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  legendSwatch: { width: 16, height: 16, borderRadius: 4, marginRight: 8 },
  legendLabel: { fontSize: 12 },

  // ── Show bar (sticky bottom) ──
  showBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  showLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginRight: 2,
  },
  showButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: "center",
  },
  showButtonText: {
    fontSize: 11,
    fontWeight: "600",
  },
});

export default StandingsScreen;
