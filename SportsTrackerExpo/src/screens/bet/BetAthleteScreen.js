import React, { useState, useEffect, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import OddsDisplayContext from "../../context/OddsDisplayContext";

const BetAthleteScreen = ({ route, navigation }) => {
  const { athleteId, sport } = route.params;
  const { colors, theme, isDarkMode } = useTheme();
  const oddsContext = useContext(OddsDisplayContext);
  const oddsDisplay = oddsContext ? oddsContext.oddsDisplay : "american";

  const { isPro, toggleBet, removeBet, isBetSelected } = useBetSlip();

  const [athleteData, setAthleteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ODDS");
  const [expandedMarkets, setExpandedMarkets] = useState({});
  const [expandedGameItems, setExpandedGameItems] = useState({
    h2h: {},
    last10: {},
    season: {},
  });
  const [statsSelections, setStatsSelections] = useState({});
  const [gameInfo, setGameInfo] = useState({ time: "TBD", teams: "Unknown" });

  useEffect(() => {
    fetchAthleteData();
  }, [athleteId, sport]);

  // Auto-log derived NHL stats when entering STATS tab
  useEffect(() => {
    if (sport !== "NHL") return;
    if (activeTab !== "STATS") return;
    if (!athleteData) return;
    const recent = (athleteData.last10matches || []).slice(0, 10);
    const marketsList = athleteData.odds
      ? athleteData.odds.filter((m) => {
          const overV = m.variants?.find((v) => v.sideID === "over");
          if (!overV || !overV.byBookmaker) return false;
          const bookmakers = Object.values(overV.byBookmaker);
          if (!bookmakers || bookmakers.length === 0) return false;
          const bm = bookmakers[0];
          return (
            (bm.annotatedLines && bm.annotatedLines.length > 0) ||
            (bm.annotatedSummary && Object.keys(bm.annotatedSummary).length > 0)
          );
        })
      : [];

    marketsList.forEach((market) => {
      const marketKey = market.marketName || "";
      const sanitizedLabel = sanitizeMarketName(market.marketName);
      const derived = recent.map((m) => {
        const g = getMatchStatNumeric(m, "Goals") || 0;
        const a = getMatchStatNumeric(m, "Assists") || 0;
        const shots =
          getMatchStatNumeric(m, "Shots") || getMatchStatNumeric(m, "SOG") || 0;
        const sp =
          getMatchStatNumeric(m, "Shooting Percentage") ||
          getMatchStatNumeric(m, "Shooting %") ||
          0;
        const sogFromCalc = sp && shots ? Math.round((sp / 100) * shots) : null;
        const sog =
          getMatchStatNumeric(m, "Shots on Goal") ||
          getMatchStatNumeric(m, "SOG") ||
          (sogFromCalc != null ? sogFromCalc : 0);
        const pts = getMatchStatNumeric(m, "Points") || g + a;
        const ppg =
          getMatchStatNumeric(m, "Power Play Goals") ||
          getMatchStatNumeric(m, "PPG") ||
          0;
        const ppa =
          getMatchStatNumeric(m, "Power Play Assists") ||
          getMatchStatNumeric(m, "PPA") ||
          0;
        const pp =
          ppg || ppa
            ? ppg + ppa
            : getMatchStatNumeric(m, "Power Play Points") || 0;

        return {
          gameDate: m.gameDate,
          rawStats: {
            Goals: g,
            Assists: a,
            "Shots on Goal": sog,
            Shots: shots,
            "Shooting Percentage": sp,
            Points: pts,
            "Power-Play Points": pp,
          },
          barChartStats: {
            Goals: getMatchStatNumeric(m, "Goals") || 0,
            "Shots on Goal": sog,
            Assists: getMatchStatNumeric(m, "Assists") || 0,
            Points:
              getMatchStatNumeric(m, "Points") ||
              (getMatchStatNumeric(m, "Goals") || 0) +
                (getMatchStatNumeric(m, "Assists") || 0),
            "Power-Play Points": pp,
          },
        };
      });
      console.log("[STATS AUTO LOG]", {
        market: sanitizedLabel || marketKey,
        derived,
      });
    });
  }, [activeTab, athleteData, sport]);

  const fetchAthleteData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://laraiyeogithubio-production-f5af.up.railway.app/api/athlete/${sport.toLowerCase()}/${athleteId}`
      );
      const data = await response.json();
      setAthleteData(data);

      // Set first market as expanded by default
      if (data.odds && data.odds.length > 0) {
        setExpandedMarkets({ [data.odds[0].marketName]: true });
      }

      // Fetch scoreboard data to get proper game info
      if (data.gameId) {
        try {
          const scoreboardResponse = await fetch(
            `https://laraiyeogithubio-production-f5af.up.railway.app/api/scoreboard/${sport.toLowerCase()}`
          );
          const scoreboardData = await scoreboardResponse.json();

          if (scoreboardData && scoreboardData.events) {
            const game = scoreboardData.events.find(
              (evt) => evt.id === data.gameId
            );

            if (game && game.competitions && game.competitions[0]) {
              const comp = game.competitions[0];
              const competitors = comp.competitors || [];
              const homeTeam = competitors.find((c) => c.homeAway === "home");
              const awayTeam = competitors.find((c) => c.homeAway === "away");

              const statusDetail = game.status?.type?.detail || "TBD";
              const team1Abbr = awayTeam?.team?.abbreviation || "Away";
              const team2Abbr = homeTeam?.team?.abbreviation || "Home";

              setGameInfo({
                time: statusDetail,
                teams: `${team1Abbr} @ ${team2Abbr}`,
              });
            }
          }
        } catch (scoreboardError) {
          console.error("Error fetching scoreboard:", scoreboardError);
          // Keep default gameInfo if scoreboard fetch fails
        }
      }
    } catch (error) {
      console.error("Error fetching athlete data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getSportPath = (sport) => {
    switch (sport) {
      case "NBA":
        return "nba";
      case "NFL":
        return "nfl";
      case "NHL":
        return "nhl";
      case "UEFA":
        return "uefa.champions";
      default:
        return "nba";
    }
  };

  // Remove athlete name (first/last/full and possessive forms) from market labels
  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const sanitizeMarketName = (marketName) => {
    if (!marketName) return "";
    let cleaned = marketName;
    const first = athleteData?.athlete?.firstName || "";
    const last = athleteData?.athlete?.lastName || "";
    const full = `${first} ${last}`.trim();

    const parts = [];
    if (full) parts.push(full);
    if (first) parts.push(first);
    if (last) parts.push(last);

    // include possessive variations
    const variations = [];
    parts.forEach((p) => {
      variations.push(p);
      variations.push(`${p}'s`);
      variations.push(`${p}’s`);
    });

    variations.forEach((v) => {
      const re = new RegExp(`\\b${escapeRegExp(v)}\\b`, "gi");
      cleaned = cleaned.replace(re, "");
    });

    // Clean up extra spaces and separators
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    cleaned = cleaned.replace(/^[\s:\u2013\u2014-]+|[\s:\u2013\u2014-]+$/g, "");
    return cleaned;
  };

  const formatOdds = (odds) => {
    if (!odds) return "--";
    const numOdds = parseFloat(odds);

    if (oddsDisplay === "decimal") {
      // Convert American to Decimal
      if (numOdds > 0) {
        return (numOdds / 100 + 1).toFixed(2);
      } else {
        return (100 / Math.abs(numOdds) + 1).toFixed(2);
      }
    } else {
      // American odds
      return numOdds > 0 ? `+${numOdds}` : String(numOdds);
    }
  };

  const formatDateToEST = (dateStr) => {
    try {
      const d = new Date(dateStr);
      const opts = {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "America/New_York",
      };
      // produce "Saturday 10, Jan 2026" style by removing comma after weekday
      const parts = d.toLocaleDateString("en-US", opts).split(",");
      // parts example: ["Saturday", " Jan 10", " 2026"] or similar; rebuild
      const weekday = d.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "America/New_York",
      });
      const month = d.toLocaleDateString("en-US", {
        month: "short",
        timeZone: "America/New_York",
      });
      const day = d.toLocaleDateString("en-US", {
        day: "numeric",
        timeZone: "America/New_York",
      });
      const year = d.toLocaleDateString("en-US", {
        year: "numeric",
        timeZone: "America/New_York",
      });
      return `${weekday} ${day}, ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  const toggleGameItem = (section, index) => {
    setExpandedGameItems((prev) => {
      const sectionMap = { ...(prev[section] || {}) };
      const current =
        prev[section] &&
        Object.prototype.hasOwnProperty.call(prev[section], index)
          ? prev[section][index]
          : index === 0;
      sectionMap[index] = !current;
      return { ...prev, [section]: sectionMap };
    });
  };

  const getResultColor = (result) => {
    if (!result) return theme.border;
    if (result === "W") return theme.success || colors.success || "green";
    if (result === "L") return theme.error || colors.error || "red";
    if (result === "D") return theme.warning || colors.warning || "orange";
    return theme.border;
  };

  const renderMatchItem = (match, index, sectionName = "last10") => {
    const isExpanded =
      expandedGameItems[sectionName] &&
      Object.prototype.hasOwnProperty.call(
        expandedGameItems[sectionName],
        index
      )
        ? expandedGameItems[sectionName][index]
        : index === 0;
    const opponent = match.opponent || {};
    const opponentAbbr = opponent.abbreviation
      ? opponent.abbreviation.toLowerCase().slice(0, 3)
      : "team";
    const opponentLogo = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${darkSuffix}/${opponentAbbr}.png&h=100&w=100`;
    const result = match.gameResult;
    const borderColor = getResultColor(result);

    return (
      <View
        key={`${sectionName}-${index}`}
        style={[
          styles.matchCard,
          { borderColor, backgroundColor: theme.surface },
        ]}
      >
        <TouchableOpacity
          onPress={() => toggleGameItem(sectionName, index)}
          style={styles.matchHeader}
        >
          <Text style={[styles.matchDate, { color: theme.textSecondary }]}>
            {formatDateToEST(match.gameDate)}
          </Text>
          <View style={styles.opponentRow}>
            <Image source={{ uri: opponentLogo }} style={styles.opponentLogo} />
            <Text style={[styles.opponentName, { color: theme.text }]}>
              {`${match.atVs || ""} ${opponent.displayName || ""}`.trim()}
            </Text>
            <View style={styles.scoreResultRow}>
              <Text style={[styles.scoreText, { color: theme.textSecondary }]}>
                {match.score || ""}
              </Text>
              <Text
                style={[styles.resultText, { color: getResultColor(result) }]}
              >
                {result || ""}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={[styles.statList, { borderTopColor: borderColor }]}>
            {match.stats &&
              Object.entries(match.stats).map(([k, v]) => (
                <View key={k} style={styles.statRow}>
                  <Text
                    style={[styles.statLabel, { color: theme.textSecondary }]}
                  >
                    {k}
                  </Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {v}
                  </Text>
                </View>
              ))}
          </View>
        )}
      </View>
    );
  };

  const renderSeasonAverages = (averages) => {
    const entries = Object.entries(averages || {});
    return (
      <View style={styles.seasonGrid}>
        {entries.map(([k, v]) => (
          <View
            key={k}
            style={[
              styles.statSquare,
              { backgroundColor: theme.surfaceSecondary || theme.surface },
            ]}
          >
            <Text style={[styles.statSquareValue, { color: theme.text }]}>
              {v}
            </Text>
            <Text
              style={[styles.statSquareLabel, { color: theme.textSecondary }]}
            >
              {k}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderGames = () => {
    return (
      <View style={styles.gamesContainer}>
        {/* last10matches header then cards */}
        <Text style={[styles.sectionHeader, { color: theme.text }]}>
          Last 10 Matches
        </Text>
        {last10matches && last10matches.length > 0 ? (
          last10matches.map((m, i) => renderMatchItem(m, i, "last10"))
        ) : (
          <Text style={{ color: theme.textSecondary, padding: 12 }}>
            No recent matches
          </Text>
        )}

        {/* h2h header then cards */}
        <Text style={[styles.sectionHeader, { color: theme.text }]}>
          Head-to-Head
        </Text>
        {h2h && h2h.length > 0 ? (
          h2h.map((m, i) => renderMatchItem(m, i, "h2h"))
        ) : (
          <Text style={{ color: theme.textSecondary, padding: 12 }}>
            No head-to-head data
          </Text>
        )}

        {/* season averages header then grid */}
        <Text style={[styles.sectionHeader, { color: theme.text }]}>
          Season Averages
        </Text>
        {seasonAverages ? (
          renderSeasonAverages(seasonAverages)
        ) : (
          <Text style={{ color: theme.textSecondary, padding: 12 }}>
            No season averages
          </Text>
        )}
      </View>
    );
  };

  const parseFractionPercent = (str, fallbackDen = 3) => {
    if (!str && str !== 0) return null;
    if (typeof str === "number") return Number(str);
    const s = String(str).trim();
    if (!s) return null;
    if (s.includes("%")) return Number(s.replace("%", "")) / 100;
    if (s.includes("/")) {
      const parts = s.split("/");
      const num = Number(parts[0]);
      const den = Number(parts[1]) || fallbackDen;
      if (isNaN(num) || isNaN(den) || den === 0) return null;
      return num / den;
    }
    const n = Number(s);
    if (!isNaN(n)) return n;
    return null;
  };
  const parseAnnotatedFraction = (raw, defaultDen = 3) => {
    if (raw === null || raw === undefined) return null;
    // If it's an object with numerator/denominator
    if (typeof raw === "object") {
      if (raw.numerator !== undefined && raw.denominator !== undefined) {
        const n = Number(raw.numerator);
        const d = Number(raw.denominator) || defaultDen;
        if (isNaN(n) || isNaN(d) || d === 0) return null;
        return n / d;
      }
      if (raw.percent !== undefined)
        return parseFractionPercent(raw.percent, defaultDen);
      return null;
    }

    // If it's a number, and a defaultDen was provided (e.g., l5 -> defaultDen=5), treat as numerator
    if (typeof raw === "number") {
      if (defaultDen) return raw / defaultDen;
      return raw <= 1 ? raw : null;
    }

    // string handling
    const s = String(raw).trim();
    if (!s) return null;
    if (s.includes("%")) return parseFloat(s.replace("%", "")) / 100;
    if (s.includes("/")) {
      const parts = s.split("/");
      const n = Number(parts[0]);
      const d = Number(parts[1]) || defaultDen;
      if (isNaN(n) || isNaN(d) || d === 0) return null;
      return n / d;
    }
    const n = Number(s);
    if (!isNaN(n)) {
      if (defaultDen) return n / defaultDen;
      return n <= 1 ? n : null;
    }
    return null;
  };

  const percentFromRaw = (raw, defaultDen = 3, side = "over") => {
    const frac = parseAnnotatedFraction(raw, defaultDen);
    if (frac === null || frac === undefined) return null;
    let pct = frac;
    if (side === "under") pct = 1 - pct;
    pct = Math.max(0, Math.min(1, pct));
    return Math.round(pct * 100);
  };

  const getMatchStatNumeric = (match, statID) => {
    if (!match || !match.stats) return 0;
    const stats = match.stats || {};

    const findStat = (needle) => {
      const lk = Object.keys(stats).find((k) =>
        k.toLowerCase().includes(needle.toLowerCase())
      );
      if (!lk) return null;
      const raw = stats[lk];
      if (raw === null || raw === undefined) return null;
      if (typeof raw === "number") return Number(raw);
      const s = String(raw).trim();
      if (s.includes("-")) {
        const parts = s.split("-");
        const n = parseFloat(parts[0]);
        if (!isNaN(n)) return n;
      }
      const n = parseFloat(s.replace("%", ""));
      if (!isNaN(n)) return n;
      return null;
    };

    // Helper to parse values consistently (handles "x-y" and percentages)
    function parseMatchStatValue(raw) {
      if (raw === null || raw === undefined) return 0;
      if (typeof raw === "number") return Number(raw);
      const s = String(raw).trim();
      if (s.includes("-")) {
        const parts = s.split("-");
        const n = parseFloat(parts[0]);
        if (!isNaN(n)) return n;
      }
      const n = parseFloat(s.replace("%", ""));
      if (!isNaN(n)) return n;
      return 0;
    }

    // PRIORITY: Handle composite stats with "+" first, before specific stat patterns
    // This prevents "Points + Assists" from matching just the "Points" pattern
    if (statID && statID.includes("+")) {
      const parts = statID.split("+").map((p) => p.trim());
      let total = 0;
      for (const p of parts) {
        // Recursively call getMatchStatNumeric for each component
        // This allows each component to use all the stat-specific logic (NHL, NFL, NBA, etc.)
        const componentValue = getMatchStatNumeric(match, p);
        if (
          componentValue !== null &&
          componentValue !== undefined &&
          !isNaN(componentValue)
        ) {
          total += componentValue;
        }
      }
      return total;
    }

    // Special handling for 3-point made/attempted strings like "6-13"
    const isThreePointersQuery = /three|3p|3-?pt|threep/i.test(statID);
    if (isThreePointersQuery) {
      const threeKey = Object.keys(stats).find((k) =>
        /3[- ]?point|3pt|3-?point/i.test(k)
      );
      if (threeKey) {
        const raw = stats[threeKey];
        if (raw !== null && raw !== undefined) {
          const s = String(raw).trim();
          if (s.includes("-")) {
            const parts = s.split("-");
            const n = parseFloat(parts[0]);
            if (!isNaN(n)) return n;
          }
          const n = parseFloat(s.replace("%", ""));
          if (!isNaN(n)) return n;
        }
      }
    }

    // NHL-specific explicit mappings: Goals, Shots on Goal (derived), Assists, Points, Power-Play Points
    const statKeys = Object.keys(stats || {});
    const statKeysLower = statKeys.map((k) => k.toLowerCase());
    const looksLikeNHL = statKeysLower.some((k) =>
      /\bgoals?\b|\bassists?\b|\bshots?\b|shooting\b|power ?play/i.test(k)
    );
    if (looksLikeNHL) {
      // Helper: find key by regex
      const findKey = (rx) => statKeys.find((k) => rx.test(k));

      // Power-Play Points: sum Power Play Goals + Power Play Assists (check FIRST, before general Points)
      if (/power[- ]?play/i.test(statID) && /point/i.test(statID)) {
        const ppg =
          findKey(/power.*goal/i) ||
          findKey(/ppg/i) ||
          findKey(/power play goals?/i);
        const ppa =
          findKey(/power.*assist/i) ||
          findKey(/ppa/i) ||
          findKey(/power play assists?/i);
        const ppgV = ppg ? parseMatchStatValue(stats[ppg]) : 0;
        const ppaV = ppa ? parseMatchStatValue(stats[ppa]) : 0;
        return ppgV + ppaV;
      }

      // Shots on Goal: check BEFORE Goals (since "Shots On Goal" contains "Goal")
      if (/shots? on goal|sog/i.test(statID)) {
        const shotsKey =
          findKey(/^shots?$/i) ||
          findKey(/shots?/i) ||
          findKey(/shots on goal/i) ||
          findKey(/sog/i);
        if (shotsKey) return parseMatchStatValue(stats[shotsKey]);
      }

      // Goals (prefer exact 'Goals' key, exclude power-play and shots on goal)
      if (
        /\bgoal(s)?\b/i.test(statID) &&
        !/power[- ]?play/i.test(statID) &&
        !/shots? on goal|sog/i.test(statID)
      ) {
        const gk = findKey(/^goals?$/i) || findKey(/\bgoals?\b/i);
        if (gk) return parseMatchStatValue(stats[gk]);
      }

      // Assists
      if (/\bassist(s)?\b/i.test(statID) && !/power[- ]?play/i.test(statID)) {
        const ak = findKey(/^assists?$/i) || findKey(/assist/i);
        if (ak) return parseMatchStatValue(stats[ak]);
      }

      // Points: prefer explicit Points key; else compute Goals+Assists (check AFTER Power-Play Points)
      if (
        /\bpoint(s)?\b|\bpts?\b/i.test(statID) &&
        !/power[- ]?play/i.test(statID)
      ) {
        const pk =
          findKey(/^points?$/i) ||
          findKey(/\bpoints?\b/i) ||
          findKey(/\bpts\b/i);
        if (pk) return parseMatchStatValue(stats[pk]);
        const gk = findKey(/^goals?$/i) || findKey(/\bgoals?\b/i);
        const ak = findKey(/^assists?$/i) || findKey(/assist/i);
        const gv = gk ? parseMatchStatValue(stats[gk]) : 0;
        const av = ak ? parseMatchStatValue(stats[ak]) : 0;
        return gv + av;
      }
    }

    // NFL-specific mappings: prefer appropriate stat keys
    const lkStat = (regexes) => {
      for (const rx of regexes) {
        const key = Object.keys(stats).find((k) => rx.test(k));
        if (key) return stats[key];
      }
      return null;
    };

    const lower = statID ? statID.toLowerCase() : "";

    // Explicit mapping rules (from 4.txt) to map market statIDs to match.stats keys
    const mappingRules = [
      { test: /pass(ing)?\s*attempt/i, keys: ["Passing Attempts"] },
      { test: /pass(ing)?\s*complet/i, keys: ["Completions"] },
      { test: /pass(ing)?\s*touch/i, keys: ["Passing Touchdowns"] },
      { test: /pass(ing)?\s*yards/i, keys: ["Passing Yards"] },
      {
        test: /pass(ing)?.*\+.*rush|pass.*rush.*yard|passing\+rushing/i,
        keys: ["Passing Yards", "Rushing Yards"],
      },
      {
        test: /rush(ing)?.*\+.*receiv|rush.*receiv.*yard|rushing\+receiving/i,
        keys: ["Rushing Yards", "Receiving Yards"],
      },
      { test: /rush(ing)?\s*yard/i, keys: ["Rushing Yards"] },
      {
        test: /^touchdowns?$|\btds?\b/i,
        keys: [
          "Rushing Touchdowns",
          "Receiving Touchdowns",
          "Interception Touchdowns",
        ],
        allowZero: true,
      },
      { test: /intercept/i, keys: ["Interceptions"] },
      { test: /longest\s*completion/i, keys: ["Longest Pass"] },
      { test: /longest\s*recept/i, keys: ["Long Reception"] },
      { test: /receiv(ing)?\s*yard/i, keys: ["Receiving Yards"] },
      { test: /receptions?/i, keys: ["Receptions"] },
      { test: /longest\s*rush/i, keys: ["Long Rushing"] },
      { test: /rush(ing)?\s*attempt/i, keys: ["Rushing Attempts"] },
      { test: /sack/i, keys: ["Sacks"] },
      {
        test: /combined\s*tackles\s*\+\s*assists|total\s*tackles/i,
        keys: ["Total Tackles"],
      },
      { test: /assist(ed)?\s*tackle/i, keys: ["Assist Tackles"] },
      { test: /solo\s*tackle/i, keys: ["Solo Tackles"] },
      {
        test: /extra\s*points?\s*made/i,
        keys: ["Extra Points Made"],
        firstNumber: true,
      },
      {
        test: /field\s*goals?\s*made/i,
        keys: ["Field Goals Made"],
        firstNumber: true,
      },
      { test: /kicking\s*total\s*points/i, keys: ["Total Kicking Points"] },
    ];

    const getByKey = (k, opts = {}) => {
      if (!k) return 0;
      const raw = stats[k];
      if (raw === null || raw === undefined) return 0;
      if (opts.firstNumber) {
        const s = String(raw).trim();
        const m = s.match(/(-?\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : 0;
      }
      return parseMatchStatValue(raw);
    };

    // try mapping rules first
    for (const rule of mappingRules) {
      if (rule.test.test(statID) || rule.test.test(lower)) {
        let sum = 0;
        for (const k of rule.keys) {
          sum += getByKey(k, { firstNumber: !!rule.firstNumber });
        }
        // if rule allows zero, return even if zero; otherwise return sum if >0
        if (rule.allowZero) return sum;
        if (sum > 0) return sum;
      }
    }

    // Combined phrases like "passing + rushing yards" without '+'
    if (
      lower.includes("pass") &&
      lower.includes("rush") &&
      lower.includes("yard")
    ) {
      const pv =
        parseMatchStatValue(lkStat([/passing.*yard/i, /pass.*yard/i])) || 0;
      const rv =
        parseMatchStatValue(lkStat([/rush.*yard/i, /rushing.*yard/i])) || 0;
      return pv + rv;
    }

    // Rushing + Receiving yards variations
    if (
      (lower.includes("rush") &&
        lower.includes("rec") &&
        lower.includes("yard")) ||
      (lower.includes("receiv") &&
        lower.includes("rush") &&
        lower.includes("yard"))
    ) {
      const rv =
        parseMatchStatValue(lkStat([/rush.*yard/i, /rushing.*yard/i])) || 0;
      const recv =
        parseMatchStatValue(
          lkStat([/receiv.*yard/i, /receiving.*yard/i, /rec.*yard/i])
        ) || 0;
      return rv + recv;
    }

    // Interceptions mapping
    if (lower.includes("intercept") || /int(s)?\b/.test(lower)) {
      const raw = lkStat([
        /interception/i,
        /intercept/i,
        /int\b/i,
        /interceptions/i,
      ]);
      if (raw != null) return parseMatchStatValue(raw);
    }

    // Touchdowns: if explicit passing TD requested, return passing TDs; otherwise sum non-passing TDs (rush/rec/return/def)
    if (
      lower.includes("touchdown") ||
      /\btds?\b/.test(lower) ||
      lower === "touchdowns" ||
      lower === "td"
    ) {
      // If user explicitly asked for passing touchdowns, return that
      if (
        lower.includes("pass") &&
        (lower.includes("touch") || lower.includes("td"))
      ) {
        const raw = lkStat([
          /pass.*td/i,
          /passing.*td/i,
          /pass.*touch/i,
          /passing.*touch/i,
        ]);
        if (raw != null) return parseMatchStatValue(raw);
      }
      // Otherwise, always return the sum of non-passing TD sources (may be 0)
      const rushTD =
        parseMatchStatValue(
          lkStat([/rush.*td/i, /rushing.*td/i, /rush.*touch/i])
        ) || 0;
      const recTD =
        parseMatchStatValue(
          lkStat([/rec.*td/i, /receiv.*td/i, /receiving.*td/i, /rec.*touch/i])
        ) || 0;
      const defTD =
        parseMatchStatValue(
          lkStat([/return.*td/i, /int.*td/i, /interception.*td/i, /def.*td/i])
        ) || 0;
      return rushTD + recTD + defTD;
    }

    if (!statID) return 0;
    if (statID.includes("+")) {
      const parts = statID.split("+").map((p) => p.trim());
      let sum = 0;
      parts.forEach((p) => {
        const v = findStat(p) || 0;
        sum += v;
      });
      return sum;
    }

    // common aliases
    const aliases = [
      "points",
      "pts",
      "rebounds",
      "reb",
      "assists",
      "ast",
      "minutes",
      "min",
      "blocks",
      "steals",
      "turnovers",
    ];
    // try direct
    const direct = findStat(statID);
    if (direct !== null) return direct;
    // try aliases
    for (const a of aliases) {
      if (
        statID.toLowerCase().includes(a) ||
        a.includes(statID.toLowerCase())
      ) {
        const v = findStat(a);
        if (v !== null) return v;
      }
    }
    // fallback: try numeric parse of first stat
    const firstKey = Object.keys(stats)[0];
    const firstVal = firstKey
      ? parseFloat(String(stats[firstKey]).replace("%", ""))
      : NaN;
    return isNaN(firstVal) ? 0 : firstVal;
  };

  const getAnnotatedForLine = (bookmaker, lineValue) => {
    if (!bookmaker) return {};
    // Try several places for annotated summary
    if (
      bookmaker.annotatedSummary &&
      typeof bookmaker.annotatedSummary === "object"
    ) {
      // maybe keyed by overUnder value
      if (lineValue && bookmaker.annotatedSummary[lineValue])
        return bookmaker.annotatedSummary[lineValue];
      return bookmaker.annotatedSummary;
    }

    // annotatedLines might be an array of entries; search for a matching overUnder
    if (
      Array.isArray(bookmaker.annotatedLines) &&
      bookmaker.annotatedLines.length > 0
    ) {
      // try find object with overUnder === lineValue
      if (lineValue) {
        const found = bookmaker.annotatedLines.find(
          (a) =>
            String(a.overUnder) === String(lineValue) ||
            String(a.overUnder) === String(parseFloat(lineValue))
        );
        if (found) return found;
      }
      // otherwise, if there's any object that contains summary-like keys, return the first that has h2hSeason or season
      const foundSummary = bookmaker.annotatedLines.find(
        (a) => a.h2hSeason || a.season || a.l5 || a.l10
      );
      if (foundSummary) return foundSummary;
      // fallback to first entry
      return bookmaker.annotatedLines[0];
    }

    return {};
  };

  const valueColorForPercent = (pct) => {
    if (pct == null) return theme.text;
    if (pct <= 40) return theme.error || colors.error || "red";
    if (pct <= 60) return theme.warning || colors.warning || "orange";
    return theme.success || colors.success || "green";
  };

  const renderStats = () => {
    if (!odds || odds.length === 0) {
      return (
        <View style={styles.statsContainer}>
          <Text
            style={[styles.statsPlaceholder, { color: theme.textSecondary }]}
          >
            No stats
          </Text>
        </View>
      );
    }

    // filter markets that have over variant and annotatedLines available on bookmaker
    const markets = odds.filter((m) => {
      const overV = m.variants?.find((v) => v.sideID === "over");
      if (!overV || !overV.byBookmaker) return false;
      const bookmakers = Object.values(overV.byBookmaker);
      if (!bookmakers || bookmakers.length === 0) return false;
      const bm = bookmakers[0];
      return (
        (bm.annotatedLines && bm.annotatedLines.length > 0) ||
        (bm.annotatedSummary && Object.keys(bm.annotatedSummary).length > 0)
      );
    });

    return (
      <View style={styles.oddsContainer}>
        {markets.map((market, mi) => {
          const marketKey = market.marketName || `${mi}`;
          const sanitizedLabel = sanitizeMarketName(market.marketName);
          const overV = market.variants.find((v) => v.sideID === "over");
          const bookmakers = Object.values(overV.byBookmaker || {});
          const bm = bookmakers[0] || {};
          // build line options: main line + altLines
          const mainLine = bm.overUnder || null;
          const altLines = Array.isArray(bm.altLines)
            ? bm.altLines.map((a) => a.overUnder).filter(Boolean)
            : [];
          const lineOptions = mainLine
            ? [mainLine, ...altLines]
            : [...altLines];

          // ensure numeric sorted line options (low -> high)
          const sortedLineOptions = lineOptions
            .slice()
            .map((x) => (x == null ? x : String(x)))
            .sort((a, b) => parseFloat(a) - parseFloat(b));

          const rawSelection = statsSelections[marketKey] || {};
          const side = rawSelection.side || "over";
          const selectedLine =
            rawSelection.line !== undefined
              ? rawSelection.line
              : sortedLineOptions[0] || null;
          // determine a stable stat query: prefer explicit statID, otherwise derive from sanitized label
          const statQueryFallback = (sanitizedLabel || "")
            .replace(/\b(over\/?under|over|under)\b/gi, "")
            .trim();
          // Inspect first recent match keys to choose the best matching stat key
          const recentFirstStats =
            last10matches && last10matches[0] && last10matches[0].stats
              ? Object.keys(last10matches[0].stats)
              : [];
          const recentFirstLower = recentFirstStats.map((k) => k.toLowerCase());
          let statQuery = statQueryFallback || market.statID;
          let foundExactMatch = false;

          // Special-case: prefer Total Kicking Points when market indicates kicking totals
          if (/kicking\s*total|total\s*kicking/i.test(statQueryFallback)) {
            const foundKick = recentFirstStats.find(
              (k) =>
                k.toLowerCase().includes("kicking") &&
                k.toLowerCase().includes("total")
            );
            if (foundKick) {
              statQuery = foundKick;
              foundExactMatch = true;
            } else if (
              recentFirstStats.indexOf("Total Kicking Points") !== -1
            ) {
              statQuery = "Total Kicking Points";
              foundExactMatch = true;
            }
          }

          // PRIORITY: Prefer exact match from sanitized label (statQueryFallback) over market.statID
          if (!foundExactMatch && statQueryFallback) {
            // Try exact match first
            const idx = recentFirstLower.indexOf(
              statQueryFallback.toLowerCase()
            );
            if (idx !== -1) {
              statQuery = recentFirstStats[idx];
              foundExactMatch = true;
            } else {
              // Try normalized version (replace hyphens/underscores with spaces)
              const normalized = statQueryFallback.replace(/[-_]/g, " ");
              const normIdx = recentFirstLower.indexOf(
                normalized.toLowerCase()
              );
              if (normIdx !== -1) {
                statQuery = recentFirstStats[normIdx];
                foundExactMatch = true;
              }
            }
          }

          // Only try market.statID if we haven't found an exact match yet AND statQueryFallback was empty
          if (
            !foundExactMatch &&
            !statQueryFallback &&
            market.statID &&
            recentFirstLower.indexOf(String(market.statID).toLowerCase()) !== -1
          ) {
            const idx2 = recentFirstLower.indexOf(
              String(market.statID).toLowerCase()
            );
            statQuery = recentFirstStats[idx2];
            foundExactMatch = true;
          }
          // If still ambiguous, try fuzzy match: require all tokens in a key
          if (
            (!statQuery || statQuery === "") &&
            statQueryFallback &&
            recentFirstStats.length
          ) {
            const tokens = statQueryFallback
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean);
            for (const k of recentFirstStats) {
              const kl = k.toLowerCase();
              const all = tokens.every((t) => kl.includes(t));
              if (all) {
                statQuery = k;
                break;
              }
            }
          }

          const deriveMappingLabel = (statID, label) => {
            const lower = (statID || label || "").toLowerCase();
            if (
              lower.includes("pass") &&
              lower.includes("rush") &&
              lower.includes("yard")
            )
              return "Passing Yards + Rushing Yards";
            if (
              lower.includes("rush") &&
              lower.includes("rec") &&
              lower.includes("yard")
            )
              return "Rushing Yards + Receiving Yards";
            if (lower.includes("pass") && lower.includes("yard"))
              return "Passing Yards";
            if (lower.includes("rush") && lower.includes("yard"))
              return "Rushing Yards";
            if (lower.includes("touch") || /\btds?\b/.test(lower)) {
              if (lower.includes("pass")) return "Passing Touchdowns";
              return "Rushing Touchdowns + Receiving Touchdowns + Return/Defensive TDs";
            }
            // fallback: show the sanitized label
            return label || statID || "Unknown Stat";
          };

          const annotated = getAnnotatedForLine(bm, selectedLine);

          const l5Raw =
            annotated.l5 ??
            annotated.l_5 ??
            annotated["l5"] ??
            annotated.l5Percent ??
            null;
          const l10Raw =
            annotated.l10 ??
            annotated.l_10 ??
            annotated["l10"] ??
            annotated.l10Percent ??
            null;
          const seasonRaw =
            annotated.season ??
            annotated.seasonPercent ??
            annotated.seasonSummary ??
            null;
          const h2hRaw = annotated.h2hSeason ?? annotated.h2h ?? null;

          // Use actual available recent games when computing denominators for L5/L10
          const availableGames = (last10matches || []).length || 0;
          const l5Den = availableGames > 0 ? Math.min(5, availableGames) : 5;
          const l10Den = availableGames > 0 ? Math.min(10, availableGames) : 10;

          const l5Pct = percentFromRaw(l5Raw, l5Den, side);
          const l10Pct = percentFromRaw(l10Raw, l10Den, side);
          const seasonPct = percentFromRaw(seasonRaw, null, side);
          const h2hPct = percentFromRaw(h2hRaw, null, side);
          const showH2H = h2hRaw !== "0/0";

          return (
            <View
              key={marketKey}
              style={[
                styles.marketCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <TouchableOpacity
                style={styles.marketHeader}
                onPress={() => toggleMarket(marketKey)}
              >
                <Text style={[styles.marketName, { color: theme.text }]}>
                  {sanitizeMarketName(market.marketName) || market.marketName}
                </Text>
                <Ionicons
                  name={
                    expandedMarkets[marketKey] ? "chevron-up" : "chevron-down"
                  }
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>

              {expandedMarkets[marketKey] && (
                <View style={styles.marketContent}>
                  {/* selectors */}
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      marginBottom: 12,
                      alignItems: "center",
                    }}
                  >
                    <TouchableOpacity
                      onPress={() =>
                        setStatsSelections((s) => ({
                          ...s,
                          [marketKey]: {
                            ...(s[marketKey] || {}),
                            side: side === "over" ? "under" : "over",
                          },
                        }))
                      }
                      style={[
                        styles.selectorPill,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          borderColor: colors.primary,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontWeight: "700",
                        }}
                      >
                        O/U
                      </Text>
                      <Text style={{ color: theme.text, marginLeft: 8 }}>
                        {side.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {sortedLineOptions.map((lv, idx) => (
                        <TouchableOpacity
                          key={String(lv) + idx}
                          onPress={() =>
                            setStatsSelections((s) => ({
                              ...s,
                              [marketKey]: {
                                ...(s[marketKey] || {}),
                                line: lv,
                                side: s[marketKey]?.side || "over",
                              },
                            }))
                          }
                          style={[
                            styles.lineOption,
                            {
                              backgroundColor:
                                String(selectedLine) === String(lv)
                                  ? colors.primary
                                  : theme.surfaceSecondary,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color:
                                String(selectedLine) === String(lv)
                                  ? "#fff"
                                  : theme.text,
                            }}
                          >
                            {String(lv)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* 3-4 boxes: L5, L10, SZN, H2H (H2H hidden if 0/0) */}
                  <View style={styles.statsSummaryRow}>
                    <View
                      style={[
                        styles.summaryBox,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.summaryValue,
                          { color: valueColorForPercent(l5Pct) },
                        ]}
                      >
                        {l5Pct != null ? `${l5Pct.toFixed(0)}%` : "--"}
                      </Text>
                      <Text
                        style={[
                          styles.summaryLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        L5
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.summaryBox,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.summaryValue,
                          { color: valueColorForPercent(l10Pct) },
                        ]}
                      >
                        {l10Pct != null ? `${l10Pct.toFixed(0)}%` : "--"}
                      </Text>
                      <Text
                        style={[
                          styles.summaryLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        L10
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.summaryBox,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.summaryValue,
                          { color: valueColorForPercent(seasonPct) },
                        ]}
                      >
                        {seasonPct != null ? `${seasonPct.toFixed(0)}%` : "--"}
                      </Text>
                      <Text
                        style={[
                          styles.summaryLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        SZN
                      </Text>
                    </View>
                    {showH2H && (
                      <View
                        style={[
                          styles.summaryBox,
                          { backgroundColor: theme.surfaceSecondary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.summaryValue,
                            { color: valueColorForPercent(h2hPct) },
                          ]}
                        >
                          {h2hPct != null ? `${h2hPct.toFixed(0)}%` : "--"}
                        </Text>
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          H2H
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Bar chart for last 10 matches (horizontal, scrollable) */}
                  <View
                    style={{
                      flexDirection: "row",
                      marginTop: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    {/* compute max from last10 and highest line */}
                    {(() => {
                      const recent = (last10matches || []).slice(0, 10);
                      const matchVals = recent.map(
                        (m) => getMatchStatNumeric(m, statQuery) || 0
                      );
                      const maxMatchVal = matchVals.length
                        ? Math.max(...matchVals)
                        : 0;
                      const highestLine = sortedLineOptions
                        .map((x) => Number(x))
                        .filter((n) => !isNaN(n))
                        .reduce((a, b) => Math.max(a, b), 0);
                      const overallMax = Math.max(maxMatchVal, highestLine, 1);
                      const top = Math.ceil(overallMax);
                      const mid = Math.round(top / 2);
                      const chartH = 120;

                      const selectedLineNum =
                        selectedLine != null ? Number(selectedLine) : null;
                      const lineTop =
                        selectedLineNum != null
                          ? Math.max(
                              0,
                              Math.min(
                                chartH,
                                Math.round(
                                  (1 - selectedLineNum / overallMax) * chartH
                                )
                              )
                            )
                          : null;
                      return (
                        <>
                          <View
                            style={{
                              width: 44,
                              justifyContent: "space-between",
                              height: chartH,
                              alignItems: "flex-end",
                              paddingRight: 6,
                            }}
                          >
                            <Text style={{ color: theme.textSecondary }}>
                              {top}
                            </Text>
                            <Text style={{ color: theme.textSecondary }}>
                              {mid}
                            </Text>
                            <Text style={{ color: theme.textSecondary }}>
                              0
                            </Text>
                          </View>

                          <View style={{ flex: 1, position: "relative" }}>
                            {selectedLineNum != null && (
                              <View
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  top: lineTop,
                                  height: 2,
                                  backgroundColor: colors.primary,
                                  zIndex: 20,
                                }}
                              >
                                <View
                                  style={{
                                    position: "absolute",
                                    left: -31,
                                    top: -7.5,
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                    backgroundColor: colors.primary,
                                  }}
                                >
                                  <Text style={{ color: "#fff", fontSize: 11 }}>
                                    {selectedLineNum}
                                  </Text>
                                </View>
                              </View>
                            )}

                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ paddingLeft: 8 }}
                            >
                              <View
                                style={{
                                  height: chartH + 36,
                                  flexDirection: "row",
                                  alignItems: "flex-end",
                                  paddingRight: 16,
                                }}
                              >
                                {recent.map((gm, gi) => {
                                  const val =
                                    getMatchStatNumeric(gm, statQuery) || 0;
                                  if (gi === 0) {
                                    const fromL10 = deriveMappingLabel(
                                      statQuery,
                                      sanitizedLabel
                                    );
                                    console.log("[STATS BAR]", {
                                      sanitizedLabel,
                                      fromL10,
                                      statQuery,
                                      value: val,
                                    });
                                  }
                                  const barH = Math.round(
                                    (val / overallMax) * chartH
                                  );
                                  const selNum =
                                    selectedLine != null
                                      ? Number(selectedLine)
                                      : null;
                                  let meets = false;
                                  if (selNum != null) {
                                    if (side === "over") meets = val >= selNum;
                                    else meets = val < selNum;
                                  }
                                  const barColor = meets
                                    ? theme.success || colors.success
                                    : theme.error || colors.error;
                                  const dateObj = new Date(gm.gameDate);
                                  const months = [
                                    "Jan",
                                    "Feb",
                                    "Mar",
                                    "Apr",
                                    "May",
                                    "Jun",
                                    "Jul",
                                    "Aug",
                                    "Sep",
                                    "Oct",
                                    "Nov",
                                    "Dec",
                                  ];
                                  const labelDate = `${
                                    months[dateObj.getMonth()]
                                  } ${dateObj.getDate()}`;
                                  const vsLabel = `${gm.atVs || ""} ${
                                    gm.opponent?.abbreviation?.slice(0, 3) || ""
                                  }`.trim();

                                  return (
                                    <View
                                      key={`bar-${gi}`}
                                      style={{
                                        width: 44,
                                        marginRight: 10,
                                        alignItems: "center",
                                      }}
                                    >
                                      <View
                                        style={{
                                          height: chartH,
                                          justifyContent: "flex-end",
                                        }}
                                      >
                                        <View
                                          style={{
                                            width: 28,
                                            height: Math.max(barH, 6),
                                            borderRadius: 6,
                                            backgroundColor: barColor,
                                            justifyContent: "center",
                                            alignItems: "center",
                                          }}
                                        >
                                          <Text
                                            style={{
                                              color: "#fff",
                                              fontSize: 10,
                                              padding: 2,
                                            }}
                                          >
                                            {Math.round(val)}
                                          </Text>
                                        </View>
                                      </View>
                                      <Text
                                        style={{
                                          color: theme.textSecondary,
                                          fontSize: 11,
                                          marginTop: 6,
                                        }}
                                      >
                                        {vsLabel}
                                      </Text>
                                      <Text
                                        style={{
                                          color: theme.textSecondary,
                                          fontSize: 11,
                                        }}
                                      >
                                        {labelDate}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            </ScrollView>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const toggleMarket = (marketName) => {
    setExpandedMarkets((prev) => ({
      ...prev,
      [marketName]: !prev[marketName],
    }));
  };

  const roundAltLine = (value, isOver) => {
    const num = parseFloat(value);
    if (isOver) {
      return `${Math.ceil(num)}+`;
    } else {
      return `${Math.floor(num)}-`;
    }
  };

  // Helper to format line as milestone (round up for over, down for under)
  const formatAsMilestone = (value, isOver) => {
    const num = parseFloat(value);
    if (isNaN(num)) return null;
    if (isOver) {
      return `${Math.ceil(num)}+`;
    } else {
      return `${Math.floor(num)}-`;
    }
  };

  // Check if a line should be treated as a milestone (only alt lines with decimals)
  const shouldBeMilestone = (line, isMainLine) => {
    // Main lines should never be milestones - they stay as over/under
    if (isMainLine) return false;
    // Alt lines with decimals should be milestones
    const num = parseFloat(line);
    return !isNaN(num) && num % 1 !== 0;
  };

  const renderOverUnderButtons = (variants, marketName, statID) => {
    const overVariant = variants.find((v) => v.sideID === "over");
    const underVariant = variants.find((v) => v.sideID === "under");

    // Reconstruct proper statID with suffix based on variant type
    const hasOverUnder = overVariant || underVariant;
    const properStatID =
      hasOverUnder && statID && !statID.includes("_") ? `${statID}_ou` : statID;

    // Extract main lines and alt lines
    const getLines = (variant) => {
      if (!variant?.byBookmaker) return { main: null, alts: [] };

      let main = null;
      const alts = [];

      // Get first bookmaker's data
      const bookmakers = Object.values(variant.byBookmaker);
      if (bookmakers.length > 0) {
        const bookmaker = bookmakers[0];

        // Main line
        if (bookmaker.odds && bookmaker.overUnder) {
          main = {
            line: parseFloat(bookmaker.overUnder),
            odds: bookmaker.odds,
          };
        }

        // Alt lines
        if (bookmaker.altLines && Array.isArray(bookmaker.altLines)) {
          bookmaker.altLines.forEach((altLine) => {
            if (altLine.overUnder && altLine.odds) {
              alts.push({
                line: parseFloat(altLine.overUnder),
                odds: altLine.odds,
              });
            }
          });
        }
      }

      return { main, alts };
    };

    const overLines = getLines(overVariant);
    const underLines = getLines(underVariant);

    const { athlete, team, gameId } = athleteData || {};
    const teamColor = team?.color ? `#${team.color}` : "#666666";
    const displayName = athlete
      ? `${athlete.firstName} ${athlete.lastName}`
      : "Player";

    return (
      <View style={styles.overUnderContainer}>
        <View style={styles.mainLinesRow}>
          {/* Over Button */}
          {overLines.main &&
            (() => {
              const line = overLines.main.line;
              const odds = overLines.main.odds;
              const overBetId = `${athleteId}-${properStatID}-${line}-over`;
              const isSelected = isBetSelected(overBetId);
              const formattedOdds = String(odds).match(/^[+-]/)
                ? String(odds)
                : `+${odds}`;
              const displayOdds = formatOdds(odds);

              return (
                <TouchableOpacity
                  style={[
                    styles.betButton,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : theme.surfaceSecondary,
                      borderColor: colors.primary,
                      borderWidth: 1,
                      opacity: isPro ? 1 : 0.5,
                    },
                  ]}
                  onPress={() => {
                    if (!isPro) return;
                    if (isSelected) {
                      removeBet(overBetId);
                    } else {
                      toggleBet({
                        id: overBetId,
                        gameId: gameId || "unknown",
                        sport: sport.toUpperCase(),
                        gameInfo: gameInfo,
                        playerId: athleteId,
                        player: displayName,
                        team: team?.abbreviation || "",
                        prop: `${properStatID} O${line}`,
                        statType: properStatID || "stat",
                        betValue: `o${line}`,
                        type: "over",
                        line: line.toString(),
                        odds: formattedOdds,
                        playerColor: teamColor,
                        description: `${displayName} ${properStatID} O${line}`,
                      });
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.betButtonLabel,
                      { color: isSelected ? "white" : theme.textSecondary },
                    ]}
                  >
                    OVER
                  </Text>
                  <Text
                    style={[
                      styles.betButtonValue,
                      { color: isSelected ? "white" : theme.text },
                    ]}
                  >
                    {line}
                  </Text>
                  <Text
                    style={[
                      styles.betButtonOdds,
                      { color: isSelected ? "white" : colors.primary },
                    ]}
                  >
                    {displayOdds}
                  </Text>
                </TouchableOpacity>
              );
            })()}

          {/* Under Button */}
          {underLines.main &&
            (() => {
              const line = underLines.main.line;
              const odds = underLines.main.odds;
              const underBetId = `${athleteId}-${properStatID}-${line}-under`;
              const isSelected = isBetSelected(underBetId);
              const formattedOdds = String(odds).match(/^[+-]/)
                ? String(odds)
                : `+${odds}`;
              const displayOdds = formatOdds(odds);

              return (
                <TouchableOpacity
                  style={[
                    styles.betButton,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : theme.surfaceSecondary,
                      borderColor: colors.primary,
                      borderWidth: 1,
                      opacity: isPro ? 1 : 0.5,
                    },
                  ]}
                  onPress={() => {
                    if (!isPro) return;
                    if (isSelected) {
                      removeBet(underBetId);
                    } else {
                      toggleBet({
                        id: underBetId,
                        gameId: gameId || "unknown",
                        sport: sport.toUpperCase(),
                        gameInfo: gameInfo,
                        playerId: athleteId,
                        player: displayName,
                        team: team?.abbreviation || "",
                        prop: `${properStatID} U${line}`,
                        statType: properStatID || "stat",
                        betValue: `u${line}`,
                        type: "under",
                        line: line.toString(),
                        odds: formattedOdds,
                        playerColor: teamColor,
                        description: `${displayName} ${properStatID} U${line}`,
                      });
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.betButtonLabel,
                      { color: isSelected ? "white" : theme.textSecondary },
                    ]}
                  >
                    UNDER
                  </Text>
                  <Text
                    style={[
                      styles.betButtonValue,
                      { color: isSelected ? "white" : theme.text },
                    ]}
                  >
                    {line}
                  </Text>
                  <Text
                    style={[
                      styles.betButtonOdds,
                      { color: isSelected ? "white" : colors.primary },
                    ]}
                  >
                    {displayOdds}
                  </Text>
                </TouchableOpacity>
              );
            })()}
        </View>

        {/* Alt Lines */}
        {(overLines.alts.length > 0 || underLines.alts.length > 0) && (
          <View
            style={[
              styles.altLinesContainer,
              { backgroundColor: theme.surface, borderRadius: 8, padding: 8 },
            ]}
          >
            <Text
              style={[styles.altLinesLabel, { color: theme.textSecondary }]}
            >
              Alternate Lines
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.altLinesScroll}
            >
              {/* Under Alt Lines (reversed order) */}
              {underLines.alts
                .slice()
                .reverse()
                .map((alt, index) => {
                  const line = alt.line;
                  const odds = alt.odds;
                  const isMilestone = shouldBeMilestone(line, false);
                  const formattedLine = isMilestone
                    ? formatAsMilestone(line, false)
                    : line.toString();
                  const betType = isMilestone ? "milestone" : "under";
                  const betValue = isMilestone ? formattedLine : `u${line}`;
                  const underBetId = `${athleteId}-${properStatID}-${formattedLine}`;
                  const isSelected = isBetSelected(underBetId);
                  const formattedOdds = String(odds).match(/^[+-]/)
                    ? String(odds)
                    : `+${odds}`;
                  const displayOdds = formatOdds(odds);

                  return (
                    <TouchableOpacity
                      key={`under-${index}`}
                      style={[
                        styles.altLineButton,
                        {
                          backgroundColor: isSelected
                            ? colors.primary
                            : theme.surfaceSecondary,
                          borderColor: colors.primary,
                          borderWidth: 1,
                          opacity: isPro ? 1 : 0.5,
                        },
                      ]}
                      onPress={() => {
                        if (!isPro) return;
                        if (isSelected) {
                          removeBet(underBetId);
                        } else {
                          toggleBet({
                            id: underBetId,
                            gameId: gameId || "unknown",
                            sport: sport.toUpperCase(),
                            gameInfo: gameInfo,
                            playerId: athleteId,
                            player: displayName,
                            team: team?.abbreviation || "",
                            prop: `${properStatID} ${formattedLine}`,
                            statType: properStatID || "stat",
                            betValue: betValue,
                            type: betType,
                            line: formattedLine,
                            odds: formattedOdds,
                            playerColor: teamColor,
                            description: `${displayName} ${properStatID} ${formattedLine}`,
                          });
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.altLineLabel,
                          { color: isSelected ? "white" : theme.textSecondary },
                        ]}
                      >
                        U {roundAltLine(line, false)}
                      </Text>
                      <Text
                        style={[
                          styles.altLineOdds,
                          { color: isSelected ? "white" : colors.primary },
                        ]}
                      >
                        {displayOdds}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

              {/* Over Alt Lines */}
              {overLines.alts.map((alt, index) => {
                const line = alt.line;
                const odds = alt.odds;
                const isMilestone = shouldBeMilestone(line, false);
                const formattedLine = isMilestone
                  ? formatAsMilestone(line, true)
                  : line.toString();
                const betType = isMilestone ? "milestone" : "over";
                const betValue = isMilestone ? formattedLine : `o${line}`;
                const overBetId = `${athleteId}-${properStatID}-${formattedLine}`;
                const isSelected = isBetSelected(overBetId);
                const formattedOdds = String(odds).match(/^[+-]/)
                  ? String(odds)
                  : `+${odds}`;
                const displayOdds = formatOdds(odds);

                return (
                  <TouchableOpacity
                    key={`over-${index}`}
                    style={[
                      styles.altLineButton,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : theme.surfaceSecondary,
                        borderColor: colors.primary,
                        borderWidth: 1,
                        opacity: isPro ? 1 : 0.5,
                      },
                    ]}
                    onPress={() => {
                      if (!isPro) return;
                      if (isSelected) {
                        removeBet(overBetId);
                      } else {
                        toggleBet({
                          id: overBetId,
                          gameId: gameId || "unknown",
                          sport: sport.toUpperCase(),
                          gameInfo: gameInfo,
                          playerId: athleteId,
                          player: displayName,
                          team: team?.abbreviation || "",
                          prop: `${properStatID} ${formattedLine}`,
                          statType: properStatID || "stat",
                          betValue: betValue,
                          type: betType,
                          line: formattedLine,
                          odds: formattedOdds,
                          playerColor: teamColor,
                          description: `${displayName} ${properStatID} ${formattedLine}`,
                        });
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.altLineLabel,
                        { color: isSelected ? "white" : theme.textSecondary },
                      ]}
                    >
                      O {roundAltLine(line, true)}
                    </Text>
                    <Text
                      style={[
                        styles.altLineOdds,
                        { color: isSelected ? "white" : colors.primary },
                      ]}
                    >
                      {displayOdds}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const renderYesNoButtons = (variants, marketName, statID) => {
    const yesVariant = variants.find((v) => v.sideID === "yes");

    if (!yesVariant?.byBookmaker) return null;

    // Reconstruct proper statID with suffix based on variant type
    const hasYesNo = yesVariant;
    const properStatID =
      hasYesNo && statID && !statID.includes("_") ? `${statID}_yn` : statID;

    // Get first available odds
    let odds = null;
    const bookmakers = Object.values(yesVariant.byBookmaker);
    if (bookmakers.length > 0 && bookmakers[0].odds) {
      odds = bookmakers[0].odds;
    }

    if (!odds) return null;

    const { athlete, team, gameId } = athleteData || {};
    const teamColor = team?.color ? `#${team.color}` : "#666666";
    const displayName = athlete
      ? `${athlete.firstName} ${athlete.lastName}`
      : "Player";
    const yesBetId = `${athleteId}-${properStatID}-yes`;
    const isSelected = isBetSelected(yesBetId);
    const formattedOdds = String(odds).match(/^[+-]/)
      ? String(odds)
      : `+${odds}`;
    const displayOdds = formatOdds(odds);

    // If there are no over/under variants in this market, make the YES button full-width like betButton
    const hasOverUnderInVariants = variants.some(
      (v) => v.sideID === "over" || v.sideID === "under"
    );

    if (!hasOverUnderInVariants) {
      return (
        <View style={styles.overUnderContainer}>
          <TouchableOpacity
            style={[
              styles.betButton,
              {
                backgroundColor: isSelected
                  ? colors.primary
                  : theme.surfaceSecondary,
                borderColor: colors.primary,
                borderWidth: 1,
              },
            ]}
            onPress={() => {
              if (isSelected) {
                removeBet(yesBetId);
              } else {
                toggleBet({
                  id: yesBetId,
                  gameId: gameId || "unknown",
                  sport: sport.toUpperCase(),
                  gameInfo: gameInfo,
                  playerId: athleteId,
                  player: displayName,
                  team: team?.abbreviation || "",
                  prop: `${properStatID} YES`,
                  statType: properStatID || "stat",
                  betValue: "yes",
                  type: "yesno",
                  odds: formattedOdds,
                  playerColor: teamColor,
                  description: `${displayName} ${properStatID} YES`,
                });
              }
            }}
          >
            <Text
              style={[
                styles.betButtonLabel,
                { color: isSelected ? "white" : theme.textSecondary },
              ]}
            >
              YES
            </Text>
            <Text
              style={[
                styles.betButtonOdds,
                { color: isSelected ? "white" : colors.primary },
              ]}
            >
              {displayOdds}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.yesNoContainer}>
        <TouchableOpacity
          style={[
            styles.yesNoButton,
            {
              backgroundColor: isSelected
                ? colors.primary
                : theme.surfaceSecondary,
              borderColor: colors.primary,
              borderWidth: 1,
            },
          ]}
          onPress={() => {
            if (isSelected) {
              removeBet(yesBetId);
            } else {
              toggleBet({
                id: yesBetId,
                gameId: gameId || "unknown",
                sport: sport.toUpperCase(),
                gameInfo: gameInfo,
                playerId: athleteId,
                player: displayName,
                team: team?.abbreviation || "",
                prop: `${properStatID} YES`,
                statType: properStatID || "stat",
                betValue: "yes",
                type: "yesno",
                odds: formattedOdds,
                playerColor: teamColor,
                description: `${displayName} ${properStatID} YES`,
              });
            }
          }}
        >
          <Text
            style={[
              styles.betButtonLabel,
              { color: isSelected ? "white" : theme.textSecondary },
            ]}
          >
            YES
          </Text>
          <Text
            style={[
              styles.betButtonOdds,
              { color: isSelected ? "white" : colors.primary },
            ]}
          >
            {displayOdds}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!athleteData) {
    return (
      <View
        style={[styles.errorContainer, { backgroundColor: theme.background }]}
      >
        <Text style={[styles.errorText, { color: theme.text }]}>
          Failed to load athlete data
        </Text>
      </View>
    );
  }

  const { athlete, team, odds, last10matches, h2h, seasonAverages } =
    athleteData;
  const teamColor = team.color ? `#${team.color}` : "#666666";
  const teamColorWithAlpha = `${teamColor}88`;
  const sportPath = getSportPath(sport);
  const darkSuffix = isDarkMode ? "-dark" : "";

  const headshotUrl = `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${athlete.id}.png&w=300`;
  const teamLogoUrl = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500/${team.abbreviation.toLowerCase()}.png&h=100&w=100`;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: teamColorWithAlpha }]}>
          <View style={styles.headshotWrapper}>
            <Image
              source={{ uri: headshotUrl }}
              style={styles.headerHeadshot}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <Image
              source={{ uri: teamLogoUrl }}
              style={styles.teamLogoBadge}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </View>
          <View style={styles.headerInfo}>
            <Text style={[styles.firstName, { color: theme.text }]}>
              {athlete.firstName}
            </Text>
            <Text style={[styles.lastName, { color: theme.text }]}>
              {athlete.lastName}
            </Text>
            <Text style={[styles.teamName, { color: theme.textSecondary }]}>
              {team.displayName}
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View
          style={[styles.tabsContainer, { backgroundColor: theme.surface }]}
        >
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "ODDS" && {
                borderBottomWidth: 3,
                borderBottomColor: colors.primary,
              },
            ]}
            onPress={() => setActiveTab("ODDS")}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "ODDS" ? colors.primary : theme.textSecondary,
                },
              ]}
            >
              ODDS
            </Text>
          </TouchableOpacity>
          {isPro && (
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "GAMES" && {
                  borderBottomWidth: 3,
                  borderBottomColor: colors.primary,
                },
              ]}
              onPress={() => setActiveTab("GAMES")}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === "GAMES"
                        ? colors.primary
                        : theme.textSecondary,
                  },
                ]}
              >
                GAMES
              </Text>
            </TouchableOpacity>
          )}
          {isPro && (
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "STATS" && {
                  borderBottomWidth: 3,
                  borderBottomColor: colors.primary,
                },
              ]}
              onPress={() => setActiveTab("STATS")}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === "STATS"
                        ? colors.primary
                        : theme.textSecondary,
                  },
                ]}
              >
                STATS
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        {activeTab === "ODDS" && (
          <View style={styles.oddsContainer}>
            {odds && odds.length > 0 ? (
              odds.map((market, index) => {
                const isExpanded = expandedMarkets[market.marketName];
                const hasOverUnder = market.variants?.some(
                  (v) => v.sideID === "over" || v.sideID === "under"
                );
                const hasYesNo = market.variants?.some(
                  (v) => v.sideID === "yes"
                );

                return (
                  <View
                    key={index}
                    style={[
                      styles.marketCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.marketHeader}
                      onPress={() => toggleMarket(market.marketName)}
                    >
                      <Text style={[styles.marketName, { color: theme.text }]}>
                        {sanitizeMarketName(market.marketName) ||
                          market.marketName}
                      </Text>
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={24}
                        color={theme.textSecondary}
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.marketContent}>
                        {hasOverUnder &&
                          renderOverUnderButtons(
                            market.variants,
                            market.marketName,
                            market.statID
                          )}
                        {hasYesNo &&
                          renderYesNoButtons(
                            market.variants,
                            market.marketName,
                            market.statID
                          )}
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.noDataContainer}>
                <Text
                  style={[styles.noDataText, { color: theme.textSecondary }]}
                >
                  No odds available
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === "STATS" && renderStats()}
        {activeTab === "GAMES" && (
          <View style={styles.gamesWrapper}>{renderGames()}</View>
        )}
      </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    padding: 20,
    alignItems: "center",
  },
  headshotWrapper: {
    position: "relative",
    marginRight: 20,
  },
  headerHeadshot: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  teamLogoBadge: {
    position: "absolute",
    bottom: -8,
    right: -8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#fff",
  },
  headerInfo: {
    flex: 1,
  },
  firstName: {
    fontSize: 18,
    fontWeight: "500",
  },
  lastName: {
    fontSize: 32,
    fontWeight: "700",
    marginTop: 4,
  },
  teamName: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
  },
  oddsContainer: {
    padding: 16,
  },
  marketCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  marketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  marketName: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  marketContent: {
    padding: 16,
    paddingTop: 0,
  },
  overUnderContainer: {
    gap: 12,
  },
  mainLinesRow: {
    flexDirection: "row",
    gap: 12,
  },
  betButton: {
    flex: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  betButtonLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  betButtonValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  betButtonOdds: {
    fontSize: 16,
    fontWeight: "600",
  },
  altLinesContainer: {
    marginTop: 8,
  },
  altLinesLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  altLinesScroll: {
    gap: 8,
  },
  altLineButton: {
    borderRadius: 6,
    padding: 12,
    minWidth: 80,
    alignItems: "center",
  },
  altLineLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  altLineOdds: {
    fontSize: 14,
    fontWeight: "600",
  },
  yesNoContainer: {
    alignItems: "flex-start",
  },
  yesNoButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  noDataContainer: {
    padding: 40,
    alignItems: "center",
  },
  noDataText: {
    fontSize: 16,
  },
  statsContainer: {
    padding: 16,
  },
  statsPlaceholder: {
    fontSize: 16,
    textAlign: "center",
    paddingVertical: 40,
  },
  gamesContainer: {
    padding: 12,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: "700",
    padding: 12,
  },
  matchCard: {
    borderLeftWidth: 4,
    marginHorizontal: 0,
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  matchHeader: {
    padding: 12,
  },
  matchDate: {
    fontSize: 12,
    marginBottom: 8,
  },
  opponentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  opponentLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 8,
  },
  opponentName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  scoreResultRow: {
    alignItems: "flex-end",
  },
  scoreText: {
    fontSize: 13,
  },
  resultText: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  statList: {
    padding: 12,
    borderTopWidth: 1,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  statLabel: {
    fontSize: 13,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  selectorPill: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
  },
  lineOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  statsSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  summaryBox: {
    flexBasis: "24%",
    height: 72,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 6,
  },
  seasonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    justifyContent: "space-between",
    gap: 8,
  },
  statSquare: {
    flexBasis: "30%",
    height: 80,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statSquareValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  statSquareLabel: {
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
});

export default BetAthleteScreen;
