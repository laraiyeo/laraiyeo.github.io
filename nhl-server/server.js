const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");

const app = express();
app.use(cors());
app.use(compression());

const PORT = process.env.PORT || 3000;
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const PLAYER_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const STANDINGS_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map();
const INTERVAL_PRE_FAR = 60 * 60 * 1000; // > 1h 5m before start
const INTERVAL_PRE_MEDIUM = 10 * 60 * 1000; // 1h 5m -> 5m before start
const INTERVAL_PRE_SOON = 30 * 1000; // <= 5m before start
const INTERVAL_LIVE = 5 * 1000; // at/after start or live
const PRE_MEDIUM_THRESHOLD = 65 * 60 * 1000; // 1h 5m
const PRE_SOON_THRESHOLD = 5 * 60 * 1000; // 5m

const URLS = {
  player: {
    gameLog: "https://api-web.nhle.com/v1/player/:id/game-log/now",
    landing: "https://api-web.nhle.com/v1/player/:id/landing",
    edgeSkater: "https://api-web.nhle.com/v1/edge/skater-detail/:id/now",
    edgeGoalie: "https://api-web.nhle.com/v1/edge/goalie-detail/:id/now",
  },
  team: {
    stats: "https://api-web.nhle.com/v1/club-stats/:id/20252026/2",
    schedule: "https://api-web.nhle.com/v1/club-schedule-season/:id/now",
    roster: "https://api-web.nhle.com/v1/roster/:id/20252026",
  },
  game: {
    landing: "https://api-web.nhle.com/v1/gamecenter/:id/landing",
    rightRail: "https://api-web.nhle.com/v1/gamecenter/:id/right-rail",
    boxscore: "https://api-web.nhle.com/v1/gamecenter/:id/boxscore",
    playByPlay: "https://api-web.nhle.com/v1/gamecenter/:id/play-by-play",
    shifts:
      "https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=:id%20and%20((duration%20!=%20%2700:00%27%20and%20typeCode%20=%20517)%20or%20typeCode%20!=%20517%20)&exclude=detailCode&exclude=duration&exclude=eventDetails&exclude=teamAbbrev&exclude=teamName",
  },
  scoreboard: "https://api-web.nhle.com/v1/score/:date",
  standings: "https://api-web.nhle.com/v1/standings/now",
  search:
    "https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20000&q=%2A&active=true",
  playerStats: {
    1: "https://api.nhle.com/stats/rest/en/leaders/goalies/gaa?cayenneExp=season=20252026%20and%20gameType=2%20and%20gamesPlayed%20%3E=%2024",
    2: "https://api.nhle.com/stats/rest/en/leaders/skaters/assists?cayenneExp=season=20252026%20and%20gameType=2%20and%20isRookie%20=%20%27Y%27",
    3: "https://api.nhle.com/stats/rest/en/leaders/skaters/goals?cayenneExp=season=20252026%20and%20gameType=2%20and%20isRookie%20=%20%27Y%27",
    4: "https://api.nhle.com/stats/rest/en/leaders/skaters/points?cayenneExp=season=20252026%20and%20gameType=2%20and%20isRookie%20=%20%27Y%27",
    8: "https://api.nhle.com/stats/rest/en/leaders/goalies/shutouts?cayenneExp=season=20252026%20and%20gameType=2%20and%20gamesPlayed%20%3E=%2024",
    9: "https://api.nhle.com/stats/rest/en/leaders/goalies/savePctg?cayenneExp=season=20252026%20and%20gameType=2%20and%20gamesPlayed%20%3E=%2024",
    10: "https://api.nhle.com/stats/rest/en/leaders/skaters/assists?cayenneExp=season=20252026%20and%20gameType=2",
    11: "https://api.nhle.com/stats/rest/en/leaders/skaters/goals?cayenneExp=season=20252026%20and%20gameType=2",
    12: "https://api.nhle.com/stats/rest/en/leaders/skaters/points?cayenneExp=season=20252026%20and%20gameType=2",
    13: "https://api-web.nhle.com/v1/edge/skater-zone-time-top-10/all/all/offensive/20252026/2",
    14: "https://api-web.nhle.com/v1/edge/skater-shot-location-top-10/all/sog/all/20252026/2",
    15: "https://api-web.nhle.com/v1/edge/skater-distance-top-10/all/all/total/20252026/2",
    16: "https://api-web.nhle.com/v1/edge/skater-speed-top-10/all/max/20252026/2",
    17: "https://api-web.nhle.com/v1/edge/skater-shot-speed-top-10/all/max/20252026/2",
    18: "https://api-web.nhle.com/v1/edge/goalie-edge-save-pctg-top-10/games/20252026/2",
    19: "https://api-web.nhle.com/v1/edge/goalie-5v5-top-10/save-pctg/20252026/2",
    20: "https://api-web.nhle.com/v1/edge/goalie-shot-location-top-10/save-pctg/all/20252026/2",
  },
  teamStats: {
    1: "https://api-web.nhle.com/v1/edge/team-zone-time-top-10/all/offensive/20252026/2",
    2: "https://api-web.nhle.com/v1/edge/team-shot-location-top-10/all/sog/all/20252026/2",
    3: "https://api-web.nhle.com/v1/edge/team-skating-distance-top-10/all/all/total/20252026/2",
    4: "https://api-web.nhle.com/v1/edge/team-skating-speed-top-10/all/max/20252026/2",
    5: "https://api-web.nhle.com/v1/edge/team-shot-speed-top-10/all/max/20252026/2",
  },
};

function setCachingHeaders(res, ttlMs = TTL_MS) {
  const secs = Math.max(0, Math.floor(ttlMs / 1000));
  res.setHeader("Cache-Control", `public, max-age=${secs}`);
}

function expandUrl(template, params = {}) {
  let out = template;
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`:${k}`, encodeURIComponent(String(v)));
  }
  return out;
}

async function getCachedJson(cacheKey, url) {
  return getCachedJsonWithTtl(cacheKey, url, TTL_MS);
}

async function getCachedJsonWithTtl(cacheKey, url, ttlMs) {
  const entry = cache.get(cacheKey);
  if (entry && Date.now() - entry.fetchedAt < ttlMs) {
    return { data: entry.data, fromCache: true, url };
  }

  const response = await axios.get(url, { timeout: 15000 });
  cache.set(cacheKey, { data: response.data, fetchedAt: Date.now() });
  return { data: response.data, fromCache: false, url };
}

function normalizeScoreboardDateParam(rawDate) {
  const raw = String(rawDate || "").trim();
  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return null;
}

function getDarkLogoFromLight(logoUrl) {
  const logo = String(logoUrl || "");
  if (!logo) return "";
  return logo.replace("_light.svg", "_dark.svg");
}

function pickDefaultName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value.default ?? value.en ?? null;
  }
  return null;
}

function getNhlSeasonSpan(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  // Sep-Dec: YYYYYYYY+1 (ex: 20262027), Jan-Aug: YYYY-1YYYY (ex: 20252026)
  return month >= 8 ? `${year}${year + 1}` : `${year - 1}${year}`;
}

function applyNhlSeasonSpan(url, seasonSpan = getNhlSeasonSpan()) {
  return String(url || "").replaceAll("20252026", seasonSpan);
}

function toDarkLogo(url) {
  const raw = String(url || "");
  if (!raw) return "";
  return raw.replace("light", "dark");
}

