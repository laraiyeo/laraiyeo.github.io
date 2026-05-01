import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import { useFavorites } from "../../context/FavoritesContext";
import { LiveViewerBadge } from "../../components/ViewerCounter";
import Icon from "react-native-vector-icons/FontAwesome6";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVER_BASE = "https://laraiyeogithubio-production-ed10.up.railway.app";
const MEETINGS_CACHE_KEY = "f1_meetings_cache:v2";
const MEETINGS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function parseGmtOffset(gmt) {
  if (!gmt) return 0;
  // gmt like "+03:00:00" or "-04:00:00" or "03:00:00"
  const sign = gmt.trim().startsWith("-") ? -1 : 1;
  const parts = gmt.replace(/^[+-]/, "").split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return sign * ((h * 3600 + m * 60 + s) * 1000);
}

function applyGmtOffsetToDate(dateStr, gmtOffsetStr) {
  if (!dateStr) return null;
  // Timestamps are already in UTC; parse to a Date (JS will convert to device local time when displayed).
  return new Date(dateStr);
}

const ResultsScreen = ({ route }) => {
  const { theme, colors } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigation = useNavigation();

  const [selectedType, setSelectedType] = useState("CURRENT");
  const [results, setResults] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [allEventsLoaded, setAllEventsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meetingDetailsCache, setMeetingDetailsCache] = useState({});

  const resultTypes = [
    { key: "LAST", name: "Previous" },
    { key: "CURRENT", name: "Current" },
    { key: "UPCOMING", name: "Upcoming" },
  ];

  useEffect(() => {
    fetchResults();
  }, [selectedType]);

  const fetchResults = async () => {
    // If we already loaded all events, compute filtered results from cache
    if (allEventsLoaded && allEvents && allEvents.length > 0) {
      const filtered = filterEventsByType(allEvents, selectedType, new Date());
      setResults(filtered);
      return;
    }

    try {
      setLoading(true);
      const now = new Date();
      const nowMs = Date.now();

      // Try to load meetings from our server and short-circuit the ESPN calendar parsing.
      try {
        let meetingsData = null;
        try {
          const cached = await AsyncStorage.getItem(MEETINGS_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (
              parsed &&
              parsed.fetchedAt &&
              Date.now() - parsed.fetchedAt < MEETINGS_CACHE_TTL
            ) {
              meetingsData = parsed.data;
            }
          }
        } catch (e) {
          // ignore cache read errors
        }

        if (!meetingsData) {
          const url = `${SERVER_BASE}/meetings`;
          const resp = await fetch(url);
          const json = await resp.json();
          const arr = Array.isArray(json.data)
            ? json.data
            : Array.isArray(json)
              ? json
              : [];
          meetingsData = arr.map((m) => {
            const startRaw = m.date_start || m.dateStart || m.date || null;
            const endRaw = m.date_end || m.dateEnd || m.endDate || null;
            const startDateObj = startRaw ? new Date(startRaw) : null;
            const endDateObj = endRaw ? new Date(endRaw) : null;
            // Adjust end time by subtracting 2 hours as required
            const endAdjusted = endDateObj
              ? new Date(endDateObj.getTime() - 2 * 60 * 60 * 1000)
              : null;
            const startMs = startDateObj ? startDateObj.getTime() : null;
            const endMs = endAdjusted ? endAdjusted.getTime() : null;
            const endPlusOneMs = endMs ? endMs + 24 * 60 * 60 * 1000 : null;
            const isCompleted = endPlusOneMs ? nowMs > endPlusOneMs : false;
            const isUpcoming = startMs ? nowMs < startMs : false;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            const eventStartDate =
              startDateObj || (m.date ? new Date(m.date) : null);
            const eventEndDate =
              endAdjusted || (m.date_end ? new Date(m.date_end) : null);
            const isTodayInEventPeriod =
              eventStartDate && eventEndDate
                ? todayStart <= eventEndDate && todayEnd >= eventStartDate
                : false;
            const finalIsUpcoming = isCompleted
              ? false
              : isTodayInEventPeriod
                ? false
                : isUpcoming;
            return {
              ...m,
              id: m.meeting_key || m.meetingKey || m.id,
              // keep raw ISO strings from the JSON so we can display exactly as provided
              startRaw: startRaw,
              endRaw: endAdjusted ? endAdjusted.toISOString() : endRaw || null,
              name:
                m.meeting_name ||
                m.meeting_official_name ||
                m.meetingName ||
                m.name ||
                "",
              // Use the original start timestamp from the JSON for display; for completed events use the end timestamp adjusted -2h
              date: isCompleted
                ? endAdjusted
                  ? endAdjusted.toISOString()
                  : endRaw || m.date_end || m.dateEnd || ""
                : startRaw || m.date_start || m.dateStart || "",
              eventDate: startDateObj,
              endDate: endAdjusted,
              countryFlag: m.country_flag || m.countryFlag || "",
              countryName: m.country_name || m.countryName || "",
              venueName:
                m.circuit_short_name ||
                m.circuitShortName ||
                m.venueName ||
                m.location ||
                "",
              isCompleted,
              isUpcoming: finalIsUpcoming,
              competitionWinners: {},
              winnerName: m.winner || "",
              winnerTeam: m.winner_team || m.winnerTeam || "",
              winnerTeamColor: m.winner_team
                ? `#${getTeamColor(m.winner_team)}`
                : theme.surfaceSecondary,
            };
          });
          try {
            await AsyncStorage.setItem(
              MEETINGS_CACHE_KEY,
              JSON.stringify({ fetchedAt: Date.now(), data: meetingsData }),
            );
          } catch (e) {}
        }

        if (meetingsData && meetingsData.length > 0) {
          // For now, if a meeting is live and is meeting 1281, fetch its detailed payload (ttl 5m)
          for (let i = 0; i < meetingsData.length; i++) {
            const ev = meetingsData[i];
            const startMs = ev.eventDate
              ? new Date(ev.eventDate).getTime()
              : ev.startRaw
                ? new Date(ev.startRaw).getTime()
                : null;
            const endMs = ev.endDate
              ? new Date(ev.endDate).getTime()
              : ev.endRaw
                ? new Date(ev.endRaw).getTime()
                : null;
            const nowMsLocal = Date.now();
            // Optionally fetch meeting details only when the meeting is live.
            if (
              startMs &&
              endMs &&
              nowMsLocal >= startMs &&
              nowMsLocal <= endMs
            ) {
              // could fetch details for live meetings here (disabled by default)
            }
          }

          setAllEvents(meetingsData);
          setAllEventsLoaded(true);
          const filtered = filterEventsByType(meetingsData, selectedType, now);
          setResults(filtered);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      } catch (e) {
        // if server fetch fails, fall back to existing calendar logic
        console.warn(
          "meetings fetch failed, falling back to calendar",
          e?.message || e,
        );
      }

      // Fetch calendar first (efficient approach)
      const calUrl =
        "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/calendar/ondays?lang=en&region=us";
      const calResp = await fetch(calUrl);
      const calJson = await calResp.json();

      if (!calJson || !Array.isArray(calJson.sections)) {
        throw new Error("Invalid calendar data");
      }

      // Process all calendar sections in parallel instead of one by one
      const sectionPromises = calJson.sections.map(async (section) => {
        try {
          const evName = section.label || section.title || "Event";
          const startDate =
            section.startDate ||
            section.event?.startDate ||
            section.event?.date;
          const endDate =
            section.endDate || section.event?.endDate || section.event?.date;
          const eventRef = section.event?.$ref;

          if (!startDate || !endDate || !eventRef) {
            console.log(`Future: ${evName}`);
            return null;
          }

          const startMs = Date.parse(startDate);
          const endMs = Date.parse(endDate);
          const endPlusOneMs = endMs + 24 * 60 * 60 * 1000;

          // Fetch event data
          const eventData = await fetchRef(eventRef);
          if (!eventData) return null;

          // Fetch venue details for circuit name & country flag
          let venueName = "";
          let countryFlag = "";
          if (
            eventData.venues &&
            eventData.venues.length > 0 &&
            eventData.venues[0].$ref
          ) {
            try {
              const venueData = await fetchRef(eventData.venues[0].$ref);
              venueName = venueData?.fullName || "";
              countryFlag = venueData?.countryFlag?.href || "";
            } catch (venueErr) {
              console.warn(
                "Failed to fetch venue info for event",
                eventData.id,
                venueErr,
              );
            }
          }

          // Determine event status based on timestamps
          // For F1 events, consider them current if we're within the event weekend (from start to end+1day)
          const isCompleted = nowMs > endPlusOneMs;
          const isUpcoming = nowMs < startMs;

          // Special handling for F1 events: if today's date falls within the event dates, it's current
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);
          const eventStartDate = new Date(startMs);
          const eventEndDate = new Date(endMs);

          // Check if today falls within the event period
          const isTodayInEventPeriod =
            todayStart <= eventEndDate && todayEnd >= eventStartDate;

          // Override isUpcoming if today is within the event period and event isn't completed
          const finalIsUpcoming = isCompleted
            ? false
            : isTodayInEventPeriod
              ? false
              : isUpcoming;
          const isInProgress = !isCompleted && !finalIsUpcoming;

          const enriched = {
            ...eventData,
            // Use end date as the canonical `date` for completed events so that
            // "Last" uses the event end date for display and sorting. Keep a
            // dedicated `endDate` field as a Date object for other logic.
            date: isCompleted ? endDate : eventData.date,
            eventDate: new Date(eventData.date),
            endDate: new Date(endDate),
            countryFlag,
            venueName,
            isCompleted,
            isUpcoming: finalIsUpcoming,
            competitionWinners: {},
            winnerName: "",
            winnerTeam: "",
            winnerTeamColor: theme.surfaceSecondary,
          };

          // For completed races, find the race winner
          if (isCompleted) {
            try {
              const raceCompetition = (eventData.competitions || []).find(
                (comp) => {
                  const type = comp.type || {};
                  const name = (
                    type.name ||
                    type.displayName ||
                    type.abbreviation ||
                    type.text ||
                    ""
                  )
                    .toString()
                    .toLowerCase();
                  return name.includes("race") && !name.includes("sprint");
                },
              );

              if (raceCompetition) {
                // Use competitors directly from the race competition data
                const competitors = raceCompetition?.competitors || [];

                const winnerComp = Array.isArray(competitors)
                  ? competitors.find((c) => c.winner === true) ||
                    competitors.find((c) => c.rank === 1 || c.order === 1)
                  : null;

                if (winnerComp) {
                  // Resolve athlete name
                  let winnerName = "";
                  try {
                    const athleteRef = winnerComp.athlete?.$ref || null;
                    if (athleteRef && typeof athleteRef === "string") {
                      const athleteData = await fetchRef(athleteRef);
                      winnerName =
                        athleteData?.displayName ||
                        athleteData?.shortName ||
                        athleteData?.fullName ||
                        athleteRef;
                    } else if (
                      winnerComp.athlete &&
                      typeof winnerComp.athlete === "object"
                    ) {
                      winnerName =
                        winnerComp.athlete.displayName ||
                        winnerComp.athlete.shortName ||
                        winnerComp.athlete.fullName ||
                        "";
                    }
                  } catch (aerr) {
                    winnerName =
                      winnerComp.athlete?.shortName ||
                      winnerComp.athlete?.displayName ||
                      winnerComp.athlete ||
                      "";
                  }

                  const manufacturer =
                    winnerComp.vehicle?.manufacturer ||
                    winnerComp.team?.displayName ||
                    "";
                  enriched.winnerName = winnerName;
                  enriched.winnerTeam = manufacturer;
                  enriched.winnerTeamColor = manufacturer
                    ? `#${getTeamColor(manufacturer)}`
                    : theme.surfaceSecondary;

                  // Console log for finished race
                  const winnerTeamColor = manufacturer
                    ? `#${getTeamColor(manufacturer)}`
                    : "";
                  console.log(
                    `Finished Race: ${evName}${
                      venueName ? ` (${venueName})` : ""
                    }${countryFlag ? ` [flag: ${countryFlag}]` : ""}: Winner: ${
                      winnerName || "UNKNOWN"
                    } - ${manufacturer || "UNKNOWN"}${
                      winnerTeamColor ? ` • ${winnerTeamColor}` : ""
                    }`,
                  );
                }
              }
            } catch (winnerErr) {
              console.warn(
                "Failed to resolve winner for completed event",
                eventData.id,
                winnerErr,
              );
            }
          }

          // For in-progress races, build competition winners map
          if (isInProgress) {
            const competitionWinners = {};
            let anyWinners = false;
            // Track next/current competition for display time and type
            let nextCompetition = null;
            let nextCompetitionMs = null;

            try {
              const competitions = eventData.competitions || [];
              for (const competition of competitions) {
                try {
                  // Use competition data directly - no need to fetch $ref
                  const compData = competition;
                  const compType = compData?.type || {};
                  const compAbbr =
                    compType.abbreviation ||
                    compType.displayName ||
                    compType.text ||
                    compType.name ||
                    "Competition";

                  // Normalize common abbreviations
                  const abbr = (compType.abbreviation || "").toString();
                  const typeMap = {
                    FP1: "Free Practice 1",
                    FP2: "Free Practice 2",
                    FP3: "Free Practice 3",
                    SS: "Sprint Shootout",
                    SR: "Sprint Race",
                    Qual: "Qualifying",
                    Race: "Race",
                  };
                  const compName =
                    abbr && typeMap[abbr]
                      ? typeMap[abbr]
                      : compType.displayName ||
                        compType.text ||
                        compType.name ||
                        compType.abbreviation ||
                        "Competition";

                  // Check if this competition is scheduled (for display time/type)
                  try {
                    const statusRef = compData?.status?.$ref;
                    let statusData = null;
                    if (typeof statusRef === "string") {
                      statusData = await fetchRef(statusRef);
                    } else if (
                      compData?.status &&
                      typeof compData.status === "object"
                    ) {
                      statusData = compData.status;
                    }

                    const isScheduled =
                      statusData &&
                      (statusData.type?.name === "STATUS_SCHEDULED" ||
                        statusData.type?.state === "pre" ||
                        statusData.type === "pre" ||
                        statusData.type?.name
                          ?.toString()
                          .toLowerCase()
                          .includes("scheduled"));

                    const compStartMs = Date.parse(compData?.date || "");
                    if (
                      isScheduled &&
                      compStartMs &&
                      (!nextCompetitionMs || compStartMs < nextCompetitionMs)
                    ) {
                      nextCompetition = {
                        compType,
                        compName,
                        compDate: compData?.date,
                        compTypeText:
                          compType.text ||
                          compType.displayName ||
                          compType.abbreviation ||
                          compName,
                        compTypeAbbreviation: compType.abbreviation || compName,
                      };
                      nextCompetitionMs = compStartMs;
                    }
                  } catch (statusInspectErr) {
                    // ignore status inspection errors
                  }

                  const competitors = compData?.competitors || [];
                  const winners = Array.isArray(competitors)
                    ? competitors.filter((c) => c.winner === true)
                    : [];

                  if (winners.length > 0) {
                    anyWinners = true;
                    for (const w of winners) {
                      // Resolve athlete name for display
                      let athleteName = "";
                      try {
                        const athleteRef = w.athlete?.$ref || null;
                        if (athleteRef && typeof athleteRef === "string") {
                          const athleteData = await fetchRef(athleteRef);
                          athleteName =
                            athleteData?.displayName ||
                            athleteData?.shortName ||
                            athleteData?.fullName ||
                            athleteRef;
                        } else if (w.athlete && typeof w.athlete === "object") {
                          athleteName =
                            w.athlete.displayName ||
                            w.athlete.shortName ||
                            w.athlete.fullName ||
                            "";
                        }
                      } catch (aerr) {
                        athleteName =
                          w.athlete?.shortName ||
                          w.athlete?.displayName ||
                          w.athlete ||
                          "";
                      }

                      const manufacturer =
                        w.vehicle?.manufacturer || w.team?.displayName || "";
                      const teamColor = manufacturer
                        ? `#${getTeamColor(manufacturer)}`
                        : "";

                      // Store for UI
                      competitionWinners[compName] = {
                        winnerName: athleteName || "TBD",
                        winnerTeam: manufacturer || "",
                        winnerTeamColor: teamColor,
                      };

                      // Console log
                      console.log(
                        `In Progress Race: ${evName}${
                          venueName ? ` (${venueName})` : ""
                        }${
                          countryFlag ? ` [flag: ${countryFlag}]` : ""
                        }: Competition: ${compAbbr} | Winner: ${
                          athleteName || "UNKNOWN"
                        } - ${manufacturer || "UNKNOWN"}${
                          teamColor ? ` • ${teamColor}` : ""
                        }`,
                      );
                    }
                  } else {
                    // No explicit winner flag; check competition status
                    try {
                      let statusRef = compData?.status?.$ref;
                      let statusData = null;
                      if (typeof statusRef === "string") {
                        statusData = await fetchRef(statusRef);
                      } else if (
                        compData?.status &&
                        typeof compData.status === "object"
                      ) {
                        statusData = compData.status;
                      }

                      const isCompletedStatus =
                        statusData &&
                        (statusData.type?.completed === true ||
                          statusData.type?.name === "STATUS_FINAL" ||
                          statusData.type?.state === "post" ||
                          statusData.completed === true ||
                          statusData.type === "post");

                      if (isCompletedStatus) {
                        const firstPlace = Array.isArray(competitors)
                          ? competitors.find(
                              (c) => c.order === 1 || c.rank === 1,
                            ) || competitors[0]
                          : null;
                        if (firstPlace) {
                          anyWinners = true;
                          // Resolve athlete name and manufacturer
                          let athleteName = "";
                          try {
                            const athleteRef = firstPlace.athlete?.$ref || null;
                            if (athleteRef && typeof athleteRef === "string") {
                              const athleteData = await fetchRef(athleteRef);
                              athleteName =
                                athleteData?.displayName ||
                                athleteData?.shortName ||
                                athleteData?.fullName ||
                                athleteRef;
                            } else if (
                              firstPlace.athlete &&
                              typeof firstPlace.athlete === "object"
                            ) {
                              athleteName =
                                firstPlace.athlete.displayName ||
                                firstPlace.athlete.shortName ||
                                firstPlace.athlete.fullName ||
                                "";
                            }
                          } catch (aerr) {
                            athleteName =
                              firstPlace.athlete?.shortName ||
                              firstPlace.athlete?.displayName ||
                              firstPlace.athlete ||
                              "";
                          }

                          const manufacturer =
                            firstPlace.vehicle?.manufacturer ||
                            firstPlace.team?.displayName ||
                            "";
                          const teamColor = manufacturer
                            ? `#${getTeamColor(manufacturer)}`
                            : "";

                          // Store for UI
                          competitionWinners[compName] = {
                            winnerName: athleteName || "TBD",
                            winnerTeam: manufacturer || "",
                            winnerTeamColor: teamColor,
                          };

                          // Console log
                          console.log(
                            `In Progress Race: ${evName}${
                              venueName ? ` (${venueName})` : ""
                            }${
                              countryFlag ? ` [flag: ${countryFlag}]` : ""
                            }: Competition: ${compAbbr} | Winner: ${
                              athleteName || "UNKNOWN"
                            } - ${manufacturer || "UNKNOWN"}${
                              teamColor ? ` • ${teamColor}` : ""
                            }`,
                          );
                        }
                      }
                    } catch (statusErr) {
                      // Fallback to order/rank heuristics
                      try {
                        const firstPlace = Array.isArray(competitors)
                          ? competitors.find(
                              (c) => c.order === 1 || c.rank === 1,
                            ) || null
                          : null;
                        if (firstPlace) {
                          anyWinners = true;
                          let athleteName = "";
                          try {
                            const athleteRef = firstPlace.athlete?.$ref || null;
                            if (athleteRef && typeof athleteRef === "string") {
                              const athleteData = await fetchRef(athleteRef);
                              athleteName =
                                athleteData?.displayName ||
                                athleteData?.shortName ||
                                athleteData?.fullName ||
                                athleteRef;
                            } else if (
                              firstPlace.athlete &&
                              typeof firstPlace.athlete === "object"
                            ) {
                              athleteName =
                                firstPlace.athlete.displayName ||
                                firstPlace.athlete.shortName ||
                                firstPlace.athlete.fullName ||
                                "";
                            }
                          } catch (aerr) {
                            athleteName =
                              firstPlace.athlete?.shortName ||
                              firstPlace.athlete?.displayName ||
                              firstPlace.athlete ||
                              "";
                          }

                          const manufacturer =
                            firstPlace.vehicle?.manufacturer ||
                            firstPlace.team?.displayName ||
                            "";
                          const teamColor = manufacturer
                            ? `#${getTeamColor(manufacturer)}`
                            : "";

                          // Store for UI
                          competitionWinners[compName] = {
                            winnerName: athleteName || "TBD",
                            winnerTeam: manufacturer || "",
                            winnerTeamColor: teamColor,
                          };

                          // Console log
                          console.log(
                            `In Progress Race: ${evName}${
                              venueName ? ` (${venueName})` : ""
                            }${
                              countryFlag ? ` [flag: ${countryFlag}]` : ""
                            }: Competition: ${compAbbr} | Winner(heuristic): ${
                              athleteName || "UNKNOWN"
                            } - ${manufacturer || "UNKNOWN"}${
                              teamColor ? ` • ${teamColor}` : ""
                            }`,
                          );
                        }
                      } catch (fallbackErr) {
                        // ignore and continue
                      }
                    }
                  }
                } catch (ce) {
                  console.warn("Error processing competition in-progress", ce);
                }
              }

              if (!anyWinners) {
                console.log(
                  `In Progress Race: ${evName}: No winners found yet`,
                );
              }

              // If we found a scheduled competition, use its date/time and type for display
              if (nextCompetition && nextCompetition.compDate) {
                try {
                  enriched.eventDate = new Date(nextCompetition.compDate);
                  enriched.date = nextCompetition.compDate;
                  enriched.nextCompetitionType = nextCompetition.compTypeText;
                  enriched.nextCompetitionAbbr =
                    nextCompetition.compTypeAbbreviation;
                  // Don't update isUpcoming - keep the event classified as in-progress
                  // since it's based on the overall event timeframe, not individual competition time
                } catch (dateSetErr) {
                  // ignore date setting errors
                }
              }
            } catch (cwErr) {
              console.warn("Error building competition winners", cwErr);
            }

            enriched.competitionWinners = competitionWinners;
          }

          // For future races, just log
          if (isUpcoming) {
            console.log(`Future: ${evName}`);
          }

          return enriched;
        } catch (eventErr) {
          console.warn("Error processing event from calendar", eventErr);
          return null;
        }
      });

      // Wait for all events to be processed and filter out nulls
      const eventsWithDetails = (await Promise.all(sectionPromises)).filter(
        Boolean,
      );

      // Cache all events for tab switching
      setAllEvents(eventsWithDetails);
      setAllEventsLoaded(true);

      const filtered = filterEventsByType(eventsWithDetails, selectedType, now);
      setResults(filtered);
    } catch (error) {
      console.error("Error fetching F1 results:", error);
      Alert.alert("Error", "Failed to fetch F1 results");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterEventsByType = (events, type, now = new Date()) => {
    switch (type) {
      case "LAST":
        return events
          .filter((e) => e.isCompleted)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
      case "CURRENT":
        return events
          .filter((e) => !e.isCompleted && !e.isUpcoming)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      case "UPCOMING":
        return events
          .filter((e) => e.isUpcoming)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      default:
        return [];
    }
  };

  const convertToHttps = (url) => {
    if (!url) return url;
    // Handle protocol-relative URLs like //a.espncdn.com/...
    if (url.startsWith("//")) {
      return `https:${url}`;
    }
    // Handle root-relative paths like /i/teamlogos/... -- prefix with ESPN CDN host
    if (url.startsWith("/")) {
      return `https://a.espncdn.com${url}`;
    }
    if (url.startsWith("http://")) {
      return url.replace("http://", "https://");
    }
    return url;
  };

  // Simple in-memory cache to deduplicate $ref fetches for venue/athlete/competition
  const refCache = new Map();
  const fetchRef = async (refUrl) => {
    if (!refUrl) return null;
    const normalized = convertToHttps(refUrl);
    if (refCache.has(normalized)) return refCache.get(normalized);
    try {
      const resp = await fetch(normalized);
      const json = await resp.json();
      refCache.set(normalized, json);
      return json;
    } catch (err) {
      console.warn("Failed to fetch ref", normalized, err);
      refCache.set(normalized, null);
      return null;
    }
  };

  // Map constructor/team display names to hex colors (same idea as web results.js)
  const getTeamColor = (constructorName) => {
    if (!constructorName) return "333333";
    const colorMap = {
      Mercedes: "00D7B6",
      "Red Bull": "4781D7",
      Ferrari: "ED1131",
      McLaren: "F47600",
      Alpine: "00A1E8",
      "Racing Bulls": "6C98FF",
      "Aston Martin": "229971",
      Williams: "1878D8",
      Sauber: "52E252",
      Haas: "9C9FA2",
      Audi: "F50537",
      Cadillac: "909090",
    };
    return colorMap[constructorName] || "333333";
  };

  // Country color map used for upcoming item gradients (exact list)
  const countryColorMap = {
    bahrain: "#CE1126",
    australia: "#012169",
    china: "#DE2910",
    japan: "#FFFFFF",
    "saudi arabia": "#006C35",
    "united states": "#3C3B6E",
    canada: "#FF0000",
    monaco: "#CE1126",
    spain: "#AA151B",
    austria: "#ED2939",
    "united kingdom": "#012169",
    belgium: "#000000",
    hungary: "#CE2939",
    netherlands: "#FF7900",
    italy: "#009246",
    azerbaijan: "#00B5E2",
    singapore: "#EF3340",
    mexico: "#006847",
    brazil: "#009C3B",
    qatar: "#8A1538",
    "united arab emirates": "#00732F",
  };

  const getCountryColor = (countryName) => {
    if (!countryName) return null;
    const normalized = countryName
      .toString()
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Direct lookup
    if (countryColorMap[normalized]) return countryColorMap[normalized];

    // Substring match to handle values like "Bahrain International Circuit"
    for (const k of Object.keys(countryColorMap)) {
      if (normalized.includes(k)) return countryColorMap[k];
    }

    // Common abbreviations
    if (
      normalized === "usa" ||
      normalized === "u.s.a" ||
      normalized.includes("united states")
    )
      return countryColorMap["united states"];
    if (normalized === "uae" || normalized.includes("united arab emirates"))
      return countryColorMap["united arab emirates"];

    return null;
  };

  const resolveCountryNameFromEvent = (ev) => {
    if (!ev) return null;
    const candidates = [
      // explicit country fields (API uses snake_case)
      ev.country_name,
      ev.countryName,
      ev.country,
      // nested meeting payloads may include country_name
      ev.meeting?.country_name,
      ev.meeting?.countryName,
      // venue/location fields
      ev.venueName,
      ev.venue,
      ev.location,
      // fallback to visible names
      ev.country_name || ev.country_name,
      ev.name,
      ev.meeting?.meeting_official_name,
      ev.meeting?.meeting_name,
    ];

    for (const c of candidates) {
      if (c && typeof c === "string") {
        const maybe = c.toString().trim();
        if (maybe.length > 0) return maybe;
      }
    }

    return null;
  };

  // Fetch meeting details with short TTL cache (5 minutes)
  const MEETING_DETAIL_TTL = 5 * 60 * 1000; // 5 minutes
  const fetchMeetingDetail = async (meetingKey) => {
    if (!meetingKey) return null;
    const cacheKey = `f1_meeting_detail:${meetingKey}`;
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed &&
          parsed.fetchedAt &&
          Date.now() - parsed.fetchedAt < MEETING_DETAIL_TTL
        ) {
          return parsed.data;
        }
      }
    } catch (e) {
      // ignore cache read errors
    }

    try {
      const url = `${SERVER_BASE}/meeting/${meetingKey}`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const json = await resp.json();
      // store in cache
      try {
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ fetchedAt: Date.now(), data: json }),
        );
      } catch (e) {}
      return json;
    } catch (err) {
      console.warn("Failed to fetch meeting detail", meetingKey, err);
      return null;
    }
  };

  // When viewing CURRENT results, ensure we load meeting details (sessions)
  useEffect(() => {
    if (
      selectedType !== "CURRENT" ||
      !Array.isArray(results) ||
      results.length === 0
    )
      return;

    results.forEach((ev) => {
      const meetingKey = ev.meeting_key || ev.meetingKey || ev.id;
      if (!meetingKey) return;
      const keyStr = String(meetingKey);
      // If event already has meetingDetails, skip
      if (ev.meetingDetails) return;

      // If we have cached meeting details, merge them immediately
      const cached = meetingDetailsCache[keyStr];
      if (cached) {
        const meetingObj = cached.meeting || cached;
        const startRaw =
          meetingObj?.date_start ||
          meetingObj?.dateStart ||
          meetingObj?.date ||
          null;
        const endRaw =
          meetingObj?.date_end ||
          meetingObj?.dateEnd ||
          meetingObj?.endDate ||
          null;
        const eventDateObj = startRaw ? new Date(startRaw) : null;
        const endDateObj = endRaw ? new Date(endRaw) : null;
        setResults((prev) =>
          prev.map((p) => {
            const pk = p.meeting_key || p.meetingKey || p.id;
            if (String(pk) === keyStr)
              return {
                ...p,
                meetingDetails: cached,
                startRaw: p.startRaw || startRaw,
                endRaw: p.endRaw || endRaw,
                eventDate: p.eventDate || eventDateObj,
                endDate: p.endDate || endDateObj,
              };
            return p;
          }),
        );
        return;
      }

      (async () => {
        try {
          const md = await fetchMeetingDetail(meetingKey);
          if (md) {
            // normalize meeting/date fields for viewer badge logic
            const meetingObj = md.meeting || md;
            const startRaw =
              meetingObj?.date_start ||
              meetingObj?.dateStart ||
              meetingObj?.date ||
              null;
            const endRaw =
              meetingObj?.date_end ||
              meetingObj?.dateEnd ||
              meetingObj?.endDate ||
              null;
            const eventDateObj = startRaw ? new Date(startRaw) : null;
            const endDateObj = endRaw ? new Date(endRaw) : null;

            setMeetingDetailsCache((prev) => ({ ...prev, [keyStr]: md }));
            setResults((prev) =>
              prev.map((p) => {
                const pk = p.meeting_key || p.meetingKey || p.id;
                if (String(pk) === keyStr)
                  return {
                    ...p,
                    meetingDetails: md,
                    startRaw: p.startRaw || startRaw,
                    endRaw: p.endRaw || endRaw,
                    eventDate: p.eventDate || eventDateObj,
                    endDate: p.endDate || endDateObj,
                  };
                return p;
              }),
            );
          }
        } catch (err) {
          // ignore per-item fetch errors
        }
      })();
    });
  }, [results, selectedType, meetingDetailsCache]);

  const formatDateShort = (dateString) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTimeShort = (dateString) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    };
    return date.toLocaleDateString("en-US", options);
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const options = {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    };
    return date.toLocaleTimeString("en-US", options);
  };

  // Helper to get F1 team ID for favorites (use team name as ID for F1)
  const getF1TeamId = (teamName) => {
    if (!teamName) return null;
    // Use team name as ID for F1 since there's no consistent numeric ID
    return `f1_${teamName.toLowerCase().replace(/\s+/g, "_")}`;
  };

  // Helper to handle team favorite toggle
  const handleTeamFavoriteToggle = async (teamName, teamColor) => {
    if (!teamName) return;

    const teamId = getF1TeamId(teamName);
    try {
      await toggleFavorite({
        teamId: teamId,
        teamName: teamName,
        sport: "f1",
        leagueCode: "f1",
        teamColor: teamColor,
      });
    } catch (error) {
      console.error("Error toggling F1 team favorite:", error);
    }
  };

  const onRefresh = React.useCallback(() => {
    // Clear cached events so we force a fresh fetch
    setRefreshing(true);
    setAllEvents([]);
    setAllEventsLoaded(false);
    fetchResults();
  }, [selectedType]);

  const renderResultItem = (event) => (
    <TouchableOpacity
      key={event.id}
      style={[
        styles.resultItem,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
      onPress={() => {
        // For current items, prefer session key (live -> next -> last). Otherwise use meeting key.
        const navParams = {
          meetingKey: event.meeting_key || event.meetingKey || event.id,
          raceName: event.name,
          raceDate: event.date,
          sport: "f1",
        };

        navigation.navigate("F1RaceDetails", navParams);
      }}
    >
      {/* Left gradient strip using winnerTeamColor (skipped when cancelled or when showing meetingDetails) */}
      {!(event.is_cancelled || event.isCancelled) &&
        !(selectedType === "CURRENT" && event.meetingDetails) &&
        (() => {
          const isUpcomingCard =
            selectedType === "UPCOMING" || event.isUpcoming;
          if (isUpcomingCard) {
            // Right-side gradient (use country color when available)
            const _countryCandidate = resolveCountryNameFromEvent(event);
            const _countryColor = getCountryColor(_countryCandidate);
            const _gradColor = _countryColor || theme.surfaceSecondary;
            return (
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  right: 0,
                  borderTopRightRadius: 12,
                  borderBottomRightRadius: 12,
                  overflow: "hidden",
                  zIndex: 0,
                }}
              >
                <Svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  pointerEvents="none"
                >
                  <Defs>
                    <SvgLinearGradient
                      id={`rightGrad_${event.id}`}
                      x1="100%"
                      y1="0%"
                      x2="0%"
                      y2="0%"
                    >
                      <Stop
                        offset="0%"
                        stopColor={_gradColor}
                        stopOpacity="0.3"
                      />
                      <Stop
                        offset="55%"
                        stopColor={_gradColor}
                        stopOpacity="0"
                      />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect
                    x={0}
                    y={0}
                    width="100%"
                    height="100%"
                    fill={`url(#rightGrad_${event.id})`}
                  />
                </Svg>
              </View>
            );
          }

          // Left-side gradient (default)
          return (
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                right: 0,
                borderTopLeftRadius: 12,
                borderBottomLeftRadius: 12,
                overflow: "hidden",
                zIndex: 0,
              }}
            >
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                pointerEvents="none"
              >
                <Defs>
                  <SvgLinearGradient
                    id={`leftGrad_${event.id}`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <Stop
                      offset="0%"
                      stopColor={
                        event.winnerTeamColor || theme.surfaceSecondary
                      }
                      stopOpacity="0.3"
                    />
                    <Stop
                      offset="55%"
                      stopColor={
                        event.winnerTeamColor || theme.surfaceSecondary
                      }
                      stopOpacity="0"
                    />
                  </SvgLinearGradient>
                </Defs>
                <Rect
                  x={0}
                  y={0}
                  width="100%"
                  height="100%"
                  fill={`url(#leftGrad_${event.id})`}
                />
              </Svg>
            </View>
          );
        })()}

      {event.is_cancelled || event.isCancelled ? (
        <>
          <View
            style={[
              styles.cancelledOverlay,
              { backgroundColor: "rgba(0, 0, 0, 0.3)" },
            ]}
            pointerEvents="none"
          />
          <View style={styles.cancelledBadge} pointerEvents="none">
            <Icon name="ban" size={40} color={theme.error} />
            <Text
              allowFontScaling={false}
              style={[styles.cancelledText, { color: theme.error }]}
            >
              CANCELLED
            </Text>
          </View>
        </>
      ) : null}

      <View style={{ position: "relative", zIndex: 1 }}>
        <View style={styles.resultHeader}>
          <Text
            allowFontScaling={false}
            style={[styles.raceName, { color: theme.text }]}
            numberOfLines={1}
          >
            {event.name}
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.raceDate, { color: theme.textSecondary }]}
          >
            {formatDate(event.date)}
          </Text>
        </View>
        {/** For Current tab, show flag/country/next time above meeting details */}
        {selectedType === "CURRENT" && (
          <View style={styles.resultInfo}>
            <View style={styles.flagAndCircuit}>
              {event.countryFlag ? (
                <Image
                  source={{ uri: convertToHttps(event.countryFlag) }}
                  style={[styles.countryFlag, { marginTop: 0 }]}
                  onError={() => {}}
                />
              ) : null}
              <View style={styles.circuitInfo}>
                <Text
                  allowFontScaling={false}
                  style={[styles.circuitName, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {event.venueName ||
                    event.venue ||
                    event.location ||
                    "Circuit Information"}
                </Text>
                {selectedType === "CURRENT" && event.nextCompetitionType ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.competitionType,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {event.nextCompetitionType}
                    {event.nextCompetitionAbbr === "FP1"
                      ? " 1"
                      : event.nextCompetitionAbbr === "FP2"
                        ? " 2"
                        : event.nextCompetitionAbbr === "FP3"
                          ? " 3"
                          : ""}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.rightColumn}>
              <Text
                allowFontScaling={false}
                style={[styles.raceTime, { color: theme.textSecondary }]}
              >
                {formatTime(event.date)}
              </Text>
            </View>
          </View>
        )}

        {selectedType === "CURRENT" &&
        (event.meetingDetails || Array.isArray(event.competitions)) ? (
          <View style={styles.meetingDetails}>
            <Text
              allowFontScaling={false}
              style={[styles.meetingName, { color: theme.text }]}
              numberOfLines={2}
            >
              {event.meetingDetails?.meeting?.meeting_official_name ||
                event.meetingDetails?.meeting?.meeting_name ||
                event.venueName ||
                event.venue ||
                event.location ||
                event.name}
            </Text>
            {(() => {
              // Prefer explicit meetingDetails.sessions; otherwise derive from event.competitions
              const sessions =
                event.meetingDetails &&
                Array.isArray(event.meetingDetails.sessions)
                  ? event.meetingDetails.sessions
                  : Array.isArray(event.competitions)
                    ? event.competitions.map((comp) => ({
                        session_key:
                          comp.id ||
                          comp.competition_id ||
                          comp.session_key ||
                          comp.$ref ||
                          comp.type?.abbreviation ||
                          comp.name,
                        session_name:
                          comp.type?.displayName ||
                          comp.type?.abbreviation ||
                          comp.name ||
                          comp.type?.text ||
                          "Session",
                        date_start: comp.date || comp.start || null,
                        date_end: comp.endDate || comp.dateEnd || null,
                        winner:
                          (comp.competitors || []).find(
                            (c) => c.winner === true,
                          )?.athlete?.displayName || null,
                        winner_team:
                          (comp.competitors || []).find(
                            (c) => c.winner === true,
                          )?.vehicle?.manufacturer || "",
                      }))
                    : [];

              if (!sessions || sessions.length === 0) return null;

              return (
                <View style={{ marginTop: 6 }}>
                  {sessions.map((s) => (
                    <View
                      key={s.session_key || s.session_name}
                      style={styles.meetingSessionRow}
                    >
                      <View style={styles.meetingSessionLeft}>
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.meetingSessionName,
                            { color: theme.text },
                          ]}
                        >
                          {s.session_name}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.meetingSessionTime,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {(() => {
                            const start =
                              s.date_start || s.dateStart || s.start || null;
                            const end =
                              s.date_end || s.dateEnd || s.end || null;
                            if (start) {
                              const datePart = formatDateShort(start);
                              return `${datePart} · ${formatTimeShort(start)}${end ? ` - ${formatTimeShort(end)}` : ""}`;
                            }
                            return `${formatTimeShort(start)} - ${formatTimeShort(end)}`;
                          })()}
                        </Text>
                      </View>
                      <View style={styles.meetingSessionRight}>
                        {s.winner || s.winnerName ? (
                          <>
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.meetingWinner,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {s.winner || s.winnerName || ""}
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Text
                                allowFontScaling={false}
                                style={[
                                  styles.meetingWinnerTeam,
                                  { color: theme.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {s.winner_team || s.winnerTeam || ""}
                              </Text>
                              <Image
                                source={require("../../../assets/f1-car-svgrepo-com.png")}
                                style={{
                                  width: 28,
                                  height: 12,
                                  tintColor: s.winner_team
                                    ? `#${getTeamColor(s.winner_team)}`
                                    : theme.textSecondary,
                                  marginTop: 2,
                                }}
                              />
                            </View>
                          </>
                        ) : (
                          (() => {
                            const now = Date.now();
                            const startMs = s.date_start
                              ? Date.parse(s.date_start)
                              : s.dateStart
                                ? Date.parse(s.dateStart)
                                : s.start
                                  ? Date.parse(s.start)
                                  : null;
                            const endMs = s.date_end
                              ? Date.parse(s.date_end)
                              : s.dateEnd
                                ? Date.parse(s.dateEnd)
                                : s.end
                                  ? Date.parse(s.end)
                                  : null;
                            let statusLabel = "Scheduled";
                            let statusColor = theme.warning;
                            if (s.is_cancelled || s.isCancelled) {
                              statusLabel = "Cancelled";
                              statusColor = theme.error;
                            } else if (startMs && endMs) {
                              if (now < startMs) {
                                statusLabel = "Scheduled";
                                statusColor = theme.warning;
                              } else if (now >= startMs && now <= endMs) {
                                statusLabel = "In Progress";
                                statusColor = theme.error;
                              } else if (now > endMs) {
                                statusLabel = "Finished";
                                statusColor = theme.success;
                              }
                            }
                            return (
                              <Text
                                allowFontScaling={false}
                                style={[
                                  styles.meetingSessionStatus,
                                  { color: statusColor },
                                ]}
                              >
                                {statusLabel}
                              </Text>
                            );
                          })()
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}
          </View>
        ) : null}

        {selectedType !== "CURRENT" && (
          <View style={styles.resultInfo}>
            <View style={styles.flagAndCircuit}>
              {event.countryFlag ? (
                <Image
                  source={{ uri: convertToHttps(event.countryFlag) }}
                  style={styles.countryFlag}
                  onError={() => {
                    /* fail silently */
                  }}
                />
              ) : null}
              <View style={styles.circuitInfo}>
                <Text
                  allowFontScaling={false}
                  style={[styles.circuitName, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {event.venueName ||
                    event.venue ||
                    event.location ||
                    "Circuit Information"}
                </Text>
                {selectedType === "CURRENT" && event.nextCompetitionType ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.competitionType,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {event.nextCompetitionType}
                    {event.nextCompetitionAbbr === "FP1"
                      ? " 1"
                      : event.nextCompetitionAbbr === "FP2"
                        ? " 2"
                        : event.nextCompetitionAbbr === "FP3"
                          ? " 3"
                          : ""}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.rightColumn}>
              <Text
                allowFontScaling={false}
                style={[styles.raceTime, { color: theme.textSecondary }]}
              >
                {formatTime(event.date)}
              </Text>
              {/* Status (keep top-right) */}
              {selectedType === "LAST" && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.statusText,
                    {
                      color:
                        event.is_cancelled || event.isCancelled
                          ? theme.error
                          : theme.success,
                      marginTop: 6,
                    },
                  ]}
                >
                  {event.is_cancelled || event.isCancelled
                    ? "CANCELLED"
                    : "Completed"}
                </Text>
              )}
              {selectedType === "CURRENT" && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.statusText,
                    { color: theme.error, marginTop: 6 },
                  ]}
                >
                  In Progress
                </Text>
              )}
              {selectedType === "UPCOMING" && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.statusText,
                    { color: theme.warning, marginTop: 6 },
                  ]}
                >
                  Scheduled
                </Text>
              )}
            </View>
          </View>
        )}

        {selectedType === "LAST" && event.winnerName ? (
          <View style={styles.winnerRow}>
            <View style={styles.winnerLeft}>
              <Text
                allowFontScaling={false}
                style={[styles.winnerLabel, { color: theme.textSecondary }]}
              >
                Winner:
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.winnerName, { color: theme.text }]}
              >
                {event.winnerName}
              </Text>
            </View>
            <View style={styles.winnerRight}>
              {event.winnerTeam ? (
                <View style={styles.winnerTeamContainer}>
                  {isFavorite(getF1TeamId(event.winnerTeam)) && (
                    <TouchableOpacity
                      onPress={() =>
                        handleTeamFavoriteToggle(
                          event.winnerTeam,
                          event.winnerTeamColor,
                        )
                      }
                      activeOpacity={0.7}
                      style={styles.winnerTeamFavoriteButton}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.winnerTeamFavoriteIcon,
                          { color: colors.primary },
                        ]}
                      >
                        ★
                      </Text>
                    </TouchableOpacity>
                  )}
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.winnerTeamRight,
                      {
                        color: isFavorite(getF1TeamId(event.winnerTeam))
                          ? colors.primary
                          : theme.textSecondary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {event.winnerTeam}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* For current/in-progress races show winners for each competition (FP1, FP2, Qualifying, Race, etc.) */}
        {selectedType === "CURRENT" &&
        event.competitionWinners &&
        Object.keys(event.competitionWinners).length > 0 ? (
          <View style={styles.winnersContainer}>
            <Text
              allowFontScaling={false}
              style={[
                styles.winnerLabel,
                { color: theme.textSecondary, marginBottom: 6 },
              ]}
            >
              Winners:
            </Text>

            {(() => {
              // Sort competitions in logical race weekend order (same as web results.js)
              const competitionOrder = [
                "Free Practice 1",
                "FP1",
                "Free Practice 2",
                "FP2",
                "Free Practice 3",
                "FP3",
                "Sprint Shootout",
                "Sprint Race",
                "Qualifying",
                "Qual",
                "Race",
              ];

              const sortedEntries = Object.entries(
                event.competitionWinners,
              ).sort(([a], [b]) => {
                const indexA = competitionOrder.indexOf(a);
                const indexB = competitionOrder.indexOf(b);
                // If both found in order, use order. If not found, put at end.
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.localeCompare(b);
              });

              return sortedEntries.map(([compName, winnerObj]) => {
                // winnerObj expected as { winnerName, winnerTeam } but handle strings for safety
                const winnerName =
                  winnerObj?.winnerName ||
                  (typeof winnerObj === "string" ? winnerObj : "TBD");
                const winnerTeam = winnerObj?.winnerTeam || "";

                return (
                  <View key={compName} style={styles.winnerRowInProgress}>
                    <View style={styles.winnerLeft}>
                      <Text
                        allowFontScaling={false}
                        style={[styles.winnerNameSmall, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {winnerName}
                      </Text>
                      {winnerTeam ? (
                        <View style={styles.winnerTeamSmallContainer}>
                          {isFavorite(getF1TeamId(winnerTeam)) && (
                            <TouchableOpacity
                              onPress={() =>
                                handleTeamFavoriteToggle(
                                  winnerTeam,
                                  event.winnerTeamColor,
                                )
                              }
                              activeOpacity={0.7}
                              style={styles.winnerTeamSmallFavoriteButton}
                            >
                              <Text
                                allowFontScaling={false}
                                style={[
                                  styles.winnerTeamSmallFavoriteIcon,
                                  { color: colors.primary },
                                ]}
                              >
                                ★
                              </Text>
                            </TouchableOpacity>
                          )}
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.winnerTeamSmall,
                              {
                                color: isFavorite(getF1TeamId(winnerTeam))
                                  ? colors.primary
                                  : theme.textSecondary,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {winnerTeam}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.winnerRight}>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.compName,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {compName}
                      </Text>
                    </View>
                  </View>
                );
              });
            })()}
          </View>
        ) : null}
      </View>

      {/* Viewer Count Section - Bottom placement as requested */}
      <View style={[styles.viewerSection, { borderTopColor: theme.border }]}>
        {(() => {
          const nowMs = Date.now();
          const startMs = event.eventDate
            ? new Date(event.eventDate).getTime()
            : event.startRaw
              ? new Date(event.startRaw).getTime()
              : null;
          const endMs = event.endDate
            ? new Date(event.endDate).getTime()
            : event.endRaw
              ? new Date(event.endRaw).getTime()
              : null;

          let liveStatus = event.status || null;
          if (startMs && nowMs < startMs) liveStatus = "scheduled";
          else if (startMs && endMs && nowMs >= startMs && nowMs <= endMs)
            liveStatus = "live";
          else if (endMs && nowMs > endMs + 24 * 60 * 60 * 1000)
            liveStatus = "finished";

          return (
            <LiveViewerBadge
              gameId={event.id}
              status={liveStatus}
              style={styles.viewerBadge}
            />
          );
        })()}
      </View>
    </TouchableOpacity>
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      backgroundColor: colors.primary,
      paddingTop: 50,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: "#fff",
      textAlign: "center",
    },
    typeContainer: {
      flexDirection: "row",
      backgroundColor: theme.surface,
      marginHorizontal: 20,
      marginVertical: 15,
      borderRadius: 8,
      padding: 4,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center",
      borderRadius: 6,
    },
    activeTypeButton: {
      backgroundColor: colors.primary,
    },
    typeButtonText: {
      fontSize: 14,
      fontWeight: "600",
    },
    activeTypeButtonText: {
      color: "#fff",
    },
    inactiveTypeButtonText: {
      color: theme.textSecondary,
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 48,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      marginTop: 10,
      fontSize: 16,
      color: theme.textSecondary,
    },
    resultItem: {
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 0,
      overflow: "hidden",
    },
    cancelledBadge: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
      zIndex: 6,
      pointerEvents: "none",
    },
    cancelledOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      borderRadius: 12,
      zIndex: 5,
    },
    cancelledText: {
      fontSize: 18,
      fontWeight: "700",
      marginTop: 4,
      textTransform: "uppercase",
    },
    resultHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    raceName: {
      fontSize: 16,
      fontWeight: "bold",
      flex: 1,
      marginRight: 10,
    },
    raceDate: {
      fontSize: 12,
      fontWeight: "500",
    },
    resultInfo: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    circuitName: {
      fontSize: 14,
      flex: 1,
      marginRight: 10,
    },
    circuitInfo: {
      flex: 1,
      marginRight: 10,
    },
    competitionType: {
      fontSize: 12,
      fontStyle: "italic",
      marginTop: 2,
    },
    raceTime: {
      fontSize: 12,
    },
    resultStatus: {
      alignItems: "flex-end",
    },
    statusText: {
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    winnerBlock: {
      marginTop: 8,
      alignItems: "flex-end",
    },
    winnerLabel: {
      fontSize: 12,
      fontWeight: "600",
    },
    winnerName: {
      fontSize: 14,
      fontWeight: "700",
    },
    winnerTeam: {
      fontSize: 12,
    },
    winnerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 8,
      marginBottom: 4,
    },
    winnerLeft: {
      flex: 1,
      alignItems: "flex-start",
    },
    winnerRight: {
      flex: 1,
      alignItems: "flex-end",
    },
    winnerTeamRight: {
      fontSize: 12,
    },
    winnerTeamContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    winnerTeamFavoriteButton: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginRight: 4,
    },
    winnerTeamFavoriteIcon: {
      fontSize: 12,
      fontWeight: "bold",
    },
    winnerTeamSmallContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 2,
    },
    winnerTeamSmallFavoriteButton: {
      paddingHorizontal: 2,
      paddingVertical: 1,
      marginRight: 3,
    },
    winnerTeamSmallFavoriteIcon: {
      fontSize: 10,
      fontWeight: "bold",
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
      textAlign: "center",
    },
    flagAndCircuit: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: 10,
    },
    countryFlag: {
      width: 25,
      height: 14,
      resizeMode: "contain",
      marginRight: 8,
      borderRadius: 2,
      backgroundColor: "#fff",
      marginTop: -17.5,
    },
    rightColumn: {
      alignItems: "flex-end",
      justifyContent: "center",
      width: 110,
    },
    winnersContainer: {
      marginTop: 8,
      borderTopWidth: 0,
      paddingTop: 4,
    },
    winnerRowInProgress: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
      borderRadius: 6,
    },
    winnerNameSmall: {
      fontSize: 13,
      fontWeight: "700",
    },
    winnerTeamSmall: {
      fontSize: 11,
      marginTop: 2,
    },
    meetingSessionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 6,
    },
    meetingSessionLeft: {
      flex: 1,
      paddingRight: 8,
    },
    meetingSessionRight: {
      width: 120,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    meetingSessionStatus: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    meetingSessionName: {
      fontSize: 13,
      fontWeight: "700",
    },
    meetingSessionTime: {
      fontSize: 10,
    },
    meetingWinner: {
      fontSize: 13,
      fontWeight: "700",
    },
    meetingWinnerTeam: {
      fontSize: 12,
    },
    meetingDetails: {
      marginTop: 8,
      marginBottom: 6,
    },
    meetingName: {
      fontSize: 14,
      fontWeight: "700",
    },
    meetingSession: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    compName: {
      fontSize: 12,
      fontWeight: "600",
    },
    viewerSection: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderTopWidth: 1,
      alignItems: "center",
      marginTop: 8,
      marginBottom: -16,
    },
    viewerBadge: {
      alignSelf: "center",
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.typeContainer}>
          {resultTypes.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.typeButton,
                selectedType === type.key && styles.activeTypeButton,
              ]}
              onPress={() => setSelectedType(type.key)}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.typeButtonText,
                  selectedType === type.key
                    ? styles.activeTypeButtonText
                    : styles.inactiveTypeButtonText,
                ]}
              >
                {type.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={styles.loadingText}>
            Loading F1 Results...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.typeContainer}>
        {resultTypes.map((type) => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.typeButton,
              selectedType === type.key && styles.activeTypeButton,
            ]}
            onPress={() => setSelectedType(type.key)}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.typeButtonText,
                selectedType === type.key
                  ? styles.activeTypeButtonText
                  : styles.inactiveTypeButtonText,
              ]}
            >
              {type.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) =>
          item.id?.toString() || item.uid || Math.random().toString()
        }
        renderItem={({ item }) => renderResultItem(item)}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={onRefresh}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={11}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text allowFontScaling={false} style={styles.emptyText}>
              No {selectedType.toLowerCase()} races found
            </Text>
          </View>
        )}
      />
    </View>
  );
};

export default ResultsScreen;
