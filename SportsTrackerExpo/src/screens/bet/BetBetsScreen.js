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

const BetBetsScreen = () => {
  const { colors, theme, isDarkMode } = useTheme();
  const { submittedBets, loadSubmittedBets } = useBetSlip();
  const oddsContext = useContext(OddsDisplayContext);
  const oddsDisplay = oddsContext ? oddsContext.oddsDisplay : "american";
  const [selectedTab, setSelectedTab] = useState("open"); // open, settled
  const [expandedParlays, setExpandedParlays] = useState(new Set([1])); // Default first parlay expanded
  const [scoreboardData, setScoreboardData] = useState([]);
  // Live-updated betslip fetch map: ticketId -> latest fetched betslip data
  const [betslipLiveMap, setBetslipLiveMap] = useState({});
  // Authoritative bets fetched from server when screen focused
  const [serverBets, setServerBets] = useState(null);
  // Timers per ticket (using setTimeout so interval can be dynamic)
  const pollsRef = useRef({});
  const isFocused = useIsFocused();

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
          "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
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
      const gameIds = [...new Set(ticket.bets.map((b) => b.gameId))].filter(
        Boolean
      );

      const playerBets = {};
      const gameLineBets = { moneyline: null, total: null, spread: null };

      ticket.bets.forEach((bet) => {
        if (bet.type === "Spread") {
          gameLineBets.spread = `${bet.team}${bet.line}`;
        } else if (bet.type === "Total") {
          const overUnder = bet.description?.toLowerCase().includes("over")
            ? "o"
            : "u";
          const lineNumber = String(bet.line || "").replace(/^[OU]\s+/, "");
          gameLineBets.total = `${overUnder}${lineNumber}`;
        } else if (bet.type === "Moneyline") {
          gameLineBets.moneyline = bet.team;
        } else if (bet.playerId && bet.statType) {
          if (!playerBets[bet.playerId]) playerBets[bet.playerId] = {};
          playerBets[bet.playerId][bet.statType] = bet.betValue;
        }
      });

      let query = `gameId=${gameIds.join(",")}`;
      if (gameLineBets.moneyline)
        query += `&moneyline=${gameLineBets.moneyline}`;
      if (gameLineBets.total) query += `&total=${gameLineBets.total}`;
      if (gameLineBets.spread) query += `&spread=${gameLineBets.spread}`;

      Object.entries(playerBets).forEach(([playerId, stats], index) => {
        const playerNum = index + 1;
        query += `&p${playerNum}=${playerId}`;
        Object.entries(stats).forEach(([statType, betValue]) => {
          const statTypeMap = {
            points: "pts",
            rebounds: "reb",
            assists: "ast",
            blocks: "blk",
            steals: "stl",
            turnovers: "to",
            threes: "3pt",
            pra: "pra",
          };
          const shortStat = statTypeMap[statType.toLowerCase()] || "pts";
          query += `&p${playerNum}_${shortStat}=${encodeURIComponent(
            String(betValue)
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

  // Dev log: show counts so it's clear whether UI is using Supabase rows or local-only slips
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    try {
      console.log(
        `[BetBetsScreen] displayedBets count=${
          (displayedBets && displayedBets.length) || 0
        } submittedBets total=${
          (submittedBets && submittedBets.length) || 0
        } submittedFromSupabase=${submittedFromSupabase.length}`
      );
    } catch (e) {}
  }

  const filteredBets = displayedBets.filter((bet) => {
    if (selectedTab === "open") {
      return bet.status === "open";
    } else if (selectedTab === "settled") {
      return bet.status === "won" || bet.status === "lost";
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

    // Dev: log constructed picks to verify parsed values (lines/current)
    try {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[BetBetsScreen] allPicks constructed:", allPicks);
      }
    } catch (e) {
      /* ignore */
    }
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
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log(
          "[BetBetsScreen] on-demand fetch for ticket",
          ticket.id,
          data
        );
      }
      return data;
    } catch (e) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn(
          "[BetBetsScreen] on-demand fetch failed for",
          ticket.id,
          e
        );
      }
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
        try {
          if (typeof loadSubmittedBets === "function")
            await loadSubmittedBets();
        } catch (e) {
          console.warn(
            "[BetBetsScreen] failed to refresh submitted bets:",
            e?.message || e
          );
        }
        // First, attempt to fetch authoritative betslips from server
        try {
          const token = await AsyncStorage.getItem("@bet_token");
          const base =
            process.env.PUBLIC_API_URL ||
            "https://laraiyeogithubio-production-f5af.up.railway.app";
          // Only attempt server-side /api/betslips if a full absolute base URL is configured
          if (token && base && base.length > 0) {
            const url = base.replace(/\/$/, "") + "/api/betslips";
            try {
              const resp = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (resp.ok) {
                const json = await resp.json();
                const authoritative = json.betslips || json.bets || json || [];
                if (mounted) setServerBets(authoritative);
                // use authoritative locally for this run
                var authoritativeLocal = authoritative;
                console.log(
                  `[BetBetsScreen] fetched authoritative betslips: ${JSON.stringify(
                    json
                  )}`
                );
              } else {
                console.warn(
                  "[BetBetsScreen] failed to fetch server betslips",
                  resp.status
                );
              }
            } catch (innerErr) {
              console.warn("[BetBetsScreen] server bets fetch error", innerErr);
            }
          } else {
            // No PUBLIC_API_URL configured in RN environment — skip server fetch to avoid network errors
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log(
                "[BetBetsScreen] skipping server /api/betslips fetch — PUBLIC_API_URL not configured"
              );
            }
          }
        } catch (e) {
          console.warn("[BetBetsScreen] server bets outer error", e);
        }

        // Decide which source of tickets to query for canonical payloads
        const source =
          typeof authoritativeLocal !== "undefined" &&
          Array.isArray(authoritativeLocal) &&
          authoritativeLocal.length > 0
            ? authoritativeLocal
            : serverBets && Array.isArray(serverBets) && serverBets.length > 0
            ? serverBets
            : submittedBets;

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
            console.log(
              `[BetBetsScreen] Focused: serving bets from -> ${sourceLabel}`
            );

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
                console.log(
                  `[BetBetsScreen] Supabase-sourced bets (${submittedBets.length}) -- listing id, updated_at, status:`
                );
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
                    console.log(
                      `[BetBetsScreen] bet id=${id} updated_at=${updated} status=${status}`
                    );
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
            if (!res.ok) return null;
            const data = await res.json();
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
        // merge into existing map
        setBetslipLiveMap((prev) => ({ ...prev, ...map }));
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
      // clear existing
      clearPollForTicket(ticket.id);

      const runOnceAndSchedule = async () => {
        let data = null;
        try {
          // Determine fetch URL: prefer stored betslip_url
          const storedUrl =
            ticket.betslipData?.betslip_url ||
            ticket.betslip_url ||
            (ticket.betslipData && ticket.betslipData.betslip_url) ||
            null;
          const url = storedUrl || buildBetslipUrlFromTicket(ticket);
          if (!url) return;

          const res = await fetch(url);
          data = await res.json();
          // Log full betslip JSON for debugging polling/state decisions
          try {
            console.log("Fetched betslip for ticket", ticket.id, data);
          } catch (e) {
            // ignore console issues in some environments
          }
          if (!mounted) return;
          setBetslipLiveMap((prev) => ({ ...prev, [ticket.id]: data }));
        } catch (e) {
          // ignore fetch errors; keep polling
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
                g.header?.competitions?.[0]?.id === gid
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

    // Start/stop polls for each selected ticket
    ticketsToUse.forEach((ticket) => {
      try {
        // Only poll for open tickets and when this screen is focused
        if (!isFocused) {
          // ensure any active poll is cleared
          if (pollsRef.current[ticket.id]) clearPollForTicket(ticket.id);
          return;
        }
        if (ticket.status && String(ticket.status).toLowerCase() !== "open") {
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
              "post"
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBets, submittedBets, scoreboardData]);

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

  const renderProgressBar = (pick) => {
    const safeLine =
      typeof pick.line === "number" && !isNaN(pick.line) && pick.line !== 0
        ? pick.line
        : null;
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
      <View style={styles.pickHeader}>
        {pick.headshot && (
          <Image
            source={{ uri: pick.headshot }}
            style={styles.playerHeadshot}
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
      {typeof pick.currentValue === "number" &&
        typeof pick.line === "number" &&
        !isNaN(pick.line) &&
        // Only render progress bar when the game is not in pre-game state
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
        {pick.isTotal && pick.homeTeamLogo && pick.awayTeamLogo ? (
          <View style={styles.overlappingLogos}>
            <Image
              source={{ uri: pick.homeTeamLogo }}
              style={styles.homeTeamLogo}
            />
            <Image
              source={{ uri: pick.awayTeamLogo }}
              style={styles.awayTeamLogo}
            />
          </View>
        ) : (
          pick.teamLogo && (
            <Image
              source={{ uri: pick.teamLogo }}
              style={styles.playerHeadshot}
            />
          )
        )}
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
      {typeof pick.currentValue === "number" &&
        typeof pick.line === "number" &&
        !isNaN(pick.line) &&
        // Only render progress bar when the game is not in pre-game state
        pick.gameState !== "pre" &&
        (function () {
          try {
            if (typeof __DEV__ !== "undefined" && __DEV__ && pick.isTotal) {
              console.log(
                "[BetBetsScreen] renderTeamPick total before progress",
                { pick }
              );
            }
          } catch (e) {}
          return renderProgressBar(pick);
        })()}
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
    if (pick.playerName) {
      return renderPlayerPick(pick, isInParlay);
    } else if (pick.team || pick.isTotal) {
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
              <Text style={[styles.scoreText, { color: theme.text }]}>
                {bet.scores.team1} - {bet.scores.team2}
              </Text>
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
              <Text style={[styles.scoreText, { color: theme.text }]}>
                {parlay.scores.team1} - {parlay.scores.team2}
              </Text>
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
            <Text style={[styles.scoreText, { color: theme.text }]}>
              {parlay.scores.team1} - {parlay.scores.team2}
            </Text>
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
    // Prefer live-updated fetched data when available
    const live = betslipLiveMap[betSlip.id];
    const betslipData =
      live || betSlip.betslipData || betSlip.betslip_data || null;
    const originalBets = betSlip.bets || betSlip.bets || [];
    const amount = betSlip.amount || 0;

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

      // Prefer betslipData.events for game info/status/scores
      let eventData = null;
      if (betslipData?.events) {
        eventData = betslipData.events.find(
          (e) => String(e.eventId) === String(bet.gameId)
        );
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
        pick.scores = eventData?.status?.game
          ? {
              team1: eventData.status.game.awayScore,
              team2: eventData.status.game.homeScore,
            }
          : undefined;
      } else {
        // Fallback to scoreboard or ticket data
        const liveGame = getLiveGameData(bet.gameId);
        pick.gameInfo = liveGame?.shortName || bet.gameInfoTeams || "Game";
        pick.gameStatus =
          liveGame?.status?.type?.shortDetail ||
          bet.gameInfoTime ||
          "Scheduled";
        pick.gameState = liveGame?.status?.type?.state || null;
      }

      // Player props
      if (bet.playerId) {
        pick.playerName = bet.player;
        pick.headshot = `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${bet.playerId}.png&w=200`;
        pick.prop = bet.prop;
        pick.propType = bet.statType;
        pick.line = Number(bet.line);
        pick.type = bet.type;
        pick.betValue = bet.betValue;

        // Try to get current value from betslipData
        if (betslipData?.events) {
          const eventData = betslipData.events.find(
            (e) => e.eventId === bet.gameId
          );
          if (eventData?.bets?.players) {
            const playerData = eventData.bets.players.find(
              (p) => p.id === bet.playerId
            );
            if (playerData) {
              const statUpper = bet.statType.toUpperCase().substring(0, 3);
              const statMap = {
                POI: "PTS",
                REB: "REB",
                ASS: "AST",
                BLO: "BLK",
                STE: "STL",
                TUR: "TO",
                PRA: "PRA",
              };
              const statKey = statMap[statUpper] || "PTS";

              if (
                bet.type === "milestone" &&
                playerData.milestones?.[statKey]
              ) {
                pick.currentValue = Number(
                  playerData.milestones[statKey].current
                );
                // Ensure a numeric `line` is present so progress bar can render
                pick.line = Number(
                  playerData.milestones[statKey].threshold ??
                    playerData.milestones[statKey].bet ??
                    bet.betValue ??
                    bet.threshold ??
                    bet.line
                );
                pick.status =
                  playerData.milestones[statKey].won === true
                    ? "winning"
                    : playerData.milestones[statKey].won === false
                    ? "losing"
                    : "pending";
              } else if (playerData.overUnder?.[statKey]) {
                pick.currentValue = Number(
                  playerData.overUnder[statKey].current
                );
                pick.status =
                  playerData.overUnder[statKey].won === true
                    ? "winning"
                    : playerData.overUnder[statKey].won === false
                    ? "losing"
                    : "pending";
              } else {
                pick.status = "pending";
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
        bet.type === "Moneyline"
      ) {
        pick.betType = bet.type.toLowerCase();
        pick.team = bet.team;
        pick.line = Number(bet.line);

        // Construct prop text based on bet type
        if (bet.type === "Spread") {
          pick.prop = `${bet.team} ${bet.line}`;
        } else if (bet.type === "Moneyline") {
          pick.prop = `${bet.team} ${bet.type}`;
        } else if (bet.type === "Total") {
          // For Total bets: displayName = type (OVER/UNDER), prop = line
          pick.displayName = bet.description?.toUpperCase() || bet.type;
          pick.prop = bet.line;
        }

        // For Total bets, get both team logos
        if (bet.type === "Total") {
          // Use team abbreviations from bet if available, otherwise extract from gameInfo
          let awayTeam = bet.awayTeam;
          let homeTeam = bet.homeTeam;

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

          pick.awayTeamLogo = awayTeam
            ? `https://a.espncdn.com/i/teamlogos/nba/500${
                isDarkMode ? "-dark" : ""
              }/${awayTeam.toLowerCase()}.png`
            : null;
          pick.homeTeamLogo = homeTeam
            ? `https://a.espncdn.com/i/teamlogos/nba/500${
                isDarkMode ? "-dark" : ""
              }/${homeTeam.toLowerCase()}.png`
            : null;
          pick.isTotal = true;
        } else {
          pick.teamLogo = `https://a.espncdn.com/i/teamlogos/nba/500${
            isDarkMode ? "-dark" : ""
          }/${bet.team?.toLowerCase()}.png`;
        }

        // Try to get current value from betslipData
        if (betslipData?.events) {
          const eventData = betslipData.events.find(
            (e) => e.eventId === bet.gameId
          );
          if (eventData?.bets) {
            if (bet.type === "Moneyline" && eventData.bets.moneyline) {
              // moneyline current may be a score string; do not set numeric currentValue
              // to avoid rendering a progress bar for moneyline bets. Keep a scoreText for display if needed.
              pick.scoreText = eventData.bets.moneyline.current?.score;
              pick.currentValue = null;
              pick.status =
                eventData.bets.moneyline.current?.won === true
                  ? "winning"
                  : eventData.bets.moneyline.current?.won === false
                  ? "losing"
                  : "pending";
            } else if (bet.type === "Spread" && eventData.bets.spread) {
              // Compute current spread value using event scores so the slider bubble shows a meaningful numeric
              const spreadCurrent = eventData.bets.spread.current;
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
              // For spread visualization:
              // - If line is positive (team is the underdog, e.g. +6.5), compute opponent - team
              //   so that more negative values move the indicator to the right (team trailing).
              // - If line is negative (team is favorite, e.g. -6.5), compute team - opponent.
              // Always compute diff as opponent - team for consistent visualization
              const currentSpreadValue = oppScore - teamScore;
              pick.currentValue = Number(currentSpreadValue);
              // mark as spread for special visualization handling
              pick.isSpread = true;
              pick.spreadLine = lineNum;
              pick.status =
                spreadCurrent?.won === true
                  ? "winning"
                  : spreadCurrent?.won === false
                  ? "losing"
                  : "pending";
            } else if (bet.type === "Total" && eventData.bets.totalPoints) {
              // ensure we have a numeric line to compute progress; prefer original bet.line but fall back to event payload
              const payloadLine = eventData.bets.totalPoints.line;
              if (typeof payloadLine === "number") {
                pick.line = payloadLine;
              } else if (payloadLine != null) {
                const parsed = Number(payloadLine);
                if (!isNaN(parsed)) pick.line = parsed;
              }

              // totalCurrent may be a number or an object like { score: 261 } depending on source
              const totalCurrent = eventData.bets.totalPoints.current;
              let parsedCurrent = null;
              if (typeof totalCurrent === "number") {
                parsedCurrent = totalCurrent;
              } else if (totalCurrent && typeof totalCurrent === "object") {
                parsedCurrent = Number(
                  totalCurrent.score ??
                    totalCurrent.current ??
                    totalCurrent.value ??
                    NaN
                );
              } else if (totalCurrent != null) {
                const n = Number(totalCurrent);
                parsedCurrent = isNaN(n) ? null : n;
              }

              pick.currentValue =
                parsedCurrent !== null && !isNaN(parsedCurrent)
                  ? Number(parsedCurrent)
                  : null;

              pick.status =
                eventData.bets.totalPoints.won === true
                  ? "winning"
                  : eventData.bets.totalPoints.won === false
                  ? "losing"
                  : "pending";

              // Dev logging to debug missing progress bars for totals
              try {
                if (typeof __DEV__ !== "undefined" && __DEV__) {
                  console.log("[BetBetsScreen] Total parse", {
                    gameId: bet.gameId,
                    bet,
                    payload: eventData.bets.totalPoints,
                    pickLine: pick.line,
                    pickCurrent: pick.currentValue,
                  });
                }
              } catch (e) {
                /* ignore logging errors */
              }
            } else {
              pick.status = "pending";
            }
          }
        } else {
          pick.status = "pending";
        }
      }

      return pick;
    });

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
      return (amount * totalDecimal).toFixed(2);
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
                })} C
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
                    : potentialPayout
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} C
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
              <Text
                style={[styles.parlayGameText, { color: theme.textSecondary }]}
              >
                {liveGame?.shortName || pick.gameInfo}
              </Text>
              {scores && liveGame?.status?.type?.state === "in" && (
                <Text style={[styles.scoreText, { color: theme.text }]}>
                  {scores[1]?.score || 0} - {scores[0]?.score || 0}
                </Text>
              )}
            </View>
            <View style={styles.parlayGameStatusRow}>
              {liveGame?.status?.type?.state === "in" && (
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
                {liveGame?.status?.type?.shortDetail || pick.gameStatus}
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
                })} C
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
              >{Number(
                  ticketStatus === "won"
                    ? displayedPayout
                    : ticketStatus === "lost"
                    ? 0
                    : potentialPayout
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} C
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
                })} C
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
                >{Number(
                  ticketStatus === "won"
                    ? displayedPayout
                    : ticketStatus === "lost"
                    ? 0
                    : potentialPayout
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} C
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
              <Text
                style={[styles.parlayGameText, { color: theme.textSecondary }]}
              >
                {liveGame?.shortName || firstPick.gameInfo}
              </Text>
              {scores && liveGame?.status?.type?.state === "in" && (
                <Text style={[styles.scoreText, { color: theme.text }]}>
                  {scores[1]?.score || 0} - {scores[0]?.score || 0}
                </Text>
              )}
            </View>
            <View style={styles.parlayGameStatusRow}>
              {liveGame?.status?.type?.state === "in" && (
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
                {liveGame?.status?.type?.shortDetail || firstPick.gameStatus}
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
                })} C
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
              >{Number(
                  ticketStatus === "won"
                    ? displayedPayout
                    : ticketStatus === "lost"
                    ? 0
                    : potentialPayout
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} C
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
                })} C
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
                    : potentialPayout
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} C
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
              p1.gameInfo || p1.gameInfoTeams || p1.gameInfoTime
            );
            const t2 = parseGameInfoTime(
              p2.gameInfo || p2.gameInfoTeams || p2.gameInfoTime
            );
            return t1 - t2;
          });
          return (
            <View key={gameId} style={{ marginBottom: 16 }}>
              <View style={styles.parlayGameInfo}>
                <View style={styles.parlayGameScore}>
                  <Text
                    style={[
                      styles.parlayGameText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {liveGame?.shortName || picks[0].gameInfo}
                  </Text>
                  {scores && liveGame?.status?.type?.state === "in" && (
                    <Text style={[styles.scoreText, { color: theme.text }]}>
                      {scores[1]?.score || 0} - {scores[0]?.score || 0}
                    </Text>
                  )}
                </View>
                <View style={styles.parlayGameStatusRow}>
                  {liveGame?.status?.type?.state === "in" && (
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
                    {liveGame?.status?.type?.shortDetail || picks[0].gameStatus}
                  </Text>
                </View>
              </View>

              <View style={styles.parlayPicks}>
                {picks.map((pick) => renderPick(pick, true))}
              </View>
            </View>
          );
        })}
        

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
                })} C
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
                    : potentialPayout
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} C
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
    marginTop: 8,
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