function normalizePossiblyMojibakeName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // Common UTF-8->Latin1 mojibake markers (e.g. "RÃ¤ty").
  if (!/[ÃÂâ]/.test(raw)) return raw;

  try {
    const repaired = Buffer.from(raw, "latin1").toString("utf8").trim();
    return repaired || raw;
  } catch {
    return raw;
  }
}

function transformPlayerInfoPayload(payload) {
  const seasonTotals = (
    Array.isArray(payload?.seasonTotals) ? payload.seasonTotals : []
  ).map((s) => {
    const {
      teamCommonName: _teamCommonName,
      teamPlaceNameWithPreposition: _teamPlaceNameWithPreposition,
      ...rest
    } = s || {};
    return {
      ...rest,
      teamName: pickDefaultName(s?.teamName),
    };
  });

  const awards = (Array.isArray(payload?.awards) ? payload.awards : []).map(
    (a) => ({
      trophy: pickDefaultName(a?.trophy),
      seasons: (Array.isArray(a?.seasons) ? a.seasons : []).map((s) => ({
        seasonId: s?.seasonId ?? null,
      })),
    }),
  );

  return {
    playerId: payload?.playerId ?? null,
    isActive: payload?.isActive ?? false,
    currentTeamId: payload?.currentTeamId ?? null,
    currentTeamAbbrev: payload?.currentTeamAbbrev ?? null,
    fullTeamName: pickDefaultName(payload?.fullTeamName),
    firstName: pickDefaultName(payload?.firstName),
    lastName: pickDefaultName(payload?.lastName),
    badges: Array.isArray(payload?.badges) ? payload.badges : [],
    teamLogoLight: payload?.teamLogo ?? "",
    teamLogoDark: toDarkLogo(payload?.teamLogo),
    sweaterNumber: payload?.sweaterNumber ?? null,
    position: payload?.position ?? null,
    headshot: payload?.headshot ?? null,
    heightInInches: payload?.heightInInches ?? null,
    weightInPounds: payload?.weightInPounds ?? null,
    birthDate: payload?.birthDate ?? null,
    birthCity: pickDefaultName(payload?.birthCity),
    birthStateProvince: pickDefaultName(payload?.birthStateProvince),
    birthCountry: payload?.birthCountry ?? null,
    shootsCatches: payload?.shootsCatches ?? null,
    draftDetails: {
      year: payload?.draftDetails?.year ?? null,
      teamAbbrev: payload?.draftDetails?.teamAbbrev ?? null,
      round: payload?.draftDetails?.round ?? null,
      pickInRound: payload?.draftDetails?.pickInRound ?? null,
      overallPick: payload?.draftDetails?.overallPick ?? null,
    },
    featuredStats: payload?.featuredStats ?? {},
    careerTotals: payload?.careerTotals ?? {},
    seasonTotals,
    awards,
  };
}

function transformPlayerGameLogPayload(payload) {
  return {
    seasonId: payload?.seasonId ?? null,
    gameTypeId: payload?.gameTypeId ?? null,
    gameLog: (Array.isArray(payload?.gameLog) ? payload.gameLog : []).map(
      (g) => ({
        ...g,
        commonName: pickDefaultName(g?.commonName),
        opponentCommonName: pickDefaultName(g?.opponentCommonName),
      }),
    ),
  };
}

function transformPlayerEdgeStatsPayload(payload) {
  const {
    player: _player,
    seasonsWithEdgeStats: _seasons,
    ...rest
  } = payload || {};
  return rest;
}

function transformTeamStatsPayload(payload) {
  const mapRows = (rows) =>
    (Array.isArray(rows) ? rows : []).map((row) => {
      const {
        firstName: _firstName,
        lastName: _lastName,
        headshot: _headshot,
        ...rest
      } = row || {};
      return {
        playerId: row?.playerId ?? null,
        ...rest,
      };
    });

  return {
    skaters: mapRows(payload?.skaters),
    goalies: mapRows(payload?.goalies),
  };
}

function transformTeamSchedulePayload(payload) {
  return {
    currentSeason: payload?.currentSeason ?? null,
    games: (Array.isArray(payload?.games) ? payload.games : []).map((g) => ({
      id: g?.id ?? null,
      gameType: g?.gameType ?? null,
      gameDate: g?.gameDate ?? null,
      venue: pickDefaultName(g?.venue),
      startTimeUTC: g?.startTimeUTC ?? null,
      gameState: g?.gameState ?? null,
      gameScheduledState: g?.gameScheduleState ?? null,
      awayTeam: {
        id: g?.awayTeam?.id ?? null,
        commonName: pickDefaultName(g?.awayTeam?.commonName),
        abbrev: g?.awayTeam?.abbrev ?? null,
        logo: g?.awayTeam?.logo ?? "",
        darkLogo:
          g?.awayTeam?.darkLogo ?? getDarkLogoFromLight(g?.awayTeam?.logo),
        score: g?.awayTeam?.score ?? null,
      },
      homeTeam: {
        id: g?.homeTeam?.id ?? null,
        commonName: pickDefaultName(g?.homeTeam?.commonName),
        abbrev: g?.homeTeam?.abbrev ?? null,
        logo: g?.homeTeam?.logo ?? "",
        darkLogo:
          g?.homeTeam?.darkLogo ?? getDarkLogoFromLight(g?.homeTeam?.logo),
        score: g?.homeTeam?.score ?? null,
      },
      gameOutcome: {
        periodType: g?.gameOutcome?.lastPeriodType ?? null,
      },
    })),
  };
}

function transformTeamRosterPayload(payload) {
  const mapPlayers = (rows) =>
    (Array.isArray(rows) ? rows : []).map((p) => ({
      id: p?.id ?? null,
      headshot: p?.headshot ?? null,
      firstName: pickDefaultName(p?.firstName),
      lastName: pickDefaultName(p?.lastName),
      sweaterNumber: p?.sweaterNumber ?? null,
      positionCode: p?.positionCode ?? null,
      shootsCatches: p?.shootsCatches ?? null,
      heightInInches: p?.heightInInches ?? null,
      heightInCentimeters: p?.heightInCentimeters ?? null,
      birthDate: p?.birthDate ?? null,
      birthCity: pickDefaultName(p?.birthCity),
      birthCountry: p?.birthCountry ?? null,
    }));

  return {
    forwards: mapPlayers(payload?.forwards),
    defensemen: mapPlayers(payload?.defensemen),
    goalies: mapPlayers(payload?.goalies),
  };
}

const PLAYER_STATS_BASIC_IDS = new Set([1, 2, 3, 4, 8, 9, 10, 11, 12]);
const PLAYER_STATS_EDGE_IDS = new Set([13, 14, 15, 16, 17, 18, 19, 20]);

