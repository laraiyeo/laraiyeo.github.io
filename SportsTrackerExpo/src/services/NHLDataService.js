// Shared NHL data service for caching teams and players across screens

import { BaseCacheService } from "./BaseCacheService";
import NHLService from "./NHLService";

class NHLDataService extends BaseCacheService {
  constructor() {
    super();
    this.teamsCache = null;
    this.playersCache = null;
    this.isInitializing = false;
    this.initPromise = null;
    this.listeners = new Set();
  }

  // Add listener for data updates
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Notify all listeners of data changes
  notifyListeners() {
    this.listeners.forEach((callback) =>
      callback({
        teamsCache: this.teamsCache,
        playersCache: this.playersCache,
        isInitializing: this.isInitializing,
      }),
    );
  }

  // Get cached data
  getData() {
    return {
      teamsCache: this.teamsCache,
      playersCache: this.playersCache,
      isInitializing: this.isInitializing,
    };
  }

  // Initialize data if not already cached
  async initializeData() {
    // If already initialized, return cached data
    if (this.teamsCache && this.playersCache) {
      console.log(
        "NHLDataService: Data already cached, returning existing data",
      );
      return this.getData();
    }

    // If already initializing, wait for that to complete
    if (this.isInitializing && this.initPromise) {
      console.log(
        "NHLDataService: Already initializing, waiting for completion",
      );
      return await this.initPromise;
    }

    console.log("NHLDataService: Starting data initialization...");

    // Start initialization
    this.isInitializing = true;
    this.notifyListeners();

    this.initPromise = this._fetchData();

    try {
      await this.initPromise;
      return this.getData();
    } finally {
      this.isInitializing = false;
      this.notifyListeners();
    }
  }

  async _fetchData() {
    try {
      const headers = this.constructor.getBrowserHeaders();
      const response = await fetch(`${NHLService.BACKEND_URL}/nhl/search`, {
        headers,
      });
      if (!response.ok) {
        throw new Error(`NHL search fetch failed (${response.status})`);
      }

      const data = await response.json();
      const teamsRaw = Array.isArray(data?.teams) ? data.teams : [];
      const playersRaw = Array.isArray(data?.players) ? data.players : [];

      const teams = teamsRaw.map((team) => {
        const teamAbbrev = String(team?.teamAbbrev || "").toUpperCase();
        const teamName = String(team?.teamName || teamAbbrev || "NHL Team");
        const location = teamName.split(" ").slice(0, -1).join(" ") || teamName;
        const rawTeamLogo = team?.teamLogo;
        const teamLogoLight =
          typeof rawTeamLogo === "string"
            ? rawTeamLogo
            : String(
                rawTeamLogo?.light ||
                  rawTeamLogo?.default ||
                  rawTeamLogo?.src ||
                  "",
              );
        const teamLogoDark =
          rawTeamLogo && typeof rawTeamLogo === "object"
            ? String(rawTeamLogo?.dark || "")
            : "";
        const fallbackLogo = teamAbbrev
          ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nhl/500/${teamAbbrev}.png&w=200&h=200`
          : "";

        return {
          id: teamAbbrev || teamName,
          teamAbbrev,
          teamName,
          displayName: teamName,
          name: teamName,
          location,
          teamLogo: teamLogoLight || teamLogoDark || fallbackLogo,
          teamLogoLight,
          teamLogoDark,
        };
      });

      const players = playersRaw.map((player) => {
        const playerId = Number(player?.playerId);
        const teamAbbrev = String(player?.teamAbbrev || "").toUpperCase();
        const positionCode = String(player?.positionCode || "").toUpperCase();
        const positionDisplayName =
          positionCode === "G"
            ? "Goalie"
            : positionCode === "C"
              ? "Center"
              : positionCode === "D"
                ? "Defenseman"
                : positionCode === "L"
                  ? "Left Wing"
                  : positionCode === "R"
                    ? "Right Wing"
                    : "Player";

        return {
          id: playerId,
          playerId,
          displayName: player?.name || "Player",
          name: player?.name || "Player",
          teamAbbrev,
          positionCode,
          position: {
            name: positionDisplayName,
            displayName: positionDisplayName,
          },
          team: {
            id: teamAbbrev,
            abbreviation: teamAbbrev,
            displayName: teamAbbrev,
            name: teamAbbrev,
            color: NHLService.getTeamColor(teamAbbrev, "#888888"),
          },
        };
      });

      this.teamsCache = teams;
      this.playersCache = players;
      console.log(
        `NHL Data Service: Loaded ${teams.length} teams and ${players.length} players`,
      );
    } catch (error) {
      console.error("Error initializing NHL data:", error);
      throw error;
    }
  }

  // Search teams
  searchTeams(query) {
    if (!this.teamsCache) return [];

    const q = String(query || "")
      .toLowerCase()
      .trim();
    return this.teamsCache.filter((team) => {
      const name = String(team?.displayName || "").toLowerCase();
      const abbr = String(team?.teamAbbrev || "").toLowerCase();
      return name.includes(q) || abbr.includes(q);
    });
  }

  // Search players
  searchPlayers(query) {
    if (!this.playersCache) return [];

    const q = String(query || "")
      .toLowerCase()
      .trim();
    return this.playersCache.filter((player) => {
      const name = String(player?.displayName || "").toLowerCase();
      const teamAbbrev = String(player?.teamAbbrev || "").toLowerCase();
      const pos = String(player?.positionCode || "").toLowerCase();
      return name.includes(q) || teamAbbrev.includes(q) || pos.includes(q);
    });
  }

  // Get all players (for compare screen)
  getAllPlayers() {
    return this.playersCache || [];
  }

  // Get all teams
  getAllTeams() {
    return this.teamsCache || [];
  }

  // Check if data is fully loaded
  isDataFullyLoaded() {
    return this.teamsCache && this.playersCache && !this.isInitializing;
  }

  // Clear cache (for testing or refresh)
  clearCache() {
    this.teamsCache = null;
    this.playersCache = null;
    this.isInitializing = false;
    this.initPromise = null;
    this.notifyListeners();
    // Also clear parent cache
    super.clearCache();
  }

  // NHL-specific position grouping
  getPositionGroup(position) {
    if (!position) return "unknown";

    const pos = position.toLowerCase();

    // Forwards
    if (pos.includes("center") || pos === "c") return "forward";
    if (pos.includes("left wing") || pos === "lw") return "forward";
    if (pos.includes("right wing") || pos === "rw") return "forward";
    if (pos.includes("wing")) return "forward";
    if (pos.includes("forward")) return "forward";

    // Defensemen
    if (pos.includes("defense") || pos === "d") return "defenseman";
    if (pos.includes("defenseman")) return "defenseman";

    // Goalies
    if (pos.includes("goalie") || pos === "g") return "goalie";
    if (pos.includes("goaltender")) return "goalie";

    return "unknown";
  }

  // Check if two players can be compared (same position group)
  canCompare(player1, player2) {
    if (!player1 || !player2) return false;

    const pos1 = this.getPositionGroup(
      player1.position?.displayName || player1.position?.name,
    );
    const pos2 = this.getPositionGroup(
      player2.position?.displayName || player2.position?.name,
    );

    return pos1 === pos2 && pos1 !== "unknown";
  }
}

// Export singleton instance
export default new NHLDataService();
