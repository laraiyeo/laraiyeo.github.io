// WBC Service - lightweight wrapper around the backend /wbc endpoints
// Mirrors the pattern used in other services but intentionally lightweight.

const BASE_BACKEND = "https://sportsheart-baseball.up.railway.app"; // replace with your production backend URL

// --------------------- team logo lookup (editable) ---------------------
// Mapping: teamId -> { abbr: string, useMLB: boolean, color?: string }
// Example: 841 -> Italy ("ita", blue)
const TEAM_LOGO_MAP = {
  897: { abbr: "pur", useMLB: false, color: "#CE1126" }, // Puerto Rico
  840: { abbr: "isr", useMLB: false, color: "#0038B8" }, // Israel
  776: { abbr: "bra", useMLB: false, color: "#009C3B" }, // Brazil
  841: { abbr: "ita", useMLB: false, color: "#0057B8" }, // Italy (Azzurri blue)
  843: { abbr: "jpn", useMLB: false, color: "#BC002D" }, // Japan
  784: { abbr: "can", useMLB: false, color: "#FF0000" }, // Canada
  1171: { abbr: "kor", useMLB: false, color: "#C60C30" }, // Korea
  918: { abbr: "rsa", useMLB: false, color: "#007A4D" }, // South Africa
  790: { abbr: "chn", useMLB: false, color: "#DE2910" }, // China
  791: { abbr: "tpe", useMLB: false, color: "#000095" }, // Chinese Taipei
  920: { abbr: "esp", useMLB: false, color: "#AA151B" }, // Spain
  792: { abbr: "col", useMLB: false, color: "#FCD116" }, // Colombia
  798: { abbr: "cub", useMLB: false, color: "#002A8F" }, // Cuba
  800: { abbr: "cze", useMLB: false, color: "#11457E" }, // Czechia
  867: { abbr: "mex", useMLB: false, color: "#006847" }, // Mexico
  805: { abbr: "dom", useMLB: false, color: "#002D62" }, // Dominican Republic
  940: { abbr: "usa", useMLB: false, color: "#3C3B6E" }, // United States
  878: { abbr: "ned", useMLB: false, color: "#FF4F00" }, // Netherlands (Orange)
  815: { abbr: "fra", useMLB: false, color: "#0055A4" }, // France
  880: { abbr: "nzl", useMLB: false, color: "#000000" }, // New Zealand
  944: { abbr: "ven", useMLB: false, color: "#F4C300" }, // Venezuela
  881: { abbr: "nca", useMLB: false, color: "#0067C6" }, // Nicaragua
  819: { abbr: "ger", useMLB: false, color: "#000000" }, // Germany
  757: { abbr: "arg", useMLB: false, color: "#74ACDF" }, // Argentina
  821: { abbr: "gbr", useMLB: false, color: "#012169" }, // Great Britain
  887: { abbr: "pak", useMLB: false, color: "#01411C" }, // Pakistan
  760: { abbr: "aus", useMLB: false, color: "#FFCD00" }, // Australia
  890: { abbr: "pan", useMLB: false, color: "#D21034" }, // Panama
  109: { abbr: "ari", useMLB: true, color: "#A71930" }, // Arizona Diamondbacks
  144: { abbr: "atl", useMLB: true, color: "#CE1141" }, // Atlanta Braves
  110: { abbr: "bal", useMLB: true, color: "#DF4601" }, // Baltimore Orioles
  111: { abbr: "bos", useMLB: true, color: "#BD3039" }, // Boston Red Sox
  112: { abbr: "chc", useMLB: true, color: "#0E3386" }, // Chicago Cubs
  145: { abbr: "cws", useMLB: true, color: "#27251F" }, // Chicago White Sox
  113: { abbr: "cin", useMLB: true, color: "#C6011F" }, // Cincinnati Reds
  114: { abbr: "cle", useMLB: true, color: "#E50022" }, // Cleveland Guardians
  115: { abbr: "col", useMLB: true, color: "#333366" }, // Colorado Rockies
  116: { abbr: "det", useMLB: true, color: "#0C2340" }, // Detroit Tigers
  117: { abbr: "hou", useMLB: true, color: "#002D62" }, // Houston Astros
  118: { abbr: "kc", useMLB: true, color: "#004687" }, // Kansas City Royals
  108: { abbr: "laa", useMLB: true, color: "#BA0021" }, // Los Angeles Angels
  119: { abbr: "lad", useMLB: true, color: "#005A9C" }, // Los Angeles Dodgers
  146: { abbr: "mia", useMLB: true, color: "#00A3E0" }, // Miami Marlins
  158: { abbr: "mil", useMLB: true, color: "#FFC52F" }, // Milwaukee Brewers
  142: { abbr: "min", useMLB: true, color: "#002B5C" }, // Minnesota Twins
  121: { abbr: "nym", useMLB: true, color: "#FF5910" }, // New York Mets
  147: { abbr: "nyy", useMLB: true, color: "#003087" }, // New York Yankees
  133: { abbr: "oak", useMLB: true, color: "#EFB21E" }, // Oakland Athletics
  143: { abbr: "phi", useMLB: true, color: "#E81828" }, // Philadelphia Phillies
  134: { abbr: "pit", useMLB: true, color: "#FDB827" }, // Pittsburgh Pirates
  135: { abbr: "sd", useMLB: true, color: "#2F241D" }, // San Diego Padres
  137: { abbr: "sf", useMLB: true, color: "#FD5A1E" }, // San Francisco Giants
  136: { abbr: "sea", useMLB: true, color: "#005C5C" }, // Seattle Mariners
  138: { abbr: "stl", useMLB: true, color: "#C41E3A" }, // St. Louis Cardinals
  139: { abbr: "tb", useMLB: true, color: "#092C5C" }, // Tampa Bay Rays
  140: { abbr: "tex", useMLB: true, color: "#003278" }, // Texas Rangers
  141: { abbr: "tor", useMLB: true, color: "#134A8E" }, // Toronto Blue Jays
  120: { abbr: "wsh", useMLB: true, color: "#AB0003" }, // Washington Nationals
};