function transformBasicPlayerStatsRow(row) {
  const {
    player: _player,
    team: _team,
    playerId: _playerId,
    playerName: _playerName,
    firstName: _firstName,
    lastName: _lastName,
    positionCode: _positionCode,
    position: _position,
    sweaterNumber: _sweaterNumber,
    teamId: _teamId,
    teamName: _teamName,
    teamFullName: _teamFullName,
    teamAbbrev: _teamAbbrev,
    teamTriCode: _teamTriCode,
    rawTricode: _rawTricode,
    ...rest
  } = row || {};

  const first = pickDefaultName(row?.firstName);
  const last = pickDefaultName(row?.lastName);
  const fullNameFromParts = [first, last].filter(Boolean).join(" ").trim();

  return {
    ...rest,
    player: {
      id: row?.player?.id ?? row?.playerId ?? null,
      fullName:
        row?.player?.fullName ?? row?.playerName ?? (fullNameFromParts || null),
      positionCode:
        row?.player?.positionCode ?? row?.positionCode ?? row?.position ?? null,
      sweaterNumber: row?.player?.sweaterNumber ?? row?.sweaterNumber ?? null,
    },
    team: {
      id: row?.team?.id ?? row?.teamId ?? null,
      fullName:
        row?.team?.fullName ?? row?.teamName ?? row?.teamFullName ?? null,
      rawTricode:
        row?.team?.rawTricode ?? row?.rawTricode ?? row?.teamAbbrev ?? null,
      triCode:
        row?.team?.triCode ?? row?.teamTriCode ?? row?.teamAbbrev ?? null,
    },
  };
}

function transformEdgePlayerStatsRow(row) {
  const playerSrc = row?.player || {};
  const teamSrc = playerSrc?.team || row?.team || {};
  const lightLogo =
    teamSrc?.teamLogo?.light ??
    row?.teamLogo ??
    row?.logo ??
    playerSrc?.teamLogo ??
    "";

  const {
    player: _player,
    firstName: _firstName,
    lastName: _lastName,
    headshot: _headshot,
    position: _position,
    positionCode: _positionCode,
    sweaterNumber: _sweaterNumber,
    team: _team,
    teamCommonName: _teamCommonName,
    teamPlaceNameWithPreposition: _teamPlaceNameWithPreposition,
    teamAbbrev: _teamAbbrev,
    teamLogo: _teamLogo,
    logo: _logo,
    ...rest
  } = row || {};

  return {
    ...rest,
    player: {
      firstName: pickDefaultName(playerSrc?.firstName ?? row?.firstName),
      lastName: pickDefaultName(playerSrc?.lastName ?? row?.lastName),
      headshot: playerSrc?.headshot ?? row?.headshot ?? null,
      position:
        playerSrc?.position ?? row?.position ?? row?.positionCode ?? null,
      sweaterNumber: playerSrc?.sweaterNumber ?? row?.sweaterNumber ?? null,
      team: {
        commonName: pickDefaultName(teamSrc?.commonName ?? row?.teamCommonName),
        placeNameWithPreposition: pickDefaultName(
          teamSrc?.placeNameWithPreposition ??
            row?.teamPlaceNameWithPreposition,
        ),
        abbreviation:
          teamSrc?.abbreviation ?? teamSrc?.abbrev ?? row?.teamAbbrev ?? null,
        teamLogo: {
          light: lightLogo,
          dark: teamSrc?.teamLogo?.dark ?? getDarkLogoFromLight(lightLogo),
        },
      },
    },
  };
}

function transformPlayerStatsPayloadById(id, payload) {
  if (PLAYER_STATS_BASIC_IDS.has(id)) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return {
      ...payload,
      data: rows.map(transformBasicPlayerStatsRow),
    };
  }

  if (PLAYER_STATS_EDGE_IDS.has(id)) {
    if (Array.isArray(payload)) {
      return payload.map(transformEdgePlayerStatsRow);
    }

    if (Array.isArray(payload?.data)) {
      return {
        ...payload,
        data: payload.data.map(transformEdgePlayerStatsRow),
      };
    }

    return payload;
  }

  return payload;
}

function toTransformedTeamStatsEntry(entry) {
  const sourceTeam = entry?.teams || entry?.team || null;
  const {
    teams: _teams,
    team: _team,
    commonName: _commonName,
    placeNameWithPreposition: _placeNameWithPreposition,
    abbrev: _abbrev,
    teamLogo: _teamLogo,
    ...rest
  } = entry || {};

  return {
    ...rest,
    teams: {
      commonName: pickDefaultName(sourceTeam?.commonName),
      placeNameWithPreposition: pickDefaultName(
        sourceTeam?.placeNameWithPreposition,
      ),
      abbrev: sourceTeam?.abbrev ?? null,
      teamLogo: {
        light:
          sourceTeam?.teamLogo?.light ??
          sourceTeam?.logo ??
          sourceTeam?.teamLogo ??
          "",
        dark:
          sourceTeam?.teamLogo?.dark ??
          getDarkLogoFromLight(
            sourceTeam?.teamLogo?.light ??
              sourceTeam?.logo ??
              sourceTeam?.teamLogo,
          ),
      },
    },
  };
}

function transformTeamStatsPayloadById(payload) {
  if (Array.isArray(payload)) {
    return payload.map(toTransformedTeamStatsEntry);
  }

  if (Array.isArray(payload?.data)) {
    return {
      ...payload,
      data: payload.data.map(toTransformedTeamStatsEntry),
    };
  }

  return toTransformedTeamStatsEntry(payload);
}

function transformSearchPlayersPayload(playersPayload) {
  const rows = Array.isArray(playersPayload) ? playersPayload : [];
  return rows.map((p) => ({
    playerId: p?.playerId ?? p?.id ?? null,
    name: p?.name ?? p?.fullName ?? null,
    positionCode: p?.positionCode ?? p?.position ?? null,
    teamAbbrev: p?.teamAbbrev ?? p?.teamAbbrevDefault ?? null,
  }));
}

function transformSearchTeamsFromStandings(standingsPayload) {
  const rows = Array.isArray(standingsPayload?.standings)
    ? standingsPayload.standings
    : [];
  const seen = new Set();
  const teams = [];

  for (const team of rows) {
    const teamAbbrev = pickDefaultName(team?.teamAbbrev);
    const key = String(teamAbbrev || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);

    teams.push({
      teamName: pickDefaultName(team?.teamName),
      teamAbbrev,
      teamLogo: team?.teamLogo ?? "",
    });
  }

  return teams;
}

function getPregamePollingInterval(msUntilStart) {
  if (!Number.isFinite(msUntilStart)) return INTERVAL_PRE_FAR;
  if (msUntilStart > PRE_MEDIUM_THRESHOLD) return INTERVAL_PRE_FAR;
  if (msUntilStart > PRE_SOON_THRESHOLD) return INTERVAL_PRE_MEDIUM;
  if (msUntilStart >= 0) return INTERVAL_PRE_SOON;
  return INTERVAL_LIVE;
}

function getGamePollingInterval(landingPayload) {
  const state = String(landingPayload?.gameState || "").toUpperCase();
  const startMs = Date.parse(String(landingPayload?.startTimeUTC || ""));
  const nowMs = Date.now();

  const isLive = state === "LIVE" || state === "CRIT" || state === "IN";
  if (isLive) return INTERVAL_LIVE;

  const isFinal = state === "OFF" || state === "FINAL" || state === "OVER";
  if (isFinal) return INTERVAL_PRE_FAR;

  const isScheduled = state === "FUT" || state === "PRE";
  if (isScheduled && Number.isFinite(startMs)) {
    return getPregamePollingInterval(startMs - nowMs);
  }

  if (Number.isFinite(startMs)) {
    return getPregamePollingInterval(startMs - nowMs);
  }

  if (state && !isFinal) return INTERVAL_LIVE;

  return INTERVAL_PRE_FAR;
}

