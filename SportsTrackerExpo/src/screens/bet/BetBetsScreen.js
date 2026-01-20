import React, { useState, useEffect, useRef, useCallback } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useContext } from "react";
import OddsDisplayContext from "../../context/OddsDisplayContext";
import { formatOddsForDisplay } from "../../utils/odds";
import { useBetSlip } from "../../context/BetSlipContext";
import BetSlip from "../../components/BetSlip";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerForPushNotifications } from "../../services/notificationService";
import { getUserBetslips } from "../../services/betService";
import {
  isFailedHeadshot,
  markFailedHeadshot,
} from "../../utils/failedHeadshots";
import { BannerAdWrapper, DEV_BANNER_ID } from "../../services/ads";

const BetBetsScreen = () => {
  const { colors, theme, isDarkMode } = useTheme();
  const { submittedBets, loadSubmittedBets, isPro } = useBetSlip();
  const oddsContext = useContext(OddsDisplayContext);
  const oddsDisplay = oddsContext ? oddsContext.oddsDisplay : "american";
  const [selectedTab, setSelectedTab] = useState("open"); // open, settled
  const [expandedParlays, setExpandedParlays] = useState(new Set([1])); // Default first parlay expanded
  const [scoreboardData, setScoreboardData] = useState([]);
  // Live-updated betslip fetch map: ticketId -> latest fetched betslip data
  const [betslipLiveMap, setBetslipLiveMap] = useState({});
  // Ref to hold most recent betslipLiveMap (avoids stale closures during async state updates)
  const betslipLiveMapRef = useRef({});
  // Authoritative bets fetched from server when screen focused
  const [serverBets, setServerBets] = useState(null);
  // Timers per ticket (using setTimeout so interval can be dynamic)
  const pollsRef = useRef({});
  const isFocused = useIsFocused();

  const hexToRgbSafe = (hex) => {
    if (!hex) return null;
    const clean = String(hex).replace(/^#/, "");
    if (clean.length !== 6) return null;
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  };

  const isColorLight = (hex) => {
    const rgb = hexToRgbSafe(hex);
    if (!rgb) return false;
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.85;
  };

  const getInitials = (name) => {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${first}${last}`;
  };

  const HeadshotOrInitials = ({
    uri,
    playerId,
    name,
    backgroundColor,
    containerStyle,
    imageStyle,
    initialsStyle,
    onError,
  }) => {
    const initialFailed = isFailedHeadshot(playerId || uri);
    const [failed, setFailed] = useState(initialFailed);
    const bg = backgroundColor || "#999";
    const textColor = isColorLight(bg) ? "#000" : "#FFF";
    return (
      <View style={containerStyle}>
        {!failed && uri ? (
          <Image
            source={{ uri }}
            style={imageStyle}
            onError={(e) => {
              setFailed(true);
              // persist failure in shared cache so we don't retry repeatedly
              try {
                markFailedHeadshot(playerId || uri);
              } catch (ex) {}
              if (onError) onError(e);
            }}
          />
        ) : (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <Text
              style={[{ color: textColor, fontWeight: "700" }, initialsStyle]}
            >
              {getInitials(name)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const clearPollForTicket = useCallback((ticketId) => {
    const handle = pollsRef.current[ticketId];
    if (handle) {
      clearTimeout(handle);
      delete pollsRef.current[ticketId];
    }
  }, []);

  // Fetch scoreboard data for live updates
  useEffect(() => {
    const fetchScoreboard = async () => {
      try {
        const response = await fetch(
          "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
        );
        const data = await response.json();
        setScoreboardData(data.events || []);
      } catch (error) {
        console.error("Error fetching scoreboard:", error);
      }
    };

    fetchScoreboard();
    const interval = setInterval(fetchScoreboard, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Helper: build betslip fetch URL from a ticket (fallback when betslip_url not present)
  const buildBetslipUrlFromTicket = (ticket) => {
    try {
      // If the ticket already contains a canonical betslip URL (from Supabase or
      // an authoritative server), prefer and return it immediately instead of
      // rebuilding. Check common variants used across the app/data sources.
      const storedUrl =
        ticket?.betslipData?.betslip_url ||
        ticket?.betslipData?.betslipUrl ||
        ticket?.betslip_url ||
        ticket?.betslipUrl ||
        ticket?.betslip_data?.betslip_url ||
        ticket?.betslip_data?.betslipUrl ||
        ticket?.betslip?.url ||
        ticket?.betslip?.betslip_url ||
        null;
      if (storedUrl) return storedUrl;

      const bets = ticket.bets || [];
      const finalGameIds = [...new Set(bets.map((b) => b.gameId))].filter(
        Boolean,
      );

      if (finalGameIds.length === 0) return null;

      // Determine if multi-sport
      const sports = [
        ...new Set(
          finalGameIds
            .map((gid) => {
              const match = String(gid).match(
                /_(nba|nfl|nhl|mlb|soccer|ncaa|wnba|uefa)$/i,
              );
              return match ? match[1].toLowerCase() : null;
            })
            .filter(Boolean),
        ),
      ];
      const isMultiSport = sports.length > 1;

      // Helper: get period suffix from bet
      const getPeriodSuffix = (bet) => {
        const t = String(bet.type || "").toLowerCase();
        if (t.includes("1st quarter")) return "1Q";
        if (t.includes("2nd quarter")) return "2Q";
        if (t.includes("3rd quarter")) return "3Q";
        if (t.includes("4th quarter")) return "4Q";
        if (t.includes("1st half")) return "1H";
        if (t.includes("2nd half")) return "2H";
        if (t.includes("1st period")) return "1P";
        if (t.includes("2nd period")) return "2P";
        if (t.includes("3rd period")) return "3P";
        return "";
      };

      // Helper: check if bet matches parameter type
      const matchesBetType = (bet, paramName) => {
        const betType = bet.type?.toLowerCase() || "";
        switch (paramName) {
          case "moneyline":
            return (
              (bet.type === "Moneyline" || betType.includes("moneyline")) &&
              !betType.includes("regulation")
            );
          case "moneylineReg":
            return (
              bet.type === "Regulation 3-Way Moneyline" ||
              bet.type === "3-Way Moneyline (Regulation)"
            );
          case "spread":
            return (
              bet.type === "Spread" ||
              (bet.type?.includes("(Alt)") && bet.type?.includes("Spread"))
            );
          case "total":
            return (
              !bet.team &&
              (betType.includes("over/under") || betType.includes("total"))
            );
          case "homePoints":
            return (
              bet.team &&
              (betType.includes("over/under") ||
                betType.includes("total") ||
                (bet.type?.includes("(Alt)") && bet.statType === "points"))
            );
          case "awayPoints":
            return (
              bet.team &&
              (betType.includes("over/under") ||
                betType.includes("total") ||
                (bet.type?.includes("(Alt)") && bet.statType === "points"))
            );
          default:
            return false;
        }
      };

      // Helper: format bet value
      const formatBetValue = (bet, paramName) => {
        if (paramName === "moneyline" || paramName === "moneylineReg") {
          return bet.team || bet.line || "";
        }
        if (paramName === "spread") {
          return `${bet.team || ""}${bet.line || ""}`;
        }
        let lineValue = String(bet.line || "").replace(/[ou]/gi, "");
        if (bet.description?.includes("-")) lineValue += "-";
        if (bet.description?.includes("+")) lineValue += "+";
        return lineValue;
      };

      let query = `gameId=${finalGameIds.join(",")}`;

      const paramNames = [
        "moneyline",
        "moneylineReg",
        "spread",
        "total",
        "homePoints",
        "awayPoints",
      ];
      const periods = [
        "",
        "1Q",
        "2Q",
        "3Q",
        "4Q",
        "1H",
        "2H",
        "1P",
        "2P",
        "3P",
      ];

      if (isMultiSport) {
        // Multi-sport: group by sport
        const sportGroups = {};
        finalGameIds.forEach((gid) => {
          const match = String(gid).match(
            /_(nba|nfl|nhl|mlb|soccer|ncaa|wnba|uefa)$/i,
          );
          const sport = match ? match[1].toLowerCase() : null;
          if (sport) {
            if (!sportGroups[sport]) sportGroups[sport] = [];
            sportGroups[sport].push(gid);
          }
        });

        Object.entries(sportGroups).forEach(([sport, gameIdsForSport]) => {
          periods.forEach((periodSuffix) => {
            paramNames.forEach((paramName) => {
              const values = gameIdsForSport.map((gid) => {
                const bet = bets.find(
                  (b) =>
                    b.gameId === gid &&
                    getPeriodSuffix(b) === periodSuffix &&
                    matchesBetType(b, paramName),
                );
                return bet ? formatBetValue(bet, paramName) : "";
              });

              if (values.some((v) => v)) {
                const sportSuffix = `_${sport}`;
                const encodedValues = values
                  .map(encodeURIComponent)
                  .join(",")
                  .replace(/%2B/g, "+")
                  .replace(/%2D/g, "-");
                query += `&${paramName}${periodSuffix}${sportSuffix}=${encodedValues}`;
              }
            });
          });
        });
      } else {
        // Single sport
        periods.forEach((periodSuffix) => {
          paramNames.forEach((paramName) => {
            const values = finalGameIds.map((gid) => {
              const bet = bets.find(
                (b) =>
                  b.gameId === gid &&
                  getPeriodSuffix(b) === periodSuffix &&
                  matchesBetType(b, paramName),
              );
              return bet ? formatBetValue(bet, paramName) : "";
            });

            if (values.some((v) => v)) {
              const encodedValues = values
                .map(encodeURIComponent)
                .join(",")
                .replace(/%2B/g, "+")
                .replace(/%2D/g, "-");
              query += `&${paramName}${periodSuffix}=${encodedValues}`;
            }
          });
        });
      }

      // Player bets
      const playerBets = {};
      bets.forEach((bet) => {
        if (bet.playerId) {
          if (!playerBets[bet.playerId]) playerBets[bet.playerId] = {};
          if (bet.statType) {
            playerBets[bet.playerId][bet.statType] = formatBetValue(
              bet,
              "homePoints",
            );
          }
        }
      });

      Object.entries(playerBets).forEach(([playerId, stats], index) => {
        const playerNum = index + 1;
        query += `&p${playerNum}=${playerId}`;
        Object.entries(stats).forEach(([statType, betValue]) => {
          const statTypeMap = {
            // NBA stats
            points: "pts",
            rebounds: "reb",
            assists: "ast",
            blocks: "blk",
            steals: "stl",
            turnovers: "to",
            threes: "3pt",
            pra: "pra",
            // NFL passing stats
            passing_yards: "pyds",
            passing_attempts: "patt",
            passing_completions: "pcmp",
            passing_interceptions: "pint",
            passing_touchdowns: "ptd",
            passing_longestcompletion: "plng",
            "passing+rushing_yards": "pryds",
            // NFL rushing stats
            rushing_yards: "ryds",
            rushing_attempts: "ratt",
            rushing_longestrush: "rlng",
            // NFL receiving stats
            receiving_yards: "recyds",
            receiving_receptions: "rrec",
            receiving_longestreception: "reclong",
            "rushing+receiving_yards": "rryds",
            // NFL kicking stats
            extrapoints_kicksmade: "kxp",
            fieldgoals_made: "kfg",
            kicking_totalpoints: "kpts",
            // NFL defensive stats
            defense_sacks: "dsac",
            // NFL touchdown stats
            touchdowns: "touchdown",
            touchdowns_yn: "touchdown",
            touchdowns_ou: "tds",
            firsttouchdown: "firsttouchdown",
            firsttouchdown_yn: "firsttouchdown",
            lasttouchdown: "lasttouchdown",
            lasttouchdown_yn: "lasttouchdown",
          };
          const shortStat = statTypeMap[statType.toLowerCase()] || "pts";
          query += `&p${playerNum}_${shortStat}=${encodeURIComponent(
            String(betValue),
          )}`;
        });
      });

      return `https://laraiyeogithubio-production-f5af.up.railway.app/api/betslip?${query}`;
    } catch (e) {
      return null;
    }
  };

  // Register push token on startup if user authenticated
  useEffect(() => {
    const tryRegister = async () => {
      try {
        const authToken = await AsyncStorage.getItem("@bet_token");
        if (authToken) {
          await registerForPushNotifications();
        }
      } catch (e) {
        console.error("Push registration error:", e);
      }
    };
    tryRegister();
  }, []);

  // Get live game data for a specific event ID
  const getLiveGameData = (eventId) => {
    return scoreboardData.find((event) => event.id === eventId);
  };

  // Resolve a candidate bet key from an event.bets object.
  // Priority: 1) pick.key exact -> 2) pick.key stripped (remove home/away) -> 3) derived stat key -> 4) prop/stat direct -> 5) canonical fallbacks
  const resolveBetsPayloadKey = (betsObj, pick, bet) => {
    if (!betsObj) return null;
    try {
      const keys = Object.keys(betsObj || {});

      const findExact = (k) => {
        if (!k) return null;
        const lower = String(k).toLowerCase();
        return keys.find((kk) => String(kk).toLowerCase() === lower) || null;
      };
      const findSubstr = (k) => {
        if (!k) return null;
        const lower = String(k).toLowerCase();
        return (
          keys.find((kk) => {
            const lkk = String(kk).toLowerCase();
            return lkk.includes(lower) || lower.includes(lkk);
          }) || null
        );
      };

      // 1) pick.key
      if (pick && pick.key) {
        const key = pick.key;
        const exact = findExact(key);
        if (exact) return exact;

        // substring match
        const substr = findSubstr(key);
        if (substr) return substr;

        // 2) stripped key (remove home/away/team markers)
        const stripped = String(key)
          .replace(/\b(team1|team2|teamA|teamB|home|away)\b[-_]?/gi, "")
          .replace(/(^home_|^away_|_home$|_away$)/gi, "")
          .replace(/[-_]{2,}/g, "-")
          .trim();
        if (stripped && stripped !== key) {
          const exactStripped = findExact(stripped);
          if (exactStripped) return exactStripped;
          const substrStripped = findSubstr(stripped);
          if (substrStripped) return substrStripped;
        }

        // 2b) If pick.key contains a period suffix like '1H', '2Q', '3P' (or reversed 'H1'),
        // prefer period-specific payload keys. Map moneyline->ML, spread->SP, total/over->T.
        try {
          const k = String(key || "");
          const m1 = k.match(/([0-9]{1,2})([HPQ])/i); // e.g. '1H'
          const m2 = k.match(/([HPQ])([0-9]{1,2})/i); // e.g. 'H1'
          const m = m1 || m2;
          if (m) {
            const num = m[1];
            const letter = m[2].toUpperCase();
            const periodToken = `${letter}${num}`; // e.g. H1, Q2, P3
            // decide kind
            let kind = null;
            if (/moneyline|ml|3-way|3way/i.test(k) || (bet && String(bet.type || "").toLowerCase().includes("moneyline"))) kind = "ML";
            else if (/spread|sp\b|spread/i.test(k) || (bet && String(bet.type || "").toLowerCase().includes("spread"))) kind = "SP";
            else if (/total|over|under|ou|totoal/i.test(k) || (bet && String(bet.type || "").toLowerCase().includes("total"))) kind = "T";
            // fallback: try all three if kind not detected
            const candidates = kind
              ? [`${periodToken}_${kind}`, `${periodToken}${kind}`, `${periodToken}_${kind.toLowerCase()}`, `${periodToken}${kind.toLowerCase()}`]
              : [
                  `${periodToken}_ML`,
                  `${periodToken}ML`,
                  `${periodToken}_SP`,
                  `${periodToken}SP`,
                  `${periodToken}_T`,
                  `${periodToken}T`,
                ];
            for (const cand of candidates) {
              const found = findExact(cand) || findSubstr(cand);
              if (found) return found;
            }
          }
        } catch (e) {}
      }

      // 3) derived stat key (attempt to synthesize likely payload key from statType)
      if (bet && bet.statType) {
        try {
          const derived = String(bet.statType)
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase();
          if (derived) {
            const exactDerived = findExact(derived);
            if (exactDerived) return exactDerived;
            const substrDerived = findSubstr(derived);
            if (substrDerived) return substrDerived;
          }
        } catch (e) {}
      }

      // 4) fallback to propType/statType raw
      if (bet && bet.propType) {
        const exact =
          findExact(bet.propType) ||
          findExact(String(bet.propType).replace(/\s+/g, ""));
        if (exact) return exact;
        const substr = findSubstr(bet.propType);
        if (substr) return substr;
      }
      if (bet && bet.statType) {
        const exact =
          findExact(bet.statType) ||
          findExact(String(bet.statType).replace(/\s+/g, ""));
        if (exact) return exact;
        const substr = findSubstr(bet.statType);
        if (substr) return substr;
      }

      // 5) common canonical fallbacks
      const candidates = [
        "totalPoints",
        "total",
        "homePoints",
        "awayPoints",
        "bothScore",
        "totalCorner",
        "totalCards",
        "cornerSpread",
        "cardSpread",
        "spread",
        "moneyline",
      ];
      for (const c of candidates) {
        const found = findExact(c);
        if (found) return found;
      }
      for (const c of candidates) {
        const found = findSubstr(c);
        if (found) return found;
      }
    } catch (e) {}
    return null;
  };

  // Helper to render two scores and bold the higher one (used for post-game emphasis)
  const renderScoreText = (left, right) => {
    const ln = Number(left) || 0;
    const rn = Number(right) || 0;
    return (
      <Text style={[styles.scoreText, { color: theme.text }]}>
        <Text style={{ fontWeight: rn > ln ? "700" : "400" }}>
          {right ?? 0}
        </Text>
        {" - "}
        <Text style={{ fontWeight: ln > rn ? "700" : "400" }}>{left ?? 0}</Text>
      </Text>
    );
  };

  // Choose display scores preferring betslip payload (pick.scores) then scoreboard competitors
  const getDisplayScoresFor = (pick, liveCompetitors) => {
    if (
      pick &&
      pick.scores &&
      (pick.scores.team1 != null || pick.scores.team2 != null)
    ) {
      return [pick.scores.team1, pick.scores.team2];
    }
    if (Array.isArray(liveCompetitors) && liveCompetitors.length >= 2) {
      return [
        liveCompetitors[1]?.score ?? null,
        liveCompetitors[0]?.score ?? null,
      ];
    }
    return [null, null];
  };

  // Render a combined "TEAM SCORE - TEAM SCORE" string with the winner bolded.
  // Shows `home` first then `away` to match desired display (e.g. POR 102 - DET 110).
  const renderGameScoreNames = (pick, liveGame, liveCompetitors) => {
    // try payload scores first
    let homeName = null;
    let awayName = null;
    let homeScore = null;
    let awayScore = null;

    // pick.scores: team1 = away, team2 = home in our mapping
    if (pick?.scores) {
      awayScore =
        pick.scores.team1 ?? pick.scores.away ?? pick.scores.teamA ?? null;
      homeScore =
        pick.scores.team2 ?? pick.scores.home ?? pick.scores.teamB ?? null;
    }

    if (liveGame?.competitions?.[0]?.competitors) {
      const comps = liveGame.competitions[0].competitors;
      const awayComp = comps.find((c) => c.homeAway === "away") || comps[0];
      const homeComp =
        comps.find((c) => c.homeAway === "home") || comps[1] || comps[0];
      awayName =
        awayComp?.team?.abbreviation ||
        awayComp?.team?.shortDisplayName ||
        awayComp?.team?.displayName ||
        awayComp?.team?.name ||
        awayComp?.team?.abbrev;
      homeName =
        homeComp?.team?.abbreviation ||
        homeComp?.team?.shortDisplayName ||
        homeComp?.team?.displayName ||
        homeComp?.team?.name ||
        homeComp?.team?.abbrev;
      awayScore =
        awayScore ?? awayComp?.score ?? awayComp?.statistics?.score ?? null;
      homeScore =
        homeScore ?? homeComp?.score ?? homeComp?.statistics?.score ?? null;
    }

    // Fallback: try to parse `pick.gameInfo` like "AWAY @ HOME"
    if ((!homeName || !awayName) && pick?.gameInfo) {
      try {
        const parts = String(pick.gameInfo).split("@");
        if (parts.length === 2) {
          awayName = awayName || parts[0].trim();
          homeName = homeName || parts[1].trim();
        }
      } catch (e) {}
    }

    const hn = homeName || "HOME";
    const an = awayName || "AWAY";
    const hs = homeScore != null ? Number(homeScore) : null;
    const as = awayScore != null ? Number(awayScore) : null;

    // Determine authoritative event state (prefer pick.gameState, then liveGame status)
    const evtState = (
      pick?.gameState ||
      liveGame?.competitions?.[0]?.status?.type?.state ||
      liveGame?.status?.type?.state ||
      liveGame?.status?.state ||
      pick?.gameStatus ||
      ""
    )
      .toString()
      .toLowerCase();

    const isPre =
      evtState === "pre" ||
      evtState === "scheduled" ||
      evtState.includes("pre");

    // For pre/scheduled games, only show team names (no numeric scores)
    if (isPre) {
      return (
        <Text style={[styles.scoreText, { color: theme.text }]}>
          <Text style={{ fontWeight: "400" }}>{an}</Text>
          {" - "}
          <Text style={{ fontWeight: "400" }}>{hn}</Text>
        </Text>
      );
    }

    // For in/post games show numeric scores and bold the higher one
    const homeNum = hs != null ? hs : "";
    const awayNum = as != null ? as : "";

    return (
      <Text style={[styles.scoreText, { color: theme.text }]}>
        <Text
          style={{ fontWeight: awayNum > homeNum ? "700" : "400" }}
        >{`${an} ${awayNum}`}</Text>
        {" - "}
        <Text
          style={{ fontWeight: homeNum > awayNum ? "700" : "400" }}
        >{`${hn} ${homeNum}`}</Text>
      </Text>
    );
  };

  // Filter bets by tab
  // Prefer server-provided bets when available; otherwise use submittedBets
  // but filter out purely-local tickets that haven't been persisted to Supabase.
  const submittedFromSupabase = Array.isArray(submittedBets)
    ? submittedBets.filter((b) => {
        try {
          // Persisted rows loaded from Supabase use an id like `ticket-<created_at>`
          // or include a `remoteId`/`betslipData` returned by the server/RPC.
          const idStr = String(b.id || "");
          if (idStr.startsWith("ticket-")) return true;
          if (b.remoteId) return true;
          if (b.betslipData) return true;
          // Also include rows that have an explicit created_at or createdAt field
          if (b.created_at || b.createdAt) return true;
          return false;
        } catch (e) {
          return false;
        }
      })
    : [];

  const displayedBets =
    serverBets && Array.isArray(serverBets) && serverBets.length > 0
      ? serverBets
      : submittedFromSupabase;

  const filteredBets = displayedBets.filter((bet) => {
    const status =
      (bet && bet.status && String(bet.status).toLowerCase()) || "";
    if (selectedTab === "open") {
      // Treat server-side 'pending' as open so newly-created slips remain visible
      return status === "open" || status === "pending";
    } else if (selectedTab === "settled") {
      return status === "won" || status === "lost";
    }
    return false;
  });

  // Helper to get ticket timestamp (prefer `timestamp`, then `createdAt`, then `created_at`)
  const getTicketTimestamp = (ticket) => {
    return (
      ticket.timestamp ||
      ticket.createdAt ||
      ticket.created_at ||
      ticket.created ||
      null
    );
  };

  // Sort tickets. Open tab: oldest first (ascending). Settled tab: newest first (descending).
  const bets = filteredBets.slice().sort((a, b) => {
    const ta = new Date(getTicketTimestamp(a) || 0).getTime();
    const tb = new Date(getTicketTimestamp(b) || 0).getTime();
    if (selectedTab === "settled") {
      return tb - ta; // newest first
    }
    return ta - tb; // oldest first
  });

  const toggleParlay = (parlayId) => {
    let willOpen = false;
    setExpandedParlays((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(parlayId)) {
        newSet.delete(parlayId);
        willOpen = false;
      } else {
        newSet.add(parlayId);
        willOpen = true;
      }
      return newSet;
    });

    // NOTE: we intentionally do NOT fetch on each toggle; on-focus bulk fetch handles updates
  };

  // Fetch a ticket's canonical betslip payload on demand (used when user opens a ticket)
  const fetchBetslipForTicket = async (ticket) => {
    if (!ticket) return null;
    try {
      const storedUrl =
        ticket.betslipData?.betslip_url ||
        ticket.betslip_url ||
        (ticket.betslipData && ticket.betslipData.betslip_url) ||
        null;
      const url = storedUrl || buildBetslipUrlFromTicket(ticket);
      if (!url) return null;
      const res = await fetch(url);
      const data = await res.json();
      setBetslipLiveMap((prev) => ({ ...prev, [ticket.id]: data }));
      return data;
    } catch (e) {
      return null;
    }
  };

  // When Bets screen is focused, fetch betslip_url for all tickets once and store results.
  // This avoids fetching on every toggle while still getting fresh payloads when user opens the screen.
  useEffect(() => {
    if (!isFocused) return;
    let mounted = true;
    const fetchAll = async () => {
      try {
        // Refresh persisted Supabase rows so submittedBets reflects current DB state
        let freshSubmittedRows = null;
        try {
          if (typeof loadSubmittedBets === "function")
            await loadSubmittedBets();
        } catch (e) {}

        // Also fetch fresh rows directly to avoid relying on state updates from context
        try {
          const fresh = await getUserBetslips();
          if (fresh && fresh.success) freshSubmittedRows = fresh.betslips || [];
        } catch (e) {
          freshSubmittedRows = null;
        }
        // Server-side authoritative fetch deferred until after we select the
        // appropriate `source` below. This avoids using stale `submittedBets`
        // state and prevents unnecessary/invalid token requests.

        // Decide which source of tickets to query for canonical payloads.
        // We prefer authoritativeLocal (from server) then serverBets, then
        // submittedBets from Supabase. If the chosen source lacks `betslip_url`
        // values for all tickets, attempt a one-time server fetch for
        // authoritative data and use that instead.
        const submittedSource =
          Array.isArray(freshSubmittedRows) && freshSubmittedRows.length > 0
            ? freshSubmittedRows
            : submittedBets;

        let source =
          typeof authoritativeLocal !== "undefined" &&
          Array.isArray(authoritativeLocal) &&
          authoritativeLocal.length > 0
            ? authoritativeLocal
            : serverBets && Array.isArray(serverBets) && serverBets.length > 0
              ? serverBets
              : submittedSource;

        // If the source doesn't include betslip_url entries, try server fetch.
        const sourceHasBetslipUrl =
          Array.isArray(source) &&
          source.length > 0 &&
          source.every((t) =>
            Boolean(
              t?.betslip_url ||
              t?.betslipData?.betslip_url ||
              t?.betslip_data?.betslip_url,
            ),
          );

        if (!sourceHasBetslipUrl) {
          try {
            const token = await AsyncStorage.getItem("@bet_token");
            const base =
              process.env.PUBLIC_API_URL ||
              "https://laraiyeogithubio-production-f5af.up.railway.app";
            if (token && base && base.length > 0) {
              const url = base.replace(/\/$/, "") + "/api/betslips";
              try {
                const resp = await fetch(url, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (resp.ok) {
                  const json = await resp.json();
                  const authoritative =
                    json.betslips || json.bets || json || [];
                  if (
                    Array.isArray(authoritative) &&
                    authoritative.length > 0
                  ) {
                    authoritativeLocal = authoritative;
                    source = authoritativeLocal;
                  }
                }
              } catch (innerErr) {
                // ignore server fetch errors
              }
            }
          } catch (e) {
            // ignore
          }
        }

        // Log where the UI will source bets from when focused (helpful for debugging)
        try {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            let sourceLabel = "submittedBets (Supabase)";
            if (
              typeof authoritativeLocal !== "undefined" &&
              Array.isArray(authoritativeLocal) &&
              authoritativeLocal.length > 0
            ) {
              sourceLabel = `authoritativeLocal (bet-server) [${authoritativeLocal.length}]`;
            } else if (
              serverBets &&
              Array.isArray(serverBets) &&
              serverBets.length > 0
            ) {
              sourceLabel = `serverBets (bet-server) [${serverBets.length}]`;
            } else if (submittedBets && Array.isArray(submittedBets)) {
              sourceLabel = `submittedBets (Supabase) [${submittedBets.length}]`;
            }

            // If we're using Supabase rows, log id, updated_at and status for each row
            try {
              if (
                (!authoritativeLocal ||
                  !Array.isArray(authoritativeLocal) ||
                  authoritativeLocal.length === 0) &&
                !(
                  serverBets &&
                  Array.isArray(serverBets) &&
                  serverBets.length > 0
                ) &&
                Array.isArray(submittedBets)
              ) {
                submittedBets.forEach((b) => {
                  try {
                    const id = b.id || b.bet_id || b.uuid || null;
                    const updated =
                      b.updated_at ||
                      b.updatedAt ||
                      b.updated ||
                      b.modified_at ||
                      b.modifiedAt ||
                      null;
                    const status = b.status || b.state || null;
                  } catch (inner) {
                    // ignore per-row logging errors
                  }
                });
              }
            } catch (e2) {
              // ignore
            }
          }
        } catch (e) {
          /* ignore logging errors */
        }

        const tasks = source.map(async (ticket) => {
          try {
            const storedUrl =
              ticket.betslipData?.betslip_url ||
              ticket.betslip_url ||
              (ticket.betslipData && ticket.betslipData.betslip_url) ||
              null;
            const url = storedUrl || buildBetslipUrlFromTicket(ticket);

            if (!url) return null;
            const res = await fetch(url);
            if (!res.ok) {
              return null;
            }
            const data = await res.json();
            // Only return if we got valid data
            if (!data || typeof data !== "object") return null;
            // Attach betslip_url to the payload so polling can reuse it
            data.betslip_url = url;
            return { id: ticket.id, data };
          } catch (e) {
            return null;
          }
        });

        const results = await Promise.all(tasks);
        if (!mounted) return;
        const map = {};
        results.forEach((r) => {
          if (r && r.id) map[r.id] = r.data;
        });

        // Batch state updates to prevent intermediate renders with mismatched data
        // Update betslipLiveMap and serverBets together if we have authoritative data
        if (
          typeof authoritativeLocal !== "undefined" &&
          Array.isArray(authoritativeLocal)
        ) {
          betslipLiveMapRef.current = { ...betslipLiveMapRef.current, ...map };
          setBetslipLiveMap((prev) => ({ ...prev, ...map }));
          if (mounted) setServerBets(authoritativeLocal);
        } else {
          betslipLiveMapRef.current = { ...betslipLiveMapRef.current, ...map };
          setBetslipLiveMap((prev) => ({ ...prev, ...map }));
        }
      } catch (e) {
        /* ignore */
      }
    };

    fetchAll();
    return () => {
      mounted = false;
    };
    // only run when screen becomes focused
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  // Auto-expand behavior: if there's exactly one ticket, expand it. If multiple, collapse all.
  useEffect(() => {
    // Run only when the number of tickets changes. This prevents toggle
    // interactions from being immediately overridden by the effect.
    if (bets.length === 1) {
      const desired = new Set([bets[0].id]);
      const same =
        expandedParlays.size === desired.size &&
        [...desired].every((id) => expandedParlays.has(id));
      if (!same) setExpandedParlays(desired);
    } else {
      if (expandedParlays.size > 0) setExpandedParlays(new Set());
    }
    // Intentionally only depend on bets.length so user toggles aren't reset
    // by this effect. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bets.length]);

  // Polling: for each submitted ticket, fetch its betslip data periodically and store in `betslipLiveMap`.
  useEffect(() => {
    let mounted = true;

    const schedulePollForTicket = (ticket) => {
      const runOnceAndSchedule = async () => {
        let data = null;
        try {
          // CRITICAL: Only use betslip_url from betslipLiveMapRef (populated by on-focus fetch)
          // Never build URL from ticket bets - the built URL format is incorrect
          const latestData = betslipLiveMapRef.current[ticket.id];
          const url = latestData?.betslip_url || null;

          // If no betslip_url in ref, defer polling until on-focus fetch completes
          if (!url) {
            const handle = setTimeout(runOnceAndSchedule, 2000);
            pollsRef.current[ticket.id] = handle;
            return;
          }

          const res = await fetch(url);
          if (!res.ok) {
            // Don't update betslipLiveMap with failed fetches
            return;
          }
          data = await res.json();
          if (!mounted) return;
          // Only update if we got valid data (don't overwrite good data with null/undefined)
          if (data && typeof data === "object") {
            // CRITICAL: Preserve betslip_url when updating with fresh data from server
            // The server response doesn't include betslip_url, so we must add it back
            data.betslip_url = url;
            // Update ref immediately (synchronous) to prevent stale state during React batching
            betslipLiveMapRef.current = {
              ...betslipLiveMapRef.current,
              [ticket.id]: data,
            };
            setBetslipLiveMap((prev) => ({ ...prev, [ticket.id]: data }));
          } else {
          }
        } catch (e) {
          // ignore fetch errors; keep polling but don't clear existing data
        }

        // Decide next interval based on game states for this ticket.
        // Prefer authoritative states returned in the fetched betslip payload (`data.events`).
        const gameIds = [
          ...new Set(ticket.bets.map((b) => b.gameId).filter(Boolean)),
        ];

        let states = [];
        if (data && Array.isArray(data.events) && data.events.length > 0) {
          states = data.events.map((e) => {
            return (
              e?.status?.state ||
              e?.status?.type?.state ||
              (e?.status?.type?.name &&
                String(e.status.type.name).toLowerCase()) ||
              "pre"
            );
          });
        } else {
          // Fallback: consult scoreboardData when betslip payload doesn't include event states
          states = gameIds.map((gid) => {
            const ev = scoreboardData.find(
              (g) =>
                String(g.id) === String(gid) ||
                g.header?.competitions?.[0]?.id === gid,
            );
            return (
              ev?.header?.competitions?.[0]?.status?.type?.state ||
              ev?.status?.type?.state ||
              ev?.status?.state ||
              ev?.status ||
              "pre"
            );
          });
        }

        // If all post -> stop polling for this ticket
        if (
          states.length > 0 &&
          states.every((s) => String(s).toLowerCase() === "post")
        ) {
          clearPollForTicket(ticket.id);
          return;
        }

        // If any in/live -> 5s, else while any pre -> 90s
        const nextInterval = states.some((s) => {
          const st = String(s).toLowerCase();
          return (
            st === "in" ||
            st === "live" ||
            st === "inprogress" ||
            st === "in_progress"
          );
        })
          ? 5000
          : 90000;

        // Schedule next run
        const handle = setTimeout(runOnceAndSchedule, nextInterval);
        pollsRef.current[ticket.id] = handle;
      };

      // start immediately
      runOnceAndSchedule();
    };

    // Start/stop polls for each ticket (prefer authoritative server bets when present)
    const ticketsToUse =
      serverBets && Array.isArray(serverBets) && serverBets.length > 0
        ? serverBets
        : submittedBets;

    try {
      const inTickets = (ticketsToUse || []).filter((t) => {
        try {
          const latest =
            betslipLiveMap[t.id] || t.betslipData || t.betslip_data || null;
          let states = [];
          if (latest && Array.isArray(latest.events) && latest.events.length)
            states = latest.events.map((e) =>
              (e?.status?.state || e?.status || e?.status?.type?.state || "")
                .toString()
                .toLowerCase(),
            );
          else {
            const gameIds = [
              ...new Set((t.bets || []).map((b) => b.gameId).filter(Boolean)),
            ];
            states = gameIds.map((gid) => {
              const ev = scoreboardData.find(
                (g) =>
                  String(g.id) === String(gid) ||
                  g.header?.competitions?.[0]?.id === gid,
              );
              return (
                ev?.header?.competitions?.[0]?.status?.type?.state ||
                ev?.status?.type?.state ||
                ev?.status?.state ||
                ev?.status ||
                ""
              )
                .toString()
                .toLowerCase();
            });
          }
          return states.some((s) =>
            ["in", "live", "inprogress", "in_progress"].includes(s),
          );
        } catch (e) {
          return false;
        }
      });
    } catch (e) {
      /* ignore logging errors */
    }

    // Start/stop polls for each selected ticket
    ticketsToUse.forEach((ticket) => {
      try {
        // Only poll for open tickets and when this screen is focused
        if (!isFocused) {
          // ensure any active poll is cleared
          if (pollsRef.current[ticket.id]) clearPollForTicket(ticket.id);
          return;
        }
        const tstat = (ticket.status || "").toString().toLowerCase();
        // treat 'open' and 'pending' as pollable; stop polling otherwise
        if (tstat && tstat !== "open" && tstat !== "pending") {
          if (pollsRef.current[ticket.id]) clearPollForTicket(ticket.id);
          return;
        }
        // Prefer the most recent fetched payload when deciding whether to schedule.
        const latest =
          betslipLiveMap[ticket.id] ||
          ticket.betslipData ||
          ticket.betslip_data ||
          null;
        if (
          latest &&
          Array.isArray(latest.events) &&
          latest.events.length > 0 &&
          latest.events.every(
            (e) =>
              String(e?.status?.state || e?.status || "").toLowerCase() ===
              "post",
          )
        ) {
          // ensure any stray poll is cleared
          if (pollsRef.current[ticket.id]) clearPollForTicket(ticket.id);
          return; // skip scheduling
        }
      } catch (err) {
        // fallthrough to scheduling
      }

      if (!pollsRef.current[ticket.id]) {
        schedulePollForTicket(ticket);
      }
    });

    // Clear polls for tickets that no longer exist in the active source
    Object.keys(pollsRef.current).forEach((tid) => {
      if (!ticketsToUse.find((t) => t.id === tid)) clearPollForTicket(tid);
    });

    return () => {
      mounted = false;
      // clear all
      Object.keys(pollsRef.current).forEach((tid) => clearPollForTicket(tid));
    };
    // Only re-run when scoreboard data changes or focus changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreboardData, isFocused]);

  // Parse various gameInfo formats into a timestamp (ms).
  // Handles strings like "12/18 - 7:00 PM EST", "LAC @ OKC - 12/18 - 7:00 PM EST",
  // and other variants. It finds the date (MM/DD) and the time (hh:mm AM/PM)
  // segments and builds a Date using America/New_York (EST) for ordering.
  const parseGameInfoTime = (gameInfo) => {
    try {
      if (!gameInfo) return 0;
      const str = String(gameInfo);

      // Split on " - " and find parts that look like a date or time
      const parts = str.split(" - ").map((p) => p.trim());

      // regexes
      const dateRegex = /\b(\d{1,2})\/(\d{1,2})\b/; // MM/DD
      const timeRegex = /(\d{1,2}:\d{2})\s*(AM|PM|am|pm)/;

      let datePart = null;
      let timePart = null;

      // search parts for time and date components
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (!timePart && timeRegex.test(p)) {
          const m = p.match(timeRegex);
          timePart = m ? m[0] : p;
          continue;
        }
        if (!datePart && dateRegex.test(p)) {
          const m = p.match(dateRegex);
          datePart = m ? `${m[1]}/${m[2]}` : p;
          continue;
        }
      }

      // As a fallback, try to extract date/time from the whole string
      if (!timePart) {
        const m = str.match(timeRegex);
        if (m) timePart = m[0];
      }
      if (!datePart) {
        const m = str.match(dateRegex);
        if (m) datePart = `${m[1]}/${m[2]}`;
      }

      if (!datePart || !timePart) return 0;

      const [month, day] = datePart.split("/").map((n) => parseInt(n, 10));
      const year = new Date().getFullYear();

      // Compose a string that Date.parse understands with explicit EST
      const human = `${month}/${day}/${year} ${timePart} EST`;
      const ts = Date.parse(human);
      return isNaN(ts) ? 0 : ts;
    } catch (e) {
      return 0;
    }
  };

  // Format timestamp to EST date and time strings
  const formatToESTDateTime = (iso) => {
    try {
      const date = iso ? new Date(iso) : new Date();
      const optsDate = {
        timeZone: "America/New_York",
        month: "short",
        day: "2-digit",
      };
      const optsTime = {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      };
      const dateStr = date.toLocaleDateString("en-US", optsDate);
      const timeStr = date.toLocaleTimeString("en-US", optsTime) + " EST";
      return { dateStr, timeStr };
    } catch (e) {
      return { dateStr: "", timeStr: "" };
    }
  };

  const getStatusIcon = (status) => {
    if (status === "winning" || status === "won") {
      return (
        <View style={[styles.statusIcon, { backgroundColor: "#22C55E" }]}>
          <Ionicons name="checkmark-sharp" size={12} color="#000" />
        </View>
      );
    } else if (status === "losing" || status === "lost") {
      return (
        <View style={[styles.statusIcon, { backgroundColor: "#EF4444" }]}>
          <Ionicons name="close" size={12} color="#000" />
        </View>
      );
    } else {
      return (
        <View
          style={[
            styles.statusIcon,
            {
              backgroundColor: theme.cardBackground,
              borderWidth: 1,
              borderColor: theme.border,
            },
          ]}
        />
      );
    }
  };

  // Helper to check if a line value is valid for progress bar
  const isValidLineForProgress = (line) => {
    if (line == null || line === "N/A") return false;
    if (typeof line === "number") return !isNaN(line) && line !== 0;
    if (typeof line === "string") {
      // Strip symbols like +, -, and other non-numeric characters except decimal point
      const cleaned = line.replace(/[^\d.-]/g, "");
      const parsed = parseFloat(cleaned);
      return !isNaN(parsed) && parsed !== 0;
    }
    return false;
  };

  const renderProgressBar = (pick) => {
    // Accept numeric lines provided as numbers or numeric strings ("234.5", "109", "1+", "5-")
    let safeLine = null;
    if (typeof pick.line === "number" && !isNaN(pick.line) && pick.line !== 0) {
      safeLine = pick.line;
    } else if (typeof pick.line === "string") {
      // Strip symbols like +, -, and other non-numeric characters except decimal point
      const cleaned = pick.line.replace(/[^\d.-]/g, "");
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && parsed !== 0) {
        safeLine = parsed;
      }
    }
    let progress = 0;
    if (
      pick.currentValue !== null &&
      pick.currentValue !== undefined &&
      safeLine !== null
    ) {
      // Special handling for spreads: visualize relative to the spread line.
      // Use diff = opponent - team (positive => opponent leads).
      if (pick.isSpread) {
        const line = Number(safeLine);
        const diff = Number(pick.currentValue);
        const maxRange = Math.max(30, Math.abs(line) * 4);

        // Any diff <= line should push the indicator to the right end (100%).
        if (diff <= line) {
          progress = 100;
        } else {
          // Map values greater than line toward 0 across maxRange
          const frac = Math.max(0, Math.min(1, (diff - line) / maxRange));
          progress = Math.max(0, 100 - frac * 100);
        }
        progress = Math.max(0, Math.min(progress, 100));
      } else {
        progress = (pick.currentValue / safeLine) * 100;
        progress = Math.max(0, Math.min(progress, 100));
      }
    }

    // Determine color based on pick.status (winning/losing) rather than comparing values
    const wonStatus = pick.status === "winning" || pick.status === "won";
    const lostStatus = pick.status === "losing" || pick.status === "lost";
    const fillColor = wonStatus
      ? "#22C55E"
      : lostStatus
        ? "#EF4444"
        : theme.textTertiary;
    const indicatorBg = wonStatus
      ? "#4ade80"
      : lostStatus
        ? "#f87171"
        : theme.text;
    const indicatorTextColor =
      wonStatus || lostStatus ? "#000" : isDarkMode ? "#000" : "#FFF";

    return (
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: fillColor,
              },
            ]}
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={[styles.progressValue, { color: theme.text }]}>
            {pick.line}
          </Text>
          {pick.currentValue !== null && (
            <View
              style={[
                styles.progressIndicator,
                {
                  left: `${Math.min(progress, 95)}%`,
                  backgroundColor: indicatorBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.progressIndicatorText,
                  { color: indicatorTextColor },
                ]}
              >
                {typeof pick.currentValue === "number"
                  ? pick.currentValue
                  : pick.currentValue}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderPlayerPick = (pick, isInParlay = false) => (
    <View
      key={pick.id}
      style={[styles.pickCard, { backgroundColor: theme.surface }]}
    >
      <View style={[styles.pickHeader]}>
        {(pick.headshot ||
          pick.headshot_url ||
          pick.playerHeadshot ||
          pick.headshotUrl) && (
          <HeadshotOrInitials
            playerId={pick.playerId}
            uri={
              pick.headshot ||
              pick.headshot_url ||
              pick.playerHeadshot ||
              pick.headshotUrl
            }
            name={pick.playerName}
            backgroundColor={pick.playerColor}
            containerStyle={[
              styles.playerHeadshot,
              pick.playerColor
                ? {
                    backgroundColor:
                      pick.playerColor +
                      `${pick.sportSuffix === "uefa" ? "" : "88"}`,
                  }
                : null,
            ]}
            imageStyle={styles.playerHeadshot}
            initialsStyle={{ fontSize: 14 }}
          />
        )}
        <View style={styles.pickPlayerInfo}>
          <Text style={[styles.pickPlayerName, { color: theme.text }]}>
            {pick.playerName}
          </Text>
          <Text style={[styles.pickPlayerProp, { color: theme.textSecondary }]}>
            {pick.prop}
          </Text>
        </View>
        {getStatusIcon(pick.status)}
      </View>
      {pick.currentValue !== null &&
        typeof pick.currentValue === "number" &&
        !isNaN(pick.currentValue) &&
        isValidLineForProgress(pick.line) &&
        pick.gameState !== "pre" &&
        renderProgressBar(pick)}
      {!isInParlay && (
        <View style={styles.pickFooter}>
          <Text style={[styles.pickGameInfo, { color: theme.textSecondary }]}>
            {pick.gameInfo}
          </Text>
          <Text style={[styles.pickGameStatus, { color: theme.textTertiary }]}>
            {pick.gameStatus}
          </Text>
        </View>
      )}
    </View>
  );

  const renderTeamPick = (pick, isInParlay = false) => (
    <View
      key={pick.id}
      style={[styles.pickCard, { backgroundColor: theme.surface }]}
    >
      <View style={styles.pickHeader}>
        {(function () {
          const homeLogo =
            pick.homeTeamLogo ||
            pick.home_team_logo ||
            pick.home_logo ||
            pick.homeTeamLogoUrl;
          const awayLogo =
            pick.awayTeamLogo ||
            pick.away_team_logo ||
            pick.away_logo ||
            pick.awayTeamLogoUrl;
          const singleLogo =
            pick.teamLogo || pick.team_logo || pick.logo || pick.teamLogoUrl;

          if (pick.isTotal && homeLogo && awayLogo) {
            return (
              <View style={styles.overlappingLogos}>
                <Image source={{ uri: homeLogo }} style={styles.homeTeamLogo} />
                <Image source={{ uri: awayLogo }} style={styles.awayTeamLogo} />
              </View>
            );
          }

          if (singleLogo) {
            return (
              <Image
                source={{ uri: singleLogo }}
                style={styles.playerHeadshot}
              />
            );
          }

          return null;
        })()}
        <View style={styles.pickPlayerInfo}>
          <Text style={[styles.pickPlayerName, { color: theme.text }]}>
            {pick.displayName || pick.team || "GAME"}
          </Text>
          <Text style={[styles.pickPlayerProp, { color: theme.textSecondary }]}>
            {pick.prop}
          </Text>
        </View>
        {getStatusIcon(pick.status)}
      </View>
      {pick.currentValue !== null &&
        typeof pick.currentValue === "number" &&
        !isNaN(pick.currentValue) &&
        isValidLineForProgress(pick.line) &&
        pick.gameState !== "pre" &&
        renderProgressBar(pick)}
      {!isInParlay && (
        <View style={styles.pickFooter}>
          <Text style={[styles.pickGameInfo, { color: theme.textSecondary }]}>
            {pick.gameInfo}
          </Text>
          <Text style={[styles.pickGameStatus, { color: theme.textTertiary }]}>
            {pick.gameStatus}
          </Text>
        </View>
      )}
    </View>
  );

  const renderPick = (pick, isInParlay = false) => {
    // Debug logging to see why picks might not render
    if (!pick.playerName && !pick.team && !pick.isTotal && !pick.line) {
    }

    if (pick.playerName) {
      return renderPlayerPick(pick, isInParlay);
    } else if (pick.team || pick.isTotal || pick.line) {
      // Include picks with a line value (like DRAW moneyline bets)
      return renderTeamPick(pick, isInParlay);
    }
    return null;
  };

  const renderTeamBet = (bet) => (
    <TouchableOpacity
      key={bet.id}
      style={[styles.betCard, { backgroundColor: theme.surface }]}
    >
      <View style={styles.teamBetHeader}>
        {getStatusIcon(bet.status)}
        <View style={styles.teamBetInfo}>
          <View style={styles.teamBetTeam}>
            <View
              style={[styles.teamLogo, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="basketball" size={20} color="#FFF" />
            </View>
            <View>
              <Text style={[styles.teamBetName, { color: theme.text }]}>
                {bet.teamName}
              </Text>
              <Text
                style={[styles.teamBetType, { color: theme.textSecondary }]}
              >
                {bet.betType?.toUpperCase() || "MONEYLINE"}
              </Text>
            </View>
          </View>
          <Text style={[styles.teamBetOdds, { color: theme.text }]}>
            {formatOddsForDisplay(bet.odds, oddsDisplay)}
          </Text>
        </View>
      </View>

      <View style={styles.teamBetGame}>
        <View style={styles.teamBetScore}>
          <Text
            style={[styles.teamBetGameInfo, { color: theme.textSecondary }]}
          >
            {bet.gameInfo}
          </Text>
          {bet.scores && (
            <View style={styles.scoreRow}>
              {renderScoreText(bet.scores?.team1, bet.scores?.team2)}
              {bet.status === "winning" || bet.status === "losing" ? (
                <View
                  style={[
                    styles.liveIndicator,
                    { backgroundColor: theme.error, marginRight: 8 },
                  ]}
                >
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
        <Text style={[styles.teamBetGameStatus, { color: theme.textTertiary }]}>
          {bet.gameStatus}
        </Text>
        {bet.quarter && (
          <Text style={[styles.teamBetQuarter, { color: theme.textTertiary }]}>
            {bet.quarter}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderParlay = (parlay) => {
    const isExpanded = expandedParlays.has(parlay.id);
    const isSinglePick = parlay.picks.length === 1;

    // If single pick, always show expanded
    if (isSinglePick) {
      return (
        <View
          key={parlay.id}
          style={[styles.betCard, { backgroundColor: theme.surface }]}
        >
          <View style={styles.parlayExpandedHeader}>
            <View style={styles.parlayBadge}>
              <Text style={styles.parlayBadgeText}>SGP</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>
              Same Game Parlay
            </Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>
              {formatOddsForDisplay(parlay.odds, oddsDisplay)}
            </Text>
          </View>

          <View style={styles.parlayGameInfo}>
            <View style={styles.parlayGameScore}>
              <Text
                style={[styles.parlayGameText, { color: theme.textSecondary }]}
              >
                {parlay.gameInfo}
              </Text>
              {parlay.scores && (
                <View style={styles.scoreRow}>
                  {renderScoreText(parlay.scores?.team1, parlay.scores?.team2)}
                </View>
              )}
            </View>
            <View style={styles.parlayGameStatusRow}>
              <View
                style={[styles.liveIndicator, { backgroundColor: theme.error }]}
              >
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text
                style={[
                  styles.parlayGameStatus,
                  { color: theme.textTertiary, marginRight: 8 },
                ]}
              >
                {parlay.gameStatus}
              </Text>
            </View>
          </View>

          <View style={styles.parlayPicks}>
            {parlay.picks.map((pick) => renderPick(pick, true))}
          </View>
        </View>
      );
    }

    // Multiple picks - collapsible
    if (!isExpanded) {
      return (
        <TouchableOpacity
          key={parlay.id}
          style={[styles.betCard, { backgroundColor: theme.surface }]}
          onPress={() => toggleParlay(parlay.id)}
        >
          <View style={styles.parlayCollapsedHeader}>
            <View style={styles.parlayBadge}>
              <Text style={styles.parlayBadgeText}>SGP</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>
              Same Game Parlay
            </Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>
              {formatOddsForDisplay(parlay.odds, oddsDisplay)}
            </Text>
          </View>

          <View
            style={[styles.parlaySummary, { borderTopColor: theme.border }]}
          >
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {parlay.picks.length} Picks
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {parlay.wager.toFixed(2)} C
              </Text>
              <Text
                style={[
                  styles.parlaySummarySubLabel,
                  { color: theme.textTertiary },
                ]}
              >
                TOTAL WAGER
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {parlay.potentialPayout.toFixed(2)} C
              </Text>
              <Text
                style={[
                  styles.parlaySummarySubLabel,
                  { color: theme.textTertiary },
                ]}
              >
                TOTAL PAYOUT
              </Text>
            </View>
          </View>

          {parlay.cashOutValue && (
            <TouchableOpacity
              style={[styles.cashOutButton, { backgroundColor: "#22C55E" }]}
            >
              <Text style={styles.cashOutButtonText}>
                Cash out {parlay.cashOutValue.toFixed(2)} C
              </Text>
              <Text style={styles.cashOutSubtext}>
                BONUS BET STAKE NOT INCLUDED
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.expandIndicator}>
            <Ionicons
              name="chevron-down"
              size={20}
              color={theme.textSecondary}
            />
          </View>
        </TouchableOpacity>
      );
    }

    // Expanded view
    return (
      <View
        key={parlay.id}
        style={[styles.betCard, { backgroundColor: theme.surface }]}
      >
        <View style={styles.parlayExpandedHeader}>
          <View style={styles.parlayBadge}>
            <Text style={styles.parlayBadgeText}>SGP</Text>
          </View>
          <Text style={[styles.parlayTitle, { color: theme.text }]}>
            Same Game Parlay
          </Text>
          <Text style={[styles.parlayOdds, { color: theme.text }]}>
            {parlay.odds}
          </Text>
        </View>

        <View style={styles.parlayGameInfo}>
          <View style={styles.parlayGameScore}>
            <Text
              style={[styles.parlayGameText, { color: theme.textSecondary }]}
            >
              {parlay.gameInfo}
            </Text>
            {renderScoreText(parlay.scores?.team1, parlay.scores?.team2)}
          </View>
          <View style={styles.parlayGameStatusRow}>
            <View
              style={[
                styles.liveIndicator,
                { backgroundColor: theme.error, marginRight: 8 },
              ]}
            >
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text
              style={[
                styles.parlayGameStatus,
                { color: theme.textTertiary, marginLeft: 8 },
              ]}
            >
              {parlay.gameStatus}
            </Text>
          </View>
        </View>

        <View style={styles.parlayPicks}>
          {parlay.picks.map((pick) => renderPick(pick, true))}
        </View>

        <TouchableOpacity
          style={styles.collapseButton}
          onPress={() => toggleParlay(parlay.id)}
        >
          <Ionicons name="chevron-up" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  // Render a submitted bet slip
  const renderSubmittedBet = (betSlip) => {
    // Prefer live-updated fetched data when available (read from ref for most recent data)
    const live =
      betslipLiveMapRef.current[betSlip.id] || betslipLiveMap[betSlip.id];

    // Normalize various payload `won` representations into UI status
    const normalizeWon = (w) => {
      try {
        if (w === true || w === "true") return "winning";
        const s = (w == null ? "" : String(w)).toLowerCase();
        if (s === "won" || s === "winning" || s === "true") return "winning";
        if (s === "lost" || s === "losing" || s === "false") return "losing";
        if (s === "pending" || s === "pending_review" || s === "open")
          return "pending";
        return null;
      } catch (e) {
        return null;
      }
    };
    const betslipData =
      live || betSlip.betslipData || betSlip.betslip_data || null;
    // DEV logging: show fetched payload events and available bet keys
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      try {
        const src = live ? "live" : betSlip.betslipData ? "stored" : "none";
        console.log(
          `betslip payload for ticket ${betSlip.id} (source=${src}):`,
        );
        const events = (betslipData && betslipData.events) || [];
        if (events.length === 0) console.log("  no events in payload");
      } catch (e) {}
    }
    const originalBets = betSlip.bets || betSlip.bets || [];
    const amount = betSlip.amount || 0;

    // Debug: log when rendering with no betslipData
    if (!betslipData && typeof __DEV__ !== "undefined" && __DEV__) {
    }

    // Helper: normalize gameId by stripping trailing sport suffix like _nba/_nfl
    const normalizeGameId = (g) => {
      try {
        const s = String(g || "");
        return s.replace(/_[a-z0-9]+$/i, "");
      } catch (e) {
        return String(g || "");
      }
    };

    // Helper: derive canonical stat key used in betslip payloads (e.g. SHT, GSV, PTS)
    const deriveStatKey = (statType, sport) => {
      try {
        const s = String(statType || "").toLowerCase();
        const sportLower = String(sport || "").toLowerCase();
        if (!s) return "PTS";

        // Quarter-specific stats (NBA)
        if (s.includes("1q_assists") || s === "1q_assists_ou") return "1QAST";
        if (s.includes("1q_points") || s === "1q_points_ou") return "1QPTS";
        if (s.includes("1q_rebounds") || s === "1q_rebounds_ou") return "1QREB";

        // NHL-specific stats (NHL uses "points" to mean "goals")
        if (sportLower === "nhl") {
          // Points in NHL = Goals
          if (s === "points_yn" || s.includes("points_yn")) return "GOALS";
          if (s === "points_ou" || s.includes("points_ou")) return "HGL";

          // First/Last to score
          if (s.includes("firsttoscore") || s.includes("first_to_score"))
            return "FIRSTGOAL";
          if (s.includes("lasttoscore") || s.includes("last_to_score"))
            return "LASTGOAL";

          // Power play goals+assists
          if (s.includes("powerplay") || s.includes("power_play")) return "PPP";

          // Goals+Assists
          if (s.includes("goals+assists") || s === "goals+assists_ou")
            return "GA";

          // Goalie saves
          if (
            s.includes("goalie_saves") ||
            s.includes("save") ||
            s.includes("gsv")
          )
            return "GSV";

          // Shots on goal
          if (s.includes("shots") || s.includes("shot") || s.includes("sht"))
            return "SHT";

          // Blocks for NHL
          if (s.includes("block") || s.includes("bs")) return "BS";

          // Assists
          if (s.includes("assist") || s.includes("ast")) return "AST";
        }

        if (sportLower === "uefa") {
          // Points in NHL = Goals
          if (s === "points_yn" || s.includes("points_yn")) return "GOALS";
          if (s === "points_ou" || s.includes("points_ou")) return "UGL";

          // First/Last to score
          if (s.includes("firsttoscore") || s.includes("first_to_score"))
            return "FIRSTGOAL";
          if (s.includes("lasttoscore") || s.includes("last_to_score"))
            return "LASTGOAL";

          if (s.includes("combinedcards") || s === "combinedcards_yn")
            return "CARDS";

          if (s.includes("redcards") || s === "redcards_yn") return "RC";

          if (s.includes("yellowcards") || s === "yellowcards_yn") return "YC";

          if (s.includes("assists") || s === "assists_ou") return "UAST";

          if (s.includes("shotsongoal") || s === "shotsongoal_ou")
            return "USOG";

          if (s.includes("shots") || s.includes("shot") || s.includes("sht"))
            return "USHT";
        }

        // NBA Combination stats
        if (s.includes("blocks+steals") || s === "blocks+steals_ou")
          return "BS";
        if (s.includes("points+assists") || s === "points+assists_ou")
          return "PA";
        if (
          s.includes("points+rebounds+assists") ||
          s === "points+rebounds+assists_ou"
        )
          return "PRA";
        if (s.includes("points+rebounds") || s === "points+rebounds_ou")
          return "PR";
        if (s.includes("rebounds+assists") || s === "rebounds+assists_ou")
          return "RA";

        // Milestone/Special stats
        if (s.includes("firstbasket") || s === "firstbasket_yn")
          return "FIRSTBASKET";
        if (s.includes("doubledouble") || s === "doubledouble_yn")
          return "2DBL";
        if (s.includes("tripledouble") || s === "tripledouble_yn")
          return "3DBL";
        if (s.includes("threepointersmade") || s === "threepointersmade_ou")
          return "3PM";

        // NFL stats
        if (sportLower === "nfl") {
          // Passing
          if (s.includes("passing_yards")) return "PYDS";
          if (s.includes("passing_attempts")) return "PATT";
          if (s.includes("passing_completions")) return "PCMP";
          if (s.includes("passing_interceptions")) return "PINT";
          if (s.includes("passing_touchdowns")) return "PTD";
          if (s.includes("passing_longestcompletion")) return "PLNG";
          if (s.includes("passing+rushing_yards")) return "PRYDS";

          // Rushing
          if (s.includes("rushing_yards")) return "RYDS";
          if (s.includes("rushing_attempts")) return "RATT";
          if (s.includes("rushing_longestrush")) return "RLNG";

          // Receiving
          if (s.includes("receiving_yards")) return "RECYDS";
          if (s.includes("receiving_receptions")) return "RREC";
          if (s.includes("receiving_longestreception")) return "RECLONG";
          if (s.includes("rushing+receiving_yards")) return "RRYDS";

          // Kicking
          if (s.includes("extrapoints_kicksmade")) return "KXP";
          if (s.includes("fieldgoals_made")) return "KFG";
          if (s.includes("kicking_totalpoints")) return "KPTS";

          // Defense
          if (s.includes("defense_sacks")) return "DSAC";

          // Touchdowns
          if (s.includes("touchdowns_ou")) return "TDS";
          if (s.includes("touchdowns_yn")) return "TOUCHDOWN";
          if (s.includes("firsttouchdown")) return "FIRSTTOUCHDOWN";
          if (s.includes("lasttouchdown")) return "LASTTOUCHDOWN";
        }

        // Basic stats (NBA/NFL)
        if (s.includes("point") || s.includes("pts") || s.includes("points"))
          return "PTS";
        if (s.includes("rebound") || s.includes("reb")) return "REB";
        if (s.includes("assist") || s.includes("ast")) return "AST";
        if (s.includes("block") || s.includes("blk")) return "BLK";
        if (s.includes("steal") || s.includes("stl")) return "STL";
        if (s.includes("turnover") || s.includes("tur") || s === "to")
          return "TO";

        // fallback: take first 3 uppercase letters
        return String(statType).toUpperCase().substring(0, 3);
      } catch (e) {
        return String(statType || "PTS")
          .toUpperCase()
          .substring(0, 3);
      }
    };

    // Helper: remove parenthetical annotations like "(Weighted)" or "(Full Match)"
    const stripParenthetical = (s) => {
      try {
        if (!s) return s;
        return String(s)
          .replace(/\s*\([^)]*\)/g, "")
          .trim();
      } catch (e) {
        return s;
      }
    };

    // Helper: resolve a key in an object with flexible casing/formatting
    const resolveKeyInObject = (obj, key) => {
      try {
        if (!obj || !key) return null;
        const k = String(key);
        const candidates = new Set([
          k,
          k.toUpperCase(),
          k.toLowerCase(),
          k.replace(/[^a-z0-9]/gi, ""),
          k.replace(/[^a-z0-9]/gi, "").toUpperCase(),
        ]);
        for (const c of candidates) {
          if (c && Object.prototype.hasOwnProperty.call(obj, c)) return c;
        }
        const lower = k.toLowerCase();
        for (const existing of Object.keys(obj)) {
          if (String(existing).toLowerCase() === lower) return existing;
        }
        return null;
      } catch (e) {
        return null;
      }
    };

    // Normalize various period representations into payload keys like P1, P2, P3, P4, OT
    const normalizePeriodKey = (p) => {
      try {
        if (!p && p !== 0) return null;
        let s = String(p).toUpperCase().trim();
        // already in P1/P2 format
        if (/^P\d+/.test(s)) return s.replace(/^P(\d+)/, (m, n) => `P${n}`);
        // numeric like '1' or '01'
        if (/^\d+$/.test(s)) return `P${String(Number(s))}`;
        // ordinals
        if (
          s.includes("1ST") ||
          s.includes("FIRST") ||
          s === "Q1" ||
          s === "1ST PERIOD"
        )
          return "P1";
        if (
          s.includes("2ND") ||
          s.includes("SECOND") ||
          s === "Q2" ||
          s === "2ND PERIOD"
        )
          return "P2";
        if (
          s.includes("3RD") ||
          s.includes("THIRD") ||
          s === "Q3" ||
          s === "3RD PERIOD"
        )
          return "P3";
        if (
          s.includes("4TH") ||
          s.includes("FOURTH") ||
          s === "Q4" ||
          s === "4TH PERIOD"
        )
          return "P4";
        if (s.includes("OT") || s.includes("OVERTIME")) return "POT";
        // fallback: if it starts with a digit somewhere, pick that
        const m = s.match(/(\d)/);
        if (m) return `P${m[1]}`;
        return null;
      } catch (e) {
        return null;
      }
    };

    // Determine badge type
    const gameIds = [...new Set(originalBets.map((bet) => bet.gameId))];
    const gamesCount = gameIds.length;
    let badgeType = "SINGLE";
    let badgeColor = "#3B82F6";

    if (originalBets.length === 1) {
      badgeType = "SINGLE";
      badgeColor = "#10B981";
    } else if (gamesCount === 1) {
      badgeType = "SGP";
      badgeColor = "#3B82F6";
    } else if (gamesCount > 1) {
      // Check if any game has 2+ picks (SGP+)
      const picksByGame = {};
      originalBets.forEach((bet) => {
        picksByGame[bet.gameId] = (picksByGame[bet.gameId] || 0) + 1;
      });
      const hasSGP = Object.values(picksByGame).some((count) => count >= 2);
      if (hasSGP) {
        badgeType = "SGP+";
        badgeColor = "#8B5CF6";
      } else {
        badgeType = "PARLAY";
        badgeColor = "#F59E0B";
      }
    }

    // Build picks from originalBets with betslipData if available
    const allPicks = originalBets.map((bet) => {
      const pick = {
        id: bet.id,
        gameId: bet.gameId,
      };
      // Expose a canonical key on the pick so resolvers can prefer it.
      try {
        // If this is a team- or game-scoped pick (id starts with 'team' or 'game'),
        // prefer the explicit `bet.key` so payload lookups match event-level keys.
        // For other picks (typically player props), derive a stat key instead
        // and avoid assigning the event-level `key` which causes progressSource mismatches.
        const idStr = String(bet.id || "");
        if (/^(team-|game-)/i.test(idStr)) {
          pick.key = bet.key || null;
        } else {
          try {
            pick.key = deriveStatKey(
              bet.statType || bet.prop || bet.propType || bet.id || "",
              bet.sport || "",
            );
          } catch (e) {
            pick.key = null;
          }
        }
      } catch (e) {
        pick.key = null;
      }

      // Prefer betslipData.events for game info/status/scores
      let eventData = null;
      if (betslipData?.events) {
        const targetId = normalizeGameId(bet.gameId);
        eventData = betslipData.events.find((e) => {
          try {
            return (
              String(e.eventId) === targetId ||
              normalizeGameId(e.eventId) === targetId
            );
          } catch (err) {
            return false;
          }
        });
      }
      if (eventData) {
        // Use eventData for all game info
        pick.gameInfo = eventData?.status?.game
          ? `${eventData.status.game.awayTeam} @ ${eventData.status.game.homeTeam}`
          : bet.gameInfoTeams || "Game";
        pick.gameStatus =
          eventData?.status?.shortDetail ||
          eventData?.status?.state ||
          "Scheduled";
        // expose normalized state (pre/in/post) for conditional rendering
        pick.gameState = eventData?.status?.state || null;
        // Only expose scores if at least one score value is present
        if (eventData?.status?.game) {
          const awayScore = eventData.status.game.awayScore;
          const homeScore = eventData.status.game.homeScore;
          if (awayScore != null || homeScore != null) {
            pick.scores = {
              team1: awayScore,
              team2: homeScore,
            };
          }
        }
      } else {
        // Fallback to scoreboard or ticket data
        const liveGame = getLiveGameData(bet.gameId);
        // If the bet contains a gameInfo object (from ticket), prefer its fields for pre-game display
        if (bet.gameInfo && typeof bet.gameInfo === "object") {
          pick.gameInfo =
            bet.gameInfo.teams ||
            bet.gameInfoTeams ||
            liveGame?.shortName ||
            "Game";
          pick.gameStatus =
            bet.gameInfo.time ||
            bet.gameInfoTime ||
            liveGame?.status?.type?.shortDetail ||
            "Scheduled";
        } else {
          pick.gameInfo = liveGame?.shortName || bet.gameInfoTeams || "Game";
          pick.gameStatus =
            liveGame?.status?.type?.shortDetail ||
            bet.gameInfoTime ||
            "Scheduled";
        }
        pick.gameState = liveGame?.status?.type?.state || null;
      }

      // Player props
      if (bet.playerId) {
        pick.playerName = bet.player;
        // determine sport suffix from gameId or statType/prop
        const getSportFromBet = (b) => {
          try {
            if (
              b.gameId &&
              typeof b.gameId === "string" &&
              b.gameId.includes("_")
            ) {
              return b.gameId.split("_").pop().toLowerCase();
            }
            const s = (b.statType || b.prop || "").toLowerCase();
            if (
              s.includes("pass") ||
              s.includes("pyds") ||
              s.includes("passing")
            )
              return "nfl";
            if (
              s.includes("rush") ||
              s.includes("ryds") ||
              s.includes("rushing")
            )
              return "nfl";
            if (
              s.includes("shot") ||
              s.includes("shots") ||
              s.includes("sht") ||
              s.includes("save") ||
              s.includes("gsv")
            )
              return "nhl";
            if (
              s.includes("goal") ||
              s.includes("ugl") ||
              s.includes("yc") ||
              s.includes("card")
            )
              return "uefa";
            if (
              s.includes("pts") ||
              s.includes("points") ||
              s.includes("3pm") ||
              s.includes("ast")
            )
              return "nba";
            return null;
          } catch (e) {
            return null;
          }
        };

        const sportSuffix = getSportFromBet(bet) || "nba";
        const sportPath = sportSuffix === "uefa" ? "soccer" : sportSuffix;
        const hsUrl = `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${bet.playerId}.png&w=200`;
        // Avoid assigning headshot URL if we've previously recorded it as missing
        pick.headshot = isFailedHeadshot(bet.playerId) ? null : hsUrl;
        pick.color = bet.playerColor || null;
        pick.sportSuffix = sportSuffix;

        // Format prop text: for milestones, show "<line> <Formatted Prop>" and clean up the label
        const formatMilestoneProp = (b) => {
          const displayLine = b.betValue || b.line || "";
          let raw = b.prop || b.statType || "";
          if (!raw) return `${displayLine}`;
          // Remove ou/o/u suffixes and any trailing numeric parts or standalone OU tokens
          raw = String(raw);
          // detect and strip Y/N suffixes like _yn or -yn
          const hadYN = /[_-](y|yn)\b/i.test(raw);
          raw = raw.replace(/[_-](y|yn)\b/gi, "");
          // remove patterns like _ou, -ou at end
          raw = raw.replace(/[_-](o|u|ou)\b/gi, "");
          // remove standalone tokens 'ou', 'o', 'u'
          raw = raw.replace(/\b(o|u|ou)\b/gi, "");
          // remove the actual line value if present
          try {
            const escapedLine = String(displayLine).replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&",
            );
            raw = raw.replace(new RegExp(escapedLine, "gi"), "");
          } catch (e) {}
          // replace underscores with spaces
          raw = raw.replace(/_/g, " ");
          // split camelCase (onGoal -> on Goal)
          raw = raw.replace(/([a-z])([A-Z])/g, "$1 $2");
          // collapse multiple spaces
          raw = raw.replace(/\s+/g, " ").trim();
          // special-case: points_yn -> ANYTIME GOALS
          const rawLower = raw.toLowerCase();
          if (hadYN && rawLower.includes("points")) {
            const label = "ANYTIME GOAL";
            return `${String(displayLine).toUpperCase()} ${label}`.trim();
          }
          if (!hadYN && rawLower.includes("points") && sportSuffix === "uefa") {
            const label = "GOALS";
            return `${String(displayLine).toUpperCase()} ${label}`.trim();
          }
          if (
            hadYN &&
            rawLower.includes("combined") &&
            sportSuffix === "uefa"
          ) {
            const label = "ANYTIME CARD";
            return `${String(displayLine).toUpperCase()} ${label}`.trim();
          }

          // capitalize first letter of each word only
          raw = raw
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");

          // If this was a Y/N prop, prefer ALL CAPS for clarity and put bet value first
          if (hadYN) {
            return `${String(
              displayLine,
            ).toUpperCase()} ${raw.toUpperCase()}`.trim();
          }

          return `${displayLine} ${raw}`.trim();
        };

        // Format over/under prop: "O2.5 Shots On Goal" or "U2.5 Shots On Goal"
        const formatOverUnderProp = (b) => {
          const displayLine = b.betValue || b.line || "";
          let raw = b.prop || b.statType || "";
          if (!raw) return `${displayLine}`;
          raw = String(raw);
          // detect and strip Y/N suffixes like _yn or -yn
          const hadYN = /[_-](y|yn)\b/i.test(raw);
          raw = raw.replace(/[_-](y|yn)\b/gi, "");
          // remove patterns like _ou, -ou at end
          raw = raw.replace(/[_-](o|u|ou)\b/gi, "");
          // remove standalone O/U tokens and line values from the string
          raw = raw.replace(/\b(o|u|ou)\s*\d+\.?\d*/gi, "");
          // remove the actual line value if present
          try {
            const escapedLine = String(displayLine).replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&",
            );
            raw = raw.replace(new RegExp(escapedLine, "gi"), "");
          } catch (e) {}
          // replace underscores with spaces
          raw = raw.replace(/_/g, " ");
          // split camelCase (onGoal -> on Goal)
          raw = raw.replace(/([a-z])([A-Z])/g, "$1 $2");
          // collapse multiple spaces
          raw = raw.replace(/\s+/g, " ").trim();
          // special-case: points_yn -> ANYTIME GOALS
          const rawLower = raw.toLowerCase();
          if (hadYN && rawLower.includes("points")) {
            const label = "ANYTIME GOAL";
            return `${String(displayLine).toUpperCase()} ${label}`.trim();
          }
          if (!hadYN && rawLower.includes("points") && sportSuffix === "uefa") {
            const label = "GOALS";
            return `${String(displayLine).toUpperCase()} ${label}`.trim();
          }
          if (
            hadYN &&
            rawLower.includes("combined") &&
            sportSuffix === "uefa"
          ) {
            const label = "ANYTIME CARD";
            return `${String(displayLine).toUpperCase()} ${label}`.trim();
          }

          // capitalize first letter of each word only
          raw = raw
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");

          // If this was a Y/N prop, prefer ALL CAPS for clarity and put bet value first
          if (hadYN) {
            return `${String(
              displayLine,
            ).toUpperCase()} ${raw.toUpperCase()}`.trim();
          }

          return `${displayLine} ${raw}`.trim();
        };

        pick.prop =
          bet.type === "milestone"
            ? formatMilestoneProp(bet)
            : bet.type === "over" ||
                bet.type === "under" ||
                bet.type === "yesno"
              ? formatOverUnderProp(bet)
              : bet.prop || "";
        pick.propType = bet.statType;
        // Preserve the original line value (could be "1+", "5-", "O1.5", etc.)
        // Don't convert to number here - let the progress bar function handle parsing
        pick.line = bet.line;
        pick.type = bet.type;
        pick.betValue = bet.betValue;
        pick.playerColor = bet.playerColor;

        // Try to get current value from betslipData
        if (betslipData?.events) {
          const targetId = normalizeGameId(bet.gameId);
          const eventData = betslipData.events.find((e) => {
            try {
              return (
                String(e.eventId) === targetId ||
                normalizeGameId(e.eventId) === targetId
              );
            } catch (err) {
              return false;
            }
          });
          if (eventData?.bets?.players) {
            const playerData = eventData.bets.players.find(
              (p) => String(p.id) === String(bet.playerId),
            );
            if (playerData) {
              // Extract player color from payload for live games
              if (playerData.color) {
                pick.playerColor = String(playerData.color).startsWith("#")
                  ? playerData.color
                  : `#${playerData.color}`;
              }
              // Derive statKey using provided statType when available; otherwise
              // attempt to infer from prop/description. Pass sport hint so NFL
              // mappings return the canonical keys expected in betslip payloads.
              const sportHint = getSportFromBet(bet) || bet.sport || "";
              let statKey = deriveStatKey(bet.statType, sportHint);
              if (!statKey || statKey.length === 0 || statKey === "PTS") {
                // try to infer from prop/description or propType
                statKey = deriveStatKey(
                  bet.prop || bet.description || bet.propType || "",
                  sportHint,
                );
              }

              // try to resolve milestone/overUnder keys with flexible casing
              const milestoneKey = resolveKeyInObject(
                playerData.milestones,
                statKey,
              );
              const ouKey = resolveKeyInObject(playerData.overUnder, statKey);

              if (bet.type === "milestone" && milestoneKey) {
                pick.currentValue = Number(
                  playerData.milestones[milestoneKey].current,
                );
                pick.progressSource = `betslipData.event:${
                  eventData?.eventId || bet.gameId
                }.players:${playerData.id}.milestones:${milestoneKey}`;
                // Preserve the line from milestone data or original bet.line
                // Don't convert to number - let progress bar function handle parsing
                const rawLine =
                  playerData.milestones[milestoneKey].threshold ??
                  playerData.milestones[milestoneKey].bet ??
                  bet.betValue ??
                  bet.threshold ??
                  bet.line;
                if (rawLine != null) pick.line = rawLine;
                pick.status =
                  playerData.milestones[milestoneKey].won === true
                    ? "winning"
                    : playerData.milestones[milestoneKey].won === false
                      ? "losing"
                      : "pending";
                pick.progressWonSource = `betslipData.event:${
                  eventData?.eventId || bet.gameId
                }.players:${playerData.id}.milestones:${milestoneKey}.won`;
              } else if (ouKey) {
                pick.currentValue = Number(playerData.overUnder[ouKey].current);
                pick.progressSource = `betslipData.event:${
                  eventData?.eventId || bet.gameId
                }.players:${playerData.id}.overUnder:${ouKey}`;
                pick.status =
                  playerData.overUnder[ouKey].won === true
                    ? "winning"
                    : playerData.overUnder[ouKey].won === false
                      ? "losing"
                      : "pending";
                pick.progressWonSource = `betslipData.event:${
                  eventData?.eventId || bet.gameId
                }.players:${playerData.id}.overUnder:${ouKey}.won`;
              } else if (playerData.milestones?.PRA) {
                // Fallback to PRA milestone when specific statKey isn't available
                if (pick.currentValue == null || isNaN(pick.currentValue)) {
                  pick.currentValue = Number(playerData.milestones.PRA.current);
                  pick.progressSource = `betslipData.event:${
                    eventData?.eventId || bet.gameId
                  }.players:${playerData.id}.milestones:PRA`;
                  pick.line = Number(
                    playerData.milestones.PRA.threshold ??
                      playerData.milestones.PRA.bet ??
                      pick.line,
                  );
                  pick.status =
                    playerData.milestones.PRA.won === true
                      ? "winning"
                      : playerData.milestones.PRA.won === false
                        ? "losing"
                        : "pending";
                  pick.progressWonSource = `betslipData.event:${
                    eventData?.eventId || bet.gameId
                  }.players:${playerData.id}.milestones:PRA.won`;
                }
              } else {
                pick.status = "pending";
              }
              // Prefer canonical player name from betslip payload for non-pre games
              try {
                const evtState = (eventData?.status?.state || "")
                  .toString()
                  .toLowerCase();
                if (playerData.name && evtState !== "pre") {
                  pick.playerName = playerData.name;
                }

                // Also prefer canonical game info/scores/status from payload for non-pre games
                if (eventData?.status && evtState !== "pre") {
                  const g = eventData.status.game;
                  if (g) {
                    const home = g.homeTeam || g.home || g.homeAbbrev || "";
                    const away = g.awayTeam || g.away || g.awayAbbrev || "";
                    const homeScore = g.homeScore ?? g.home_score ?? null;
                    const awayScore = g.awayScore ?? g.away_score ?? null;
                    if (homeScore != null && awayScore != null) {
                      // keep numeric scores separate in `pick.scores` so we can
                      // render them with `renderScoreText` (which bolds winners)
                      pick.gameInfo = `${g.awayTeam || away} @ ${
                        g.homeTeam || home
                      }`;
                    } else if (g.homeTeam && g.awayTeam) {
                      pick.gameInfo = `${g.awayTeam} @ ${g.homeTeam}`;
                    }
                    pick.gameStatus =
                      eventData.status.shortDetail ||
                      eventData.status.state ||
                      pick.gameStatus;
                    pick.gameState = eventData.status.state || pick.gameState;
                    pick.scores = g
                      ? { team1: g.awayScore, team2: g.homeScore }
                      : pick.scores;
                  }
                }
              } catch (e) {
                /* ignore */
              }
            }
          }
        } else {
          pick.status = "pending";
        }
      }
      // Game line bets
      else if (
        bet.type === "Spread" ||
        bet.type === "Total" ||
        bet.type === "Moneyline" ||
        bet.type === "Milestone" ||
        bet.type === "alt" ||
        bet.type === "away_points" ||
        bet.type === "home_points" ||
        bet.type === "away_goals" ||
        bet.type === "home_goals" ||
        bet.type?.toLowerCase().includes("moneyline") ||
        bet.type?.toLowerCase().includes("spread") ||
        bet.type?.toLowerCase().includes("period") ||
        bet.type?.toLowerCase().includes("quarter") ||
        bet.type?.toLowerCase().includes("half") ||
        bet.type?.includes("_points") ||
        bet.type?.includes("_goals") ||
        bet.type?.includes("Over/Under") ||
        bet.type?.includes("Yes/No") ||
        bet.type?.includes("Goals")
      ) {
        const liveGame = getLiveGameData(bet.gameId);
        pick.betType = bet.type.toLowerCase();
        pick.team = bet.team;
        // Preserve line as string/number handled elsewhere; try numeric conversion
        pick.line = Number(bet.line);

        // Early-detect UEFA-style totals (corner/cards) even when bet.type isn't exactly "Total"
        try {
          const combinedQuick =
            `${bet.type} ${bet.description || ""} ${bet.id || ""}`.toLowerCase();
          const isCornerQuick = /corner/.test(combinedQuick);
          const isCardsQuick = /card|cards/.test(combinedQuick);
          if ((isCornerQuick || isCardsQuick) && !bet.team) {
            // Build pick for special total and return early to avoid fallback overriding
            if (isCornerQuick) {
              bet.propType = bet.propType || "totalCorner";
              pick.displayName = "GAME";
              const linePart = String(bet.line || bet.description || "").trim();
              pick.prop = `${linePart}${linePart ? " " : ""}TOTAL CORNERS`;
              pick.isTotal = true;
            } else {
              bet.propType = bet.propType || "totalCards";
              pick.displayName = "GAME";
              pick.prop = `${String(bet.line || bet.description || "").trim()} TOTAL CARDS`;
              pick.isTotal = true;
            }

            // Attach both logos for game totals
            let awayTeam = bet.awayTeam;
            let awayId = bet.team1Id;
            let homeTeam = bet.homeTeam;
            let homeId = bet.team2Id;
            if (!awayTeam || !homeTeam) {
              if (liveGame?.competitions?.[0]?.competitors) {
                const competitors = liveGame.competitions[0].competitors;
                awayTeam = competitors.find((c) => c.homeAway === "away")?.team
                  ?.abbreviation;
                homeTeam = competitors.find((c) => c.homeAway === "home")?.team
                  ?.abbreviation;
              } else if (bet.gameInfo?.teams) {
                const teams = String(bet.gameInfo.teams || "").split(" @ ");
                awayTeam = teams[0]?.trim();
                homeTeam = teams[1]?.trim();
              }
            }
            const sportPathQuick =
              bet.sport === "UEFA"
                ? "soccer"
                : (bet.sport || "nba").toLowerCase();
            const toUseAwayQuick =
              bet.sport === "UEFA" ? awayId : (awayTeam || "").toLowerCase();
            const toUseHomeQuick =
              bet.sport === "UEFA" ? homeId : (homeTeam || "").toLowerCase();
            pick.awayTeamLogo = awayTeam
              ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPathQuick}/500${isDarkMode ? "-dark" : ""}/${toUseAwayQuick}.png&h=100&w=100`
              : null;
            pick.homeTeamLogo = homeTeam
              ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPathQuick}/500${isDarkMode ? "-dark" : ""}/${toUseHomeQuick}.png&h=100&w=100`
              : null;

            // Try to apply live payload values for totals (totalCorner/totalCards)
            try {
              const targetIdQuick = normalizeGameId(bet.gameId);
              const matches = (betslipData?.events || []).filter((e) => {
                try {
                  return (
                    String(e.eventId) === targetIdQuick ||
                    normalizeGameId(e.eventId) === targetIdQuick
                  );
                } catch (er) {
                  return false;
                }
              });
              if (matches.length > 0) {
                const wantKey =
                  bet.propType ||
                  bet.prop ||
                  (isCornerQuick
                    ? "totalCorner"
                    : isCardsQuick
                      ? "totalCards"
                      : null);
                let chosen = null;
                let chosenResolved = null;
                for (const m of matches) {
                  if (!m?.bets) continue;
                  const resolved =
                    resolveBetsPayloadKey(m.bets, pick, bet) ||
                    (wantKey && (m.bets[wantKey] ? wantKey : null));
                  if (resolved && m.bets[resolved]) {
                    chosen = m;
                    chosenResolved = resolved;
                    break;
                  }
                }
                // fallback to first match if none contain resolved key
                if (!chosen) {
                  chosen = matches[0];
                  chosenResolved =
                    resolveBetsPayloadKey(chosen.bets, pick, bet) ||
                    (wantKey && (chosen.bets[wantKey] ? wantKey : null));
                }

                if (chosen && chosenResolved && chosen.bets[chosenResolved]) {
                  const payload = chosen.bets[chosenResolved];
                  if (payload.line != null) {
                    const n = Number(payload.line);
                    if (!isNaN(n)) pick.line = n;
                  }
                  let cur = payload.current;
                  if (cur && typeof cur === "object")
                    cur = Number(cur.current ?? cur.score ?? cur.value ?? NaN);
                  else if (cur != null) cur = Number(cur);
                  if (!isNaN(cur)) pick.currentValue = cur;
                  pick.progressSource = `betslipData.event:${chosen.eventId || bet.gameId}.bets.${chosenResolved}.current`;
                  pick.status = normalizeWon(payload.won) || pick.status;
                  pick.progressWonSource = `betslipData.event:${chosen.eventId || bet.gameId}.bets.${chosenResolved}.won`;
                }
              }
            } catch (e) {}

            // Fallback: if this is a player prop and we couldn't resolve a
            // progressSource from the payload, attempt to construct one from
            // the derived stat key so the UI can read progress where possible.
            try {
              if (bet.playerId && !pick.progressSource) {
                const sportHint = getSportFromBet(bet) || bet.sport || "";
                const statKey = deriveStatKey(
                  bet.statType || bet.prop || bet.propType || bet.id || "",
                  sportHint,
                );
                if (statKey) {
                  // prefer overUnder path, otherwise milestones
                  const constructed = `betslipData.event:${eventData?.eventId || bet.gameId}.players:${bet.playerId}.overUnder:${statKey}`;
                  try {
                    if (typeof __DEV__ !== "undefined" && __DEV__) {
                      console.log("DEV: constructing fallback progressSource for player prop", {
                        pickId: pick.id,
                        pickKey: pick.key,
                        betId: bet.id,
                        playerId: bet.playerId,
                        statType: bet.statType,
                        statKey,
                        constructed,
                        eventId: eventData?.eventId || bet.gameId,
                      });
                    }
                  } catch (e) {}

                  pick.progressSource = constructed;
                  pick.progressWonSource = `betslipData.event:${eventData?.eventId || bet.gameId}.players:${bet.playerId}.overUnder:${statKey}.won`;
                }
              }
            } catch (e) {}

            // DEV: if progressSource still missing, log details to help debugging
            try {
              if (!pick.progressSource) {
                try {
                  // Targeted trace for ticket the user reported
                  if (
                    typeof betSlip !== "undefined" &&
                    String(betSlip.id) === "9a188305-e50f-4d57-8fe2-3fbbfe3ce172"
                  ) {
                    console.log("TRACE: pick missing progressSource", {
                      ticketId: betSlip.id,
                      pickId: pick.id,
                      pickKey: pick.key,
                      betId: bet.id,
                      playerId: bet.playerId,
                      eventId: eventData?.eventId || bet.gameId,
                      betslipEvents:
                        betslipData && Array.isArray(betslipData.events)
                          ? betslipData.events.map((e) => ({
                              eventId: e.eventId,
                              bets: Object.keys(e.bets || {}),
                            }))
                          : null,
                      matchedEventPlayers:
                        eventData && eventData.bets && eventData.bets.players
                          ? eventData.bets.players.map((p) => p.id)
                          : null,
                    });
                  }
                } catch (inner) {}
              }
            } catch (e) {}

            return pick;
          }
        } catch (e) {}
        if (
          bet.type === "Spread" ||
          bet.type?.toLowerCase().includes("spread")
        ) {
          // Format period context for display
          let periodContext = "";
          if (bet.period) {
            const p = String(bet.period).toLowerCase();
            if (p === "1q") periodContext = " 1st Quarter";
            else if (p === "2q") periodContext = " 2nd Quarter";
            else if (p === "3q") periodContext = " 3rd Quarter";
            else if (p === "4q") periodContext = " 4th Quarter";
            else if (p === "1h") periodContext = " 1st Half";
            else if (p === "2h") periodContext = " 2nd Half";
            else if (p === "1p") periodContext = " 1st Period";
            else if (p === "2p") periodContext = " 2nd Period";
            else if (p === "3p") periodContext = " 3rd Period";
          }

          // Clean up type label (remove Alt markers)
          let typeLabel = " Spread";
          if (bet.type && bet.type !== "Spread") {
            typeLabel = ` ${bet.type.replace(/\s*\(Alt\)/gi, "").trim()}`;
          }

          pick.prop = `${bet.team}${periodContext}${typeLabel} ${bet.line}`;
        } else if (
          bet.type === "Moneyline" ||
          bet.type?.toLowerCase().includes("moneyline")
        ) {
          const periodPart =
            bet.period && bet.period !== "reg" ? `${bet.period} ` : "";
          const typePart = bet.statType || bet.type;
          pick.prop = bet.team
            ? `${bet.team} ${periodPart}${typePart}`
            : `${bet.line || "DRAW"} ${periodPart}${typePart}`;
          pick.displayName = bet.team || bet.line || "DRAW";

          // For DRAW bets (regulation 3-way moneyline), show both team logos like totals
          if (
            !bet.team &&
            (bet.line === "Draw" ||
              bet.line === "DRAW" ||
              String(bet.line).toLowerCase() === "draw")
          ) {
            let awayTeam = bet.awayTeam;
            let awayId = bet.team1Id;
            let homeTeam = bet.homeTeam;
            let homeId = bet.team2Id;

            if (!awayTeam || !homeTeam) {
              if (liveGame?.competitions?.[0]?.competitors) {
                const competitors = liveGame.competitions[0].competitors;
                awayTeam = competitors.find((c) => c.homeAway === "away")?.team
                  ?.abbreviation;
                homeTeam = competitors.find((c) => c.homeAway === "home")?.team
                  ?.abbreviation;
              } else if (bet.gameInfo?.teams) {
                const teams = bet.gameInfo.teams.split(" @ ");
                awayTeam = teams[0]?.trim();
                homeTeam = teams[1]?.trim();
              }
            }

            const sportPath =
              bet.sport === "UEFA"
                ? "soccer"
                : (bet.sport || "nba").toLowerCase();

            const toUseAway =
              bet.sport === "UEFA" ? awayId : awayTeam.toLowerCase();
            const toUseHome =
              bet.sport === "UEFA" ? homeId : homeTeam.toLowerCase();

            pick.awayTeamLogo = awayTeam
              ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                  isDarkMode ? "-dark" : ""
                }/${toUseAway}.png&h=100&w=100`
              : null;
            pick.homeTeamLogo = homeTeam
              ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                  isDarkMode ? "-dark" : ""
                }/${toUseHome}.png&h=100&w=100`
              : null;
            pick.isTotal = true;
          }
        } else if (bet.type === "Total") {
          // Detect UEFA special totals (corner/cards) and label appropriately
          const combined =
            `${bet.type} ${bet.description || ""} ${bet.id || ""}`.toLowerCase();
          const isCorner = /corner/.test(combined);
          const isCards = /card|cards/.test(combined);

          if (isCorner) {
            // Total corners
            bet.propType = bet.propType || "totalCorner";
            pick.displayName = "TOTAL CORNERS";
            // ensure we render e.g. "3.5 TOTAL CORNERS" or "3.5 TOTAL CORNERS (HOME)"
            const linePart = String(bet.line || "").trim();
            pick.prop = `${linePart}${linePart ? " " : ""}TOTAL CORNERS`;
            pick.isTotal = true;
          } else if (isCards) {
            // Total cards
            bet.propType = bet.propType || "totalCards";
            pick.displayName = "GAME";
            pick.prop = `${String(bet.line || "").trim()} TOTAL CARDS`;
            pick.isTotal = true;
          } else {
            // Generic total
            // Strip parenthetical tokens from description/type/statType for display
            pick.displayName = stripParenthetical(
              (bet.description || bet.type).toUpperCase(),
            );
            const periodPart = bet.period
              ? ` ${stripParenthetical(bet.period)}`
              : "";
            const typePart = bet.statType
              ? ` ${stripParenthetical(bet.statType)}`
              : ` ${stripParenthetical(bet.type)}`;
            pick.prop =
              `${String(bet.line || "").trim()}${periodPart}${typePart}`.trim();
            pick.isTotal = true;
          }
          // If this total is actually a Yes/No style like Both Teams To Score, normalize display
          try {
            const combinedLower =
              `${bet.type} ${bet.description || ""} ${bet.id || ""}`.toLowerCase();
            if (
              /both\s+teams/.test(combinedLower) ||
              /both\s+to\s+score/.test(combinedLower) ||
              /yes\/no/.test(combinedLower)
            ) {
              // Mark propType so progress lookup prefers the bothScore key
              bet.propType = bet.propType || "bothScore";
              // Use simple GAME display with Yes/No prop
              pick.displayName = "GAME";
              const yn = /yes/i.test(bet.line || bet.description || "")
                ? "Yes"
                : /no/i.test(bet.line || bet.description || "")
                  ? "No"
                  : bet.line || bet.description || "";
              pick.prop =
                String(yn).toUpperCase() === "YES" ||
                String(yn).toUpperCase() === "NO"
                  ? `${String(yn).charAt(0).toUpperCase()}${String(yn).slice(1).toLowerCase()}`
                  : bet.line || bet.description || "";
            }
          } catch (e) {}
        } else if (bet.type === "Milestone") {
          // Milestone bets: show line period statType/type
          pick.displayName = stripParenthetical(bet.team) || "GAME";
          const periodPart = bet.period
            ? ` ${stripParenthetical(bet.period)}`
            : "";
          const typePart = bet.statType
            ? ` ${stripParenthetical(bet.statType)}`
            : ` ${stripParenthetical(bet.type)}`;
          pick.prop =
            `${(bet.line || bet.description || "").toString().trim()}${periodPart}${typePart}`.trim();
        } else if (bet.type === "alt") {
          // Alternate line bets: show team/line period statType/type
          const periodPart = bet.period
            ? ` ${stripParenthetical(bet.period)}`
            : "";
          const typePart = bet.statType
            ? ` ${stripParenthetical(bet.statType)}`
            : ` ${stripParenthetical(bet.type)}`;
          pick.prop =
            `${stripParenthetical(bet.team) || ""} ${(bet.line || "").toString().trim()}${periodPart}${typePart}`.trim();
        } else if (
          bet.type?.includes("_points") ||
          bet.type?.includes("_goals") ||
          bet.type?.includes("period") ||
          bet.type?.includes("quarter") ||
          bet.type?.includes("half") ||
          bet.type?.includes("Over/Under") ||
          bet.type?.includes("Goals")
        ) {
          // Format special team/period bet types
          // Extract period info from type (e.g., "1st Half", "1st Quarter", "2nd Period")
          const periodMatch = bet.type.match(
            /(1st|2nd|3rd|4th)\s+(Half|Quarter|Period)/i,
          );
          const periodPart = periodMatch ? periodMatch[0].toUpperCase() : "";

          // Get the stat type (Points, Goals, etc.)
          const statMatch = bet.type.match(/(Points|Goals|Saves)/i);
          const statPart = statMatch ? statMatch[0].toUpperCase() : "";

          // Build clean prop: "DESCRIPTION PERIOD STAT" or "TEAM LINE PERIOD STAT"
          const parts = [];

          // Use description if available (it already includes team and line formatted nicely)
          if (bet.description && bet.description !== bet.type) {
            parts.push(stripParenthetical(bet.description));
          } else {
            // Otherwise build from components
            if (bet.team) parts.push(stripParenthetical(bet.team));
            if (bet.line) parts.push((bet.line || "").toString().trim());
          }

          if (periodPart) parts.push(periodPart);
          if (statPart) parts.push(statPart);

          // For game totals without a stat, add "TOTAL GOALS" or "TOTAL POINTS" based on sport
          if (!bet.team && !statPart && bet.type?.includes("Over/Under")) {
            const sport = bet.sport || bet.gameId?.split("_")[1] || "";
            const combined =
              `${bet.type} ${bet.description || ""} ${bet.id || ""}`.toLowerCase();
            if (
              sport.toLowerCase() === "nhl" ||
              sport.toLowerCase() === "uefa"
            ) {
              parts.push("TOTAL GOALS");
            } else {
              parts.push("TOTAL");
            }
          }

          // If we still don't have a prop, use type
          pick.prop = (
            parts.length > 0 ? parts.join(" ") : stripParenthetical(bet.type)
          ).trim();
          pick.displayName = stripParenthetical(bet.team) || "GAME";
        } else {
          // Fallback for any other bet type
          pick.prop = (
            bet.description ||
            bet.type ||
            `${stripParenthetical(bet.team) || ""} ${(bet.line || "").toString()}`
          )
            .toString()
            .trim();
          pick.displayName = stripParenthetical(bet.team) || "GAME";
        }

        // For Total/Over-Under bets without a team, get both team logos
        if (
          (bet.type === "Total" ||
            bet.type?.includes("Over/Under") ||
            bet.type?.includes("Yes/No")) &&
          !bet.team
        ) {
          // Use team abbreviations from bet if available, otherwise extract from gameInfo
          let awayTeam = bet.awayTeam;
          let awayId = bet.team1Id;
          let homeTeam = bet.homeTeam;
          let homeId = bet.team2Id;

          if (!awayTeam || !homeTeam) {
            if (liveGame?.competitions?.[0]?.competitors) {
              const competitors = liveGame.competitions[0].competitors;
              awayTeam = competitors.find((c) => c.homeAway === "away")?.team
                ?.abbreviation;
              homeTeam = competitors.find((c) => c.homeAway === "home")?.team
                ?.abbreviation;
            } else if (bet.gameInfo?.teams) {
              // Parse from "MEM @ MIN" format or "COL @ TB"
              const teams = bet.gameInfo.teams.split(" @ ");
              awayTeam = teams[0]?.trim();
              homeTeam = teams[1]?.trim();
            }
          }

          const sportPath =
            bet.sport === "UEFA"
              ? "soccer"
              : (bet.sport || "nba").toLowerCase();

          const toUseAway =
            bet.sport === "UEFA" ? awayId : awayTeam.toLowerCase();
          const toUseHome =
            bet.sport === "UEFA" ? homeId : homeTeam.toLowerCase();

          pick.awayTeamLogo = awayTeam
            ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                isDarkMode ? "-dark" : ""
              }/${toUseAway}.png&h=100&w=100`
            : null;
          pick.homeTeamLogo = homeTeam
            ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                isDarkMode ? "-dark" : ""
              }/${toUseHome}.png&h=100&w=100`
            : null;
          pick.isTotal = true;
        } else if (bet.type === "Milestone" && !bet.team) {
          // Milestone game totals (no team): show both team logos
          let awayTeam = bet.awayTeam;
          let awayId = bet.team1Id;
          let homeTeam = bet.homeTeam;
          let homeId = bet.team2Id;

          if (!awayTeam || !homeTeam) {
            if (liveGame?.competitions?.[0]?.competitors) {
              const competitors = liveGame.competitions[0].competitors;
              awayTeam = competitors.find((c) => c.homeAway === "away")?.team
                ?.abbreviation;
              homeTeam = competitors.find((c) => c.homeAway === "home")?.team
                ?.abbreviation;
            } else if (bet.gameInfo?.teams) {
              // Parse from "MEM @ MIN" format
              const teams = bet.gameInfo.teams.split(" @ ");
              awayTeam = teams[0]?.trim();
              homeTeam = teams[1]?.trim();
            }
          }

          const sportPath =
            bet.sport === "UEFA"
              ? "soccer"
              : (bet.sport || "nba").toLowerCase();

          const toUseAway =
            bet.sport === "UEFA" ? awayId : awayTeam.toLowerCase();
          const toUseHome =
            bet.sport === "UEFA" ? homeId : homeTeam.toLowerCase();

          pick.awayTeamLogo = awayTeam
            ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                isDarkMode ? "-dark" : ""
              }/${toUseAway}.png&h=100&w=100`
            : null;
          pick.homeTeamLogo = homeTeam
            ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                isDarkMode ? "-dark" : ""
              }/${toUseHome}.png&h=100&w=100`
            : null;
          pick.isTotal = true;
        } else if (bet.team) {
          // Team-specific bets (moneylines, spreads, team points/goals)
          const sportPath =
            bet.sport === "UEFA"
              ? "soccer"
              : (bet.sport || "nba").toLowerCase();

          const toUseTeam =
            bet.sport === "UEFA" ? bet.teamId : bet.team.toLowerCase();

          pick.teamLogo = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
            isDarkMode ? "-dark" : ""
          }/${toUseTeam}.png&h=100&w=100`;

          // Mark team point/goal totals as isTotal for proper rendering
          if (
            bet.type?.includes("Points") ||
            bet.type?.includes("Goals") ||
            bet.type?.includes("Over/Under")
          ) {
            pick.isTotal = true;
          }
        } else {
          // Fallback: no team logo
          pick.isTotal = false;
        }

        // Try to get current value from betslipData
        if (betslipData?.events) {
          const targetId = normalizeGameId(bet.gameId);
          const eventData = betslipData.events.find((e) => {
            try {
              return (
                String(e.eventId) === targetId ||
                normalizeGameId(e.eventId) === targetId
              );
            } catch (err) {
              return false;
            }
          });
          if (eventData?.bets) {
            // There may be multiple event payload objects with the same eventId; prefer the one that contains the resolved key
            let chosen = null;
            let chosenKey = null;
            try {
              const targetId = normalizeGameId(bet.gameId);
              const matches = (betslipData?.events || []).filter((e) => {
                try {
                  return (
                    String(e.eventId) === targetId ||
                    normalizeGameId(e.eventId) === targetId
                  );
                } catch (er) {
                  return false;
                }
              });
              let chosen = null;
              let chosenKey = null;
              const wantKey = bet.propType || bet.prop || null;
              for (const m of matches) {
                if (!m?.bets) continue;
                const resolved =
                  resolveBetsPayloadKey(m.bets, pick, bet) ||
                  (wantKey && (m.bets[wantKey] ? wantKey : null));
                if (resolved && m.bets[resolved]) {
                  chosen = m;
                  chosenKey = resolved;
                  break;
                }
              }
              if (!chosen && matches.length > 0) {
                chosen = matches[0];
                chosenKey =
                  resolveBetsPayloadKey(chosen.bets, pick, bet) ||
                  (wantKey && (chosen.bets[wantKey] ? wantKey : null));
              }

              if (chosen && chosenKey && chosen.bets[chosenKey]) {
                const payload = chosen.bets[chosenKey];
                const pl = payload.line;
                if (typeof pl === "number") pick.line = pl;
                else if (pl != null) {
                  const n = Number(pl);
                  if (!isNaN(n)) pick.line = n;
                }
                const cur = payload.current;
                let parsedCur = null;
                if (typeof cur === "number") parsedCur = cur;
                else if (cur && typeof cur === "object")
                  parsedCur = Number(
                    cur.score ?? cur.current ?? cur.value ?? NaN,
                  );
                else if (cur != null) {
                  const n = Number(cur);
                  parsedCur = isNaN(n) ? null : n;
                }
                pick.currentValue =
                  parsedCur !== null && !isNaN(parsedCur)
                    ? Number(parsedCur)
                    : pick.currentValue;
                pick.progressSource = `betslipData.event:${chosen?.eventId || bet.gameId}.bets.${chosenKey}.current`;
                pick.status = normalizeWon(payload.won) || pick.status;
                pick.progressWonSource = `betslipData.event:${chosen?.eventId || bet.gameId}.bets.${chosenKey}.won`;
              }
            } catch (e) {}
            // resolvedBetKey fallback: prefer chosenKey from matches, otherwise resolve against eventData
            const resolvedBetKey =
              chosenKey || resolveBetsPayloadKey(eventData.bets, pick, bet);
            // Period-specific overrides (e.g. P1_SP, P2_T)
            try {
              const periodKey = normalizePeriodKey(bet.period);
              if (periodKey) {
                const periodSpread = eventData.bets[`${periodKey}_SP`];
                const periodTotal = eventData.bets[`${periodKey}_T`];
                if (periodSpread) {
                  // period spread current may be a score string like "0-0" or object
                  const cur = periodSpread.current;
                  let parsed = null;
                  if (typeof cur === "number") parsed = cur;
                  else if (typeof cur === "string") {
                    const parts = cur.split("-").map((s) => Number(s.trim()));
                    if (
                      parts.length === 2 &&
                      !isNaN(parts[0]) &&
                      !isNaN(parts[1])
                    )
                      parsed = parts[1] - parts[0];
                  } else if (cur && typeof cur === "object")
                    parsed = Number(cur.score ?? cur.current ?? NaN);
                  if (parsed != null && !isNaN(parsed)) {
                    pick.currentValue = Number(parsed);
                    pick.progressSource = `betslipData.event:${
                      eventData?.eventId || bet.gameId
                    }.bets.${periodKey}_SP.current`;
                    pick.status =
                      periodSpread.won === true
                        ? "winning"
                        : periodSpread.won === false
                          ? "losing"
                          : "pending";
                    pick.progressWonSource = `betslipData.event:${
                      eventData?.eventId || bet.gameId
                    }.bets.${periodKey}_SP.won`;
                  }
                }
                if (periodTotal) {
                  const cur = periodTotal.current;
                  let parsed = null;
                  if (typeof cur === "number") parsed = cur;
                  else if (cur && typeof cur === "object")
                    parsed = Number(
                      cur.score ?? cur.current ?? cur.value ?? NaN,
                    );
                  else if (cur != null) {
                    const n = Number(cur);
                    parsed = isNaN(n) ? null : n;
                  }
                  if (parsed != null && !isNaN(parsed)) {
                    pick.currentValue = Number(parsed);
                    pick.progressSource = `betslipData.event:${
                      eventData?.eventId || bet.gameId
                    }.bets.${periodKey}_T.current`;
                    pick.status =
                      periodTotal.won === true
                        ? "winning"
                        : periodTotal.won === false
                          ? "losing"
                          : "pending";
                    pick.progressWonSource = `betslipData.event:${
                      eventData?.eventId || bet.gameId
                    }.bets.${periodKey}_T.won`;
                  }
                }
              }
            } catch (e) {
              /* ignore */
            }
            if (
              (bet.type === "Moneyline" ||
                String(bet.type).toLowerCase().includes("moneyline")) &&
              (eventData.bets.moneyline ||
                (resolvedBetKey &&
                  String(resolvedBetKey).toLowerCase().includes("moneyline")))
            ) {
              const mlPayload =
                eventData.bets.moneyline || eventData.bets[resolvedBetKey];
              // moneyline current may be a score string; do not set numeric currentValue
              // to avoid rendering a progress bar for moneyline bets. Keep a scoreText for display if needed.
              pick.scoreText = mlPayload?.current?.score;
              pick.currentValue = null;
              pick.status =
                mlPayload?.current?.won === true
                  ? "winning"
                  : mlPayload?.current?.won === false
                    ? "losing"
                    : "pending";
              pick.progressWonSource = `betslipData.event:${eventData?.eventId || bet.gameId}.bets.${resolvedBetKey || "moneyline"}.current.won`;
            } else if (
              (bet.type === "Spread" ||
                String(bet.type).toLowerCase().includes("spread")) &&
              (eventData.bets.spread ||
                (resolvedBetKey &&
                  String(resolvedBetKey).toLowerCase().includes("spread")))
            ) {
              // Compute current spread value using event scores so the slider bubble shows a meaningful numeric
              const spreadPayload =
                eventData.bets.spread || eventData.bets[resolvedBetKey];
              const spreadCurrent = spreadPayload?.current;
              const gameInfo = eventData.status?.game;
              const homeTeam = gameInfo?.homeTeam;
              const awayTeam = gameInfo?.awayTeam;
              const homeScore = Number(gameInfo?.homeScore) || 0;
              const awayScore = Number(gameInfo?.awayScore) || 0;
              let teamScore = null;
              let oppScore = null;
              try {
                if (
                  String(bet.team).toUpperCase() ===
                  String(homeTeam).toUpperCase()
                ) {
                  teamScore = homeScore;
                  oppScore = awayScore;
                } else {
                  teamScore = awayScore;
                  oppScore = homeScore;
                }
              } catch (e) {
                teamScore = Number(spreadCurrent?.adjustedScore) || 0;
                oppScore = 0;
              }

              const lineNum = Number(bet.line) || 0;
              if (!isNaN(lineNum) && lineNum !== 0) {
                pick.line = lineNum;
              }
              // For spread visualization:
              // - If line is positive (team is the underdog, e.g. +6.5), compute opponent - team
              //   so that more negative values move the indicator to the right (team trailing).
              // - If line is negative (team is favorite, e.g. -6.5), compute team - opponent.
              // Always compute diff as opponent - team for consistent visualization
              const currentSpreadValue = oppScore - teamScore;
              pick.currentValue = Number(currentSpreadValue);
              pick.progressSource = `betslipData.event:${eventData?.eventId || bet.gameId}.bets.${resolvedBetKey || "spread"}.current`;
              // mark as spread for special visualization handling
              pick.isSpread = true;
              pick.spreadLine = lineNum;
              pick.status =
                spreadCurrent?.won === true
                  ? "winning"
                  : spreadCurrent?.won === false
                    ? "losing"
                    : "pending";
              pick.progressWonSource = `betslipData.event:${eventData?.eventId || bet.gameId}.bets.${resolvedBetKey || "spread"}.current.won`;
            } else if (
              (bet.type === "Total" ||
                String(bet.type).toLowerCase().includes("total")) &&
              (eventData.bets.totalPoints ||
                (resolvedBetKey && /total/i.test(resolvedBetKey)))
            ) {
              // prefer payload key resolved earlier
              const tpKey =
                resolvedBetKey && /total/i.test(resolvedBetKey)
                  ? resolvedBetKey
                  : "totalPoints";
              const payload =
                eventData.bets[tpKey] || eventData.bets.totalPoints;
              if (payload) {
                const payloadLine = payload.line;
                if (typeof payloadLine === "number") pick.line = payloadLine;
                else if (payloadLine != null) {
                  const parsed = Number(payloadLine);
                  if (!isNaN(parsed)) pick.line = parsed;
                }
                const totalCurrent = payload.current;
                let parsedCurrent = null;
                if (typeof totalCurrent === "number")
                  parsedCurrent = totalCurrent;
                else if (totalCurrent && typeof totalCurrent === "object")
                  parsedCurrent = Number(
                    totalCurrent.score ??
                      totalCurrent.current ??
                      totalCurrent.value ??
                      NaN,
                  );
                else if (totalCurrent != null) {
                  const n = Number(totalCurrent);
                  parsedCurrent = isNaN(n) ? null : n;
                }
                pick.currentValue =
                  parsedCurrent !== null && !isNaN(parsedCurrent)
                    ? Number(parsedCurrent)
                    : null;
                pick.progressSource = `betslipData.event:${eventData?.eventId || bet.gameId}.bets.${tpKey}.current`;
                pick.status = normalizeWon(payload.won) || "pending";
                pick.progressWonSource = `betslipData.event:${eventData?.eventId || bet.gameId}.bets.${tpKey}.won`;
              }
            } else if (
              (eventData.bets.awayPoints ||
                eventData.bets.homePoints ||
                (resolvedBetKey &&
                  /(home|away).*points|points.*home|awaypoints|homepoints/i.test(
                    resolvedBetKey,
                  ))) &&
              (bet.type?.toLowerCase().includes("_points") ||
                String(bet.type).toLowerCase().includes("home") ||
                String(bet.type).toLowerCase().includes("away"))
            ) {
              // Handle team-specific point totals (awayPoints / homePoints)
              const g = eventData.status?.game || {};
              const homeAbbrev = g.homeTeam || g.home || "";
              const awayAbbrev = g.awayTeam || g.away || "";
              let ptsPayload = null;
              // if resolved key points to a specific payload use it
              if (resolvedBetKey && eventData.bets[resolvedBetKey]) {
                ptsPayload = eventData.bets[resolvedBetKey];
              } else {
                if (
                  eventData.bets.homePoints &&
                  (String(bet.team).toUpperCase() ===
                    String(homeAbbrev).toUpperCase() ||
                    String(bet.type).toLowerCase().includes("home"))
                ) {
                  ptsPayload = eventData.bets.homePoints;
                } else if (
                  eventData.bets.awayPoints &&
                  (String(bet.team).toUpperCase() ===
                    String(awayAbbrev).toUpperCase() ||
                    String(bet.type).toLowerCase().includes("away"))
                ) {
                  ptsPayload = eventData.bets.awayPoints;
                } else {
                  // fallback: prefer awayPoints then homePoints
                  ptsPayload =
                    eventData.bets.awayPoints || eventData.bets.homePoints;
                }
              }

              if (ptsPayload) {
                const payloadLine = ptsPayload.line;
                if (typeof payloadLine === "number") {
                  pick.line = payloadLine;
                } else if (payloadLine != null) {
                  const parsed = Number(payloadLine);
                  if (!isNaN(parsed)) pick.line = parsed;
                }

                const payloadCurrent = ptsPayload.current;
                let parsedCurrent = null;
                if (typeof payloadCurrent === "number")
                  parsedCurrent = payloadCurrent;
                else if (payloadCurrent && typeof payloadCurrent === "object")
                  parsedCurrent = Number(
                    payloadCurrent.score ??
                      payloadCurrent.current ??
                      payloadCurrent.value ??
                      NaN,
                  );
                else if (payloadCurrent != null) {
                  const n = Number(payloadCurrent);
                  parsedCurrent = isNaN(n) ? null : n;
                }

                pick.currentValue =
                  parsedCurrent !== null && !isNaN(parsedCurrent)
                    ? Number(parsedCurrent)
                    : null;
                // determine whether homePoints or awayPoints provided the payload
                const ptsSource =
                  ptsPayload === eventData.bets.homePoints
                    ? "homePoints"
                    : "awayPoints";
                pick.progressSource = `betslipData.event:${
                  eventData?.eventId || bet.gameId
                }.bets.${ptsSource}.current`;

                pick.status =
                  ptsPayload.won === true
                    ? "winning"
                    : ptsPayload.won === false
                      ? "losing"
                      : "pending";
                pick.progressWonSource = `betslipData.event:${
                  eventData?.eventId || bet.gameId
                }.bets.${ptsSource}.won`;
                pick.isTotal = true;
              } else {
                pick.status = "pending";
              }
            } else {
              pick.status = "pending";
            }
            // Prefer canonical game names/scores/status from event payload when not pre
            try {
              const evtState = (eventData?.status?.state || "")
                .toString()
                .toLowerCase();
              if (eventData?.status && evtState !== "pre") {
                // set game info to include scores for post games
                const g = eventData.status.game;
                if (g) {
                  // format: HOME SCORE - AWAY SCORE (Home and Away abbreviations preserved)
                  const home = g.homeTeam || g.home || g.homeAbbrev || "";
                  const away = g.awayTeam || g.away || g.awayAbbrev || "";
                  const homeScore = g.homeScore ?? g.home_score ?? null;
                  const awayScore = g.awayScore ?? g.away_score ?? null;
                  if (homeScore != null && awayScore != null) {
                    pick.gameInfo = `${g.awayTeam || away} @ ${
                      g.homeTeam || home
                    }`;
                  } else if (g.homeTeam && g.awayTeam) {
                    pick.gameInfo = `${g.awayTeam} @ ${g.homeTeam}`;
                  }
                  pick.gameStatus =
                    eventData.status.shortDetail ||
                    eventData.status.state ||
                    pick.gameStatus;
                  pick.gameState = eventData.status.state || pick.gameState;
                  pick.scores = g
                    ? { team1: g.awayScore, team2: g.homeScore }
                    : pick.scores;
                }
              }
            } catch (e) {
              /* ignore */
            }
          }
        } else {
          pick.status = "pending";
        }
      }

      // Ensure we prefer betslip_url payload values for non-pre events
      try {
        if (betslipData?.events) {
          const targetId = normalizeGameId(bet.gameId);
          const overrideEvent = betslipData.events.find((e) => {
            try {
              return (
                String(e.eventId) === targetId ||
                normalizeGameId(e.eventId) === targetId
              );
            } catch (err) {
              return false;
            }
          });
          const evtState = (overrideEvent?.status?.state || "")
            .toString()
            .toLowerCase();

          if (overrideEvent && evtState !== "pre") {
            // Period-specific overrides (P1_SP, P2_T, etc.)
            try {
              const periodKey = normalizePeriodKey(bet.period);
              if (periodKey) {
                const periodSpread = overrideEvent.bets[`${periodKey}_SP`];
                const periodTotal = overrideEvent.bets[`${periodKey}_T`];
                if (periodSpread) {
                  const cur = periodSpread.current;
                  let parsed = null;
                  if (typeof cur === "number") parsed = cur;
                  else if (typeof cur === "string") {
                    const parts = cur.split("-").map((s) => Number(s.trim()));
                    if (
                      parts.length === 2 &&
                      !isNaN(parts[0]) &&
                      !isNaN(parts[1])
                    )
                      parsed = parts[1] - parts[0];
                  } else if (cur && typeof cur === "object")
                    parsed = Number(cur.score ?? cur.current ?? NaN);
                  if (parsed != null && !isNaN(parsed)) {
                    pick.currentValue = Number(parsed);
                    pick.progressSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.bets.${periodKey}_SP.current`;
                    pick.status =
                      periodSpread.won === true
                        ? "winning"
                        : periodSpread.won === false
                          ? "losing"
                          : "pending";
                    pick.progressWonSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.bets.${periodKey}_SP.won`;
                  }
                }
                if (periodTotal) {
                  const cur = periodTotal.current;
                  let parsed = null;
                  if (typeof cur === "number") parsed = cur;
                  else if (cur && typeof cur === "object")
                    parsed = Number(
                      cur.score ?? cur.current ?? cur.value ?? NaN,
                    );
                  else if (cur != null) {
                    const n = Number(cur);
                    parsed = isNaN(n) ? null : n;
                  }
                  if (parsed != null && !isNaN(parsed)) {
                    pick.currentValue = Number(parsed);
                    pick.progressSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.bets.${periodKey}_T.current`;
                    pick.status =
                      periodTotal.won === true
                        ? "winning"
                        : periodTotal.won === false
                          ? "losing"
                          : "pending";
                    pick.progressWonSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.bets.${periodKey}_T.won`;
                  }
                }
              }
            } catch (e) {
              /* ignore */
            }
            // Player-level overrides
            if (pick.playerName && overrideEvent?.bets?.players) {
              const p = overrideEvent.bets.players.find(
                (pp) => String(pp.id) === String(bet.playerId),
              );

              if (p) {
                const sportHint = getSportFromBet(bet) || bet.sport || "";
                let statKey = deriveStatKey(bet.statType, sportHint);
                if (!statKey || statKey.length === 0 || statKey === "PTS") {
                  statKey = deriveStatKey(
                    bet.prop || bet.description || bet.propType || "",
                    sportHint,
                  );
                }

                // resolve milestone/overUnder keys in override payloads
                const milestoneKey = resolveKeyInObject(p.milestones, statKey);
                const ouKey = resolveKeyInObject(p.overUnder, statKey);

                if (milestoneKey) {
                  const milestoneValue = Number(
                    p.milestones[milestoneKey].current,
                  );
                  if (!isNaN(milestoneValue)) {
                    pick.currentValue = milestoneValue;
                    pick.progressSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.players:${p.id}.milestones:${milestoneKey}`;
                    pick.status =
                      p.milestones[milestoneKey].won === true
                        ? "winning"
                        : p.milestones[milestoneKey].won === false
                          ? "losing"
                          : "pending";
                    pick.progressWonSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.players:${p.id}.milestones:${milestoneKey}`;
                  }
                } else if (ouKey) {
                  const overUnderValue = Number(p.overUnder[ouKey].current);
                  if (!isNaN(overUnderValue)) {
                    pick.currentValue = overUnderValue;
                    pick.progressSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.players:${p.id}.overUnder:${ouKey}`;
                    pick.status =
                      p.overUnder[ouKey].won === true
                        ? "winning"
                        : p.overUnder[ouKey].won === false
                          ? "losing"
                          : "pending";
                    pick.progressWonSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.players:${p.id}.overUnder:${ouKey}`;
                  }
                }
                // PRA fallback: if no statKey value found, prefer PRA milestone if present
                if (
                  (pick.currentValue == null || isNaN(pick.currentValue)) &&
                  p.milestones?.PRA
                ) {
                  pick.currentValue = Number(p.milestones.PRA.current);
                  pick.progressSource = `overrideEvent.event:${
                    overrideEvent?.eventId || bet.gameId
                  }.players:${p.id}.milestones:PRA`;
                  pick.status =
                    p.milestones.PRA.won === true
                      ? "winning"
                      : p.milestones.PRA.won === false
                        ? "losing"
                        : "pending";
                  pick.progressWonSource = `overrideEvent.event:${
                    overrideEvent?.eventId || bet.gameId
                  }.players:${p.id}.milestones:PRA.won`;
                }
              }
            }

            // Team-level overrides (spread/total/points)
            if (!pick.playerName && overrideEvent?.bets) {
              const resolvedOverrideKey = resolveBetsPayloadKey(
                overrideEvent.bets,
                pick,
                bet,
              );
              // First, determine bet type and check for quarter/half/period specific keys
              const g = overrideEvent.status?.game || {};
              const homeAbbrev = g.homeTeam || g.home || "";
              const awayAbbrev = g.awayTeam || g.away || "";
              const betType = String(bet.type || "").toLowerCase();
              let handled = false;
              let quarterOrHalfKey = null;

              // Period bets (NHL: P1_ML, P1_SP, P2_T, etc.)
              // Check both betType AND bet.period for period detection
              if (
                betType.includes("1st period") ||
                betType.includes("1p") ||
                bet.period === "1p"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "P1_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  quarterOrHalfKey = "P1_T";
                else if (betType.includes("moneyline"))
                  quarterOrHalfKey = "P1_ML";
              } else if (
                betType.includes("2nd period") ||
                betType.includes("2p") ||
                bet.period === "2p"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "P2_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  quarterOrHalfKey = "P2_T";
                else if (betType.includes("moneyline"))
                  quarterOrHalfKey = "P2_ML";
              } else if (
                betType.includes("3rd period") ||
                betType.includes("3p") ||
                bet.period === "3p"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "P3_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  quarterOrHalfKey = "P3_T";
                else if (betType.includes("moneyline"))
                  quarterOrHalfKey = "P3_ML";
              }
              // Quarter bets (NBA/NFL: Q1_SP, Q1_T, etc.)
              // Check both betType AND bet.period for quarter detection
              else if (
                betType.includes("1st quarter") ||
                betType.includes("1q") ||
                bet.period === "1q"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "Q1_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  // Only use Q1_T for game totals, not team-specific points
                  quarterOrHalfKey = !bet.team ? "Q1_T" : null;
              } else if (
                betType.includes("2nd quarter") ||
                betType.includes("2q") ||
                bet.period === "2q"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "Q2_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  quarterOrHalfKey = "Q2_T";
              } else if (
                betType.includes("3rd quarter") ||
                betType.includes("3q") ||
                bet.period === "3q"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "Q3_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  quarterOrHalfKey = "Q3_T";
              } else if (
                betType.includes("4th quarter") ||
                betType.includes("4q") ||
                bet.period === "4q"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "Q4_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  quarterOrHalfKey = "Q4_T";
              }
              // Half bets (H1_SP, H1_T, H2_SP, H2_T)
              // Check both betType AND bet.period for quarter/half detection
              else if (
                betType.includes("1st half") ||
                betType.includes("1h") ||
                bet.period === "1h"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "H1_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  // Only use H1_T for game totals, not team-specific points
                  quarterOrHalfKey = !bet.team ? "H1_T" : null;
                else if (betType.includes("moneyline"))
                  quarterOrHalfKey = "H1_ML";
              } else if (
                betType.includes("2nd half") ||
                betType.includes("2h") ||
                bet.period === "2h"
              ) {
                if (betType.includes("spread")) quarterOrHalfKey = "H2_SP";
                else if (
                  betType.includes("total") ||
                  betType.includes("over/under")
                )
                  quarterOrHalfKey = "H2_T";
                else if (betType.includes("moneyline"))
                  quarterOrHalfKey = "H2_ML";
              }

              // Check for quarter/half/period bet in betslip data
              if (quarterOrHalfKey && overrideEvent.bets[quarterOrHalfKey]) {
                handled = true;
                const qhBet = overrideEvent.bets[quarterOrHalfKey];

                if (quarterOrHalfKey.endsWith("_SP")) {
                  // Spread
                  const cur = qhBet.current;
                  let parsed = null;
                  if (typeof cur === "number") parsed = cur;
                  else if (typeof cur === "string") {
                    const parts = cur.split("-").map((s) => Number(s.trim()));
                    if (
                      parts.length === 2 &&
                      !isNaN(parts[0]) &&
                      !isNaN(parts[1])
                    )
                      parsed = parts[1] - parts[0];
                  } else if (cur && typeof cur === "object")
                    parsed = Number(cur.score ?? cur.current ?? NaN);

                  if (parsed != null && !isNaN(parsed)) {
                    pick.currentValue = Number(parsed);
                    pick.progressSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.bets.${quarterOrHalfKey}.current`;
                    pick.status =
                      qhBet.won === true
                        ? "winning"
                        : qhBet.won === false
                          ? "losing"
                          : "pending";
                    pick.progressWonSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.bets.${quarterOrHalfKey}.won`;
                  }
                } else if (quarterOrHalfKey.endsWith("_T")) {
                  // Total
                  // Update line from payload if available
                  const payloadLine = qhBet.line;
                  if (typeof payloadLine === "number") {
                    pick.line = payloadLine;
                  } else if (payloadLine != null) {
                    const parsed = Number(payloadLine);
                    if (!isNaN(parsed)) pick.line = parsed;
                  }

                  const cur = qhBet.current;
                  let parsed = null;
                  if (typeof cur === "number") parsed = cur;
                  else if (cur && typeof cur === "object")
                    parsed = Number(
                      cur.score ?? cur.current ?? cur.value ?? NaN,
                    );
                  else if (cur != null) {
                    const n = Number(cur);
                    parsed = isNaN(n) ? null : n;
                  }

                  if (parsed != null && !isNaN(parsed)) {
                    pick.currentValue = Number(parsed);
                    pick.progressSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.bets.${quarterOrHalfKey}.current`;
                    pick.status =
                      qhBet.won === true
                        ? "winning"
                        : qhBet.won === false
                          ? "losing"
                          : "pending";
                    pick.progressWonSource = `overrideEvent.event:${
                      overrideEvent?.eventId || bet.gameId
                    }.bets.${quarterOrHalfKey}.won`;
                  }
                } else if (quarterOrHalfKey.endsWith("_ML")) {
                  // Moneyline
                  pick.scoreText = qhBet.current?.score || qhBet.current;
                  pick.currentValue = null;
                  pick.progressSource = `overrideEvent.event:${
                    overrideEvent?.eventId || bet.gameId
                  }.bets.${quarterOrHalfKey}`;
                  pick.status =
                    qhBet.won === true
                      ? "winning"
                      : qhBet.won === false
                        ? "losing"
                        : "pending";
                  pick.progressWonSource = `overrideEvent.event:${
                    overrideEvent?.eventId || bet.gameId
                  }.bets.${quarterOrHalfKey}.won`;
                }
              }

              // If not handled by quarter/half/period, check generic moneyline/spread/total
              if (
                !handled &&
                (overrideEvent.bets.moneyline ||
                  (resolvedOverrideKey &&
                    String(resolvedOverrideKey)
                      .toLowerCase()
                      .includes("moneyline"))) &&
                betType.includes("moneyline")
              ) {
                const mlPay =
                  overrideEvent.bets.moneyline ||
                  overrideEvent.bets[resolvedOverrideKey];
                handled = true;
                pick.scoreText = mlPay?.current?.score || mlPay?.current;
                pick.currentValue = null;
                pick.progressSource = `overrideEvent.event:${overrideEvent?.eventId || bet.gameId}.bets.${resolvedOverrideKey || "moneyline"}`;
                pick.status =
                  mlPay?.won === true
                    ? "winning"
                    : mlPay?.won === false
                      ? "losing"
                      : "pending";
                pick.progressWonSource = `overrideEvent.event:${overrideEvent?.eventId || bet.gameId}.bets.${resolvedOverrideKey || "moneyline"}.won`;
              } else if (
                !handled &&
                (overrideEvent.bets.spread ||
                  (resolvedOverrideKey &&
                    String(resolvedOverrideKey)
                      .toLowerCase()
                      .includes("spread"))) &&
                betType.includes("spread")
              ) {
                handled = true;
                const spreadPayload =
                  overrideEvent.bets.spread ||
                  overrideEvent.bets[resolvedOverrideKey];
                const spreadCurrent = spreadPayload?.current;
                const homeScore = Number(g?.homeScore) || 0;
                const awayScore = Number(g?.awayScore) || 0;
                let teamScore = null;
                let oppScore = null;
                try {
                  if (
                    String(bet.team).toUpperCase() ===
                    String(g?.homeTeam).toUpperCase()
                  ) {
                    teamScore = homeScore;
                    oppScore = awayScore;
                  } else {
                    teamScore = awayScore;
                    oppScore = homeScore;
                  }
                } catch (e) {
                  teamScore = Number(spreadCurrent?.adjustedScore) || 0;
                  oppScore = 0;
                }
                pick.currentValue = Number(oppScore - teamScore);
                pick.progressSource = `overrideEvent.event:${overrideEvent?.eventId || bet.gameId}.bets.${resolvedOverrideKey || "spread"}.current`;
                pick.status =
                  spreadPayload?.won === true
                    ? "winning"
                    : spreadPayload?.won === false
                      ? "losing"
                      : "pending";
                pick.progressWonSource = `overrideEvent.event:${overrideEvent?.eventId || bet.gameId}.bets.${resolvedOverrideKey || "spread"}.won`;
                const spreadLine = overrideEvent.bets.spread.line;
                if (typeof spreadLine === "number" && !isNaN(spreadLine)) {
                  pick.line = spreadLine;
                }
              } else if (
                !handled &&
                (overrideEvent.bets.totalPoints ||
                  (resolvedOverrideKey &&
                    /total/i.test(resolvedOverrideKey))) &&
                (betType.includes("total") ||
                  betType.includes("over/under") ||
                  betType.includes("yes/no")) &&
                !bet.team && // Only use totalPoints for game totals, not team-specific points
                !betType.includes("points over/under") // Exclude team-specific point bets
              ) {
                const tpKey =
                  resolvedOverrideKey && /total/i.test(resolvedOverrideKey)
                    ? resolvedOverrideKey
                    : "totalPoints";
                const payload =
                  overrideEvent.bets[tpKey] || overrideEvent.bets.totalPoints;
                handled = true;
                if (payload) {
                  const overrideLine = payload.line;
                  if (typeof overrideLine === "number")
                    pick.line = overrideLine;
                  else if (overrideLine != null) {
                    const parsed = Number(overrideLine);
                    if (!isNaN(parsed)) pick.line = parsed;
                  }
                  const totalCurrent = payload.current;
                  let parsedCurrent = null;
                  if (typeof totalCurrent === "number")
                    parsedCurrent = totalCurrent;
                  else if (totalCurrent && typeof totalCurrent === "object")
                    parsedCurrent = Number(
                      totalCurrent.score ??
                        totalCurrent.current ??
                        totalCurrent.value ??
                        NaN,
                    );
                  else if (totalCurrent != null) {
                    const n = Number(totalCurrent);
                    parsedCurrent = isNaN(n) ? null : n;
                  }
                  pick.currentValue =
                    parsedCurrent !== null && !isNaN(parsedCurrent)
                      ? Number(parsedCurrent)
                      : pick.currentValue;
                  pick.progressSource = `overrideEvent.event:${overrideEvent?.eventId || bet.gameId}.bets.${tpKey}.current`;
                  pick.status =
                    payload?.won === true
                      ? "winning"
                      : payload?.won === false
                        ? "losing"
                        : "pending";
                  pick.progressWonSource = `overrideEvent.event:${overrideEvent?.eventId || bet.gameId}.bets.${tpKey}.won`;
                }
              }

              // Handle team-specific points/goals if not already handled
              if (!handled) {
                // Check for quarter/half specific team points (awayPoints1H, homePoints2H, etc.)
                const hasHomePoints = overrideEvent.bets.homePoints;
                const hasAwayPoints = overrideEvent.bets.awayPoints;
                const hasHomeGoals = overrideEvent.bets.homeGoals;
                const hasAwayGoals = overrideEvent.bets.awayGoals;

                // Quarter/Half specific team points
                let teamPointsKey = null;
                if (betType.includes("1st half") || betType.includes("1h")) {
                  if (
                    betType.includes("home") ||
                    String(bet.team).toUpperCase() ===
                      String(homeAbbrev).toUpperCase()
                  ) {
                    teamPointsKey = "homePoints1H";
                  } else if (
                    betType.includes("away") ||
                    String(bet.team).toUpperCase() ===
                      String(awayAbbrev).toUpperCase()
                  ) {
                    teamPointsKey = "awayPoints1H";
                  }
                } else if (
                  betType.includes("2nd half") ||
                  betType.includes("2h")
                ) {
                  if (
                    betType.includes("home") ||
                    String(bet.team).toUpperCase() ===
                      String(homeAbbrev).toUpperCase()
                  ) {
                    teamPointsKey = "homePoints2H";
                  } else if (
                    betType.includes("away") ||
                    String(bet.team).toUpperCase() ===
                      String(awayAbbrev).toUpperCase()
                  ) {
                    teamPointsKey = "awayPoints2H";
                  }
                } else if (
                  betType.includes("1st quarter") ||
                  betType.includes("1q")
                ) {
                  if (
                    betType.includes("home") ||
                    String(bet.team).toUpperCase() ===
                      String(homeAbbrev).toUpperCase()
                  ) {
                    teamPointsKey = "homePoints1Q";
                  } else if (
                    betType.includes("away") ||
                    String(bet.team).toUpperCase() ===
                      String(awayAbbrev).toUpperCase()
                  ) {
                    teamPointsKey = "awayPoints1Q";
                  }
                } else if (
                  betType.includes("2nd quarter") ||
                  betType.includes("2q")
                ) {
                  if (
                    betType.includes("home") ||
                    String(bet.team).toUpperCase() ===
                      String(homeAbbrev).toUpperCase()
                  ) {
                    teamPointsKey = "homePoints2Q";
                  } else if (
                    betType.includes("away") ||
                    String(bet.team).toUpperCase() ===
                      String(awayAbbrev).toUpperCase()
                  ) {
                    teamPointsKey = "awayPoints2Q";
                  }
                }

                let ptsPayload = null;
                let ptsSource = null;

                // Check for quarter/half team points first
                if (teamPointsKey && overrideEvent.bets[teamPointsKey]) {
                  ptsPayload = overrideEvent.bets[teamPointsKey];
                  ptsSource = teamPointsKey;
                }
                // Then check for full game homePoints/awayPoints/homeGoals/awayGoals
                else if (
                  hasHomePoints &&
                  (String(bet.team).toUpperCase() ===
                    String(homeAbbrev).toUpperCase() ||
                    betType.includes("home"))
                ) {
                  ptsPayload = overrideEvent.bets.homePoints;
                  ptsSource = "homePoints";
                } else if (
                  hasAwayPoints &&
                  (String(bet.team).toUpperCase() ===
                    String(awayAbbrev).toUpperCase() ||
                    betType.includes("away"))
                ) {
                  ptsPayload = overrideEvent.bets.awayPoints;
                  ptsSource = "awayPoints";
                } else if (
                  hasHomeGoals &&
                  (String(bet.team).toUpperCase() ===
                    String(homeAbbrev).toUpperCase() ||
                    betType.includes("home"))
                ) {
                  ptsPayload = overrideEvent.bets.homeGoals;
                  ptsSource = "homeGoals";
                } else if (
                  hasAwayGoals &&
                  (String(bet.team).toUpperCase() ===
                    String(awayAbbrev).toUpperCase() ||
                    betType.includes("away"))
                ) {
                  ptsPayload = overrideEvent.bets.awayGoals;
                  ptsSource = "awayGoals";
                } else if (hasAwayPoints || hasHomePoints) {
                  ptsPayload =
                    overrideEvent.bets.awayPoints ||
                    overrideEvent.bets.homePoints;
                  ptsSource = overrideEvent.bets.awayPoints
                    ? "awayPoints"
                    : "homePoints";
                } else if (hasAwayGoals || hasHomeGoals) {
                  ptsPayload =
                    overrideEvent.bets.awayGoals ||
                    overrideEvent.bets.homeGoals;
                  ptsSource = overrideEvent.bets.awayGoals
                    ? "awayGoals"
                    : "homeGoals";
                }

                if (ptsPayload && ptsSource) {
                  const payloadLine = ptsPayload.line;
                  if (typeof payloadLine === "number") pick.line = payloadLine;
                  else if (payloadLine != null) {
                    const parsed = Number(payloadLine);
                    if (!isNaN(parsed)) pick.line = parsed;
                  }

                  const payloadCurrent = ptsPayload.current;
                  let parsedCurrent = null;
                  if (typeof payloadCurrent === "number")
                    parsedCurrent = payloadCurrent;
                  else if (payloadCurrent && typeof payloadCurrent === "object")
                    parsedCurrent = Number(
                      payloadCurrent.score ??
                        payloadCurrent.current ??
                        payloadCurrent.value ??
                        NaN,
                    );
                  else if (payloadCurrent != null) {
                    const n = Number(payloadCurrent);
                    parsedCurrent = isNaN(n) ? null : n;
                  }
                  pick.currentValue =
                    parsedCurrent !== null && !isNaN(parsedCurrent)
                      ? Number(parsedCurrent)
                      : pick.currentValue;
                  pick.progressSource = `overrideEvent.event:${
                    overrideEvent?.eventId || bet.gameId
                  }.bets.${ptsSource}.current`;
                  pick.status =
                    ptsPayload.won === true
                      ? "winning"
                      : ptsPayload.won === false
                        ? "losing"
                        : "pending";
                  pick.progressWonSource = `overrideEvent.event:${
                    overrideEvent?.eventId || bet.gameId
                  }.bets.${ptsSource}.won`;
                }
              }
            }
          }
        }
      } catch (e) {
        /* ignore */
      }

      try {
        // prefer explicit marker set when parsing values
        let progressSource = pick.progressSource || "none";

        // compute sport hint and stat key being searched for (for debugging)
        const sportHint =
          (bet &&
            (bet.sport ||
              (typeof bet.gameId === "string" &&
                bet.gameId.includes("_") &&
                bet.gameId.split("_").pop()))) ||
          "unknown";
        // Prefer explicit propType when present (e.g., totalCorner/totalCards/bothScore)
        const statGuess = deriveStatKey(
          bet.propType || bet.statType || bet.prop || "",
          sportHint,
        );
        const sportDisplay = sportHint
          ? String(sportHint).toUpperCase()
          : "N/A";
        const lookingFor = statGuess ? String(statGuess).toUpperCase() : "N/A";
      } catch (e) {}

      return pick;
    });

    try {
      // Lightweight per-pick summary for debugging
      console.log(
        `renderSubmittedBet picks summary for ${betSlip.id}:`,
        allPicks.map((p) => {
          const srcBet = originalBets.find((b) => b.id === p.id) || {};
          return {
            id: p.id,
            key: srcBet.key || srcBet.propType || srcBet.statType || null,
            sport:
              srcBet.sport ||
              String(srcBet.gameId || "")
                .split("_")
                .pop() ||
              null,
            progressSource: p.progressSource || null,
            currentValue: p.currentValue != null ? p.currentValue : null,
            status: p.status || null,
          };
        }),
      );
    } catch (e) {}

    // Calculate total odds and payout
    const calculateOdds = () => {
      const decimalOdds = originalBets.map((bet) => {
        const odds = parseInt(bet.odds);
        if (odds > 0) {
          return odds / 100 + 1;
        } else {
          return 100 / Math.abs(odds) + 1;
        }
      });
      const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);
      const americanOdds =
        totalDecimal >= 2
          ? `+${Math.round((totalDecimal - 1) * 100)}`
          : `-${Math.round(100 / (totalDecimal - 1))}`;
      return americanOdds;
    };

    const calculatePayout = () => {
      const decimalOdds = originalBets.map((bet) => {
        const odds = parseInt(bet.odds);
        if (odds > 0) {
          return odds / 100 + 1;
        } else {
          return 100 / Math.abs(odds) + 1;
        }
      });
      const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);
      const mult = isPro ? 2 : 1;
      return (amount * totalDecimal * mult).toFixed(2);
    };

    const odds = calculateOdds();
    const potentialPayout = calculatePayout();
    // For settled tickets, override displayed payout and add border color
    const ticketStatus = betSlip.status
      ? String(betSlip.status).toLowerCase()
      : null; // 'won'|'lost'|'open'
    let displayedPayout = potentialPayout;
    if (ticketStatus === "won") {
      // prefer server-provided potential_payout if present
      const serverPayout =
        betSlip.potential_payout || betSlip.potentialPayout || betSlip.payout;
      if (serverPayout != null) {
        const asNum = Number(serverPayout);
        displayedPayout = isNaN(asNum) ? potentialPayout : asNum.toFixed(2);
      }
    } else if (ticketStatus === "lost") {
      displayedPayout = (0).toFixed(2);
    }
    const isExpanded = expandedParlays.has(betSlip.id);

    // Single pick - follow expanded/collapsed state (do NOT force-expanded)
    if (allPicks.length === 1) {
      const pick = allPicks[0];
      const liveGame = getLiveGameData(pick.gameId);
      const scores = liveGame?.competitions?.[0]?.competitors;

      if (!isExpanded) {
        // Collapsed single view (click to expand)
        return (
          <TouchableOpacity
            key={betSlip.id}
            style={[
              styles.betCard,
              { backgroundColor: theme.surface },
              ticketStatus === "won"
                ? { borderWidth: 2, borderColor: "#22C55E" }
                : ticketStatus === "lost"
                  ? { borderWidth: 2, borderColor: "#EF4444" }
                  : {},
            ]}
            onPress={() => toggleParlay(betSlip.id)}
          >
            <View style={styles.parlayCollapsedHeader}>
              <View
                style={[styles.parlayBadge, { backgroundColor: badgeColor }]}
              >
                <Text style={styles.parlayBadgeText}>{badgeType}</Text>
              </View>
              <Text style={[styles.parlayTitle, { color: theme.text }]}>
                Single Bet
              </Text>
              <Text style={[styles.parlayOdds, { color: theme.text }]}>
                {" "}
                {formatOddsForDisplay(odds, oddsDisplay)}{" "}
              </Text>
            </View>

            <View
              style={[styles.parlaySummary, { borderTopColor: theme.border }]}
            >
              <View style={styles.parlaySummaryItem}>
                <Text
                  style={[styles.parlaySummaryLabel, { color: theme.text }]}
                >
                  {amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  C
                </Text>
                <Text
                  style={[
                    styles.parlaySummarySubLabel,
                    { color: theme.textTertiary },
                  ]}
                >
                  WAGER
                </Text>
              </View>
              <View style={styles.parlaySummaryItem}>
                <Text
                  style={[styles.parlaySummaryLabel, { color: theme.text }]}
                >
                  {Number(
                    ticketStatus === "won"
                      ? displayedPayout
                      : ticketStatus === "lost"
                        ? 0
                        : potentialPayout,
                  ).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  C
                </Text>
                <Text
                  style={[
                    styles.parlaySummarySubLabel,
                    { color: theme.textTertiary },
                  ]}
                >
                  PAYOUT
                </Text>
              </View>
            </View>

            <View style={styles.expandIndicator}>
              <Ionicons
                name="chevron-down"
                size={20}
                color={theme.textSecondary}
              />
            </View>
          </TouchableOpacity>
        );
      }

      // Expanded single view (when isExpanded)
      return (
        <View
          key={betSlip.id}
          style={[
            styles.betCard,
            { backgroundColor: theme.surface },
            ticketStatus === "won"
              ? { borderWidth: 2, borderColor: "#22C55E" }
              : ticketStatus === "lost"
                ? { borderWidth: 2, borderColor: "#EF4444" }
                : {},
          ]}
        >
          <View style={styles.parlayExpandedHeader}>
            <View style={[styles.parlayBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.parlayBadgeText}>{badgeType}</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>
              Single Bet
            </Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>
              {formatOddsForDisplay(odds, oddsDisplay)}
            </Text>
          </View>

          <View style={styles.parlayGameInfo}>
            <View style={styles.parlayGameScore}>
              {renderGameScoreNames(pick, liveGame, scores)}
            </View>
            <View style={styles.parlayGameStatusRow}>
              {(liveGame?.competitions[0]?.status?.type?.state || pick.gameState) === "in" && (
                <View
                  style={[
                    styles.liveIndicator,
                    { backgroundColor: theme.error, marginRight: 8 },
                  ]}
                >
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
              <Text
                style={[
                  styles.parlayGameStatus,
                  { color: theme.textTertiary, marginLeft: 0 },
                ]}
              >
                {pick.gameStatus || liveGame?.status?.type?.shortDetail}
              </Text>
            </View>
          </View>

          <View style={styles.parlayPicks}>{renderPick(pick, true)}</View>

          <View
            style={[styles.parlaySummary, { borderTopColor: theme.border }]}
          >
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                C
              </Text>
              <Text
                style={[
                  styles.parlaySummarySubLabel,
                  { color: theme.textTertiary },
                ]}
              >
                WAGER
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {Number(
                  ticketStatus === "won"
                    ? displayedPayout
                    : ticketStatus === "lost"
                      ? 0
                      : potentialPayout,
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                C
              </Text>
              <Text
                style={[
                  styles.parlaySummarySubLabel,
                  { color: theme.textTertiary },
                ]}
              >
                PAYOUT
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.collapseButton,
              {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
            onPress={() => toggleParlay(betSlip.id)}
          >
            <Ionicons name="chevron-up" size={20} color={theme.textSecondary} />
            {(() => {
              const ts = getTicketTimestamp(betSlip);
              const { dateStr, timeStr } = formatToESTDateTime(ts);
              return (
                <View style={{ marginLeft: 8, alignItems: "flex-start" }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {dateStr}
                  </Text>
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                    {timeStr}
                  </Text>
                </View>
              );
            })()}
          </TouchableOpacity>
        </View>
      );
    }

    // Multiple picks - SGP (all same game)
    if (gamesCount === 1) {
      const firstPick = allPicks[0];
      const liveGame = getLiveGameData(firstPick.gameId);
      const scores = liveGame?.competitions?.[0]?.competitors;

      // collapsed SGP view when not expanded
      if (!isExpanded) {
        return (
          <TouchableOpacity
            key={betSlip.id}
            style={[
              styles.betCard,
              { backgroundColor: theme.surface },
              ticketStatus === "won"
                ? { borderWidth: 2, borderColor: "#22C55E" }
                : ticketStatus === "lost"
                  ? { borderWidth: 2, borderColor: "#EF4444" }
                  : {},
            ]}
            onPress={() => toggleParlay(betSlip.id)}
          >
            <View style={styles.parlayCollapsedHeader}>
              <View
                style={[styles.parlayBadge, { backgroundColor: badgeColor }]}
              >
                <Text style={styles.parlayBadgeText}>{badgeType}</Text>
              </View>
              <Text style={[styles.parlayTitle, { color: theme.text }]}>
                Same Game Parlay
              </Text>
              <Text style={[styles.parlayOdds, { color: theme.text }]}>
                {formatOddsForDisplay(odds, oddsDisplay)}
              </Text>
            </View>

            <View
              style={[styles.parlaySummary, { borderTopColor: theme.border }]}
            >
              <View style={styles.parlaySummaryItem}>
                <Text
                  style={[styles.parlaySummaryLabel, { color: theme.text }]}
                >
                  {allPicks.length} Picks
                </Text>
              </View>
              <View style={styles.parlaySummaryItem}>
                <Text
                  style={[styles.parlaySummaryLabel, { color: theme.text }]}
                >
                  {amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  C
                </Text>
                <Text
                  style={[
                    styles.parlaySummarySubLabel,
                    { color: theme.textTertiary },
                  ]}
                >
                  WAGER
                </Text>
              </View>
              <View style={styles.parlaySummaryItem}>
                <Text
                  style={[styles.parlaySummaryLabel, { color: theme.text }]}
                >
                  {Number(
                    ticketStatus === "won"
                      ? displayedPayout
                      : ticketStatus === "lost"
                        ? 0
                        : potentialPayout,
                  ).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  C
                </Text>
                <Text
                  style={[
                    styles.parlaySummarySubLabel,
                    { color: theme.textTertiary },
                  ]}
                >
                  PAYOUT
                </Text>
              </View>
            </View>

            <View style={styles.expandIndicator}>
              <Ionicons
                name="chevron-down"
                size={20}
                color={theme.textSecondary}
              />
            </View>
          </TouchableOpacity>
        );
      }

      // expanded SGP view
      return (
        <View
          key={betSlip.id}
          style={[
            styles.betCard,
            { backgroundColor: theme.surface },
            ticketStatus === "won"
              ? { borderWidth: 2, borderColor: "#22C55E" }
              : ticketStatus === "lost"
                ? { borderWidth: 2, borderColor: "#EF4444" }
                : {},
          ]}
        >
          <View style={styles.parlayExpandedHeader}>
            <View style={[styles.parlayBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.parlayBadgeText}>{badgeType}</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>
              Same Game Parlay
            </Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>
              {formatOddsForDisplay(odds, oddsDisplay)}
            </Text>
          </View>

          <View style={styles.parlayGameInfo}>
            <View style={styles.parlayGameScore}>
              {renderGameScoreNames(firstPick, liveGame, scores)}
            </View>
            <View style={styles.parlayGameStatusRow}>
              {(liveGame?.competitions[0]?.status?.type?.state || firstPick.gameState) === "in" && (
                <View
                  style={[
                    styles.liveIndicator,
                    { backgroundColor: theme.error, marginRight: 8 },
                  ]}
                >
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
              <Text
                style={[
                  styles.parlayGameStatus,
                  { color: theme.textTertiary, marginLeft: 0 },
                ]}
              >
                {firstPick.gameStatus || liveGame?.competitions[0]?.status?.type?.shortDetail}
              </Text>
            </View>
          </View>

          <View style={styles.parlayPicks}>
            {allPicks.map((pick) => renderPick(pick, true))}
          </View>

          <View
            style={[styles.parlaySummary, { borderTopColor: theme.border }]}
          >
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {allPicks.length} Picks
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                C
              </Text>
              <Text
                style={[
                  styles.parlaySummarySubLabel,
                  { color: theme.textTertiary },
                ]}
              >
                WAGER
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {Number(
                  ticketStatus === "won"
                    ? displayedPayout
                    : ticketStatus === "lost"
                      ? 0
                      : potentialPayout,
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                C
              </Text>
              <Text
                style={[
                  styles.parlaySummarySubLabel,
                  { color: theme.textTertiary },
                ]}
              >
                PAYOUT
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.collapseButton,
              {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
            onPress={() => toggleParlay(betSlip.id)}
          >
            <Ionicons name="chevron-up" size={20} color={theme.textSecondary} />
            {(() => {
              const ts = getTicketTimestamp(betSlip);
              const { dateStr, timeStr } = formatToESTDateTime(ts);
              return (
                <View style={{ marginLeft: 8, alignItems: "flex-start" }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {dateStr}
                  </Text>
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                    {timeStr}
                  </Text>
                </View>
              );
            })()}
          </TouchableOpacity>
        </View>
      );
    }

    // Multiple games - Parlay/SGP+ (collapsed/expanded)
    if (!isExpanded) {
      return (
        <TouchableOpacity
          key={betSlip.id}
          style={[
            styles.betCard,
            { backgroundColor: theme.surface },
            ticketStatus === "won"
              ? { borderWidth: 2, borderColor: "#22C55E" }
              : ticketStatus === "lost"
                ? { borderWidth: 2, borderColor: "#EF4444" }
                : {},
          ]}
          onPress={() => toggleParlay(betSlip.id)}
        >
          <View style={styles.parlayCollapsedHeader}>
            <View style={[styles.parlayBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.parlayBadgeText}>{badgeType}</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>
              {gamesCount} Games
            </Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>
              {formatOddsForDisplay(odds, oddsDisplay)}
            </Text>
          </View>

          <View
            style={[styles.parlaySummary, { borderTopColor: theme.border }]}
          >
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {allPicks.length} Picks
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                C
              </Text>
              <Text
                style={[
                  styles.parlaySummarySubLabel,
                  { color: theme.textTertiary },
                ]}
              >
                WAGER
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {Number(
                  ticketStatus === "won"
                    ? displayedPayout
                    : ticketStatus === "lost"
                      ? 0
                      : potentialPayout,
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                C
              </Text>
              <Text
                style={[
                  styles.parlaySummarySubLabel,
                  { color: theme.textTertiary },
                ]}
              >
                PAYOUT
              </Text>
            </View>
          </View>

          <View style={styles.expandIndicator}>
            <Ionicons
              name="chevron-down"
              size={20}
              color={theme.textSecondary}
            />
          </View>
        </TouchableOpacity>
      );
    }

    // Expanded multi-game view
    // Group picks by game
    const picksByGame = {};
    allPicks.forEach((pick) => {
      if (!picksByGame[pick.gameId]) {
        picksByGame[pick.gameId] = [];
      }
      picksByGame[pick.gameId].push(pick);
    });

    // Sort games within a ticket by start time parsed from picks[0].gameInfo
    const sortedGameEntries = Object.entries(picksByGame).sort((a, b) => {
      const aInfo =
        a[1][0].gameInfo || a[1][0].gameInfoTeams || a[1][0].gameInfoTime;
      const bInfo =
        b[1][0].gameInfo || b[1][0].gameInfoTeams || b[1][0].gameInfoTime;
      const ta = parseGameInfoTime(aInfo);
      const tb = parseGameInfoTime(bInfo);
      return ta - tb;
    });

    return (
      <View
        key={betSlip.id}
        style={[
          styles.betCard,
          { backgroundColor: theme.surface },
          ticketStatus === "won"
            ? { borderWidth: 2, borderColor: "#22C55E" }
            : ticketStatus === "lost"
              ? { borderWidth: 2, borderColor: "#EF4444" }
              : {},
        ]}
      >
        <View style={styles.parlayExpandedHeader}>
          <View style={[styles.parlayBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.parlayBadgeText}>{badgeType}</Text>
          </View>
          <Text style={[styles.parlayTitle, { color: theme.text }]}>
            {gamesCount} Games
          </Text>
          <Text style={[styles.parlayOdds, { color: theme.text }]}>
            {formatOddsForDisplay(odds, oddsDisplay)}
          </Text>
        </View>

        {sortedGameEntries.map(([gameId, picks]) => {
          const liveGame = getLiveGameData(gameId);
          const scores = liveGame?.competitions?.[0]?.competitors;
          // ensure picks for this game are sorted by their parsed start time
          picks.sort((p1, p2) => {
            const t1 = parseGameInfoTime(
              p1.gameInfo || p1.gameInfoTeams || p1.gameInfoTime,
            );
            const t2 = parseGameInfoTime(
              p2.gameInfo || p2.gameInfoTeams || p2.gameInfoTime,
            );
            return t1 - t2;
          });
          return (
            <View key={gameId} style={{ marginBottom: 16 }}>
              <View style={styles.parlayGameInfo}>
                <View style={styles.parlayGameScore}>
                  {renderGameScoreNames(picks[0], liveGame, scores)}
                </View>
                <View style={styles.parlayGameStatusRow}>
                  {(liveGame?.competitions[0]?.status?.type?.state || picks[0].gameState) === "in" && (
                    <View
                      style={[
                        styles.liveIndicator,
                        { backgroundColor: theme.error, marginRight: 8 },
                      ]}
                    >
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                  )}
                  <Text
                    style={[
                      styles.parlayGameStatus,
                      { color: theme.textTertiary, marginLeft: 0 },
                    ]}
                  >
                    {picks[0].gameStatus || liveGame?.competitions[0]?.status?.type?.shortDetail}
                  </Text>
                </View>
              </View>

              <View style={styles.parlayPicks}>
                {picks.map((pick) => renderPick(pick, true))}
              </View>
            </View>
          );
        })}

        <View style={[styles.parlaySummary, { borderTopColor: theme.border }]}>
          <View style={styles.parlaySummaryItem}>
            <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
              {allPicks.length} Picks
            </Text>
          </View>
          <View style={styles.parlaySummaryItem}>
            <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
              {amount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              C
            </Text>
            <Text
              style={[
                styles.parlaySummarySubLabel,
                { color: theme.textTertiary },
              ]}
            >
              WAGER
            </Text>
          </View>
          <View style={styles.parlaySummaryItem}>
            <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
              {Number(
                ticketStatus === "won"
                  ? displayedPayout
                  : ticketStatus === "lost"
                    ? 0
                    : potentialPayout,
              ).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              C
            </Text>
            <Text
              style={[
                styles.parlaySummarySubLabel,
                { color: theme.textTertiary },
              ]}
            >
              PAYOUT
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.collapseButton,
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
          onPress={() => toggleParlay(betSlip.id)}
        >
          <Ionicons name="chevron-up" size={20} color={theme.textSecondary} />
          {(() => {
            const ts = getTicketTimestamp(betSlip);
            const { dateStr, timeStr } = formatToESTDateTime(ts);
            return (
              <View style={{ marginLeft: 8, alignItems: "flex-start" }}>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {dateStr}
                </Text>
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                  {timeStr}
                </Text>
              </View>
            );
          })()}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Tabs */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.background,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.tab, selectedTab === "open" && styles.tabActive]}
          onPress={() => setSelectedTab("open")}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  selectedTab === "open" ? colors.primary : theme.textSecondary,
              },
            ]}
          >
            Open
          </Text>
          {selectedTab === "open" && (
            <View
              style={[styles.tabIndicator, { backgroundColor: colors.primary }]}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedTab === "settled" && styles.tabActive]}
          onPress={() => setSelectedTab("settled")}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  selectedTab === "settled"
                    ? colors.primary
                    : theme.textSecondary,
              },
            ]}
          >
            Settled
          </Text>
          {selectedTab === "settled" && (
            <View
              style={[styles.tabIndicator, { backgroundColor: colors.primary }]}
            />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {bets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="receipt-outline"
              size={64}
              color={theme.textTertiary}
            />
            <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
              No {selectedTab} bets
            </Text>
            <Text
              style={[
                styles.emptyStateSubtitle,
                { color: theme.textSecondary },
              ]}
            >
              {selectedTab === "open" && "Place a bet to get started"}
              {selectedTab === "settled" &&
                "Your settled bets will appear here"}
              {selectedTab === "saved" && "Save bets to view them later"}
            </Text>
          </View>
        ) : (
          <View style={styles.betsContainer}>
            {bets.map((betSlip) => renderSubmittedBet(betSlip))}
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {!isPro && <BannerAdWrapper />}
      <BetSlip />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    position: "relative",
  },
  tabActive: {},
  tabText: {
    fontSize: 16,
    fontWeight: "600",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  scrollView: {
    flex: 1,
  },
  betsContainer: {
    padding: 12,
  },
  betCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  // Player Pick Styles
  pickCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  pickHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  statusIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  pickPlayerInfo: {
    flex: 1,
  },
  pickPlayerName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  pickPlayerProp: {
    fontSize: 13,
    textTransform: "uppercase",
  },
  pickBetValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  playerHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  overlappingLogos: {
    width: 50,
    height: 50,
    marginRight: 12,
    position: "relative",
  },
  homeTeamLogo: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  awayTeamLogo: {
    position: "absolute",
    bottom: 0,
    right: 0,
    zIndex: 1,
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    position: "relative",
  },
  progressValue: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: "600",
  },
  progressIndicator: {
    position: "absolute",
    top: -20,
    transform: [{ translateX: -12 }],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: "center",
  },
  progressIndicatorText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "800",
  },
  pickFooter: {
    marginTop: 8,
  },
  pickGameInfo: {
    fontSize: 13,
    marginBottom: 4,
  },
  pickGameStatus: {
    fontSize: 12,
  },
  // Team Bet Styles
  teamBetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  teamBetInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  teamBetTeam: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  teamBetName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  teamBetType: {
    fontSize: 13,
  },
  teamBetOdds: {
    fontSize: 16,
    fontWeight: "700",
  },
  teamBetGame: {
    marginTop: 8,
  },
  teamBetScore: {
    marginBottom: 4,
  },
  teamBetGameInfo: {
    fontSize: 13,
    marginBottom: 4,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreText: {
    fontSize: 14,
    fontWeight: "600",
  },
  liveIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  teamBetGameStatus: {
    fontSize: 12,
  },
  teamBetQuarter: {
    fontSize: 12,
    marginTop: 2,
  },
  // Parlay Styles
  parlayCollapsedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  parlayExpandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  parlayBadge: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  parlayBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  parlayTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  parlayOdds: {
    fontSize: 16,
    fontWeight: "700",
  },
  parlayGameInfo: {
    marginBottom: 12,
  },
  parlayGameText: {
    fontSize: 13,
    marginBottom: 4,
  },
  parlayGameScore: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  parlayGameStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  parlayGameStatus: {
    fontSize: 12,
  },
  parlaySummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    marginBottom: 12,
  },
  parlaySummaryItem: {
    alignItems: "center",
  },
  parlaySummaryLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  parlaySummarySubLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  cashOutButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  cashOutButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cashOutSubtext: {
    color: "#FFF",
    fontSize: 10,
    marginTop: 2,
    opacity: 0.8,
  },
  expandIndicator: {
    alignItems: "center",
    paddingVertical: 4,
  },
  parlayPicks: {
    marginTop: -10,
    marginBottom: -20,
  },
  collapseButton: {
    alignItems: "center",
    paddingVertical: 8,
    marginTop: 8,
  },
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  bottomPadding: {
    height: 100,
  },
});

export default BetBetsScreen;
