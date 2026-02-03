// Enhanced FIFA World Cup Service
// Handles API calls for FIFA World competitions (World Cup, Qualifiers)
// Combines soccer web logic with React Native patterns

import React from "react";
import { normalizeLeagueCodeForStorage } from "../../utils/TeamIdMapping";
import { BaseCacheService } from "../BaseCacheService";

// FIFA World Competition configurations
const FIFA_COMPETITIONS = {
  "fifa.world": { name: "FIFA World Cup", logo: "4", isPrimary: true },
  "fifa.worldq.uefa": { name: "UEFA Qualifiers", logo: "67", isPrimary: false },
  "fifa.worldq.afc": { name: "AFC Qualifiers", logo: "62", isPrimary: false },
  "fifa.worldq.concacaf": {
    name: "CONCACAF Qualifiers",
    logo: "64",
    isPrimary: false,
  },
  "fifa.worldq.caf": { name: "CAF Qualifiers", logo: "63", isPrimary: false },
  "fifa.worldq.conmebol": {
    name: "CONMEBOL Qualifiers",
    logo: "65",
    isPrimary: false,
  },
  "fifa.worldq.ofc": { name: "OFC Qualifiers", logo: "66", isPrimary: false },
};

// Helper function for general soccer year logic
// For FIFA competitions: July-December uses current year, else previous year
const getSoccerYear = () => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
  return currentMonth >= 7 && currentMonth <= 12
    ? now.getFullYear()
    : now.getFullYear() - 1;
};