function transformLandingPayload(payload) {
  const summary = payload?.summary || {};
  const matchup = payload?.matchup || {};

  const mapIceSurfaceTeam = (team) => ({
    forwards: Array.isArray(team?.forwards)
      ? team.forwards.map((p) => ({ playerId: p?.playerId ?? null }))
      : [],
    defensemen: Array.isArray(team?.defensemen)
      ? team.defensemen.map((p) => ({ playerId: p?.playerId ?? null }))
      : [],
    goalies: Array.isArray(team?.goalies)
      ? team.goalies.map((p) => ({ playerId: p?.playerId ?? null }))
      : [],
    penaltyBox: Array.isArray(team?.penaltyBox)
      ? team.penaltyBox.map((p) => ({ playerId: p?.playerId ?? null }))
      : [],
  });

  const scoring = Array.isArray(summary?.scoring)
    ? summary.scoring.map((s) => ({
        periodDescriptor: {
          number: s?.periodDescriptor?.number ?? null,
          periodType: s?.periodDescriptor?.periodType ?? null,
        },
        goals: Array.isArray(s?.goals)
          ? s.goals.map((g) => ({
              strength: g?.strength ?? null,
              playerId: g?.playerId ?? null,
              firstName: pickDefaultName(g?.firstName),
              lastName: pickDefaultName(g?.lastName),
              name: pickDefaultName(g?.name),
              teamAbbrev: pickDefaultName(g?.teamAbbrev),
              headshot: g?.headshot ?? null,
              awayScore: g?.awayScore ?? null,
              homeScore: g?.homeScore ?? null,
              timeInPeriod: g?.timeInPeriod ?? null,
              shotType: g?.shotType ?? null,
              goalModifier: g?.goalModifier ?? null,
              assists: Array.isArray(g?.assists)
                ? g.assists.map((a) => ({
                    playerId: a?.playerId ?? null,
                    firstName: pickDefaultName(a?.firstName),
                    lastName: pickDefaultName(a?.lastName),
                    name: pickDefaultName(a?.name),
                  }))
                : [],
            }))
          : [],
      }))
    : [];

  const threeStars = Array.isArray(summary?.threeStars)
    ? summary.threeStars.map((s) => ({
        star: s?.star ?? null,
        playerId: s?.playerId ?? null,
        teamAbbrev: s?.teamAbbrev ?? null,
        headshot: s?.headshot ?? null,
        name: pickDefaultName(s?.name),
        sweaterNo: s?.sweaterNo ?? null,
        position: s?.position ?? null,
        goals: s?.goals ?? null,
        assists: s?.assists ?? null,
        points: s?.points ?? null,
        goalsAgainstAverage: s?.goalsAgainstAverage ?? null,
        savePctg: s?.savePctg ?? null,
      }))
    : [];

  const penaltiesByPeriod = Array.isArray(summary?.penalties)
    ? summary.penalties
    : [];
  const penalties = penaltiesByPeriod.map((periodBucket) => {
    const bucketPenalties = Array.isArray(periodBucket?.penalties)
      ? periodBucket.penalties
      : [];
    return {
      periodDescriptor: {
        number: periodBucket?.periodDescriptor?.number ?? null,
        periodType: periodBucket?.periodDescriptor?.periodType ?? null,
      },
      penalties: bucketPenalties.map((p) => ({
        timeInPeriod: p?.timeInPeriod ?? null,
        type: p?.type ?? null,
        duration: p?.duration ?? null,
        committedByPlayer: {
          firstName: pickDefaultName(p?.committedByPlayer?.firstName),
          lastName: pickDefaultName(p?.committedByPlayer?.lastName),
        },
        teamAbbrev: pickDefaultName(p?.teamAbbrev),
        drawnBy: {
          firstName: pickDefaultName(p?.drawnBy?.firstName),
          lastName: pickDefaultName(p?.drawnBy?.lastName),
        },
        descKey: p?.descKey ?? null,
      })),
    };
  });

  const shootout = {
    liveScore: {
      home: summary?.shootout?.liveScore?.home ?? null,
      away: summary?.shootout?.liveScore?.away ?? null,
    },
    events: Array.isArray(summary?.shootout?.events)
      ? summary.shootout.events.map((event) => ({
          sequence: event?.sequence ?? null,
          playerId: event?.playerId ?? null,
          teamAbbrev: {
            default: pickDefaultName(event?.teamAbbrev),
          },
          firstName: {
            default: pickDefaultName(event?.firstName),
          },
          lastName: {
            default: pickDefaultName(event?.lastName),
          },
          shotType: event?.shotType ?? null,
          result: event?.result ?? null,
          homeScore: event?.homeScore ?? null,
          awayScore: event?.awayScore ?? null,
        }))
      : [],
  };

  const skaterComparisonLeaders = Array.isArray(
    matchup?.skaterComparison?.leaders,
  )
    ? matchup.skaterComparison.leaders
    : [];

  const mapSkaterLeader = (leader) => ({
    playerId: leader?.playerId ?? null,
    firstName: pickDefaultName(leader?.firstName),
    lastName: pickDefaultName(leader?.lastName),
    sweaterNumber: leader?.sweaterNumber ?? null,
    positionCode: leader?.positionCode ?? null,
    headshot: leader?.headshot ?? null,
    value: leader?.value ?? null,
  });

  const mapGoalieLeader = (leader) => ({
    playerId: leader?.playerId ?? null,
    firstName: pickDefaultName(leader?.firstName),
    lastName: pickDefaultName(leader?.lastName),
    sweaterNumber: leader?.sweaterNumber ?? null,
    positionCode: leader?.positionCode ?? null,
    headshot: leader?.headshot ?? null,
    gamesPlayed: leader?.gamesPlayed ?? null,
    seasonPoints: leader?.seasonPoints ?? null,
    record: leader?.record ?? null,
    gaa: leader?.gaa ?? null,
    savePcts: leader?.savePcts ?? leader?.savePctg ?? null,
    shutouts: leader?.shutouts ?? null,
  });

  const skaterSeasonStats = Array.isArray(matchup?.skaterSeasonStats?.skaters)
    ? matchup.skaterSeasonStats.skaters
    : [];

  const goalieSeasonStats = Array.isArray(matchup?.goalieSeasonStats?.goalies)
    ? matchup.goalieSeasonStats.goalies
    : [];

  return {
    id: payload?.id ?? null,
    gameType: payload?.gameType ?? null,
    gameDate: payload?.gameDate ?? null,
    venue: pickDefaultName(payload?.venue),
    venueLocation: pickDefaultName(payload?.venueLocation),
    startTimeUTC: payload?.startTimeUTC ?? null,
    periodDescriptor: {
      number: payload?.periodDescriptor?.number ?? null,
      periodType: payload?.periodDescriptor?.periodType ?? null,
    },
    gameState: payload?.gameState ?? null,
    gameScheduleState: payload?.gameScheduleState ?? null,
    awayTeam: {
      id: payload?.awayTeam?.id ?? null,
      commonName: pickDefaultName(payload?.awayTeam?.commonName),
      abbrev: payload?.awayTeam?.abbrev ?? null,
      placeName: pickDefaultName(payload?.awayTeam?.placeName),
      score: payload?.awayTeam?.score ?? null,
      logo: payload?.awayTeam?.logo ?? null,
      darkLogo:
        payload?.awayTeam?.darkLogo ??
        getDarkLogoFromLight(payload?.awayTeam?.logo),
    },
    homeTeam: {
      id: payload?.homeTeam?.id ?? null,
      commonName: pickDefaultName(payload?.homeTeam?.commonName),
      abbrev: payload?.homeTeam?.abbrev ?? null,
      placeName: pickDefaultName(payload?.homeTeam?.placeName),
      score: payload?.homeTeam?.score ?? null,
      logo: payload?.homeTeam?.logo ?? null,
      darkLogo:
        payload?.homeTeam?.darkLogo ??
        getDarkLogoFromLight(payload?.homeTeam?.logo),
    },
    summary: {
      iceSurface: {
        awayTeam: mapIceSurfaceTeam(summary?.iceSurface?.awayTeam),
        homeTeam: mapIceSurfaceTeam(summary?.iceSurface?.homeTeam),
      },
      scoring,
      threeStars,
      penalties,
      shootout,
    },
    matchup: {
      skaterComparison: {
        contextLabel: matchup?.skaterComparison?.contextLabel ?? null,
        leaders: skaterComparisonLeaders.map((entry) => ({
          category: entry?.category ?? null,
          awayLeader: mapSkaterLeader(entry?.awayLeader),
          homeLeader: mapSkaterLeader(entry?.homeLeader),
        })),
      },
      goalieComparison: {
        contextLabel: matchup?.goalieComparison?.contextLabel ?? null,
        homeTeam: {
          teamTotals: {
            record:
              matchup?.goalieComparison?.homeTeam?.teamTotals?.record ?? null,
          },
          leaders: (Array.isArray(matchup?.goalieComparison?.homeTeam?.leaders)
            ? matchup.goalieComparison.homeTeam.leaders
            : []
          ).map(mapGoalieLeader),
        },
        awayTeam: {
          teamTotals: {
            record:
              matchup?.goalieComparison?.awayTeam?.teamTotals?.record ?? null,
          },
          leaders: (Array.isArray(matchup?.goalieComparison?.awayTeam?.leaders)
            ? matchup.goalieComparison.awayTeam.leaders
            : []
          ).map(mapGoalieLeader),
        },
      },
      skaterSeasonStats: {
        skaters: skaterSeasonStats.map((skater) => ({
          ...skater,
          playerId: skater?.playerId ?? null,
          teamId: skater?.teamId ?? null,
          sweaterNumber: skater?.sweaterNumber ?? null,
          name: pickDefaultName(skater?.name),
          position: skater?.position ?? null,
        })),
      },
      goalieSeasonStats: {
        goalies: goalieSeasonStats.map((goalie) => ({
          ...goalie,
          playerId: goalie?.playerId ?? null,
          teamId: goalie?.teamId ?? null,
          sweaterNumber: goalie?.sweaterNumber ?? null,
          name: pickDefaultName(goalie?.name),
          position: goalie?.position ?? null,
        })),
      },
    },
    clock: {
      timeRemaining: payload?.clock?.timeRemaining ?? null,
      secondsRemaining: payload?.clock?.secondsRemaining ?? null,
      running: payload?.clock?.running ?? false,
      inIntermission: payload?.clock?.inIntermission ?? false,
    },
  };
}

