const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron");
require("dotenv").config();

// Supabase admin client and inlined services
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { Expo } = require("expo-server-sdk");

// Create Supabase admin client from env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(
  SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: { persistSession: false },
  }
);

const expo = new Expo();

// Small helper: send push notification via Supabase-stored tokens
async function sendPushNotification(userId, title, bodyText, data = {}) {
  try {
    // Attempt to resolve tokens from multiple schema shapes: public.users (legacy) and public.profiles + push_tokens (uuid)
    let pushToken = null;
    let resolvedProfileId = null;
    let resolvedUserRow = null;

    // Try to get legacy users row (may contain push_token and username)
    try {
      const { data: urow, error: uerr } = await supabaseAdmin
        .from("users")
        .select("id, username, push_token")
        .eq("id", userId)
        .maybeSingle();
      if (uerr) throw uerr;
      resolvedUserRow = urow || null;
      if (resolvedUserRow && resolvedUserRow.push_token)
        pushToken = resolvedUserRow.push_token;
    } catch (e) {
      console.warn(
        "sendPushNotification: users lookup failed,",
        e?.message || e
      );
    }

    // Try to resolve a profile UUID for this user (by username if available, or directly if userId already looks like a UUID)
    try {
      const looksLikeUuid = typeof userId === "string" && userId.includes("-");
      if (looksLikeUuid) {
        const { data: prof, error: perr } = await supabaseAdmin
          .from("profiles")
          .select("id, username")
          .eq("id", userId)
          .maybeSingle();
        if (!perr && prof) resolvedProfileId = prof.id;
      } else if (resolvedUserRow && resolvedUserRow.username) {
        const { data: prof, error: perr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("username", resolvedUserRow.username)
          .maybeSingle();
        if (!perr && prof) resolvedProfileId = prof.id;
      }
    } catch (e) {
      console.warn(
        "sendPushNotification: profiles lookup failed,",
        e?.message || e
      );
    }

    // If no push token yet, check push_tokens using resolvedProfileId first, then fallback to userId
    if (!pushToken) {
      if (resolvedProfileId) {
        const { data: tokensByProfile, error: tpfErr } = await supabaseAdmin
          .from("push_tokens")
          .select("expo_push_token")
          .eq("user_id", resolvedProfileId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!tpfErr && tokensByProfile && tokensByProfile.length > 0)
          pushToken = tokensByProfile[0].expo_push_token;
      }
    }

    if (!pushToken) {
      const { data: tokens, error: tokenErr } = await supabaseAdmin
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!tokenErr && tokens && tokens.length > 0)
        pushToken = tokens[0].expo_push_token;
    }

    if (!pushToken) {
      console.log(
        "No push token for user",
        userId,
        "resolvedProfileId",
        resolvedProfileId
      );
      return;
    }

    if (!Expo.isExpoPushToken(pushToken)) {
      console.error("Invalid Expo push token:", pushToken);
      return;
    }

    const message = {
      to: pushToken,
      sound: "default",
      title,
      body: bodyText,
      data,
      priority: "high",
    };
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error("expo send error", err);
      }
    }

    // Try to persist a push_notifications record. If the user_id type conflicts, fall back to storing null and include uuid in data.
    try {
      await supabaseAdmin
        .from("push_notifications")
        .insert({ user_id: userId, title, body: bodyText, data });
    } catch (insErr) {
      console.warn(
        "push_notifications insert failed with user_id, retrying without user_id",
        insErr?.message || insErr
      );
      await supabaseAdmin.from("push_notifications").insert({
        user_id: null,
        title,
        body: bodyText,
        data: {
          ...data,
          user_uuid: resolvedProfileId || null,
          legacy_user_id:
            typeof userId === "number" || /^[0-9]+$/.test(String(userId))
              ? userId
              : null,
        },
      });
    }
  } catch (err) {
    console.error("sendPushNotification error", err?.message || err);
  }
}