const COUNTRY_LOGO_URL = (abbr) =>
  `https://a.espncdn.com/combiner/i?img=/i/teamlogos/countries/500/${abbr}.png&w=200`;
const MLB_LOGO_URL = (abbr, isDark) =>
  `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/${isDark ? "500-dark" : "500"}/${abbr}.png&w=200`;

function _getTeamLogo(teamId, isDark = true) {
  if (!teamId) return null;
  const key = Number(teamId);
  const m = TEAM_LOGO_MAP[key];
  if (m && m.abbr)
    return m.useMLB ? MLB_LOGO_URL(m.abbr, isDark) : COUNTRY_LOGO_URL(m.abbr);
  return null;
}

function _getTeamColor(teamId) {
  if (!teamId) return null;
  const key = Number(teamId);
  const m = TEAM_LOGO_MAP[key];
  return m && m.color ? m.color : null;
}

function _setTeamLogoMapping(teamId, mapping) {
  if (!teamId || !mapping) return;
  const key = Number(teamId);
  TEAM_LOGO_MAP[key] = { abbr: mapping.abbr, useMLB: !!mapping.useMLB };
}

function _setTeamLogoMappings(mappings) {
  if (!mappings || typeof mappings !== "object") return;
  Object.keys(mappings).forEach((k) => {
    const key = Number(k);
    const m = mappings[k];
    if (m && m.abbr) TEAM_LOGO_MAP[key] = { abbr: m.abbr, useMLB: !!m.useMLB };
  });
}

class WBCService {
  static async fetchJson(path, options = {}) {
    const url = `${BASE_BACKEND}${path}`;
    // Bypass native HTTP cache so auto-poll always gets fresh data
    const res = await fetch(url, {
      ...options,
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...options.headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json();
  }

  static async getScoreboard(date) {
    // date format: YYYYMMDD or YYYYMMDD-YYYYMMDD
    const qs = date ? `?date=${encodeURIComponent(String(date))}` : "";
    return this.fetchJson(`/wbc/games${qs}`);
  }

  static async getTeam(teamId) {
    return this.fetchJson(`/wbc/team/${encodeURIComponent(String(teamId))}`);
  }

  static async getTeamRoster(teamId) {
    return this.fetchJson(
      `/wbc/teamRoster/${encodeURIComponent(String(teamId))}`,
    );
  }

  static async search(q) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.fetchJson(`/wbc/search${qs}`);
  }

  static async getGameFeed(gamePk, format = "json") {
    const qs = format === "msgpack" ? `?format=msgpack` : "";
    return this.fetchJson(
      `/wbc/gameFeed/${encodeURIComponent(String(gamePk))}${qs}`,
    );
  }

  static async getPlayer(code) {
    return this.fetchJson(`/wbc/player/${encodeURIComponent(String(code))}`);
  }

  static async getStandings(leagueId) {
    return this.fetchJson(
      `/wbc/standings/${encodeURIComponent(String(leagueId))}`,
    );
  }

  static async getStats() {
    return this.fetchJson(`/wbc/stats`);
  }

  static async getLeaders() {
    return this.fetchJson(`/wbc/leaders`);
  }

  static async getBracket() {
    return this.fetchJson(`/wbc/bracket`);
  }

  static async getSearch() {
    return this.fetchJson(`/wbc/search`);
  }

  // --- runtime-editable logo helpers (wrap internal functions) ---
  static getTeamLogo(teamId, isDark = true) {
    return _getTeamLogo(teamId, isDark);
  }

  static getTeamColor(teamId) {
    return _getTeamColor(teamId);
  }

  static getTeamAbbr(teamId) {
    if (!teamId) return "";
    const key = Number(teamId);
    const m = TEAM_LOGO_MAP[key];
    return m && m.abbr ? m.abbr.toUpperCase() : "";
  }

  static setTeamLogoMapping(teamId, mapping) {
    return _setTeamLogoMapping(teamId, mapping);
  }

  static setTeamLogoMappings(mappings) {
    return _setTeamLogoMappings(mappings);
  }
}

export default WBCService;