function transformRightRailPayload(payload) {
  const seasonSeries = Array.isArray(payload?.seasonSeries)
    ? payload.seasonSeries
    : [];
  const teamGameStats = Array.isArray(payload?.teamGameStats)
    ? payload.teamGameStats
    : [];
  const byPeriod = Array.isArray(payload?.linescore?.byPeriod)
    ? payload.linescore.byPeriod
    : [];

  return {
    seasonSeries: seasonSeries.map((g) => ({
      id: g?.id ?? null,
      gameType: g?.gameType ?? null,
      gameDate: g?.gameDate ?? null,
      startTimeUTC: g?.startTimeUTC ?? null,
      gameState: g?.gameState ?? null,
      gameScheduleState: g?.gameScheduleState ?? null,
      awayTeam: {
        id: g?.awayTeam?.id ?? null,
        score: g?.awayTeam?.score ?? null,
      },
      homeTeam: {
        id: g?.homeTeam?.id ?? null,
        score: g?.homeTeam?.score ?? null,
      },
      periodDescriptor: {
        number: g?.periodDescriptor?.number ?? null,
        periodType: g?.periodDescriptor?.periodType ?? null,
      },
    })),
    gameInfo: {
      referees: (Array.isArray(payload?.gameInfo?.referees)
        ? payload.gameInfo.referees
        : []
      ).map((r) => ({ default: pickDefaultName(r) })),
      linesmen: (Array.isArray(payload?.gameInfo?.linesmen)
        ? payload.gameInfo.linesmen
        : []
      ).map((l) => ({ default: pickDefaultName(l) })),
      awayTeam: {
        headCoach: pickDefaultName(payload?.gameInfo?.awayTeam?.headCoach),
        scratches: (Array.isArray(payload?.gameInfo?.awayTeam?.scratches)
          ? payload.gameInfo.awayTeam.scratches
          : []
        ).map((s) => ({
          id: s?.id ?? null,
          firstName: pickDefaultName(s?.firstName),
          lastName: pickDefaultName(s?.lastName),
        })),
      },
      homeTeam: {
        headCoach: pickDefaultName(payload?.gameInfo?.homeTeam?.headCoach),
        scratches: (Array.isArray(payload?.gameInfo?.homeTeam?.scratches)
          ? payload.gameInfo.homeTeam.scratches
          : []
        ).map((s) => ({
          id: s?.id ?? null,
          firstName: pickDefaultName(s?.firstName),
          lastName: pickDefaultName(s?.lastName),
        })),
      },
    },
    linescore: {
      byPeriod: byPeriod.map((p) => ({
        periodDescriptor: {
          number: p?.periodDescriptor?.number ?? null,
          periodType: p?.periodDescriptor?.periodType ?? null,
        },
        away: p?.away ?? null,
        home: p?.home ?? null,
      })),
      totals: {
        away: payload?.linescore?.totals?.away ?? null,
        home: payload?.linescore?.totals?.home ?? null,
      },
    },
    teamGameStats: teamGameStats.map((s) => ({
      category: s?.category ?? null,
      awayValue: s?.awayValue ?? null,
      homeValue: s?.homeValue ?? null,
    })),
    teamSeasonStats: {
      awayTeam: payload?.teamSeasonStats?.awayTeam ?? {},
      homeTeam: payload?.teamSeasonStats?.homeTeam ?? {},
    },
  };
}

function transformBoxscorePayload(payload) {
  const mapPlayers = (arr) =>
    (Array.isArray(arr) ? arr : []).map((p) => ({
      ...p,
      playerId: p?.playerId ?? null,
      sweaterNumber: p?.sweaterNumber ?? null,
      name: pickDefaultName(p?.name),
    }));

  return {
    playerByGameStats: {
      awayTeam: {
        forwards: mapPlayers(payload?.playerByGameStats?.awayTeam?.forwards),
        defense: mapPlayers(payload?.playerByGameStats?.awayTeam?.defense),
        goalies: mapPlayers(payload?.playerByGameStats?.awayTeam?.goalies),
      },
      homeTeam: {
        forwards: mapPlayers(payload?.playerByGameStats?.homeTeam?.forwards),
        defense: mapPlayers(payload?.playerByGameStats?.homeTeam?.defense),
        goalies: mapPlayers(payload?.playerByGameStats?.homeTeam?.goalies),
      },
    },
  };
}