async function broadcastToAll(title, bodyText, data = {}) {
  try {
    const { data: tokens } = await supabaseAdmin
      .from("push_tokens")
      .select("expo_push_token");
    const messages = (tokens || []).map((t) => ({
      to: t.expo_push_token,
      sound: "default",
      title,
      body: bodyText,
      data,
    }));
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (e) {
        console.error("broadcast chunk error", e);
      }
    }
    await supabaseAdmin
      .from("push_notifications")
      .insert({ title, body: bodyText, data });
  } catch (e) {
    console.error("broadcastToAll error", e);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Data cache
let scoreboardData = null;
let summaryDataCache = {}; // { eventId: data }
let rosterGamelogCache = {}; // { teamId: { roster, gamelogs } }

// Configuration
const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_WEB_API_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";

// Scheduling state
let currentScoreboardInterval = null;
let currentSummaryIntervals = {}; // { eventId: intervalId }
let isAnyGameLive = false;
let nextGameStartTime = null;
let currentPollingMode = "slow"; // 'slow', 'moderate', 'fast'
let rostersScoreboardInterval = null; // Dedicated 30-minute refresh for /api/rosters

// Helper functions
function getTimeDifferenceInMinutes(date1, date2) {
  return Math.abs(date2 - date1) / (1000 * 60);
}

function getPSTTime() {
  const now = new Date();
  // Convert to PST (UTC-8)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const pstTime = new Date(utc + 3600000 * -8);
  return pstTime;
}

function getScoreboardDate() {
  const pstTime = getPSTTime();
  const hour = pstTime.getHours();

  // If before 2am PST, use previous day
  if (hour < 2) {
    pstTime.setDate(pstTime.getDate() - 1);
  }

  // Format as YYYYMMDD
  const year = pstTime.getFullYear();
  const month = String(pstTime.getMonth() + 1).padStart(2, "0");
  const day = String(pstTime.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function isGameLive(status) {
  return status?.type?.state === "in";
}

function isGameScheduled(status) {
  return status?.type?.state === "pre";
}

function findNextGameStart(events) {
  const now = new Date();
  const upcomingGames = events
    .filter((event) => {
      const gameDate = new Date(event.date);
      const status = event.competitions?.[0]?.status;
      return gameDate > now && isGameScheduled(status);
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return upcomingGames.length > 0 ? new Date(upcomingGames[0].date) : null;
}

// Helper function to capitalize slug
function capitalizeSlug(slug) {
  if (!slug) return slug;
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Helper function to transform statistics array to object
function transformStatistics(statsArray) {
  if (!statsArray || !Array.isArray(statsArray)) return {};

  const statsObj = {};
  statsArray.forEach((stat) => {
    if (stat.label && stat.displayValue) {
      statsObj[stat.label] = stat.displayValue;
    }
  });
  return statsObj;
}

// Helper function to transform linescores array to object
function transformLinescores(linescoresArray) {
  if (!linescoresArray || !Array.isArray(linescoresArray)) return {};

  const linescoresObj = {};
  linescoresArray.forEach((score, index) => {
    // Use period if available, otherwise generate from index
    const period = score.period || index + 1;
    const value = score.displayValue !== undefined ? score.displayValue : score;
    linescoresObj[period] = value;
  });
  return linescoresObj;
}

// Data transformation functions
function transformScoreboardData(data) {
  if (!data || !data.events) return null;

  return {
    events: data.events.map((event) => ({
      id: event.id,
      date: event.date,
      name: event.name,
      shortName: event.shortName,
      season: {
        ...event.season,
        slug: capitalizeSlug(event.season?.slug),
      },
      competitions: event.competitions?.map((comp) => ({
        venue: comp.venue,
        competitors: comp.competitors?.map((competitor) => ({
          homeAway: competitor.homeAway,
          winner: competitor.winner,
          team: {
            id: competitor.team?.id,
            abbreviation: competitor.team?.abbreviation,
            displayName: competitor.team?.displayName,
            color: competitor.team?.color,
            alternateColor: competitor.team?.alternateColor,
            logo: competitor.team?.logo,
          },
          score: competitor.score,
          linescores: transformLinescores(competitor.linescores),
          statistics: transformStatistics(competitor.statistics),
          record: competitor.records?.[0]?.summary || null,
        })),
        notes: comp.notes,
      })),
      status: {
        displayClock: event.status?.displayClock,
        period: event.status?.period,
        type: {
          state: event.status?.type?.state,
          completed: event.status?.type?.completed,
          detail: event.status?.type?.detail,
          shortDetail: event.status?.type?.shortDetail,
        },
      },
    })),
  };
}

// Helper function to get team abbreviation from ID in scoreboard data
function getTeamAbbreviationById(teamId) {
  if (!scoreboardData?.events) return teamId;

  for (const event of scoreboardData.events) {
    const competitors = event.competitions?.[0]?.competitors || [];
    for (const competitor of competitors) {
      if (competitor.team?.id === teamId) {
        return competitor.team.abbreviation;
      }
    }
  }
  return teamId;
}

// Helper function to transform player stats with labels
function transformPlayerStats(statsArray, labels) {
  if (
    !statsArray ||
    !labels ||
    !Array.isArray(statsArray) ||
    !Array.isArray(labels)
  )
    return {};

  const statsObj = {};
  statsArray.forEach((stat, index) => {
    if (labels[index]) {
      statsObj[labels[index]] = stat;
    }
  });
  return statsObj;
}

// Helper function to calculate odds based on probability
function calculateOdds(probability) {
  if (probability >= 0.95) return -2000;
  if (probability >= 0.9) return -900;
  if (probability >= 0.85) return -567;
  if (probability >= 0.8) return -400;
  if (probability >= 0.75) return -300;
  if (probability >= 0.7) return -233;
  if (probability >= 0.65) return -186;
  if (probability >= 0.6) return -150;
  if (probability >= 0.55) return -122;
  if (probability >= 0.5) return -100;
  if (probability >= 0.45) return +122;
  if (probability >= 0.4) return +150;
  if (probability >= 0.35) return +186;
  if (probability >= 0.3) return +233;
  if (probability >= 0.25) return +300;
  if (probability >= 0.2) return +400;
  if (probability >= 0.15) return +567;
  return +900;
}

// Helper function to generate betting odds for a player
function generatePlayerOdds(gamelog, opponentTeamData) {
  if (!gamelog || !gamelog.seasonTypes) return null;

  const labels = gamelog.labels || [];
  const seasonTypes = gamelog.seasonTypes || [];
  const events = gamelog.events || {};

  // Collect all stats for each category with opponent info
  const allStats = {};
  const opponentStats = {}; // Track stats against specific opponents
  labels.forEach((label) => {
    allStats[label] = [];
    opponentStats[label] = {};
  });

  // Extract all event stats
  seasonTypes.forEach((seasonType) => {
    const categories = seasonType.categories || [];
    categories.forEach((category) => {
      const categoryEvents = category.events || [];
      categoryEvents.forEach((eventData) => {
        const stats = eventData.stats || [];
        const eventId = eventData.eventId;
        const opponent = events[eventId]?.opponent;

        labels.forEach((label, index) => {
          if (stats[index] !== undefined && stats[index] !== null) {
            // Parse numeric values (handle formats like "10-20")
            const value = parseFloat(String(stats[index]).split("-")[0]);
            if (!isNaN(value)) {
              allStats[label].push(value);

              // Track opponent-specific stats
              if (opponent?.id) {
                if (!opponentStats[label][opponent.id]) {
                  opponentStats[label][opponent.id] = [];
                }
                opponentStats[label][opponent.id].push(value);
              }
            }
          }
        });
      });
    });
  });

  // Calculate PRA (Points + Rebounds + Assists)
  const ptsValues = allStats["PTS"] || [];
  const rebValues = allStats["REB"] || [];
  const astValues = allStats["AST"] || [];

  const praValues = [];
  const minLength = Math.min(
    ptsValues.length,
    rebValues.length,
    astValues.length
  );
  for (let i = 0; i < minLength; i++) {
    praValues.push(ptsValues[i] + rebValues[i] + astValues[i]);
  }
  allStats["PRA"] = praValues;

  // Calculate stats for key betting categories
  const bettingCategories = ["PTS", "REB", "AST", "BLK", "TO", "PRA"];
  const odds = {
    milestones: {},
    overUnder: {},
  };

  bettingCategories.forEach((category) => {
    const values = allStats[category] || [];
    if (values.length === 0) return;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);

    // Over/Under lines - always end in .5
    const overLine = Math.floor(avg) + 0.5;

    // Calculate hit counts for different time periods
    const last5 = values.slice(-5);
    const last10 = values.slice(-10);
    const seasonTotal = values.length;

    const over5 = last5.filter((v) => v > overLine).length;
    const over10 = last10.filter((v) => v > overLine).length;
    const overSeason = values.filter((v) => v > overLine).length;

    const under5 = last5.filter((v) => v < overLine).length;
    const under10 = last10.filter((v) => v < overLine).length;
    const underSeason = values.filter((v) => v < overLine).length;

    // H2H stats against today's opponent
    let overH2h = null;
    let underH2h = null;
    let h2hTotal = 0;
    if (
      opponentTeamData?.id &&
      opponentStats[category]?.[opponentTeamData.id]
    ) {
      const h2hValues = opponentStats[category][opponentTeamData.id];
      h2hTotal = h2hValues.length;
      overH2h = h2hValues.filter((v) => v > overLine).length;
      underH2h = h2hValues.filter((v) => v < overLine).length;
    }

    // Calculate confidence with refined weighting
    // Tier 1: Last 5 games (40% weight - most recent form)
    const last5Total = Math.min(5, values.length);
    const last5OverRate = last5Total > 0 ? over5 / last5Total : 0;
    const last5UnderRate = last5Total > 0 ? under5 / last5Total : 0;

    // Tier 2: Last 10 games and H2H (30% weight - medium-term trends)
    const last10Total = Math.min(10, values.length);
    const last10OverRate = last10Total > 0 ? over10 / last10Total : 0;
    const last10UnderRate = last10Total > 0 ? under10 / last10Total : 0;

    // H2H contribution (only if games exist)
    const h2hOverRate = h2hTotal > 0 ? overH2h / h2hTotal : null;
    const h2hUnderRate = h2hTotal > 0 ? underH2h / h2hTotal : null;

    // Blend last 10 and H2H (if H2H exists, use 50/50 split, otherwise just last 10)
    const tier2OverRate =
      h2hOverRate !== null
        ? last10OverRate * 0.5 + h2hOverRate * 0.5
        : last10OverRate;
    const tier2UnderRate =
      h2hUnderRate !== null
        ? last10UnderRate * 0.5 + h2hUnderRate * 0.5
        : last10UnderRate;

    // Tier 3: Season stats (30% weight, scaled by games played reliability)
    const seasonOverRate = seasonTotal > 0 ? overSeason / seasonTotal : 0;
    const seasonUnderRate = seasonTotal > 0 ? underSeason / seasonTotal : 0;

    // Scale season weight by games played (more games = more reliable)
    // Full weight at 41+ games (half season), scales down for fewer games
    const seasonReliability = Math.min(1, seasonTotal / 41);
    const seasonWeight = 0.3 * seasonReliability;

    // Redistribute any unused season weight to recent games
    const unusedWeight = 0.3 - seasonWeight;
    const adjustedTier1Weight = 0.4 + unusedWeight * 0.6; // Give most unused weight to last 5
    const adjustedTier2Weight = 0.3 + unusedWeight * 0.4; // Give some to last 10/H2H

    // Calculate final confidence (to 1 decimal point)
    const overConfidence = parseFloat(
      (
        (last5OverRate * adjustedTier1Weight +
          tier2OverRate * adjustedTier2Weight +
          seasonOverRate * seasonWeight) *
        100
      ).toFixed(1)
    );
    const underConfidence = parseFloat(
      (
        (last5UnderRate * adjustedTier1Weight +
          tier2UnderRate * adjustedTier2Weight +
          seasonUnderRate * seasonWeight) *
        100
      ).toFixed(1)
    );

    odds.overUnder[category] = {
      line: overLine,
      over: calculateOdds(overConfidence / 100),
      under: calculateOdds(underConfidence / 100),
      o5: (last5OverRate * 100).toFixed(1),
      o10: (last10OverRate * 100).toFixed(1),
      oSeason: (seasonOverRate * 100).toFixed(1),
      oH2h: h2hOverRate !== null ? (h2hOverRate * 100).toFixed(1) : null,
      oConfidence: overConfidence,
      u5: (last5UnderRate * 100).toFixed(1),
      u10: (last10UnderRate * 100).toFixed(1),
      uSeason: (seasonUnderRate * 100).toFixed(1),
      uH2h: h2hUnderRate !== null ? (h2hUnderRate * 100).toFixed(1) : null,
      uConfidence: underConfidence,
    };

    // Milestones - increment by 5 for PTS and PRA, by 1 for others
    const milestones = [];
    const increment = category === "PTS" || category === "PRA" ? 5 : 1;
    const range = max - min;

    // Generate milestone tiers
    if (range > 0) {
      let threshold = Math.floor(min);
      if (threshold < 0) threshold = 0;

      // Round to nearest increment
      threshold = Math.ceil(threshold / increment) * increment;

      while (threshold <= max && milestones.length < 8) {
        if (threshold > 0) {
          const countAbove = values.filter((v) => v >= threshold).length;
          const probability = countAbove / values.length;
          const oddValue = calculateOdds(probability);
          milestones.push(`${threshold}+:${oddValue}`);
        }
        threshold += increment;
      }
    }

    odds.milestones[category] = milestones.join(", ");
  });

  return odds;
}

// Data transformation function for summary
function transformSummaryData(data) {
  if (!data) return null;

  const transformed = {};

  // Boxscore - teams
  if (data.boxscore?.teams) {
    transformed.boxscore = {
      teams: data.boxscore.teams.map((teamData) => ({
        team: {
          id: teamData.team?.id,
          abbreviation: teamData.team?.abbreviation,
          displayName: teamData.team?.displayName,
          shortDisplayName: teamData.team?.shortDisplayName,
          color: teamData.team?.color,
          alternateColor: teamData.team?.alternateColor,
          logo: teamData.team?.logo,
        },
        statistics: transformStatistics(teamData.statistics),
        homeAway: teamData.homeAway,
      })),
    };

    // Boxscore - players
    if (data.boxscore?.players) {
      transformed.boxscore.players = data.boxscore.players.map((playerTeam) => {
        const stats = playerTeam.statistics?.[0];
        return {
          team: {
            id: playerTeam.team?.id,
            abbreviation: playerTeam.team?.abbreviation,
            displayName: playerTeam.team?.displayName,
          },
          statistics: stats
            ? {
                athletes: stats.athletes?.map((athleteData) => ({
                  active: athleteData.active,
                  athlete: {
                    id: athleteData.athlete?.id,
                    displayName: athleteData.athlete?.displayName,
                    shortName: athleteData.athlete?.shortName,
                    headshot: athleteData.athlete?.headshot?.href,
                    jersey: athleteData.athlete?.jersey,
                    position: {
                      name: athleteData.athlete?.position?.name,
                      abbreviation: athleteData.athlete?.position?.abbreviation,
                    },
                  },
                  starter: athleteData.starter,
                  stats: transformPlayerStats(athleteData.stats, stats.labels),
                })),
              }
            : {},
        };
      });
    }
  }

  // GameInfo - venue only
  if (data.gameInfo?.venue) {
    transformed.gameInfo = {
      venue: data.gameInfo.venue.fullName,
    };
  }

  // LastFiveGames
  if (data.lastFiveGames) {
    transformed.lastFiveGames = data.lastFiveGames.map((teamGames) => ({
      team: {
        id: teamGames.team?.id,
        displayName: teamGames.team?.displayName,
        abbreviation: teamGames.team?.abbreviation,
        logo: teamGames.team?.logo,
      },
      events: teamGames.events?.map((event) => ({
        id: event.id,
        opponent: event.opponent?.displayName,
        opponentAbbreviation: event.opponent?.abbreviation,
        atVs: event.atVs,
        date: event.gameDate,
        score: event.score,
        result: event.gameResult,
      })),
    }));
  }

  // Injuries
  if (data.injuries) {
    transformed.injuries = data.injuries.map((teamInjury) => ({
      team: {
        id: teamInjury.team?.id,
        displayName: teamInjury.team?.displayName,
        abbreviation: teamInjury.team?.abbreviation,
      },
      injuries: teamInjury.injuries?.map((injury) => ({
        [injury.athlete?.id]: injury.athlete?.displayName,
      })),
    }));
  }

  // Pickcenter
  if (data.pickcenter && data.pickcenter.length > 0) {
    const pick = data.pickcenter[0];
    transformed.pickcenter = {
      details: pick.details,
      overUnder: pick.overUnder,
      spread: pick.spread,
      overOdds: pick.overOdds,
      underOdds: pick.underOdds,
      moneyline: {
        home: {
          line: pick.homeTeamOdds?.moneyLine,
          odds: pick.homeTeamOdds?.moneyLine,
        },
        away: {
          line: pick.awayTeamOdds?.moneyLine,
          odds: pick.awayTeamOdds?.moneyLine,
        },
      },
      pointSpread: {
        home: {
          line: pick.spread,
          odds: pick.homeTeamOdds?.spreadOdds,
        },
        away: {
          line: pick.spread ? -pick.spread : null,
          odds: pick.awayTeamOdds?.spreadOdds,
        },
      },
      total: {
        over: {
          home: {
            line: pick.overUnder,
            odds: pick.overOdds,
          },
          away: {
            line: pick.overUnder,
            odds: pick.overOdds,
          },
        },
        under: {
          home: {
            line: pick.overUnder,
            odds: pick.underOdds,
          },
          away: {
            line: pick.overUnder,
            odds: pick.underOdds,
          },
        },
      },
    };
  }

  // WinProbability
  if (data.winprobability && data.winprobability.length > 0) {
    transformed.winprobability = data.winprobability.map(
      (wp) => wp.homeWinPercentage
    );
  }

  // Predictor
  if (data.predictor?.homeTeam) {
    transformed.predictor = {
      homeTeam: {
        id: data.predictor.homeTeam.id,
        WIN: data.predictor.homeTeam.gameProjection,
        LOSS: data.predictor.homeTeam.teamChanceLoss,
      },
    };
  }

  // Plays - only last entry
  if (data.plays && data.plays.length > 0) {
    const lastPlay = data.plays[data.plays.length - 1];
    const participants = {};

    if (lastPlay.participants) {
      lastPlay.participants.forEach((p, idx) => {
        participants[`athlete${idx + 1}`] = {
          [p.athlete?.id]: p.athlete?.displayName,
        };
      });
    }

    transformed.plays = {
      id: lastPlay.id,
      type: lastPlay.type?.text,
      text: lastPlay.text,
      period: {
        number: lastPlay.period?.number,
        displayValue: lastPlay.period?.displayValue,
      },
      clock: lastPlay.clock?.displayValue,
      scoringPlay: lastPlay.scoringPlay,
      scoreValue: lastPlay.scoreValue,
      team: getTeamAbbreviationById(lastPlay.team?.id),
      participants,
      shootingPlay: lastPlay.shootingPlay,
      coordinate: {
        x:
          lastPlay.coordinate?.x > 100 || lastPlay.coordinate?.x < -100
            ? 0
            : lastPlay.coordinate?.x,
        y:
          lastPlay.coordinate?.y > 100 || lastPlay.coordinate?.y < -100
            ? 0
            : lastPlay.coordinate?.y,
      },
      pointsAttempted: lastPlay.pointsAttempted,
      shortDescription: lastPlay.shortDescription,
    };
  }

  // Header
  if (data.header) {
    transformed.header = {
      id: data.header.id,
      season: data.header.season,
      gameNote: data.header.gameNote,
      competitions: data.header.competitions?.map((comp) => ({
        date: comp.date,
        competitors: comp.competitors?.map((competitor) => ({
          homeAway: competitor.homeAway,
          winner: competitor.winner,
          team: {
            id: competitor.team?.id,
            abbreviation: competitor.team?.abbreviation,
            displayName: competitor.team?.displayName,
            color: competitor.team?.color,
            alternateColor: competitor.team?.alternateColor,
            logo: competitor.team?.logo,
          },
          score: competitor.score,
          linescores: transformLinescores(competitor.linescores),
          record: competitor.record?.[0]?.summary || null,
        })),
        status: {
          displayClock: comp.status?.displayClock,
          period: comp.status?.period,
          type: {
            state: comp.status?.type?.state,
            completed: comp.status?.type?.completed,
            detail: comp.status?.type?.detail,
            shortDetail: comp.status?.type?.shortDetail,
          },
        },
      })),
    };
  }

  return transformed;
}

// Transform rosters data
function transformRostersData(rostersData) {
  if (!rostersData || !rostersData.teams) {
    return { teams: [] };
  }

  const teams = rostersData.teams.map((teamData) => {
    const { team, roster, gamelogs, opponentId } = teamData;

    // Filter athletes - exclude those with injuries
    const healthyAthletes = (roster?.athletes || []).filter((athlete) => {
      return !athlete.injuries || athlete.injuries.length === 0;
    });

    const athletes = healthyAthletes.map((athlete) => {
      const gamelog = gamelogs[athlete.id];

      // Base athlete info
      const athleteData = {
        id: athlete.id,
        name: `${athlete.firstName} ${athlete.lastName}`,
        shortName: athlete.shortName,
        headshot: athlete.headshot?.href || null,
        jersey: athlete.jersey,
        position: {
          displayName: athlete.position?.displayName || null,
          abbreviation: athlete.position?.abbreviation || null,
        },
      };

      // Add gamelog data if available
      if (gamelog) {
        const labels = gamelog.labels || [];
        const events = gamelog.events || {};
        const seasonTypes = gamelog.seasonTypes || [];

        // Get first 5 events and their stats
        const eventIds = Object.keys(events).slice(0, 5);

        // Build a map of eventId to stats
        const eventStatsMap = {};
        eventIds.forEach((eventId) => {
          seasonTypes.forEach((seasonType) => {
            const categories = seasonType.categories || [];
            categories.forEach((category) => {
              const categoryEvents = category.events || [];
              categoryEvents.forEach((eventData) => {
                if (eventData.eventId === eventId) {
                  const stats = eventData.stats || [];
                  const formattedStats = {};
                  labels.forEach((label, index) => {
                    if (stats[index] !== undefined) {
                      formattedStats[label] = stats[index];
                    }
                  });
                  eventStatsMap[eventId] = formattedStats;
                }
              });
            });
          });
        });

        // Create recentGames with embedded stats
        const recentGames = eventIds.map((eventId) => {
          const event = events[eventId];
          return {
            atVs: event.atVs,
            gameDate: event.gameDate,
            score: event.score,
            opponent: {
              id: event.opponent?.id || null,
              displayName: event.opponent?.displayName || null,
              logo: event.opponent?.logo || null,
            },
            stats: eventStatsMap[eventId] || null,
          };
        });

        // Get averages from summary
        let averages = null;
        seasonTypes.forEach((seasonType) => {
          if (seasonType.summary && seasonType.summary.stats) {
            const summaryStats = seasonType.summary.stats;
            summaryStats.forEach((summaryItem) => {
              if (summaryItem.displayName === "Averages") {
                const stats = summaryItem.stats || [];
                const formattedAverages = {};
                labels.forEach((label, index) => {
                  if (stats[index] !== undefined) {
                    formattedAverages[label] = stats[index];
                  }
                });

                // Calculate PRA average
                const ptsAvg = parseFloat(formattedAverages["PTS"]) || 0;
                const rebAvg = parseFloat(formattedAverages["REB"]) || 0;
                const astAvg = parseFloat(formattedAverages["AST"]) || 0;
                formattedAverages["PRA"] = (ptsAvg + rebAvg + astAvg).toFixed(
                  1
                );

                averages = formattedAverages;
              }
            });
          }
        });

        athleteData.recentGames = recentGames;
        athleteData.averages = averages;
        // Pass opponent ID to odds generation
        athleteData.odds = generatePlayerOdds(
          gamelog,
          opponentId ? { id: opponentId } : null
        );
      }

      return athleteData;
    });

    return {
      id: team.id,
      abbreviation: team.abbreviation,
      displayName: team.displayName,
      color: team.color,
      logo: team.logo,
      athletes,
    };
  });

  return { teams };
}

// Fetch functions
async function fetchScoreboard() {
  try {
    const dateParam = getScoreboardDate();
    console.log(`[Scoreboard] Fetching data for date ${dateParam}...`);
    const response = await axios.get(
      `${ESPN_BASE_URL}/scoreboard?dates=${dateParam}`
    );
    scoreboardData = response.data;

    // Check game statuses and update scheduling
    updateSchedulingLogic();

    console.log("[Scoreboard] Data fetched successfully");
    return scoreboardData;
  } catch (error) {
    console.error("[Scoreboard] Error fetching data:", error.message);
    return null;
  }
}

async function fetchSummary(eventId) {
  try {
    console.log(`[Summary] Fetching data for event ${eventId}...`);
    const response = await axios.get(
      `${ESPN_BASE_URL}/summary?event=${eventId}`
    );
    response.data.lastPolledTime = new Date();
    summaryDataCache[eventId] = response.data;
    console.log(`[Summary] Data fetched successfully for event ${eventId}`);
    return response.data;
  } catch (error) {
    console.error(
      `[Summary] Error fetching data for event ${eventId}:`,
      error.message
    );
    return null;
  }
}

async function fetchTeamRoster(teamId) {
  try {
    console.log(`[Roster] Fetching data for team ${teamId}...`);
    const response = await axios.get(`${ESPN_BASE_URL}/teams/${teamId}/roster`);
    console.log(`[Roster] Data fetched successfully for team ${teamId}`);
    return response.data;
  } catch (error) {
    console.error(
      `[Roster] Error fetching data for team ${teamId}:`,
      error.message
    );
    return null;
  }
}

async function fetchAthleteGamelog(athleteId) {
  try {
    console.log(`[Gamelog] Fetching data for athlete ${athleteId}...`);
    const response = await axios.get(
      `${ESPN_WEB_API_URL}/athletes/${athleteId}/gamelog`
    );
    console.log(`[Gamelog] Data fetched successfully for athlete ${athleteId}`);
    return response.data;
  } catch (error) {
    console.error(
      `[Gamelog] Error fetching data for athlete ${athleteId}:`,
      error.message
    );
    return null;
  }
}

async function fetchRosterAndGamelogs(teamId, opponentId = null) {
  try {
    console.log(
      `[Roster+Gamelog] Fetching combined data for team ${teamId}...`
    );

    // Fetch roster
    const roster = await fetchTeamRoster(teamId);
    if (!roster) {
      throw new Error("Failed to fetch roster");
    }

    // Filter out injured athletes
    const healthyAthletes = (roster.athletes || []).filter((athlete) => {
      return !athlete.injuries || athlete.injuries.length === 0;
    });

    const gamelogs = {};

    // Fetch gamelogs only for healthy athletes
    const gamelogPromises = healthyAthletes.map(async (athlete) => {
      const gamelog = await fetchAthleteGamelog(athlete.id);
      if (gamelog) {
        gamelogs[athlete.id] = gamelog;
      }
    });

    await Promise.all(gamelogPromises);

    const combinedData = {
      team: roster.team,
      roster,
      gamelogs,
      opponentId, // Pass opponent ID through
      lastUpdated: new Date().toISOString(),
    };

    rosterGamelogCache[teamId] = combinedData;
    console.log(
      `[Roster+Gamelog] Combined data fetched successfully for team ${teamId}`
    );

    return combinedData;
  } catch (error) {
    console.error(
      `[Roster+Gamelog] Error fetching combined data for team ${teamId}:`,
      error.message
    );
    return null;
  }
}

async function fetchAllRostersAndGamelogs() {
  try {
    console.log("[Rosters] Fetching all rosters and gamelogs...");

    // Fetch scoreboard if not available
    if (!scoreboardData || !scoreboardData.events) {
      await fetchScoreboard();
    }

    if (!scoreboardData?.events) {
      throw new Error("No scoreboard data available");
    }

    // Extract unique team IDs from scoreboard and build opponent map
    const teamIds = new Set();
    const opponentMap = {}; // teamId -> opponentTeamId

    scoreboardData.events.forEach((event) => {
      const competitors = event.competitions?.[0]?.competitors || [];
      competitors.forEach((competitor) => {
        teamIds.add(competitor.team.id);
      });

      // Build opponent relationships (each team plays against the other)
      if (competitors.length === 2) {
        const team1Id = competitors[0].team.id;
        const team2Id = competitors[1].team.id;
        opponentMap[team1Id] = team2Id;
        opponentMap[team2Id] = team1Id;
      }
    });

    console.log(`[Rosters] Found ${teamIds.size} teams to fetch`);

    // Fetch roster and gamelogs for each team with opponent info
    const teamsData = [];
    for (const teamId of teamIds) {
      const opponentId = opponentMap[teamId];
      const teamData = await fetchRosterAndGamelogs(teamId, opponentId);
      if (teamData) {
        teamsData.push(teamData);
      }
    }

    const combinedData = {
      teams: teamsData,
      lastUpdated: new Date().toISOString(),
    };

    // Store in cache with special key
    rosterGamelogCache["all"] = combinedData;
    console.log(`[Rosters] All rosters and gamelogs fetched successfully`);

    return combinedData;
  } catch (error) {
    console.error(
      "[Rosters] Error fetching all rosters and gamelogs:",
      error.message
    );
    return null;
  }
}

// Scheduling logic
function updateSchedulingLogic() {
  if (!scoreboardData?.events) return;

  const events = scoreboardData.events;
  let hasLiveGames = false;
  let hasScheduledGames = false;
  const now = new Date();

  // Check if any games are live or scheduled
  for (const event of events) {
    const status = event.competitions?.[0]?.status;
    if (isGameLive(status)) {
      hasLiveGames = true;
      break;
    }
    if (isGameScheduled(status)) {
      hasScheduledGames = true;
    }
  }

  // Find next game start time
  const nextGameTime = findNextGameStart(events);
  nextGameStartTime = nextGameTime;

  // Determine polling mode
  let newPollingMode = "slow";

  if (hasLiveGames) {
    // Fast polling: games are live
    newPollingMode = "fast";
  } else if (nextGameTime) {
    const minutesUntilStart = getTimeDifferenceInMinutes(now, nextGameTime);
    if (minutesUntilStart <= 5) {
      // Fast polling: game starting within 5 minutes
      newPollingMode = "fast";
    } else if (hasScheduledGames) {
      // Moderate polling: games scheduled today but not imminent
      newPollingMode = "moderate";
    }
  }

  // Update scoreboard fetching interval if mode changed
  if (newPollingMode !== currentPollingMode) {
    if (newPollingMode === "fast") {
      console.log(
        "[Scheduler] Live games or game starting soon detected. Switching to 2-second interval."
      );
      startScoreboardFastPolling();
    } else if (newPollingMode === "moderate") {
      console.log(
        "[Scheduler] Scheduled games detected. Switching to 90-second interval."
      );
      startScoreboardModeratePolling();
    } else {
      console.log(
        "[Scheduler] No live or upcoming games. Switching to 30-minute interval."
      );
      startScoreboardSlowPolling();
    }
    currentPollingMode = newPollingMode;
  }

  isAnyGameLive = hasLiveGames;

  // Update summary fetching for each event
  updateSummaryScheduling(events);
}

function startScoreboardFastPolling() {
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }
  console.log("[Polling] Switching to FAST polling (2 seconds)");
  currentScoreboardInterval = setInterval(fetchScoreboard, 2000); // Every 2 seconds
}

function startScoreboardModeratePolling() {
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }
  console.log("[Polling] Switching to MODERATE polling (90 seconds)");
  currentScoreboardInterval = setInterval(fetchScoreboard, 90 * 1000); // Every 90 seconds
}

function startScoreboardSlowPolling() {
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }
  console.log("[Polling] Switching to SLOW polling (30 minutes)");
  currentScoreboardInterval = setInterval(fetchScoreboard, 30 * 60 * 1000); // Every 30 minutes
}

function updateSummaryScheduling(events) {
  const now = new Date();

  for (const event of events) {
    const eventId = event.id;
    const status = event.competitions?.[0]?.status;
    const gameDate = new Date(event.date);

    const isLive = isGameLive(status);
    const isPost = status?.type?.state === "post";
    const minutesUntilStart = getTimeDifferenceInMinutes(now, gameDate);

    // Fast poll if: game is live, starting in 5 minutes, or ended within last 5 minutes
    let shouldFastPoll =
      isLive || (minutesUntilStart <= 5 && minutesUntilStart >= 0);

    // If game is post, check if it ended within the last 5 minutes
    // We'll use the last update time from cache if available
    if (isPost && summaryDataCache[eventId]) {
      const lastUpdate = summaryDataCache[eventId].lastPolledTime || now;
      const minutesSinceEnd = getTimeDifferenceInMinutes(lastUpdate, now);
      if (minutesSinceEnd <= 5) {
        shouldFastPoll = true;
      }
    }

    // Check if we need to update the interval for this event
    const hasInterval = currentSummaryIntervals[eventId];

    if (shouldFastPoll && !hasInterval) {
      console.log(
        `[Summary Scheduler] Starting fast polling for event ${eventId}`
      );
      currentSummaryIntervals[eventId] = setInterval(
        () => fetchSummary(eventId),
        2000
      );
    } else if (!shouldFastPoll && hasInterval) {
      console.log(
        `[Summary Scheduler] Stopping fast polling for event ${eventId}`
      );
      clearInterval(currentSummaryIntervals[eventId]);
      delete currentSummaryIntervals[eventId];
    }
  }
}

// Daily roster/gamelog update at 2:00 AM PST
cron.schedule(
  "0 2 * * *",
  async () => {
    console.log("[Cron] Running daily roster/gamelog update at 2:00 AM PST");
    await fetchAllRostersAndGamelogs();
  },
  {
    timezone: "America/Los_Angeles",
  }
);

// Game start roster/gamelog update
async function checkForGameStarts() {
  if (!scoreboardData?.events) return;

  const now = new Date();

  for (const event of scoreboardData.events) {
    const status = event.competitions?.[0]?.status;
    const gameDate = new Date(event.date);
    const minutesUntilStart = getTimeDifferenceInMinutes(now, gameDate);

    // Check if game is starting soon (within 1 minute) or just started
    if (
      (minutesUntilStart <= 1 && isGameScheduled(status)) ||
      (isGameLive(status) && minutesUntilStart <= 5)
    ) {
      // Only fetch if we haven't updated recently (within last 5 minutes)
      const cached = rosterGamelogCache["all"];
      if (
        !cached ||
        getTimeDifferenceInMinutes(now, new Date(cached.lastUpdated)) > 5
      ) {
        console.log(
          `[Game Start] Updating all rosters/gamelogs (games starting)`
        );
        await fetchAllRostersAndGamelogs();
        break; // Only fetch once per check
      }
    }
  }
}

// Check for game starts every minute
setInterval(checkForGameStarts, 60 * 1000);

// API Endpoints
app.get("/", (req, res) => {
  res.json({
    message: "NBA Data Fetcher API",
    version: "1.0.0",
    endpoints: {
      scoreboard: "/api/scoreboard",
      summary: "/api/summary/:eventId",
      rosters: "/api/rosters",
      betslip:
        "/api/betslip?gameId=:eventId&moneyline=:team&total=:bet&spread=:bet&p1=:playerId&p1_pts=:bet",
      betslipNotification:
        "/api/betslip/notification?gameId=:eventId&[same params as betslip]",
      health: "/health",
    },
    examples: {
      betslip:
        "/api/betslip?gameId=401836803&moneyline=BOS&total=o220.5&p1=4432166&p1_pts=o29.5",
      betslipNotification:
        "/api/betslip/notification?gameId=401836803&moneyline=BOS&total=o220.5&p1=4432166&p1_pts=o29.5",
      multiGame:
        "/api/betslip?gameId=401836803,401839023&moneyline=DET&p1=4432166&p1_pts=o29.5",
    },
    status: {
      isAnyGameLive,
      nextGameStart: nextGameStartTime,
      cachedEvents: Object.keys(summaryDataCache).length,
      cachedRosters: rosterGamelogCache["all"] ? "cached" : "not cached",
      pollingMode: currentPollingMode,
    },
    deployment: {
      platform: "Railway",
      customApiUrl: "https://laraiyeogithubio-production-f5af.up.railway.app",
      fallbackApi: "ESPN",
    },
  });
});

app.get("/api/scoreboard", async (req, res) => {
  try {
    if (!scoreboardData) {
      await fetchScoreboard();
    }

    // Transform and return only the filtered data
    const transformedData = transformScoreboardData(scoreboardData);
    res.json(transformedData || { error: "Failed to fetch scoreboard data" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/summary/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    // Check cache first
    const old = summaryDataCache[eventId];
    const newSummary = await fetchSummary(eventId);

    // If we had an old summary, compare game state transitions
    try {
      const oldState = old?.header?.competitions?.[0]?.status?.type?.state;
      const newState =
        newSummary?.header?.competitions?.[0]?.status?.type?.state;
      if (oldState && newState && oldState !== newState) {
        const comp = newSummary.header?.competitions?.[0];
        const home =
          comp?.competitors?.find((c) => c.homeAway === "home")?.team
            ?.abbreviation || "";
        const away =
          comp?.competitors?.find((c) => c.homeAway === "away")?.team
            ?.abbreviation || "";
        if (oldState === "pre" && newState === "in") {
          // game started
          broadcastToAll("Game Starts", `${home} vs ${away} has now started`, {
            eventId,
          });
        }
        if (oldState === "in" && newState === "post") {
          const homeScore =
            comp?.competitors?.find((c) => c.homeAway === "home")?.score || 0;
          const awayScore =
            comp?.competitors?.find((c) => c.homeAway === "away")?.score || 0;
          broadcastToAll(
            "Game Ended",
            `${home} ${homeScore} vs ${away} ${awayScore} has ended!`,
            { eventId }
          );
        }
      }
    } catch (e) {
      console.error("Error comparing summary states", e?.message || e);
    }

    // Transform and return only the filtered data
    const transformedData = transformSummaryData(summaryDataCache[eventId]);
    res.json(transformedData || { error: "Failed to fetch summary data" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/rosters", async (req, res) => {
  try {
    // Check cache first
    if (!rosterGamelogCache["all"]) {
      await fetchAllRostersAndGamelogs();
    }

    // Transform and return the data
    const transformedData = transformRostersData(rosterGamelogCache["all"]);
    res.json(transformedData || { error: "Failed to fetch rosters data" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/betslip", async (req, res) => {
  try {
    const { moneyline, total, gameId, ...playerBets } = req.query;

    if (!gameId) {
      return res
        .status(400)
        .json({ error: "gameId is required as a query parameter" });
    }

    // Parse game IDs (can be single or comma-separated)
    const gameIds = gameId.split(",").map((id) => id.trim());
    const events = [];

    // Process each game
    for (const currentGameId of gameIds) {
      try {
        // For betslip, we need raw ESPN data (not transformed) to get boxscore.players with full structure
        // So we fetch directly from ESPN rather than using the custom API which returns transformed data
        let summaryData = null;
        try {
          const espnResponse = await axios.get(
            `${ESPN_BASE_URL}/summary?event=${currentGameId}`
          );
          summaryData = espnResponse.data;
          console.log(
            `[Betslip] Using ESPN raw data for game ${currentGameId}`
          );
          console.log(
            `[Betslip] ESPN response has boxscore: ${!!summaryData.boxscore}, has boxscore.players: ${!!summaryData
              .boxscore?.players}`
          );
        } catch (espnError) {
          console.log(
            `[Betslip] Failed to fetch from ESPN for game ${currentGameId}: ${espnError.message}`
          );
        }

        if (!summaryData) {
          console.log(`[Betslip] No data available for game ${currentGameId}`);
          continue;
        }

        // Get game status
        const gameStatus = summaryData.header?.competitions?.[0]?.status?.type;
        const isCompleted = gameStatus?.completed || false;

        const eventData = {
          eventId: currentGameId,
          status: {
            shortDetail: gameStatus?.detail,
            completed: isCompleted,
            state: gameStatus?.state,
            date: summaryData.header?.competitions?.[0]?.date || null,
            game: {
              homeTeam:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "home"
                )?.team?.abbreviation || null,
              awayTeam:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "away"
                )?.team?.abbreviation || null,
              homeScore:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "home"
                )?.score || null,
              awayScore:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "away"
                )?.score || null,
            },
          },
          bets: {},
        };

        // Get team logos from boxscore
        const boxscoreTeams = summaryData.boxscore?.teams || [];
        const getTeamLogo = (abbreviation) => {
          const team = boxscoreTeams.find(
            (t) => t.team?.abbreviation === abbreviation
          );
          return team?.team?.logo || null;
        };

        // Process moneyline bet
        if (moneyline) {
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];

          const betTeam = competitors.find(
            (c) => c.team?.abbreviation === moneyline
          );
          const opposingTeam = competitors.find(
            (c) => c.team?.abbreviation !== moneyline
          );

          if (betTeam && opposingTeam) {
            const betScore = parseInt(betTeam.score) || 0;
            const oppScore = parseInt(opposingTeam.score) || 0;
            const isWinning = betScore > oppScore;

            eventData.bets.moneyline = {
              team: moneyline,
              teamLogo: getTeamLogo(moneyline),
              current: {
                score: `${betScore}-${oppScore}`,
                lead:
                  betScore > oppScore
                    ? moneyline
                    : betScore < oppScore
                    ? opposingTeam.team?.abbreviation
                    : "Tied",
                won: isCompleted
                  ? isWinning
                  : isWinning
                  ? "in progress"
                  : false,
              },
            };
          }
        }

        // Process total points bet
        if (total) {
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];
          const homeScore =
            parseInt(competitors.find((c) => c.homeAway === "home")?.score) ||
            0;
          const awayScore =
            parseInt(competitors.find((c) => c.homeAway === "away")?.score) ||
            0;
          const currentTotal = homeScore + awayScore;

          const isOver = total.startsWith("o") || total.startsWith("O");
          const line = parseFloat(total.substring(1));
          const isWinning = isOver ? currentTotal > line : currentTotal < line;

          eventData.bets.totalPoints = {
            bet: total,
            line: line,
            type: isOver ? "over" : "under",
            current: currentTotal,
            won: isCompleted ? isWinning : isWinning ? "in progress" : false,
          };
        }

        // Process spread bet
        if (req.query.spread) {
          const spreadBet = req.query.spread;
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];

          // Parse spread (format: "BOS-1.5" or "DET+3.5")
          const match = spreadBet.match(/^([A-Z]+)([+-]?[0-9.]+)$/);
          if (match) {
            const teamAbbr = match[1];
            const spreadLine = parseFloat(match[2]);

            const betTeam = competitors.find(
              (c) => c.team?.abbreviation === teamAbbr
            );
            const opposingTeam = competitors.find(
              (c) => c.team?.abbreviation !== teamAbbr
            );

            if (betTeam && opposingTeam) {
              const betScore = parseInt(betTeam.score) || 0;
              const oppScore = parseInt(opposingTeam.score) || 0;
              const adjustedScore = betScore + spreadLine;
              const isWinning = adjustedScore > oppScore;

              eventData.bets.spread = {
                team: teamAbbr,
                teamLogo: getTeamLogo(teamAbbr),
                line: spreadLine,
                current: {
                  score: `${betScore}-${oppScore}`,
                  adjustedScore: adjustedScore.toFixed(1),
                  won: isCompleted
                    ? isWinning
                    : isWinning
                    ? "in progress"
                    : false,
                },
              };
            }
          }
        }

        // Process player bets
        const boxscorePlayers = summaryData.boxscore?.players || [];
        const players = [];

        console.log(
          `[Betslip] Boxscore players count: ${boxscorePlayers.length}`
        );

        Object.keys(playerBets).forEach((key) => {
          const playerMatch = key.match(/^p(\d+)$/);
          if (playerMatch) {
            const playerId = playerBets[key];
            console.log(`[Betslip] Looking for player ID: ${playerId}`);

            const playerData = {
              id: playerId,
              name: null,
              headshot: null,
              overUnder: {},
              milestones: {},
            };

            // Find player in boxscore
            for (const team of boxscorePlayers) {
              // Debug: Check team structure
              console.log(
                `[Betslip] Team: ${
                  team.team?.abbreviation
                }, has statistics: ${!!team.statistics}, statistics is array: ${Array.isArray(
                  team.statistics
                )}, length: ${team.statistics?.length}`
              );

              // If statistics is missing or empty, log the team structure
              if (
                !team.statistics ||
                !Array.isArray(team.statistics) ||
                team.statistics.length === 0
              ) {
                console.log(
                  `[Betslip] WARNING: Team ${team.team?.abbreviation} has no statistics array. Team keys:`,
                  Object.keys(team)
                );
                continue;
              }

              // Statistics is an array, not an object
              const statisticsData = team.statistics[0];
              if (statisticsData) {
                console.log(
                  `[Betslip] Statistics data found, has athletes: ${!!statisticsData.athletes}, athletes length: ${
                    statisticsData.athletes?.length
                  }`
                );
              }
              const athletes = statisticsData?.athletes || [];
              console.log(
                `[Betslip] Checking team: ${team.team?.abbreviation}, athletes count: ${athletes.length}`
              );

              const athlete = athletes.find((a) => a.athlete?.id === playerId);
              if (athlete) {
                console.log(
                  `[Betslip] Found player: ${athlete.athlete?.displayName}`
                );
                playerData.name = athlete.athlete?.displayName;
                playerData.headshot = athlete.athlete?.headshot?.href;

                // Get stat labels for mapping
                const labels = statisticsData.labels || [];

                // Process player over/under and milestone bets
                Object.keys(playerBets).forEach((betKey) => {
                  const statMatch = betKey.match(/^p(\d+)_(\w+)$/);
                  if (statMatch) {
                    const [, num, stat] = statMatch;
                    if (num === playerMatch[1]) {
                      const betValue = playerBets[betKey];
                      const statUpper = stat.toUpperCase();

                      // Find stat index in labels
                      const statIndex = labels.indexOf(statUpper);
                      const current =
                        statIndex >= 0
                          ? parseFloat(athlete.stats?.[statIndex]) || 0
                          : 0;

                      console.log(
                        `[Betslip] Processing bet: ${betKey}, stat: ${statUpper}, current: ${current}, betValue: ${betValue}`
                      );

                      // Check if it's an over/under (contains 'o' or 'u' prefix)
                      if (betValue.match(/^[ou]/i)) {
                        const isOver =
                          betValue.startsWith("o") || betValue.startsWith("O");
                        const line = parseFloat(betValue.substring(1));
                        const isWinning = isOver
                          ? current > line
                          : current < line;

                        playerData.overUnder[statUpper] = {
                          bet: line,
                          type: isOver ? "over" : "under",
                          current: current,
                          won: isCompleted
                            ? isWinning
                            : isWinning
                            ? "in progress"
                            : false,
                        };
                      }
                      // Check if it's a milestone (any number, may have + or % at the end)
                      else {
                        // Parse threshold from string (handles "5+", "5", "5%2B", etc.)
                        const threshold = parseInt(
                          betValue.replace(/[^0-9]/g, "")
                        );
                        if (!isNaN(threshold)) {
                          const isWinning = current >= threshold;

                          playerData.milestones[statUpper] = {
                            bet: betValue,
                            threshold: threshold,
                            current: current,
                            won: isCompleted
                              ? isWinning
                              : isWinning
                              ? "in progress"
                              : false,
                          };
                        }
                      }
                    }
                  }
                });

                break;
              }
            }

            // Only add player if they have bets
            if (
              Object.keys(playerData.overUnder).length > 0 ||
              Object.keys(playerData.milestones).length > 0
            ) {
              players.push(playerData);
            } else {
              console.log(`[Betslip] Player ${playerId} has no bets processed`);
            }
          }
        });

        if (players.length > 0) {
          eventData.bets.players = players;
        }

        events.push(eventData);
      } catch (gameError) {
        console.error(
          `[Betslip] Error processing game ${currentGameId}:`,
          gameError.message
        );
      }
    }

    // Calculate payload size
    const responseString = JSON.stringify(events);
    const payloadSizeBytes = Buffer.byteLength(responseString, "utf8");
    const payloadSizeKB = (payloadSizeBytes / 1024).toFixed(2);

    console.log(
      `[Betslip] Payload size: ${payloadSizeBytes} bytes (${payloadSizeKB} KB)`
    );

    // Add metadata about payload size
    const response = {
      events: events,
      metadata: {
        payloadSize: {
          bytes: payloadSizeBytes,
          kb: parseFloat(payloadSizeKB),
          withinPushLimit: payloadSizeBytes <= 4096, // FCM/APNs limit is 4KB
          recommendedForPush: payloadSizeBytes <= 3072, // Leave room for overhead
        },
        totalBets: events.reduce((sum, event) => {
          let count = 0;
          if (event.bets.moneyline) count++;
          if (event.bets.totalPoints) count++;
          if (event.bets.spread) count++;
          if (event.bets.players)
            count += event.bets.players.reduce((pSum, p) => {
              return (
                pSum +
                Object.keys(p.overUnder).length +
                Object.keys(p.milestones).length
              );
            }, 0);
          return sum + count;
        }, 0),
        gamesCount: events.length,
      },
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backwards-compatible alias: redirect /api/betslip/notification to /api/betslip
const url = require("url");
app.get("/api/betslip/notification", (req, res) => {
  try {
    const search = url.parse(req.url).search || "";
    return res.redirect(307, "/api/betslip" + search);
  } catch (e) {
    return res.status(500).json({ error: "Redirect failed" });
  }
});

// Health check endpoint for Railway
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Initialize server
async function initialize() {
  console.log("Initializing server...");

  // Initial fetch
  await fetchScoreboard();

  // Determine initial polling mode based on scoreboard
  updateSchedulingLogic();

  // If no games detected, start slow polling as fallback
  if (!currentScoreboardInterval) {
    startScoreboardSlowPolling();
  }

  // Start a dedicated 30-minute scoreboard refresh to keep /api/rosters up-to-date.
  // This ensures the server refreshes ESPN's scoreboard feed on a regular cadence
  // regardless of the dynamic polling mode used for live games.
  if (!rostersScoreboardInterval) {
    console.log(
      "[Rosters Scheduler] Starting 30-minute scoreboard refresh for /api/rosters"
    );
    rostersScoreboardInterval = setInterval(async () => {
      try {
        console.log("[Rosters Scheduler] Refreshing scoreboard for rosters...");
        await fetchScoreboard();
        // Clear the cached combined rosters/gamelogs so the next /api/rosters call
        // will rebuild data based on the fresh scoreboard. We avoid immediate
        // fetchAllRostersAndGamelogs here to keep this interval lightweight.
        if (rosterGamelogCache["all"]) {
          delete rosterGamelogCache["all"];
          console.log(
            '[Rosters Scheduler] Cleared rosterGamelogCache["all"] to force refresh on next request'
          );
        }
      } catch (err) {
        console.error(
          "[Rosters Scheduler] Error refreshing scoreboard:",
          err?.message || err
        );
      }
    }, 30 * 60 * 1000);
  }

  console.log("Server initialized successfully");
}

// --------------------------
// Inlined Auth routes
// --------------------------
app.post(
  "/api/auth/signup",
  [
    body("username").isLength({ min: 3 }).trim().escape(),
    body("password").isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { username, password, credits = 2500 } = req.body;
      // check exists
      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("username", username)
        .limit(1);
      if (existing && existing.length > 0)
        return res.status(400).json({ message: "Username already exists" });

      const passwordHash = await bcrypt.hash(password, 10);
      const { data, error } = await supabaseAdmin
        .from("users")
        .insert({ username, password_hash: passwordHash, credits })
        .select()
        .maybeSingle();
      if (error) throw error;
      // After creating a user, check for an existing profile with same username and include profileId if present
      let profileId = null;
      try {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("username", username)
          .maybeSingle();
        if (prof && prof.id) profileId = prof.id;
      } catch (e) {
        /* ignore */
      }

      if (!process.env.JWT_SECRET)
        return res.status(500).json({ message: "JWT_SECRET not configured" });
      const token = jwt.sign(
        { userId: data.id, username: data.username, profileId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
      );
      res.status(201).json({
        message: "User created",
        user: {
          id: data.id,
          username: data.username,
          credits: data.credits,
          profileId,
        },
        token,
      });
    } catch (e) {
      console.error("signup error", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.post("/api/auth/login", async (req, res) => {
  try {
    const rawBody = req.body || {};
    const { username, password } = rawBody;
    // Sanitize headers: mask Authorization
    const incomingHeaders = { ...req.headers };
    if (incomingHeaders.authorization) {
      const token =
        incomingHeaders.authorization.split(" ")[1] ||
        incomingHeaders.authorization;
      incomingHeaders.authorization = `${String(token).slice(0, 8)}...<masked>`;
    }
    // Avoid printing cookies or other very large headers
    if (incomingHeaders.cookie) incomingHeaders.cookie = "<cookie masked>";

    console.log("[auth/login] incoming headers (sanitized):", incomingHeaders);
    console.log("[auth/login] request body (sanitized):", {
      username: username || null,
      password: password ? "***" : null,
      rawBody,
    });
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, username, password_hash, credits")
      .eq("username", username)
      .maybeSingle();
    console.log("[auth/login] users.select result:", {
      user: user
        ? { id: user.id, username: user.username, credits: user.credits }
        : null,
      error: error ? error.message || error : null,
    });
    if (error) throw error;

    // If no legacy users row, attempt to resolve using the provided Supabase access token (if present)
    if (!user) {
      const authHeaderRaw = req.headers.authorization || null;
      const incomingToken = authHeaderRaw
        ? authHeaderRaw.startsWith("Bearer ")
          ? authHeaderRaw.split(" ")[1]
          : authHeaderRaw
        : null;
      console.log(
        "[auth/login] no legacy users row found for username; incomingToken present=",
        !!incomingToken
      );
      if (incomingToken) {
        try {
          console.log(
            "[auth/login] attempting supabaseAdmin.auth.getUser with masked token",
            `${String(incomingToken).slice(0, 8)}...<masked>`
          );
          const { data: sbData, error: sbErr } =
            await supabaseAdmin.auth.getUser(incomingToken);
          console.log("[auth/login] supabaseAdmin.auth.getUser result:", {
            sbData: sbData || null,
            error: sbErr ? sbErr.message || sbErr : null,
          });
          const supabaseUser = sbData && sbData.user ? sbData.user : null;
          if (supabaseUser && supabaseUser.id) {
            // Try to find a profile with this Supabase UUID
            try {
              const { data: prof, error: profErr } = await supabaseAdmin
                .from("profiles")
                .select("id, username, phone, credits")
                .eq("id", supabaseUser.id)
                .maybeSingle();
              console.log(
                "[auth/login] profiles.select by supabase user id result:",
                {
                  prof: prof || null,
                  error: profErr ? profErr.message || profErr : null,
                }
              );
              if (prof && prof.id) {
                if (!process.env.JWT_SECRET)
                  return res
                    .status(500)
                    .json({ message: "JWT_SECRET not configured" });
                const token = jwt.sign(
                  {
                    userId: null,
                    username: prof.username || username,
                    profileId: prof.id,
                    supabaseUserId: supabaseUser.id,
                  },
                  process.env.JWT_SECRET,
                  { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
                );
                return res.json({
                  message: "Login successful (via Supabase token)",
                  user: {
                    id: null,
                    username: prof.username || username,
                    credits: prof.credits || null,
                    profileId: prof.id,
                  },
                  token,
                });
              }
            } catch (profLookupErr) {
              console.error(
                "[auth/login] error looking up profile by supabase id",
                profLookupErr
              );
            }
          }
        } catch (e) {
          console.error(
            "[auth/login] error resolving supabase token",
            e && e.message ? e.message : e
          );
        }
      }
      return res.status(404).json({ message: "User not found" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid password" });
    if (!process.env.JWT_SECRET)
      return res.status(500).json({ message: "JWT_SECRET not configured" });
    // Try to find a matching profile UUID for this username
    let profileId = null;
    try {
      console.log(
        "[auth/login] attempting profiles.select by username=",
        user.username
      );
      const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", user.username)
        .maybeSingle();
      console.log("[auth/login] profiles.select result:", {
        prof: prof || null,
        error: profErr ? profErr.message || profErr : null,
      });
      if (prof && prof.id) profileId = prof.id;
    } catch (e) {
      /* ignore */
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, profileId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        credits: user.credits,
        profileId,
      },
      token,
    });
  } catch (e) {
    console.error("login error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Simple auth middleware used by inlined routes
function authMiddlewareInline(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).json({ message: "Unauthorized" });
  const token = auth.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username || null;
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

app.post("/api/auth/verify", authMiddlewareInline, async (req, res) => {
  try {
    // Prefer returning profile info when available
    if (req.username) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id, username, credits, phone, created_at")
        .eq("username", req.username)
        .maybeSingle();
      if (prof) return res.json({ user: prof });
    }
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, username, credits")
      .eq("id", req.userId)
      .maybeSingle();
    if (!data) return res.status(404).json({ message: "User not found" });
    res.json({ user: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------------
// Inlined profile route (push-token upsert)
// --------------------------
app.post("/api/profile/push-token", authMiddlewareInline, async (req, res) => {
  try {
    const { pushToken, platform } = req.body;
    if (!pushToken)
      return res.status(400).json({ message: "pushToken required" });
    // Prefer profiles->push_tokens when a profile UUID exists for this user
    let profileId = null;
    try {
      if (typeof req.userId === "string" && req.userId.includes("-")) {
        // userId is already a UUID, assume it maps to profiles.id
        profileId = req.userId;
      } else if (req.username) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("username", req.username)
          .maybeSingle();
        if (prof && prof.id) profileId = prof.id;
      }
    } catch (e) {
      console.warn("profile resolution failed", e?.message || e);
    }

    if (profileId) {
      try {
        const { error } = await supabaseAdmin
          .from("push_tokens")
          .upsert({ user_id: profileId, expo_push_token: pushToken, platform })
          .eq("user_id", profileId);
        if (error) throw error;
        return res.json({ success: true, source: "push_tokens:profile" });
      } catch (err) {
        console.warn(
          "push_tokens upsert with profileId failed",
          err?.message || err
        );
        // fallback to legacy path below
      }
    }

    // Legacy/fallback: try upserting with whatever userId we have, then update users.push_token if that fails
    try {
      const { error } = await supabaseAdmin
        .from("push_tokens")
        .upsert({ user_id: req.userId, expo_push_token: pushToken, platform })
        .eq("user_id", req.userId);
      if (!error)
        return res.json({ success: true, source: "push_tokens:legacy" });
      throw error;
    } catch (upsertErr) {
      console.warn(
        "push_tokens upsert legacy failed, attempting users.push_token fallback",
        upsertErr?.message || upsertErr
      );
      try {
        const { error: updErr } = await supabaseAdmin
          .from("users")
          .update({ push_token: pushToken })
          .eq("id", req.userId);
        if (updErr) throw updErr;
        return res.json({ success: true, source: "users.push_token" });
      } catch (updErr) {
        console.error(
          "push-token update users failed",
          updErr?.message || updErr
        );
        throw updErr;
      }
    }
  } catch (e) {
    console.error("push-token upsert", e);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------------
// Inlined betslips routes and watcher (uses Supabase HTTP)
// --------------------------
const betslipWatchers = {};

function startWatcherInline(betslipId) {
  if (betslipWatchers[betslipId]) return;
  const lastStates = {};
  const intervalId = setInterval(async () => {
    try {
      const { data: rows } = await supabaseAdmin
        .from("betslips")
        .select("*")
        .eq("id", betslipId)
        .limit(1);
      const fresh = (rows && rows[0]) || null;
      if (!fresh) {
        clearInterval(intervalId);
        delete betslipWatchers[betslipId];
        return;
      }
      const betsArr = (fresh.betslip_data && fresh.betslip_data.bets) || [];
      // fetch summaries
      const summaries = {};
      for (const evId of Array.from(
        new Set(betsArr.map((b) => b.gameId || b.game_id).filter(Boolean))
      )) {
        try {
          const resp = await axios.get(
            `${ESPN_BASE_URL}/summary?event=${evId}`
          );
          summaries[evId] = resp.data;
        } catch (e) {
          console.error("summary fetch", e);
        }
      }
      let allFinal = true;
      let anyLost = false;
      for (const bet of betsArr) {
        const pickKey = bet.id || JSON.stringify(bet);
        const evId = bet.gameId || bet.game_id;
        const summary = summaries[evId];
        let newState = null;
        if (!summary) newState = "in progress";
        else {
          const gameStatus = summary.header?.competitions?.[0]?.status?.type;
          const isCompleted = gameStatus?.completed || false;
          // simplified heuristics (moneyline/total/spread/player)
          if (!bet.playerId && !bet.player && !bet.prop) {
            const competitors =
              summary.header?.competitions?.[0]?.competitors || [];
            const betTeam = competitors.find(
              (c) =>
                c.team?.abbreviation ===
                (bet.team || bet.selection || bet.description)
            );
            const opp = competitors.find(
              (c) =>
                c.team?.abbreviation !==
                (bet.team || bet.selection || bet.description)
            );
            if (betTeam && opp) {
              const betScore = parseInt(betTeam.score) || 0;
              const oppScore = parseInt(opp.score) || 0;
              const isWinning = betScore > oppScore;
              newState = isCompleted
                ? isWinning
                  ? "won"
                  : "lost"
                : isWinning
                ? "in progress"
                : false;
            }
          }
          if (
            newState === null &&
            (bet.line || bet.betValue || bet.type === "total")
          ) {
            const competitors =
              summary.header?.competitions?.[0]?.competitors || [];
            const home =
              parseInt(competitors.find((c) => c.homeAway === "home")?.score) ||
              0;
            const away =
              parseInt(competitors.find((c) => c.homeAway === "away")?.score) ||
              0;
            const currentTotal = home + away;
            const raw = bet.line || bet.betValue || "";
            const isOver = String(raw).toLowerCase().startsWith("o");
            const lineNum =
              parseFloat(String(raw).replace(/[^0-9\.\-]/g, "")) || 0;
            const isWinning = isOver
              ? currentTotal > lineNum
              : currentTotal < lineNum;
            newState = isCompleted
              ? isWinning
                ? "won"
                : "lost"
              : isWinning
              ? "in progress"
              : false;
          }
          if (newState === null) newState = "in progress";
        }
        if (lastStates[pickKey] !== newState) {
          if (newState === "won")
            await sendPushNotification(
              fresh.user_id,
              "Pick Won",
              `Your pick won`,
              { betslipId: fresh.id, pick: bet }
            );
          if (newState === "lost")
            await sendPushNotification(
              fresh.user_id,
              "Pick Lost",
              `Your pick lost`,
              { betslipId: fresh.id, pick: bet }
            );
          lastStates[pickKey] = newState;
        }
        if (newState === "in progress") allFinal = false;
        if (newState === "lost") anyLost = true;
      }
      if (allFinal) {
        const newStatus = anyLost ? "lost" : "won";
        if (fresh.status !== newStatus) {
          await supabaseAdmin
            .from("betslips")
            .update({ status: newStatus })
            .eq("id", betslipId);
          // send bet result
          await sendPushNotification(
            fresh.user_id,
            newStatus === "won" ? "Bet Won" : "Bet Lost",
            `Your bet has ${newStatus}`,
            { betslipId }
          );
        }
        clearInterval(intervalId);
        delete betslipWatchers[betslipId];
      }
    } catch (e) {
      console.error("watcher tick error", e);
    }
  }, 5000);
  betslipWatchers[betslipId] = { intervalId, lastStates };
}

app.post("/api/betslips", authMiddlewareInline, async (req, res) => {
  try {
    const { betslipData, totalStake, potentialPayout } = req.body;
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("credits")
      .eq("id", req.userId)
      .maybeSingle();
    if (!user) return res.status(404).json({ message: "User not found" });
    if (parseFloat(user.credits) < totalStake)
      return res.status(400).json({ message: "Insufficient credits" });
    const newCredits = parseFloat(user.credits) - totalStake;
    const { error: updErr } = await supabaseAdmin
      .from("users")
      .update({ credits: newCredits })
      .eq("id", req.userId);
    if (updErr) throw updErr;
    const { data: inserted } = await supabaseAdmin
      .from("betslips")
      .insert({
        user_id: req.userId,
        betslip_data: betslipData,
        total_stake: totalStake,
        potential_payout: potentialPayout,
      })
      .select()
      .maybeSingle();
    await supabaseAdmin.from("bet_history").insert({
      user_id: req.userId,
      betslip_id: inserted.id,
      action: "placed",
      credits_change: -totalStake,
      credits_after: newCredits,
    });
    // start watcher
    startWatcherInline(inserted.id);
    res.status(201).json({
      message: "Bet placed",
      betslipId: inserted.id,
      creditsRemaining: newCredits,
    });
  } catch (e) {
    console.error("place bet", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/betslips", authMiddlewareInline, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from("betslips")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false });
    res.json({ betslips: data || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// Debug: send a test push notification to the caller's profile (or specified profileId)
app.post(
  "/api/debug/push-test",
  authMiddlewareInline,
  async (req, res) => {
    try {
      const body = req.body || {};
      const targetProfileId = body.profileId || req.profileId || null;

      // If JWT includes profileId, prefer it
      let profileId = targetProfileId || null;
      if (!profileId && req.username) {
        // Try to resolve profileId from username
        try {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("username", req.username)
            .maybeSingle();
          if (prof && prof.id) profileId = prof.id;
        } catch (e) {
          console.error("/api/debug/push-test profile lookup error", e);
        }
      }

      if (!profileId) {
        return res.status(400).json({ message: "profileId required" });
      }

      // fetch push tokens
      const { data: tokens, error: tokErr } = await supabaseAdmin
        .from("push_tokens")
        .select("expo_push_token, platform")
        .eq("user_id", profileId);
      if (tokErr) throw tokErr;
      if (!tokens || tokens.length === 0)
        return res.status(404).json({ message: "No push tokens for profile" });

      // send to each token
      const results = [];
      for (const t of tokens) {
        try {
          await sendPushNotification(profileId, body.title || "Test", body.body || "This is a test notification", body.data || {});
          results.push({ token: t.expo_push_token, status: "sent" });
        } catch (e) {
          console.error("/api/debug/push-test send error", e);
          results.push({ token: t.expo_push_token, status: "error", error: e && e.message });
        }
      }

      res.json({ success: true, results });
    } catch (e) {
      console.error("/api/debug/push-test error", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.get("/api/betslips/:id", authMiddlewareInline, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from("betslips")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!data) return res.status(404).json({ message: "Betslip not found" });
    res.json({ betslip: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/betslips/:id/watch", authMiddlewareInline, async (req, res) => {
  const id = req.params.id;
  try {
    const { data } = await supabaseAdmin
      .from("betslips")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return res.status(404).json({ message: "Betslip not found" });
    if (data.user_id !== req.userId)
      return res.status(403).json({ message: "Forbidden" });
    if (betslipWatchers[id]) return res.json({ message: "Already watching" });
    startWatcherInline(id);
    res.json({ message: "Watcher started" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete(
  "/api/betslips/:id/watch",
  authMiddlewareInline,
  async (req, res) => {
    const id = req.params.id;
    try {
      if (!betslipWatchers[id]) return res.json({ watching: false });
      clearInterval(betslipWatchers[id].intervalId);
      delete betslipWatchers[id];
      res.json({ watching: false });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Authentication API: http://localhost:${PORT}/api/auth`);
  console.log(`Betslips API: http://localhost:${PORT}/api/betslips`);
  initialize();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received. Closing HTTP server...");

  // Clear all intervals
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }

  Object.values(currentSummaryIntervals).forEach((interval) => {
    clearInterval(interval);
  });

  if (rostersScoreboardInterval) {
    clearInterval(rostersScoreboardInterval);
  }

  process.exit(0);
});
