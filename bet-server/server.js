const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron");
require("dotenv").config();

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
    if (stat.abbreviation && stat.displayValue) {
      statsObj[stat.abbreviation] = stat.displayValue;
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
          records: competitor.record?.[0]?.summary || null,
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

  // Collect all stats for each category
  const allStats = {};
  labels.forEach((label) => {
    allStats[label] = [];
  });

  // Extract all event stats
  seasonTypes.forEach((seasonType) => {
    const categories = seasonType.categories || [];
    categories.forEach((category) => {
      const categoryEvents = category.events || [];
      categoryEvents.forEach((eventData) => {
        const stats = eventData.stats || [];
        labels.forEach((label, index) => {
          if (stats[index] !== undefined && stats[index] !== null) {
            // Parse numeric values (handle formats like "10-20")
            const value = parseFloat(String(stats[index]).split("-")[0]);
            if (!isNaN(value)) {
              allStats[label].push(value);
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
    const overProb = values.filter((v) => v > overLine).length / values.length;
    const underProb = 1 - overProb;

    odds.overUnder[category] = {
      line: overLine,
      over: calculateOdds(overProb > 0.5 ? overProb : 0.5),
      under: calculateOdds(underProb > 0.5 ? underProb : 0.5),
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
    const { team, roster, gamelogs } = teamData;

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
        athleteData.odds = generatePlayerOdds(gamelog, null);
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
    console.log("[Scoreboard] Fetching data...");
    const response = await axios.get(`${ESPN_BASE_URL}/scoreboard`);
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

async function fetchRosterAndGamelogs(teamId) {
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

    // Extract unique team IDs from scoreboard
    const teamIds = new Set();
    scoreboardData.events.forEach((event) => {
      event.competitions?.[0]?.competitors?.forEach((competitor) => {
        teamIds.add(competitor.team.id);
      });
    });

    console.log(`[Rosters] Found ${teamIds.size} teams to fetch`);

    // Fetch roster and gamelogs for each team
    const teamsData = [];
    for (const teamId of teamIds) {
      const teamData = await fetchRosterAndGamelogs(teamId);
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
  const now = new Date();

  // Check if any games are live
  for (const event of events) {
    const status = event.competitions?.[0]?.status;
    if (isGameLive(status)) {
      hasLiveGames = true;
      break;
    }
  }

  // Find next game start time
  const nextGameTime = findNextGameStart(events);
  nextGameStartTime = nextGameTime;

  // Update scoreboard fetching interval
  if (hasLiveGames && !isAnyGameLive) {
    console.log(
      "[Scheduler] Live games detected. Switching to 2-second interval."
    );
    startScoreboardFastPolling();
  } else if (!hasLiveGames && nextGameTime) {
    const minutesUntilStart = getTimeDifferenceInMinutes(now, nextGameTime);
    if (minutesUntilStart <= 5 && isAnyGameLive) {
      console.log(
        "[Scheduler] Game starting in 5 minutes. Maintaining fast polling."
      );
    } else if (minutesUntilStart <= 5 && !isAnyGameLive) {
      console.log(
        "[Scheduler] Game starting in 5 minutes. Switching to 2-second interval."
      );
      startScoreboardFastPolling();
    } else if (isAnyGameLive) {
      console.log(
        "[Scheduler] No live games. Switching to 30-minute interval."
      );
      startScoreboardSlowPolling();
    }
  } else if (!hasLiveGames && !nextGameTime && isAnyGameLive) {
    console.log(
      "[Scheduler] No live or upcoming games. Switching to 30-minute interval."
    );
    startScoreboardSlowPolling();
  }

  isAnyGameLive = hasLiveGames;

  // Update summary fetching for each event
  updateSummaryScheduling(events);
}

function startScoreboardFastPolling() {
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }
  currentScoreboardInterval = setInterval(fetchScoreboard, 2000); // Every 2 seconds
}

function startScoreboardSlowPolling() {
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }
  currentScoreboardInterval = setInterval(fetchScoreboard, 30 * 60 * 1000); // Every 30 minutes
}

function updateSummaryScheduling(events) {
  const now = new Date();

  for (const event of events) {
    const eventId = event.id;
    const status = event.competitions?.[0]?.status;
    const gameDate = new Date(event.date);

    const isLive = isGameLive(status);
    const minutesUntilStart = getTimeDifferenceInMinutes(now, gameDate);
    const shouldFastPoll =
      isLive || (minutesUntilStart <= 5 && minutesUntilStart >= 0);

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
    endpoints: {
      scoreboard: "/api/scoreboard",
      summary: "/api/summary/:eventId",
      rosters: "/api/rosters",
      betslip:
        "/api/betslip/:eventId?:filters (moneyline, spread, total, gameId, player bets)",
    },
    status: {
      isAnyGameLive,
      nextGameStart: nextGameStartTime,
      cachedEvents: Object.keys(summaryDataCache).length,
      cachedRosters: rosterGamelogCache["all"] ? "cached" : "not cached",
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
    if (!summaryDataCache[eventId]) {
      await fetchSummary(eventId);
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
      return res.status(400).json({ error: "gameId is required as a query parameter" });
    }

    // Parse game IDs (can be single or comma-separated)
    const gameIds = gameId.split(',').map(id => id.trim());
    const events = [];

    // Process each game
    for (const currentGameId of gameIds) {
      try {
        // Try to fetch from our API first (laraiyeo.github as placeholder)
        let summaryData = null;
        try {
          const response = await axios.get(`https://laraiyeo.github.io/api/summary/${currentGameId}`);
          summaryData = response.data;
          console.log(`[Betslip] Using data from laraiyeo.github for game ${currentGameId}`);
        } catch (apiError) {
          console.log(`[Betslip] Failed to fetch from laraiyeo.github for game ${currentGameId}, using ESPN as backup`);
          // Fallback to ESPN - fetch directly (not from cache) to get raw data with all boxscore details
          try {
            const espnResponse = await axios.get(`${ESPN_BASE_URL}/summary?event=${currentGameId}`);
            summaryData = espnResponse.data;
            console.log(`[Betslip] Using ESPN data for game ${currentGameId}`);
          } catch (espnError) {
            console.log(`[Betslip] Failed to fetch from ESPN for game ${currentGameId}: ${espnError.message}`);
          }
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
            shortDetail: gameStatus?.shortDetail,
            completed: isCompleted
          },
          bets: {}
        };

        // Get team logos from boxscore
        const boxscoreTeams = summaryData.boxscore?.teams || [];
        const getTeamLogo = (abbreviation) => {
          const team = boxscoreTeams.find(t => t.team?.abbreviation === abbreviation);
          return team?.team?.logo || null;
        };

        // Process moneyline bet
        if (moneyline) {
          const competitors = summaryData.header?.competitions?.[0]?.competitors || [];
          
          const betTeam = competitors.find((c) => c.team?.abbreviation === moneyline);
          const opposingTeam = competitors.find((c) => c.team?.abbreviation !== moneyline);

          if (betTeam && opposingTeam) {
            const betScore = parseInt(betTeam.score) || 0;
            const oppScore = parseInt(opposingTeam.score) || 0;
            const isWinning = betScore > oppScore;

            eventData.bets.moneyline = {
              team: moneyline,
              teamLogo: getTeamLogo(moneyline),
              current: {
                score: `${betScore}-${oppScore}`,
                lead: betScore > oppScore ? moneyline : (betScore < oppScore ? opposingTeam.team?.abbreviation : "Tied"),
                won: isCompleted ? isWinning : (isWinning ? "in progress" : false),
              },
            };
          }
        }

        // Process total points bet
        if (total) {
          const competitors = summaryData.header?.competitions?.[0]?.competitors || [];
          const homeScore = parseInt(competitors.find((c) => c.homeAway === "home")?.score) || 0;
          const awayScore = parseInt(competitors.find((c) => c.homeAway === "away")?.score) || 0;
          const currentTotal = homeScore + awayScore;

          const isOver = total.startsWith("o") || total.startsWith("O");
          const line = parseFloat(total.substring(1));
          const isWinning = isOver ? currentTotal > line : currentTotal < line;

          eventData.bets.totalPoints = {
            bet: total,
            line: line,
            type: isOver ? "over" : "under",
            current: currentTotal,
            won: isCompleted ? isWinning : (isWinning ? "in progress" : false),
          };
        }

        // Process spread bet
        if (req.query.spread) {
          const spreadBet = req.query.spread;
          const competitors = summaryData.header?.competitions?.[0]?.competitors || [];
          
          // Parse spread (format: "BOS-1.5" or "DET+3.5")
          const match = spreadBet.match(/^([A-Z]+)([+-]?[0-9.]+)$/);
          if (match) {
            const teamAbbr = match[1];
            const spreadLine = parseFloat(match[2]);
            
            const betTeam = competitors.find((c) => c.team?.abbreviation === teamAbbr);
            const opposingTeam = competitors.find((c) => c.team?.abbreviation !== teamAbbr);
            
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
                  won: isCompleted ? isWinning : (isWinning ? "in progress" : false),
                },
              };
            }
          }
        }

        // Process player bets
        const boxscorePlayers = summaryData.boxscore?.players || [];
        const players = [];
        
        console.log(`[Betslip] Boxscore players count: ${boxscorePlayers.length}`);
        
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
              // Statistics is an array, not an object
              const statisticsData = team.statistics?.[0];
              const athletes = statisticsData?.athletes || [];
              console.log(`[Betslip] Checking team: ${team.team?.abbreviation}, athletes count: ${athletes.length}`);
              
              const athlete = athletes.find((a) => a.athlete?.id === playerId);
              if (athlete) {
                console.log(`[Betslip] Found player: ${athlete.athlete?.displayName}`);
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
                      const current = statIndex >= 0 ? parseFloat(athlete.stats?.[statIndex]) || 0 : 0;

                      console.log(`[Betslip] Processing bet: ${betKey}, stat: ${statUpper}, current: ${current}, betValue: ${betValue}`);

                      // Check if it's an over/under (contains 'o' or 'u' prefix)
                      if (betValue.match(/^[ou]/i)) {
                        const isOver = betValue.startsWith("o") || betValue.startsWith("O");
                        const line = parseFloat(betValue.substring(1));
                        const isWinning = isOver ? current > line : current < line;

                        playerData.overUnder[statUpper] = {
                          bet: line,
                          type: isOver ? "over" : "under",
                          current: current,
                          won: isCompleted ? isWinning : (isWinning ? "in progress" : false),
                        };
                      }
                      // Check if it's a milestone (any number, may have + or % at the end)
                      else {
                        // Parse threshold from string (handles "5+", "5", "5%2B", etc.)
                        const threshold = parseInt(betValue.replace(/[^0-9]/g, ''));
                        if (!isNaN(threshold)) {
                          const isWinning = current >= threshold;

                          playerData.milestones[statUpper] = {
                            bet: betValue,
                            threshold: threshold,
                            current: current,
                            won: isCompleted ? isWinning : (isWinning ? "in progress" : false),
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
            if (Object.keys(playerData.overUnder).length > 0 || Object.keys(playerData.milestones).length > 0) {
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
        console.error(`[Betslip] Error processing game ${currentGameId}:`, gameError.message);
      }
    }

    // Calculate payload size
    const responseString = JSON.stringify(events);
    const payloadSizeBytes = Buffer.byteLength(responseString, 'utf8');
    const payloadSizeKB = (payloadSizeBytes / 1024).toFixed(2);

    console.log(`[Betslip] Payload size: ${payloadSizeBytes} bytes (${payloadSizeKB} KB)`);

    // Add metadata about payload size
    const response = {
      events: events,
      metadata: {
        payloadSize: {
          bytes: payloadSizeBytes,
          kb: parseFloat(payloadSizeKB),
          withinPushLimit: payloadSizeBytes <= 4096, // FCM/APNs limit is 4KB
          recommendedForPush: payloadSizeBytes <= 3072 // Leave room for overhead
        },
        totalBets: events.reduce((sum, event) => {
          let count = 0;
          if (event.bets.moneyline) count++;
          if (event.bets.totalPoints) count++;
          if (event.bets.spread) count++;
          if (event.bets.players) count += event.bets.players.reduce((pSum, p) => {
            return pSum + Object.keys(p.overUnder).length + Object.keys(p.milestones).length;
          }, 0);
          return sum + count;
        }, 0),
        gamesCount: events.length
      }
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
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

  // Start with 30-minute polling by default
  startScoreboardSlowPolling();

  console.log("Server initialized successfully");
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
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

  process.exit(0);
});