function transformPlaysPayload(payload) {
  const plays = Array.isArray(payload?.plays) ? payload.plays : [];
  const rosterSpots = Array.isArray(payload?.rosterSpots)
    ? payload.rosterSpots
    : [];
  return {
    plays: plays.map((p) => {
      const rawDetails = {
        eventOwnerTeamId: p?.details?.eventOwnerTeamId,
        playerId: p?.details?.playerId,
        hittingPlayerId: p?.details?.hittingPlayerId,
        hitteePlayerId: p?.details?.hitteePlayerId,
        committedByPlayerId: p?.details?.committedByPlayerId,
        drawnByPlayerId: p?.details?.drawnByPlayerId,
        losingPlayerId: p?.details?.losingPlayerId,
        winningPlayerId: p?.details?.winningPlayerId,
        blockingPlayerId: p?.details?.blockingPlayerId,
        shootingPlayerId: p?.details?.shootingPlayerId,
        goalieInNetId: p?.details?.goalieInNetId,
        scoringPlayerId: p?.details?.scoringPlayerId,
        scoringPlayerTotal: p?.details?.scoringPlayerTotal,
        assist1PlayerId: p?.details?.assist1PlayerId,
        assist1PlayerTotal: p?.details?.assist1PlayerTotal,
        assist2PlayerId: p?.details?.assist2PlayerId,
        assist2PlayerTotal: p?.details?.assist2PlayerTotal,
        assist3PlayerId: p?.details?.assist3PlayerId,
        assist3PlayerTotal: p?.details?.assist3PlayerTotal,
        typeCode: p?.details?.typeCode,
        descKey: p?.details?.descKey,
        duration: p?.details?.duration,
        shotType: p?.details?.shotType,
        xCoord: p?.details?.xCoord,
        yCoord: p?.details?.yCoord,
        reason: p?.details?.reason,
        secondaryReason: p?.details?.secondaryReason,
        awayScore: p?.details?.awayScore,
        homeScore: p?.details?.homeScore,
      };

      const details = Object.fromEntries(
        Object.entries(rawDetails).filter(
          ([, value]) => value !== null && value !== undefined,
        ),
      );

      const play = {
        periodDescriptor: {
          number: p?.periodDescriptor?.number ?? null,
          periodType: p?.periodDescriptor?.periodType ?? null,
        },
        timeRemaining: p?.timeRemaining ?? null,
        situationCode: p?.situationCode ?? null,
        homeTeamDefendingSide: p?.homeTeamDefendingSide ?? null,
        typeCode: p?.typeCode ?? null,
        typeDescKey: p?.typeDescKey ?? null,
      };

      if (Object.keys(details).length > 0) {
        play.details = details;
      }

      return play;
    }),
    rosterSpots: rosterSpots
      .map((spot) => ({
        teamId: spot?.teamId ?? null,
        playerId: spot?.playerId ?? null,
        firstName: {
          default: pickDefaultName(spot?.firstName),
        },
        lastName: {
          default: pickDefaultName(spot?.lastName),
        },
        sweaterNumber: spot?.sweaterNumber ?? null,
        headshot: spot?.headshot ?? null,
      }))
      .filter((spot) => spot.playerId != null),
  };
}

function transformShiftsPayload(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const grouped = {};

  for (const row of rows) {
    const teamId = String(row?.teamId ?? "unknown");
    const firstName = normalizePossiblyMojibakeName(
      row?.firstName ?? row?.playerFirstName ?? "Unknown",
    );
    const lastName = normalizePossiblyMojibakeName(
      row?.lastName ?? row?.playerLastName ?? "Player",
    );
    const playerKey = `${firstName} ${lastName}`.trim();

    if (!grouped[teamId]) grouped[teamId] = {};
    if (!grouped[teamId][playerKey]) grouped[teamId][playerKey] = [];

    grouped[teamId][playerKey].push({
      period: row?.period ?? null,
      startTime: row?.startTime ?? null,
      endTime: row?.endTime ?? null,
    });
  }

  return grouped;
}

function transformScoreboardPayload(payload) {
  const games = Array.isArray(payload?.games) ? payload.games : [];
  return {
    games: games.map((g) => ({
      id: g?.id ?? null,
      gameType: g?.gameType ?? null,
      venue: g?.venue?.default ?? null,
      startTimeUTC: g?.startTimeUTC ?? null,
      gameState: g?.gameState ?? null,
      gameScheduleState: g?.gameScheduleState ?? null,
      awayTeam: {
        id: g?.awayTeam?.id ?? null,
        name: g?.awayTeam?.name?.default ?? null,
        abbrev: g?.awayTeam?.abbrev ?? null,
        record: g?.awayTeam?.record ?? null,
        score: g?.awayTeam?.score ?? null,
        logoLight: g?.awayTeam?.logo ?? "",
        logoDark: getDarkLogoFromLight(g?.awayTeam?.logo),
      },
      homeTeam: {
        id: g?.homeTeam?.id ?? null,
        name: g?.homeTeam?.name?.default ?? null,
        abbrev: g?.homeTeam?.abbrev ?? null,
        record: g?.homeTeam?.record ?? null,
        score: g?.homeTeam?.score ?? null,
        logoLight: g?.homeTeam?.logo ?? "",
        logoDark: getDarkLogoFromLight(g?.homeTeam?.logo),
      },
      seriesStatus: {
        seriesTitle: g?.seriesStatus?.seriesTitle ?? null,
        topSeedTeamAbbrev: g?.seriesStatus?.topSeedTeamAbbrev ?? null,
        topSeedWins: g?.seriesStatus?.topSeedWins ?? null,
        bottomSeedTeamAbbrev: g?.seriesStatus?.bottomSeedTeamAbbrev ?? null,
        bottomSeedWins: g?.seriesStatus?.bottomSeedWins ?? null,
        gameNumberOfSeries: g?.seriesStatus?.gameNumberOfSeries ?? null,
      },
      clock: {
        timeRemaining: g?.clock?.timeRemaining ?? null,
        secondsRemaining: g?.clock?.secondsRemaining ?? null,
        running: g?.clock?.running ?? false,
        inIntermission: g?.clock?.inIntermission ?? false,
      },
      period: g?.period ?? null,
      periodDescriptor: g?.periodDescriptor ?? null,
    })),
  };
}

function transformStandingsPayload(payload) {
  const standings = Array.isArray(payload?.standings) ? payload.standings : [];

  return {
    ...payload,
    standings: standings.map((entry) => {
      const {
        placeName: _placeName,
        teamName: _teamName,
        ...rest
      } = entry || {};
      return {
        ...rest,
        teamCommonName: pickDefaultName(entry?.teamCommonName),
        teamAbbrev: pickDefaultName(entry?.teamAbbrev),
      };
    }),
  };
}

function getScoreboardPollingInterval(payload) {
  const games = Array.isArray(payload?.games) ? payload.games : [];
  if (games.length === 0) return INTERVAL_PRE_FAR;

  const nowMs = Date.now();
  let desired = INTERVAL_PRE_FAR;

  games.forEach((g) => {
    const state = String(g?.gameState || "").toUpperCase();
    if (state === "LIVE" || state === "CRIT" || state === "IN") {
      desired = Math.min(desired, INTERVAL_LIVE);
      return;
    }

    if (state === "OFF" || state === "FINAL" || state === "OVER") {
      desired = Math.min(desired, INTERVAL_PRE_FAR);
      return;
    }

    const startMs = Date.parse(String(g?.startTimeUTC || ""));
    if (Number.isFinite(startMs)) {
      desired = Math.min(desired, getPregamePollingInterval(startMs - nowMs));
      return;
    }

    desired = Math.min(desired, INTERVAL_LIVE);
  });

  return desired;
}