export const FIFAWorldServiceEnhanced = {
  // Logo cache to prevent repeated fetches
  logoCache: new Map(),
  // Roster cache to avoid fetching rosters for the same team/season repeatedly
  rosterCache: new Map(),

  // Smart live game detection for Soccer
  hasLiveEvents(games) {
    try {
      if (!Array.isArray(games)) return false;
      return games.some((game) => {
        const status =
          game?.status?.type?.name?.toLowerCase() ||
          game?.competitions?.[0]?.status?.type?.name?.toLowerCase() ||
          "";
        return (
          status.includes("live") ||
          status.includes("in progress") ||
          status.includes("halftime") ||
          status.includes("break") ||
          status.includes("second half") ||
          status.includes("first half") ||
          status.includes("extra time") ||
          status.includes("penalty") ||
          status.includes("overtime")
        );
      });
    } catch (error) {
      console.error("FIFAWorldService: Error detecting live events", error);
      return false;
    }
  },

  getDataType(data, context) {
    try {
      if (this.hasLiveEvents(data?.events || data)) {
        return "live";
      }

      if (
        context?.includes("standings") ||
        context?.includes("teams") ||
        context?.includes("team") ||
        context?.includes("player")
      ) {
        return "static";
      }

      return "scheduled"; // Default for matches/scoreboard
    } catch (error) {
      console.error("FIFAWorldService: Error determining data type", error);
      return "scheduled";
    }
  },

  // Proxy method to use BaseCacheService caching
  async getCachedData(key, fetchFunction, context) {
    return BaseCacheService.getCachedData(
      key,
      fetchFunction,
      context,
      this.getDataType.bind(this),
    );
  },

  // Proxy method for browser headers
  getBrowserHeaders() {
    return BaseCacheService.getBrowserHeaders();
  },

  // Function to get team logo with fallback and caching
  async getTeamLogoWithFallback(teamId) {
    // Check cache first
    if (this.logoCache.has(teamId)) {
      return Promise.resolve(this.logoCache.get(teamId));
    }

    return new Promise((resolve) => {
      const primaryUrl = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500-dark/${teamId}.png&w=200&h=200`;
      const fallbackUrl = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${teamId}.png&w=200&h=200`;

      // Try primary URL first
      fetch(primaryUrl, { method: "HEAD" })
        .then((response) => {
          if (response.ok) {
            this.logoCache.set(teamId, primaryUrl);
            resolve(primaryUrl);
          } else {
            throw new Error("Primary logo not found");
          }
        })
        .catch(() => {
          // Try fallback URL
          fetch(fallbackUrl, { method: "HEAD" })
            .then((response) => {
              if (response.ok) {
                this.logoCache.set(teamId, fallbackUrl);
                resolve(fallbackUrl);
              } else {
                throw new Error("Fallback logo not found");
              }
            })
            .catch(() => {
              // Use default soccer ball
              const defaultLogo =
                "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/default-team.png";
              this.logoCache.set(teamId, defaultLogo);
              resolve(defaultLogo);
            });
        });
    });
  },

  // Helper function to get team color using alternate color logic
  getTeamColorWithAlternateLogic(team) {
    if (!team || !team.color) return "007bff"; // Default fallback

    const isUsingAlternateColor = [
      "ffffff",
      "ffee00",
      "ffff00",
      "81f733",
      "000000",
    ].includes(team.color);

    if (isUsingAlternateColor && team.alternateColor) {
      return team.alternateColor;
    } else {
      return team.color;
    }
  },

  // Helper function to format date for API
  getAdjustedDateForSoccer() {
    const now = new Date();
    const estNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
    if (estNow.getHours() < 2) {
      estNow.setDate(estNow.getDate() - 1);
    }
    const adjustedDate =
      estNow.getFullYear() +
      String(estNow.getMonth() + 1).padStart(2, "0") +
      String(estNow.getDate()).padStart(2, "0");
    return adjustedDate;
  },

  // Format date range for API calls
  formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  },

  // Get date ranges for different filters
  getDateRange(dateFilter) {
    const today = new Date();

    switch (dateFilter) {
      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          startDate: yesterday,
          endDate: yesterday,
        };
      case "today":
        return {
          startDate: today,
          endDate: today,
        };
      case "tomorrow":
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return {
          startDate: tomorrow,
          endDate: tomorrow,
        };
      case "upcoming":
        const tomorrowForUpcoming = new Date(today);
        tomorrowForUpcoming.setDate(tomorrowForUpcoming.getDate() + 1);
        const endDate = new Date(tomorrowForUpcoming);
        endDate.setDate(endDate.getDate() + 6); // +7 days total from tomorrow
        return {
          startDate: tomorrowForUpcoming,
          endDate: endDate,
        };
      default:
        return {
          startDate: today,
          endDate: today,
        };
    }
  },

  // Create date range string for API
  createDateRangeString(startDate, endDate) {
    const start = this.formatDateForAPI(startDate);
    const end = this.formatDateForAPI(endDate);
    return start === end ? start : `${start}-${end}`;
  },

  // Fetch games from specific FIFA competition
  async fetchGamesFromCompetition(competitionCode, dateRange) {
    try {
      console.log(`Starting fetch for FIFA competition ${competitionCode}...`);
      const headers = this.getBrowserHeaders();
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${competitionCode}/scoreboard?dates=${dateRange}`,
        { headers },
      );

      if (response.ok) {
        const data = await response.json();
        const competitionGames = data.events || [];

        // Add competition information to each game
        competitionGames.forEach((game) => {
          game.competitionCode = competitionCode;
          game.competitionName =
            FIFA_COMPETITIONS[competitionCode]?.name || "FIFA Competition";
          game.isFIFACompetition = true;
          game.priority = competitionCode === "fifa.world" ? 1 : 2; // World Cup = 1, Qualifiers = 2
          // Add leagues data for round information
          game.leaguesData = data.leagues?.[0];
        });

        console.log(
          `Found ${competitionGames.length} games in ${competitionCode}`,
        );
        return competitionGames;
      } else {
        console.log(`No data for ${competitionCode} (${response.status})`);
        return [];
      }
    } catch (error) {
      console.error(`Error fetching ${competitionCode}:`, error);
      return [];
    }
  },

  // Fetch games from all FIFA competitions or specific competition
  async fetchGamesFromAllCompetitions(dateRange, specificCompetition = null) {
    const allGames = [];

    // Get competitions to check
    const allCompetitionsToCheck = specificCompetition
      ? [
          {
            code: specificCompetition,
            name:
              FIFA_COMPETITIONS[specificCompetition]?.name ||
              "FIFA Competition",
          },
        ]
      : [
          { code: "fifa.world", name: "FIFA World Cup" }, // Main competition FIRST
          { code: "fifa.worldq.uefa", name: "UEFA Qualifiers" },
          { code: "fifa.worldq.afc", name: "AFC Qualifiers" },
          { code: "fifa.worldq.concacaf", name: "CONCACAF Qualifiers" },
          { code: "fifa.worldq.caf", name: "CAF Qualifiers" },
          { code: "fifa.worldq.conmebol", name: "CONMEBOL Qualifiers" },
          { code: "fifa.worldq.ofc", name: "OFC Qualifiers" },
        ];

    console.log(
      `Fetching FIFA games from ${allCompetitionsToCheck.length} competitions:`,
      allCompetitionsToCheck.map((c) => c.code),
    );

    // Create all fetch promises in parallel
    const fetchPromises = allCompetitionsToCheck.map(async (competition) => {
      return this.fetchGamesFromCompetition(competition.code, dateRange);
    });

    // Wait for all promises to complete
    const allResults = await Promise.all(fetchPromises);

    // Flatten and combine all games
    allResults.forEach((games) => {
      allGames.push(...games);
    });

    // Sort by priority (World Cup first), then by date
    allGames.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower priority number = higher importance
      }
      return new Date(a.date) - new Date(b.date);
    });

    console.log(`Total FIFA games found: ${allGames.length}`);
    return allGames;
  },

  // Fetch current matches/scoreboard with date filter and optional competition filter
  async getScoreboard(dateFilter = "today", competitionCode = null) {
    const cacheKey = competitionCode
      ? `fifa_${competitionCode}_scoreboard_${dateFilter}`
      : `fifa_scoreboard_${dateFilter}`;

    return this.getCachedData(
      cacheKey,
      async () => {
        try {
          const { startDate, endDate } = this.getDateRange(dateFilter);
          const dateRange = this.createDateRangeString(startDate, endDate);

          console.log(
            `Fetching FIFA scoreboard for ${dateFilter}${
              competitionCode ? ` (${competitionCode})` : ""
            }:`,
            dateRange,
          );

          // Fetch from all competitions or specific competition
          const games = await this.fetchGamesFromAllCompetitions(
            dateRange,
            competitionCode,
          );

          return {
            events: games,
            leagues: games.length > 0 ? [games[0].leaguesData] : [],
          };
        } catch (error) {
          console.error("Error fetching FIFA scoreboard:", error);
          throw error;
        }
      },
      "scoreboard",
    );
  },

  // Fetch game details
  async getGameDetails(gameId, competitionHint = null) {
    try {
      // First, try to detect the competition from the core API
      let detectedHint = null;
      if (!competitionHint) {
        try {
          // Try each FIFA competition to find the right one
          for (const comp of Object.keys(FIFA_COMPETITIONS)) {
            const coreResponse = await fetch(
              `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${comp}/events/${gameId}?lang=en&region=us`,
            );
            if (coreResponse.ok) {
              const coreData = await coreResponse.json();
              // Try to read season.$ref or seasonType.$ref which include the league code
              const seasonRef =
                coreData?.season?.$ref ||
                coreData?.seasonType?.$ref ||
                coreData?.$ref;
              if (seasonRef && typeof seasonRef === "string") {
                // seasonRef example: http://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2024?lang=en&region=us
                const match = seasonRef.match(/leagues\/([^\/]+)\/seasons/);
                if (match && match[1]) {
                  detectedHint = match[1];
                  break; // Found the right competition
                }
              }
            }
          }
        } catch (coreErr) {
          // Ignore core API errors and continue with existing heuristics
          console.log("Could not fetch core event resource for hint:", coreErr);
        }
      }

      // Build competition order. If we have a hint, put it first
      let competitionOrder = [
        "fifa.world",
        "fifa.worldq.uefa",
        "fifa.worldq.afc",
        "fifa.worldq.concacaf",
        "fifa.worldq.caf",
        "fifa.worldq.conmebol",
        "fifa.worldq.ofc",
      ];
      const effectiveHint = competitionHint || detectedHint;
      if (effectiveHint) {
        // Normalize hint to a key if it matches one of our known codes
        const normalized = Object.keys(FIFA_COMPETITIONS).find(
          (k) =>
            k === effectiveHint ||
            FIFA_COMPETITIONS[k].name.toLowerCase() ===
              String(effectiveHint).toLowerCase() ||
            k === String(effectiveHint),
        );
        if (normalized) {
          // Place the hinted competition at the front
          competitionOrder = [
            normalized,
            ...competitionOrder.filter((c) => c !== normalized),
          ];
        }
      }

      for (const competition of competitionOrder) {
        try {
          const response = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${gameId}`,
          );
          if (response.ok) {
            const data = await response.json();
            // Add competition information
            data.competitionCode = competition;
            data.competitionName = FIFA_COMPETITIONS[competition].name;
            return data;
          }
        } catch (err) {
          console.log(`Game ${gameId} not found in ${competition}`, err);
        }
      }
      throw new Error(`Game ${gameId} not found in any FIFA competition`);
    } catch (error) {
      console.error("Error fetching FIFA game details:", error);
      throw error;
    }
  },

  // Fetch league standings (for World Cup groups)
  async getStandings(competitionCode = "fifa.world") {
    try {
      // FIFA standings don't use the year parameter like domestic leagues
      const response = await fetch(
        `https://cdn.espn.com/core/soccer/table?xhr=1&league=${competitionCode}`,
      );
      const standingsData = await response.json();

      if (
        !standingsData ||
        !standingsData.content ||
        !standingsData.content.standings ||
        !standingsData.content.standings.groups ||
        standingsData.content.standings.groups.length === 0
      ) {
        throw new Error("No valid standings data available");
      }

      console.log("Found FIFA standings data");
      const data = standingsData;

      // Check if we have the expected structure with multiple groups
      if (
        data.content &&
        data.content.standings &&
        data.content.standings.groups
      ) {
        const groups = data.content.standings.groups;
        console.log(`Found FIFA standings with ${groups.length} groups`);

        // Log the first few entries to see the structure
        if (
          groups.length > 0 &&
          groups[0].standings &&
          groups[0].standings.entries
        ) {
          console.log(
            "First group entries:",
            groups[0].standings.entries.length,
          );
          groups[0].standings.entries.slice(0, 3).forEach((entry, index) => {
            console.log(`Entry ${index + 1}:`, {
              team: entry.team.displayName,
              stats: entry.stats,
              fullEntry: entry,
            });
          });
        }

        // Return all groups for FIFA World Cup format
        return {
          standings: {
            groups: groups, // Keep all groups for World Cup format
          },
        };
      } else {
        console.log("Unexpected FIFA standings structure");
        throw new Error("Unexpected standings structure");
      }
    } catch (error) {
      console.error("Error fetching FIFA standings:", error);
      throw error;
    }
  },

  // Fetch team information
  async getTeam(teamId, competitionCode = "fifa.world") {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${competitionCode}/teams/${teamId}`,
      );
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching FIFA team:", error);
      throw error;
    }
  },

  // Fetch player information
  async getPlayer(playerId) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/players/${playerId}`,
      );
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching FIFA player:", error);
      throw error;
    }
  },

  // Search for teams in FIFA competitions
  async searchTeams(query, competitionCode = "fifa.world") {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${competitionCode}/teams?limit=50`,
      );
      const data = await response.json();

      if (
        data.sports &&
        data.sports[0] &&
        data.sports[0].leagues &&
        data.sports[0].leagues[0]
      ) {
        const teams = data.sports[0].leagues[0].teams;
        return teams.filter((team) =>
          team.team.displayName.toLowerCase().includes(query.toLowerCase()),
        );
      }
      return [];
    } catch (error) {
      console.error("Error searching FIFA teams:", error);
      throw error;
    }
  },

  // Search for players in FIFA competitions
  async searchPlayers(query, competitionCode = "fifa.world") {
    try {
      // Get all teams first
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${competitionCode}/teams`,
      );
      const data = await response.json();

      if (
        !data.sports ||
        !data.sports[0] ||
        !data.sports[0].leagues ||
        !data.sports[0].leagues[0]
      ) {
        return [];
      }

      const teams = data.sports[0].leagues[0].teams;
      const allPlayers = [];

      // Fetch rosters for teams
      const teamPromises = teams.map(async (team) => {
        try {
          const teamId = team.team.id;
          const year = getSoccerYear();
          const response = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${competitionCode}/teams/${teamId}/roster?season=${year}`,
          );
          const rosterData = await response.json();

          if (
            !rosterData ||
            !rosterData.athletes ||
            rosterData.athletes.length === 0
          ) {
            return [];
          }

          if (rosterData.athletes) {
            return rosterData.athletes.map((athlete) => {
              const player = athlete.athlete || athlete;
              let firstName, lastName;

              // Handle name splitting
              if (player.firstName && player.firstName.includes(" ")) {
                const nameParts = player.firstName.split(" ");
                firstName = nameParts[0];
                lastName = nameParts.slice(1).join(" ");
              } else {
                firstName = player.firstName || "Unknown";
                lastName =
                  player.lastName && player.lastName !== player.firstName
                    ? player.lastName
                    : "";
              }

              const displayName = lastName
                ? `${firstName} ${lastName}`.trim()
                : firstName;

              return {
                id: player.id,
                firstName: firstName,
                lastName: lastName,
                displayName: displayName,
                fullName: player.fullName || displayName,
                position:
                  player.position?.abbreviation ||
                  player.position?.name ||
                  "N/A",
                team: team.team.displayName,
                teamAbbr:
                  team.team.abbreviation ||
                  team.team.displayName.substring(0, 3).toUpperCase(),
                teamId: team.team.id,
                jersey: player.jersey || "N/A",
                athlete: player, // Keep original data
              };
            });
          }
          return [];
        } catch (teamError) {
          console.error(
            `Error fetching team ${team.team.displayName}:`,
            teamError,
          );
          return [];
        }
      });

      // Use Promise.allSettled to continue even if some teams fail
      const teamRosters = await Promise.allSettled(teamPromises);

      // Extract successful results and flatten
      teamRosters.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          allPlayers.push(...result.value);
        }
      });

      // Filter players based on query
      if (!query || query.trim() === "") {
        return allPlayers;
      }

      return allPlayers.filter((player) => {
        const fullName = `${player.firstName || ""} ${
          player.lastName || ""
        }`.toLowerCase();
        const displayName = (player.displayName || "").toLowerCase();
        const teamName = (player.team || "").toLowerCase();
        const queryLower = query.toLowerCase();

        return (
          fullName.includes(queryLower) ||
          displayName.includes(queryLower) ||
          teamName.includes(queryLower) ||
          (player.firstName &&
            player.firstName.toLowerCase().includes(queryLower)) ||
          (player.lastName &&
            player.lastName.toLowerCase().includes(queryLower))
        );
      });
    } catch (error) {
      console.error("Error searching FIFA players:", error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  },

  // Get competition details
  getCompetitionInfo() {
    return {
      leagues: FIFA_COMPETITIONS,
      apiCode: "fifa.world",
    };
  },

  // Get league information
  getLeagueInfo() {
    return {
      id: "fifa.world",
      name: "FIFA World Cup",
      fullName: "FIFA World Cup",
      country: "International",
      flag: null, // No single flag for international competition
      apiCode: "fifa.world",
    };
  },

  // Clear all caches
  clearCache() {
    this.logoCache.clear();
    return BaseCacheService.clearCache();
  },
};