async function respondCached(res, cacheKey, url) {
  try {
    const { data, fromCache } = await getCachedJson(cacheKey, url);
    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", url, data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch NHL data", details: err.message, url });
  }
}

// Root + health
app.get("/", (req, res) => {
  res.json({ message: "NHL server running" });
});

app.get("/health", (req, res) => {
  const entries = {};
  for (const [k, v] of cache.entries()) {
    entries[k] = { ageMs: Date.now() - v.fetchedAt };
  }
  res.json({ status: "ok", cachedKeys: cache.size, entries });
});

// Folder: player_id -> /nhl/player/:id
app.get("/nhl/player/:id", async (req, res) => {
  const id = req.params.id;
  const urls = {
    landing: expandUrl(URLS.player.landing, { id }),
    gameLog: expandUrl(URLS.player.gameLog, { id }),
    edgeSkater: expandUrl(URLS.player.edgeSkater, { id }),
    edgeGoalie: expandUrl(URLS.player.edgeGoalie, { id }),
  };

  try {
    const [landing, gameLog] = await Promise.all([
      getCachedJsonWithTtl(`player:landing:${id}`, urls.landing, PLAYER_TTL_MS),
      getCachedJsonWithTtl(`player:gameLog:${id}`, urls.gameLog, PLAYER_TTL_MS),
    ]);

    let edge = null;
    try {
      edge = await getCachedJsonWithTtl(
        `player:edge:skater:${id}`,
        urls.edgeSkater,
        PLAYER_TTL_MS,
      );
    } catch (skaterErr) {
      try {
        edge = await getCachedJsonWithTtl(
          `player:edge:goalie:${id}`,
          urls.edgeGoalie,
          PLAYER_TTL_MS,
        );
      } catch (goalieErr) {
        console.warn(`edge unavailable for player ${id}; omitting edge stats`, {
          skater: skaterErr?.message || String(skaterErr),
          goalie: goalieErr?.message || String(goalieErr),
        });
      }
    }

    const data = {
      info: transformPlayerInfoPayload(landing.data),
      gameLog: transformPlayerGameLogPayload(gameLog.data),
    };
    if (edge?.data) {
      data.stats = transformPlayerEdgeStatsPayload(edge.data);
    }

    setCachingHeaders(res, PLAYER_TTL_MS);
    res.json({
      source:
        landing.fromCache && gameLog.fromCache && (edge ? edge.fromCache : true)
          ? "cache"
          : "origin",
      id,
      data,
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch player data", details: err.message });
  }
});

// Folder: team_id -> /nhl/team/:id
app.get("/nhl/team/:id", async (req, res) => {
  const id = String(req.params.id || "").toUpperCase();
  const seasonSpan = getNhlSeasonSpan();
  const urls = {
    stats: applyNhlSeasonSpan(expandUrl(URLS.team.stats, { id }), seasonSpan),
    schedule: expandUrl(URLS.team.schedule, { id }),
    roster: applyNhlSeasonSpan(expandUrl(URLS.team.roster, { id }), seasonSpan),
    standings: URLS.standings,
  };

  try {
    const [stats, schedule, roster, standings] = await Promise.all([
      getCachedJson(`team:stats:${seasonSpan}:${id}`, urls.stats),
      getCachedJson(`team:schedule:${id}`, urls.schedule),
      getCachedJson(`team:roster:${seasonSpan}:${id}`, urls.roster),
      getCachedJsonWithTtl(`standings:now`, urls.standings, STANDINGS_TTL_MS),
    ]);

    const transformedStandings = transformStandingsPayload(standings.data);
    const teamStanding = (
      Array.isArray(transformedStandings?.standings)
        ? transformedStandings.standings
        : []
    ).find((entry) => {
      const entryTeamId = String(entry?.teamId ?? "");
      const entryAbbrev = String(entry?.teamAbbrev ?? "").toUpperCase();
      return entryTeamId === id || entryAbbrev === id;
    });

    setCachingHeaders(res, TTL_MS);
    res.json({
      source:
        stats.fromCache &&
        schedule.fromCache &&
        roster.fromCache &&
        standings.fromCache
          ? "cache"
          : "origin",
      id,
      data: {
        stats: transformTeamStatsPayload(stats.data),
        schedule: transformTeamSchedulePayload(schedule.data),
        roster: transformTeamRosterPayload(roster.data),
        standings: teamStanding || null,
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch team data", details: err.message });
  }
});

// Folder: game_id -> /nhl/game/:id
app.get("/nhl/game/:id", async (req, res) => {
  const id = req.params.id;
  const urls = {
    landing: expandUrl(URLS.game.landing, { id }),
    rightRail: expandUrl(URLS.game.rightRail, { id }),
    boxscore: expandUrl(URLS.game.boxscore, { id }),
    playByPlay: expandUrl(URLS.game.playByPlay, { id }),
    shifts: expandUrl(URLS.game.shifts, { id }),
  };

  try {
    let landing = await getCachedJsonWithTtl(
      `game:landing:${id}`,
      urls.landing,
      INTERVAL_PRE_FAR,
    );
    let pollingIntervalMs = getGamePollingInterval(landing.data);
    if (pollingIntervalMs !== INTERVAL_PRE_FAR) {
      landing = await getCachedJsonWithTtl(
        `game:landing:${id}`,
        urls.landing,
        pollingIntervalMs,
      );
      pollingIntervalMs = getGamePollingInterval(landing.data);
    }

    const [rightRail, boxscore, shifts] = await Promise.all([
      getCachedJsonWithTtl(
        `game:rightRail:${id}`,
        urls.rightRail,
        pollingIntervalMs,
      ),
      getCachedJsonWithTtl(
        `game:boxscore:${id}`,
        urls.boxscore,
        pollingIntervalMs,
      ),
      getCachedJsonWithTtl(`game:shifts:${id}`, urls.shifts, pollingIntervalMs),
    ]);

    let playByPlay = null;
    try {
      playByPlay = await getCachedJsonWithTtl(
        `game:playByPlay:${id}`,
        urls.playByPlay,
        pollingIntervalMs,
      );
    } catch (playByPlayErr) {
      console.warn(
        `playByPlay unavailable for game ${id}; returning partial game payload`,
        playByPlayErr?.message || playByPlayErr,
      );
    }

    const data = {
      landing: transformLandingPayload(landing.data),
      rightRail: transformRightRailPayload(rightRail.data),
      boxscore: transformBoxscorePayload(boxscore.data),
      shifts: transformShiftsPayload(shifts.data),
    };
    if (playByPlay?.data) {
      data.plays = transformPlaysPayload(playByPlay.data);
    }

    setCachingHeaders(res, pollingIntervalMs);
    res.json({
      source:
        landing.fromCache &&
        rightRail.fromCache &&
        boxscore.fromCache &&
        (playByPlay ? playByPlay.fromCache : true) &&
        shifts.fromCache
          ? "cache"
          : "origin",
      id,
      polling: {
        intervalMs: pollingIntervalMs,
        mode:
          pollingIntervalMs <= INTERVAL_LIVE
            ? "live"
            : pollingIntervalMs <= INTERVAL_PRE_SOON
              ? "soon"
              : pollingIntervalMs <= INTERVAL_PRE_MEDIUM
                ? "pregame"
                : "slow",
      },
      data,
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch game data", details: err.message });
  }
});

// Folder: scoreboard_date -> /nhl/scoreboard/:date
app.get("/nhl/scoreboard/:date", async (req, res) => {
  const date = normalizeScoreboardDateParam(req.params.date);
  if (!date) {
    return res.status(400).json({
      error: "Invalid date. Use YYYY-MM-DD or YYYYMMDD",
      received: req.params.date,
    });
  }

  const url = expandUrl(URLS.scoreboard, { date });
  try {
    // Start with far pregame TTL; tighten cache window dynamically as game times approach.
    let { data, fromCache } = await getCachedJsonWithTtl(
      `scoreboard:${date}`,
      url,
      INTERVAL_PRE_FAR,
    );
    const desiredInterval = getScoreboardPollingInterval(data);
    if (desiredInterval !== INTERVAL_PRE_FAR) {
      const refreshed = await getCachedJsonWithTtl(
        `scoreboard:${date}`,
        url,
        desiredInterval,
      );
      data = refreshed.data;
      fromCache = refreshed.fromCache;
    }

    const transformed = transformScoreboardPayload(data);
    const pollingIntervalMs = getScoreboardPollingInterval(data);
    setCachingHeaders(res, pollingIntervalMs);
    res.json({
      source: fromCache ? "cache" : "origin",
      date,
      polling: {
        intervalMs: pollingIntervalMs,
        mode:
          pollingIntervalMs <= INTERVAL_LIVE
            ? "live"
            : pollingIntervalMs <= INTERVAL_PRE_SOON
              ? "soon"
              : pollingIntervalMs <= INTERVAL_PRE_MEDIUM
                ? "pregame"
                : "slow",
      },
      ...transformed,
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch scoreboard",
      details: err.message,
      url,
    });
  }
});

// Folder: standings -> /nhl/standings
app.get("/nhl/standings", async (req, res) => {
  const cacheKey = "standings:now";
  try {
    const { data, fromCache } = await getCachedJsonWithTtl(
      cacheKey,
      URLS.standings,
      STANDINGS_TTL_MS,
    );

    const transformed = transformStandingsPayload(data);
    setCachingHeaders(res, STANDINGS_TTL_MS);
    res.json({
      source: fromCache ? "cache" : "origin",
      ...transformed,
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch standings",
      details: err.message,
      url: URLS.standings,
    });
  }
});

// Folder: search -> /nhl/search
app.get("/nhl/search", async (req, res) => {
  const q = req.query.q;
  const playersUrl = q
    ? `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20000&q=${encodeURIComponent(String(q))}&active=true`
    : URLS.search;

  try {
    const [playersResult, standingsResult] = await Promise.all([
      getCachedJsonWithTtl(
        `search:players:${q || "*"}`,
        playersUrl,
        SEARCH_TTL_MS,
      ),
      getCachedJsonWithTtl(
        "search:teams:standings",
        URLS.standings,
        SEARCH_TTL_MS,
      ),
    ]);

    const players = transformSearchPlayersPayload(playersResult.data);
    const teams = transformSearchTeamsFromStandings(standingsResult.data);

    setCachingHeaders(res, SEARCH_TTL_MS);
    res.json({
      source:
        playersResult.fromCache && standingsResult.fromCache
          ? "cache"
          : "origin",
      teams,
      players,
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch search data",
      details: err.message,
    });
  }
});

// Folder: player-stats -> /nhl/player-stats and /nhl/player-stats/:id
app.get("/nhl/player-stats", async (req, res) => {
  const seasonSpan = getNhlSeasonSpan();
  const ids = Object.keys(URLS.playerStats)
    .map((v) => Number(v))
    .sort((a, b) => a - b);

  try {
    const results = await Promise.all(
      ids.map(async (id) => {
        const resolvedUrl = applyNhlSeasonSpan(
          URLS.playerStats[id],
          seasonSpan,
        );
        const { data, fromCache, url } = await getCachedJson(
          `player-stats:${seasonSpan}:${id}`,
          resolvedUrl,
        );
        return {
          id,
          source: fromCache ? "cache" : "origin",
          url,
          data: transformPlayerStatsPayloadById(id, data),
        };
      }),
    );

    setCachingHeaders(res, TTL_MS);
    res.json({ source: "mixed", count: results.length, data: results });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch player stats", details: err.message });
  }
});

app.get("/nhl/player-stats/:id", async (req, res) => {
  const seasonSpan = getNhlSeasonSpan();
  const id = Number(req.params.id);
  const template = URLS.playerStats[id];
  const url = applyNhlSeasonSpan(template, seasonSpan);
  if (!url) {
    return res.status(404).json({
      error: "Unknown player-stats id",
      validIds: Object.keys(URLS.playerStats),
    });
  }
  try {
    const { data, fromCache } = await getCachedJson(
      `player-stats:${seasonSpan}:${id}`,
      url,
    );
    const transformed = transformPlayerStatsPayloadById(id, data);
    setCachingHeaders(res, TTL_MS);
    res.json({
      source: fromCache ? "cache" : "origin",
      url,
      data: transformed,
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch player stats",
      details: err.message,
      url,
    });
  }
});

// Folder: team-stats -> /nhl/team-stats and /nhl/team-stats/:id
app.get("/nhl/team-stats", async (req, res) => {
  const seasonSpan = getNhlSeasonSpan();
  const ids = Object.keys(URLS.teamStats)
    .map((v) => Number(v))
    .sort((a, b) => a - b);

  try {
    const results = await Promise.all(
      ids.map(async (id) => {
        const resolvedUrl = applyNhlSeasonSpan(URLS.teamStats[id], seasonSpan);
        const { data, fromCache, url } = await getCachedJson(
          `team-stats:${seasonSpan}:${id}`,
          resolvedUrl,
        );
        return {
          id,
          source: fromCache ? "cache" : "origin",
          url,
          data: transformTeamStatsPayloadById(data),
        };
      }),
    );

    setCachingHeaders(res, TTL_MS);
    res.json({ source: "mixed", count: results.length, data: results });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch team stats", details: err.message });
  }
});

app.get("/nhl/team-stats/:id", async (req, res) => {
  const seasonSpan = getNhlSeasonSpan();
  const id = Number(req.params.id);
  const template = URLS.teamStats[id];
  const url = applyNhlSeasonSpan(template, seasonSpan);
  if (!url) {
    return res.status(404).json({
      error: "Unknown team-stats id",
      validIds: Object.keys(URLS.teamStats),
    });
  }
  try {
    const { data, fromCache } = await getCachedJson(
      `team-stats:${seasonSpan}:${id}`,
      url,
    );
    const transformed = transformTeamStatsPayloadById(data);
    setCachingHeaders(res, TTL_MS);
    res.json({
      source: fromCache ? "cache" : "origin",
      url,
      data: transformed,
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch team stats",
      details: err.message,
      url,
    });
  }
});

app.listen(PORT, () => {
  console.log(`NHL server listening on port ${PORT}`);
});
