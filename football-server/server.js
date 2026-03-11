"use strict";

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");

const app = express();
app.use(cors());
app.use(compression());

const PORT = process.env.PORT || 3000;

// ─── API credentials (prefer env vars so tokens aren't baked in) ──────────────
const SM_TOKEN =
  process.env.SM_TOKEN ||
  "5fYsJzDLF5YWGegHcnqsh3kmA89yH3KaPsglvqExtoBvwS0UbcQzUjk5jez1";
const SM_BASE = "https://api.sportmonks.com/v3/football";
const SAP_BASE = "https://v1.football.sportsapipro.com";
const SAP_KEY = process.env.SAP_KEY || "0150000b-b709-4b1f-8c87-5fdad60acbbe";

// ─── TTL constants ────────────────────────────────────────────────────────────
const TTL_30S = 30 * 1000;
const TTL_1H = 60 * 60 * 1000;
const TTL_24H = 24 * TTL_1H;

// ─── Cache stores ─────────────────────────────────────────────────────────────
// key -> { data, fetchedAt }
const cache = new Map();

// key -> intervalId  (used for SAP standings / league meta auto-refresh)
const refreshIntervals = new Map();

// key -> { id: intervalId, fast: boolean }  (fixture-date dynamic intervals)
const fixtureIntervals = new Map();

// key -> { intervalId: number | null, lastRequest: number }  (game activity polling)
const gameActivity = new Map();

// League metadata built on startup: Map<leagueId, { seasonId, stageId }>
let leagueMeta = null;

// ─── SportsApiPro competition IDs to warm on startup ─────────────────────────
const SAP_COMPETITION_IDS = [61, 119, 7, 11, 25, 17, 35];

// ─────────────────────────────────────────────────────────────────────────────
// Low-level helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUrl(url, headers = {}) {
  const response = await axios.get(url, { timeout: 15000, headers });
  return response.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, fetchedAt: Date.now() });
}

function cacheValid(key, ttlMs) {
  const e = cache.get(key);
  return e != null && Date.now() - e.fetchedAt < ttlMs;
}

async function fetchAndCache(key, url, headers = {}) {
  const data = await fetchUrl(url, headers);
  cacheSet(key, data);
  console.log(`[cache] SET ${key}`);
  return data;
}

function setCacheControl(res, ttlMs) {
  res.set(
    "Cache-Control",
    `public, max-age=${Math.max(0, Math.floor(ttlMs / 1000))}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup warm-up
// ─────────────────────────────────────────────────────────────────────────────

// 1) SportsApiPro competition standings — TTL 24h, auto-refresh
async function warmSapStandings() {
  await Promise.allSettled(
    SAP_COMPETITION_IDS.map(async (compId) => {
      const key = `sap:standings:${compId}`;
      const url = `${SAP_BASE}/standings?competitions=${compId}`;
      try {
        await fetchAndCache(key, url, { "x-api-key": SAP_KEY });
        // auto-refresh every 24 h
        const id = setInterval(
          () =>
            fetchAndCache(key, url, { "x-api-key": SAP_KEY }).catch((e) =>
              console.error(`[auto-refresh] ${key}:`, e.message),
            ),
          TTL_24H,
        );
        refreshIntervals.set(key, id);
      } catch (err) {
        console.warn(`[startup] SAP standings ${compId} failed:`, err.message);
      }
    }),
  );
}

// 2) All SportMonks leagues with currentSeason.stages — TTL 24h, auto-refresh
async function warmLeagueMeta() {
  try {
    const leagues = await fetchAllLeaguePages();
    buildLeagueMeta(leagues);
    cacheSet("sm:leagues:all", leagues);

    // auto-refresh every 24 h
    const id = setInterval(async () => {
      try {
        const fresh = await fetchAllLeaguePages();
        buildLeagueMeta(fresh);
        cacheSet("sm:leagues:all", fresh);
      } catch (e) {
        console.error("[auto-refresh] league meta:", e.message);
      }
    }, TTL_24H);
    refreshIntervals.set("sm:leagues:all", id);

    console.log(
      `[startup] League meta ready — ${leagueMeta?.size ?? 0} entries`,
    );
  } catch (err) {
    console.warn("[startup] League meta failed:", err.message);
  }
}

async function fetchAllLeaguePages() {
  let page = 1;
  let allLeagues = [];

  while (true) {
    const url = `${SM_BASE}/leagues?api_token=${SM_TOKEN}&include=currentSeason.stages&per_page=250&page=${page}`;
    const response = await fetchUrl(url);
    if (!response?.data || !Array.isArray(response.data)) break;
    allLeagues = allLeagues.concat(response.data);
    if (!response.pagination?.has_more) break;
    page++;
  }

  return allLeagues;
}

function buildLeagueMeta(leagues) {
  leagueMeta = new Map();
  for (const league of leagues || []) {
    const seasonId = league.currentseason?.id ?? null;
    let stageId = null;
    const stages = league.currentseason?.stages;
    if (Array.isArray(stages)) {
      const s1 = stages.find((s) => s.sort_order === 1);
      if (s1) stageId = s1.id;
    }
    leagueMeta.set(league.id, { seasonId, stageId });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture / game state helpers
// ─────────────────────────────────────────────────────────────────────────────

const FINISHED_STATES = new Set([
  "FT",
  "AET",
  "FT_PEN",
  "POSTP",
  "CANC",
  "ABAN",
  "WO",
  "WALKOVER",
  "CUT",
  "AWA",
]);
const FUTURE_STATES = new Set(["NS", "TBA", "DELAYED"]);

function stateCode(fixture) {
  return (
    fixture?.state?.state ||
    fixture?.state?.short_name ||
    fixture?.state?.developer_name ||
    ""
  ).toUpperCase();
}

function isFinished(fixture) {
  return FINISHED_STATES.has(stateCode(fixture));
}
function isScheduled(fixture) {
  return FUTURE_STATES.has(stateCode(fixture));
}
function isLive(fixture) {
  const c = stateCode(fixture);
  return c !== "" && !FINISHED_STATES.has(c) && !FUTURE_STATES.has(c);
}

function startTimeMsOf(fixture) {
  if (fixture?.starting_at_timestamp)
    return fixture.starting_at_timestamp * 1000;
  if (fixture?.starting_at)
    return new Date(fixture.starting_at + " UTC").getTime();
  return null;
}

// TTL for the /fixture date-list endpoint (evaluates over all fixtures on that day)
function fixtureDateTtlInfo(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    return { ttl: TTL_1H, fast: false };
  }
  const now = Date.now();
  const PRE = 15 * 60 * 1000;

  for (const f of fixtures) {
    if (isLive(f)) return { ttl: TTL_30S, fast: true };
  }
  for (const f of fixtures) {
    const t = startTimeMsOf(f);
    if (t != null && t > now && t - now <= PRE)
      return { ttl: TTL_30S, fast: true };
  }
  return { ttl: TTL_1H, fast: false };
}

// TTL for a single game fixture (/game endpoint)
function gameTtlInfo(fixture) {
  if (!fixture) return { ttl: TTL_1H, fast: false, mode: "scheduled" };

  if (isFinished(fixture))
    return { ttl: TTL_24H, fast: false, mode: "finished" };
  if (isLive(fixture)) return { ttl: TTL_30S, fast: true, mode: "live" };

  const t = startTimeMsOf(fixture);
  if (t != null) {
    const now = Date.now();
    const diff = t - now;
    const FIFTEEN_MIN = 15 * 60 * 1000;
    if (diff >= 0 && diff <= FIFTEEN_MIN)
      return { ttl: TTL_30S, fast: true, mode: "pre_match" };
    if (diff > FIFTEEN_MIN && diff <= TTL_1H)
      return { ttl: diff - FIFTEEN_MIN, fast: false, mode: "pre_1h" };
  }

  return { ttl: TTL_1H, fast: false, mode: "scheduled" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture-date dynamic interval management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts (or adjusts) the auto-refresh interval for a fixture-date cache key.
 * Re-evaluates the desired speed after every fetch so it can transition
 * between TTL_1H and TTL_30S dynamically as games go live.
 *
 * Called on every incoming request (idempotent if already at correct speed).
 */
function manageFixtureDateInterval(cacheKey, url, latestData) {
  const { fast: wantFast } = fixtureDateTtlInfo(latestData?.data);
  const current = fixtureIntervals.get(cacheKey);

  // Already running at the correct speed — nothing to do
  if (current && current.fast === wantFast) return;

  // Cancel any existing interval before creating a new one
  if (current) clearInterval(current.id);

  const intervalMs = wantFast ? TTL_30S : TTL_1H;
  const id = setInterval(async () => {
    try {
      const freshData = await fetchAndCache(cacheKey, url);
      // Re-evaluate speed immediately after each fetch
      manageFixtureDateInterval(cacheKey, url, freshData);
    } catch (e) {
      console.error(`[fixture-interval] ${cacheKey}:`, e.message);
    }
  }, intervalMs);

  fixtureIntervals.set(cacheKey, { id, fast: wantFast });
  console.log(
    `[fixture-interval] ${cacheKey}: ${wantFast ? "30s" : "1h"} interval`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Game activity-based polling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures the game endpoint is polled every 30 s while it's live/pre-match
 * AND requests have been seen within the last 60 s.  Stops automatically on
 * inactivity, game-end, or leaving the fast-poll window.
 */
function ensureGamePolling(cacheKey, fixtureUrl, fixture) {
  const { fast } = gameTtlInfo(fixture);
  if (!fast) return; // game is finished or scheduled far away — no polling needed

  // Record this request as activity
  let act = gameActivity.get(cacheKey);
  if (!act) {
    act = { intervalId: null, lastRequest: Date.now() };
    gameActivity.set(cacheKey, act);
  }
  act.lastRequest = Date.now();

  if (act.intervalId != null) return; // already polling

  act.intervalId = setInterval(async () => {
    // Stop if no request seen for 60 s
    if (Date.now() - act.lastRequest > 60_000) {
      clearInterval(act.intervalId);
      act.intervalId = null;
      console.log(`[game-poll] ${cacheKey}: stopped (inactivity)`);
      return;
    }

    try {
      const fixtureData = await fetchUrl(fixtureUrl);
      cacheSet(cacheKey, fixtureData);

      const { fast: stillFast, mode } = gameTtlInfo(fixtureData?.data);
      if (!stillFast) {
        clearInterval(act.intervalId);
        act.intervalId = null;
        console.log(`[game-poll] ${cacheKey}: stopped (mode: ${mode})`);
      }
    } catch (e) {
      console.error(`[game-poll] ${cacheKey}:`, e.message);
    }
  }, TTL_30S);

  console.log(`[game-poll] ${cacheKey}: started 30s polling`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// Transforms combined league data (standings/teams/leagueInfo/stageStats) per a–d.txt specs.
function transformLeagueResponse(combined) {
  const colorMap = buildSapColorMap();

  // ── a.txt: standings grouped by stage ──────────────────────────────────────
  const standingRows = Array.isArray(combined.standings?.data)
    ? combined.standings.data
    : [];
  const stageMap = new Map();
  for (const entry of standingRows) {
    const sid = entry.stage?.id ?? entry.stage_id ?? "__unknown__";
    if (!stageMap.has(sid)) {
      const st = entry.stage;
      stageMap.set(sid, {
        stage: st
          ? {
              name: st.name ?? null,
              sort_order: st.sort_order ?? null,
              starting_at: st.starting_at ?? null,
              ending_at: st.ending_at ?? null,
            }
          : null,
        entries: [],
      });
    }
    const p = entry.participant;
    const colors = p
      ? findSapColors(p.name, colorMap)
      : { colorPrimary: null, colorSecondary: null };
    stageMap.get(sid).entries.push({
      id: entry.id ?? null,
      league_id: entry.league_id ?? null,
      season_id: entry.season_id ?? null,
      result: entry.result ?? null,
      points: entry.points ?? null,
      rule: entry.rule
        ? {
            model_type: entry.rule.model_type ?? null,
            type: entry.rule.type?.name ?? null,
          }
        : null,
      participant: p
        ? {
            id: p.id ?? null,
            name: p.name ?? null,
            short_code: p.short_code ?? null,
            image_path: p.image_path ?? null,
            colorPrimary: colors.colorPrimary,
            colorSecondary: colors.colorSecondary,
          }
        : null,
      details: Array.isArray(entry.details)
        ? entry.details.map((d) => ({
            value: d.value ?? null,
            type: d.type
              ? {
                  name: d.type.name ?? null,
                  stat_group: d.type.stat_group ?? null,
                }
              : null,
          }))
        : [],
      form: Array.isArray(entry.form)
        ? entry.form.map((f) => ({
            fixture_id: f.fixture_id ?? null,
            form: f.form ?? null,
          }))
        : [],
    });
  }
  const standings = Array.from(stageMap.values());

  // ── b.txt: teams in season ─────────────────────────────────────────────────
  const teamsRaw = Array.isArray(combined.teamsInSeason?.data)
    ? combined.teamsInSeason.data
    : [];
  const teamsInSeason = teamsRaw.map((t) => {
    const teamColors = findSapColors(t.name, colorMap);
    return {
      id: t.id ?? null,
      name: t.name ?? null,
      short_code: t.short_code ?? null,
      image_path: t.image_path ?? null,
      colorPrimary: teamColors.colorPrimary,
      colorSecondary: teamColors.colorSecondary,
      sidelined: Array.isArray(t.sidelined)
        ? t.sidelined.map((sl) => ({
            player_id: sl.player_id ?? null,
            start_date: sl.start_date ?? null,
            end_date: sl.end_date ?? null,
            games_missed: sl.games_missed ?? null,
            player: sl.player
              ? {
                  id: sl.player.id ?? null,
                  firstname: sl.player.firstname ?? null,
                  lastname: sl.player.lastname ?? null,
                  name: sl.player.name ?? null,
                  image_path: sl.player.image_path ?? null,
                }
              : null,
            type: sl.type ? { name: sl.type.name ?? null } : null,
          }))
        : [],
      statistics: Array.isArray(t.statistics)
        ? t.statistics.map((s) => ({
            details: Array.isArray(s.details)
              ? s.details.map((d) => ({
                  value: d.value ?? null,
                  type: d.type
                    ? {
                        name: d.type.name ?? null,
                        stat_group: d.type.stat_group ?? null,
                      }
                    : null,
                }))
              : [],
          }))
        : [],
      players: Array.isArray(t.players)
        ? t.players.map((pl) => ({
            id: pl.player_id ?? null,
            captain: pl.captain ?? null,
            jersey_number: pl.jersey_number ?? null,
            player: pl.player
              ? {
                  firstname: pl.player.firstname ?? null,
                  lastname: pl.player.lastname ?? null,
                  name: pl.player.name ?? null,
                  image_path: pl.player.image_path ?? null,
                }
              : null,
            detailedposition: pl.detailedposition
              ? { name: pl.detailedposition.name ?? null }
              : null,
            position: pl.position ? { name: pl.position.name ?? null } : null,
          }))
        : [],
    };
  });

  // ── c.txt: league info ─────────────────────────────────────────────────────
  const li = combined.leagueInfo?.data;
  const leagueInfo = li
    ? {
        id: li.id ?? null,
        name: li.name ?? null,
        short_code: li.short_code ?? null,
        image_path: li.image_path ?? null,
        last_played_at: li.last_played_at ?? null,
        currentseason: li.currentseason
          ? {
              id: li.currentseason.id ?? null,
              name: li.currentseason.name ?? null,
              starting_at: li.currentseason.starting_at ?? null,
              ending_at: li.currentseason.ending_at ?? null,
            }
          : null,
        country: li.country
          ? {
              name: li.country.name ?? null,
              image_path: li.country.image_path ?? null,
            }
          : null,
        latest: Array.isArray(li.latest)
          ? li.latest.map((f) => ({
              id: f.id ?? null,
              starting_at: f.starting_at ?? null,
              scores: Array.isArray(f.scores)
                ? f.scores
                    .filter((s) => s.description === "CURRENT")
                    .map((s) => ({
                      score: s.score
                        ? {
                            goals: s.score.goals ?? null,
                            participant: s.score.participant ?? null,
                          }
                        : null,
                    }))
                : [],
              participants: Array.isArray(f.participants)
                ? f.participants.map((p) => {
                    const colors = findSapColors(p.name, colorMap);
                    return {
                      id: p.id ?? null,
                      name: p.name ?? null,
                      short_code: p.short_code ?? null,
                      image_path: p.image_path ?? null,
                      colorPrimary: colors.colorPrimary,
                      colorSecondary: colors.colorSecondary,
                      meta: p.meta
                        ? {
                            location: p.meta.location ?? null,
                            winner: p.meta.winner ?? null,
                          }
                        : null,
                    };
                  })
                : [],
              venue: f.venue ? { name: f.venue.name ?? null } : null,
            }))
          : [],
        upcoming: Array.isArray(li.upcoming)
          ? li.upcoming.map((f) => ({
              id: f.id ?? null,
              starting_at: f.starting_at ?? null,
              participants: Array.isArray(f.participants)
                ? f.participants.map((p) => {
                    const colors = findSapColors(p.name, colorMap);
                    return {
                      id: p.id ?? null,
                      name: p.name ?? null,
                      short_code: p.short_code ?? null,
                      image_path: p.image_path ?? null,
                      colorPrimary: colors.colorPrimary,
                      colorSecondary: colors.colorSecondary,
                      meta: p.meta
                        ? { location: p.meta.location ?? null }
                        : null,
                    };
                  })
                : [],
              venue: f.venue ? { name: f.venue.name ?? null } : null,
            }))
          : [],
      }
    : null;

  // ── d.txt: stage stats ─────────────────────────────────────────────────────
  const stageStats = Array.isArray(combined.stageStats?.data)
    ? combined.stageStats.data.map((s) => ({
        relation_id: s.relation_id ?? null,
        value: s.value ?? null,
        type: s.type
          ? { name: s.type.name ?? null, stat_group: s.type.stat_group ?? null }
          : null,
      }))
    : null;

  return { standings, teamsInSeason, leagueInfo, stageStats };
}

// GET /football/league/:leagueId
// Fetches 4 SportMonks endpoints in parallel: standings, teams, league info, stage stats.
app.get("/football/league/:leagueId", async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    return res.status(400).json({ error: "Invalid leagueId" });
  }

  if (!leagueMeta) {
    return res
      .status(503)
      .json({ error: "Server is still initializing — try again shortly" });
  }

  const meta = leagueMeta.get(leagueId);
  if (!meta) {
    return res
      .status(404)
      .json({ error: `League ${leagueId} not found in metadata` });
  }

  const { seasonId, stageId } = meta;
  const cacheKey = `league:${leagueId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformLeagueResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const [standings, teamsInSeason, leagueInfo, stageStats] =
      await Promise.all([
        fetchUrl(
          `${SM_BASE}/standings/seasons/${seasonId}?api_token=${SM_TOKEN}` +
            `&include=rule.type;stage;participant;details.type;form;league;group`,
        ),
        fetchUrl(
          `${SM_BASE}/teams/seasons/${seasonId}?api_token=${SM_TOKEN}` +
            `&include=sidelined.player;sidelined.type;statistics.details.type;players.player;players.detailedPosition;players.position` +
            `&filters=teamstatisticSeasons:${seasonId}`,
        ),
        fetchUrl(
          `${SM_BASE}/leagues/${leagueId}?api_token=${SM_TOKEN}` +
            `&include=currentSeason;country;latest.scores;latest.participants;latest.venue;upcoming.participants;upcoming.venue`,
        ),
        stageId
          ? fetchUrl(
              `${SM_BASE}/statistics/stages/${stageId}?api_token=${SM_TOKEN}` +
                `&include=type;participant`,
            )
          : Promise.resolve(null),
      ]);

    const combined = { standings, teamsInSeason, leagueInfo, stageStats };
    cacheSet(cacheKey, combined);

    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformLeagueResponse(combined) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch league data", details: err.message });
  }
});

// Transforms combined team data per a–d.txt specs.
function transformTeamResponse(combined) {
  const colorMap = buildSapColorMap();

  // ── a.txt: schedule — stages → rounds → fixtures ─────────────────────────
  const schedule = Array.isArray(combined.scheduleData?.data)
    ? combined.scheduleData.data.map((stage) => ({
        id: stage.id ?? null,
        league_id: stage.league_id ?? null,
        season_id: stage.season_id ?? null,
        name: stage.name ?? null,
        starting_at: stage.starting_at ?? null,
        ending_at: stage.ending_at ?? null,
        rounds: Array.isArray(stage.rounds)
          ? stage.rounds.map((round) => ({
              id: round.id ?? null,
              name: round.name ?? null,
              fixtures: Array.isArray(round.fixtures)
                ? round.fixtures.map((f) => ({
                    id: f.id ?? null,
                    starting_at: f.starting_at ?? null,
                    participants: Array.isArray(f.participants)
                      ? f.participants.map((p) => {
                          const colors = findSapColors(p.name, colorMap);
                          return {
                            id: p.id ?? null,
                            name: p.name ?? null,
                            short_code: p.short_code ?? null,
                            image_path: p.image_path ?? null,
                            colorPrimary: colors.colorPrimary,
                            colorSecondary: colors.colorSecondary,
                            meta: p.meta
                              ? {
                                  location: p.meta.location ?? null,
                                  winner: p.meta.winner ?? null,
                                  position: p.meta.position ?? null,
                                }
                              : null,
                          };
                        })
                      : [],
                    scores: Array.isArray(f.scores)
                      ? f.scores
                          .filter((s) => s.description === "CURRENT")
                          .map((s) => ({
                            score: s.score
                              ? {
                                  goals: s.score.goals ?? null,
                                  participant: s.score.participant ?? null,
                                }
                              : null,
                          }))
                      : [],
                  }))
                : [],
            }))
          : [],
      }))
    : [];

  // ── b.txt: squad ──────────────────────────────────────────────────────────
  const squad = Array.isArray(combined.squadData?.data)
    ? combined.squadData.data.map((sq) => ({
        player_id: sq.player_id ?? null,
        start: sq.start ?? null,
        end: sq.end ?? null,
        captain: sq.captain ?? null,
        jersey_number: sq.jersey_number ?? null,
        player: sq.player
          ? {
              firstname: sq.player.firstname ?? null,
              lastname: sq.player.lastname ?? null,
              name: sq.player.name ?? null,
              image_path: sq.player.image_path ?? null,
              height: sq.player.height ?? null,
              weight: sq.player.weight ?? null,
              date_of_birth: sq.player.date_of_birth ?? null,
              country: sq.player.country
                ? {
                    name: sq.player.country.name ?? null,
                    image_path: sq.player.country.image_path ?? null,
                  }
                : null,
              statistics: Array.isArray(sq.player.statistics)
                ? sq.player.statistics.flatMap((s) =>
                    Array.isArray(s.details)
                      ? s.details.map((d) => ({
                          value: d.value ?? null,
                          type: d.type
                            ? {
                                name: d.type.name ?? null,
                                stat_group: d.type.stat_group ?? null,
                              }
                            : null,
                        }))
                      : [],
                  )
                : [],
            }
          : null,
      }))
    : [];

  // ── c.txt: team info ──────────────────────────────────────────────────────
  const t = combined.teamInfo?.data;
  const teamInfo = t
    ? {
        id: t.id ?? null,
        name: t.name ?? null,
        short_code: t.short_code ?? null,
        image_path: t.image_path ?? null,
        founded: t.founded ?? null,
        last_played_at: t.last_played_at ?? null,
        country: t.country
          ? {
              name: t.country.name ?? null,
              image_path: t.country.image_path ?? null,
            }
          : null,
        coaches: Array.isArray(t.coaches)
          ? t.coaches.map((c) => ({
              coach_id: c.coach_id ?? null,
              active: c.active ?? null,
              start: c.start ?? null,
              end: c.end ?? null,
              coach: c.coach
                ? {
                    firstname: c.coach.firstname ?? null,
                    lastname: c.coach.lastname ?? null,
                    name: c.coach.name ?? null,
                    image_path: c.coach.image_path ?? null,
                    date_of_birth: c.coach.date_of_birth ?? null,
                  }
                : null,
            }))
          : [],
        trophies: Array.isArray(t.trophies)
          ? t.trophies
              .filter((tr) => tr.season != null)
              .map((tr) => ({
                trophy: tr.trophy ? { name: tr.trophy.name ?? null } : null,
                season: tr.season ? { name: tr.season.name ?? null } : null,
                league: tr.league
                  ? {
                      id: tr.league.id ?? null,
                      name: tr.league.name ?? null,
                      image_path: tr.league.image_path ?? null,
                      sub_type: tr.league.sub_type ?? null,
                    }
                  : null,
              }))
          : [],
        rivals: Array.isArray(t.rivals)
          ? t.rivals.map((r) => {
              const colors = findSapColors(r.name, colorMap);
              return {
                id: r.id ?? null,
                name: r.name ?? null,
                short_code: r.short_code ?? null,
                image_path: r.image_path ?? null,
                colorPrimary: colors.colorPrimary,
                colorSecondary: colors.colorSecondary,
              };
            })
          : [],
        sidelined: Array.isArray(t.sidelined)
          ? t.sidelined.map((sl) => ({
              player_id: sl.player_id ?? null,
              start_date: sl.start_date ?? null,
              end_date: sl.end_date ?? null,
              games_missed: sl.games_missed ?? null,
              player: sl.player
                ? {
                    firstname: sl.player.firstname ?? null,
                    lastname: sl.player.lastname ?? null,
                    display_name: sl.player.display_name ?? null,
                    image_path: sl.player.image_path ?? null,
                  }
                : null,
              type: sl.type ? { name: sl.type.name ?? null } : null,
            }))
          : [],
        activeseasons: Array.isArray(t.activeseasons)
          ? t.activeseasons.map((as) => ({
              id: as.id ?? null,
              league_id: as.league_id ?? null,
              name: as.name ?? null,
              league: as.league
                ? {
                    name: as.league.name ?? null,
                    image_path: as.league.image_path ?? null,
                  }
                : null,
            }))
          : [],
        venue: t.venue
          ? {
              name: t.venue.name ?? null,
              address: t.venue.address ?? null,
              capacity: t.venue.capacity ?? null,
              image_path: t.venue.image_path ?? null,
              city_name: t.venue.city_name ?? null,
              surface: t.venue.surface ?? null,
            }
          : null,
        rankings: Array.isArray(t.rankings)
          ? t.rankings.map((r) => ({
              position: r.position ?? null,
              points: r.points ?? null,
              type: r.type ?? null,
            }))
          : [],
        statistics: Array.isArray(t.statistics)
          ? t.statistics.map((s) => ({
              season_id: s.season_id ?? null,
              details: Array.isArray(s.details)
                ? s.details.map((d) => ({
                    value: d.value ?? null,
                    type: d.type
                      ? {
                          name: d.type.name ?? null,
                          stat_group: d.type.stat_group ?? null,
                        }
                      : null,
                  }))
                : [],
            }))
          : [],
      }
    : null;

  // ── d.txt: transfers ──────────────────────────────────────────────────────
  const transfers = Array.isArray(combined.transfersData?.data)
    ? combined.transfersData.data.map((tr) => {
        const fromColors = tr.fromteam
          ? findSapColors(tr.fromteam.name, colorMap)
          : { colorPrimary: null, colorSecondary: null };
        const toColors = tr.toteam
          ? findSapColors(tr.toteam.name, colorMap)
          : { colorPrimary: null, colorSecondary: null };
        return {
          player_id: tr.player_id ?? null,
          date: tr.date ?? null,
          amount: tr.amount ?? null,
          fromteam: tr.fromteam
            ? {
                id: tr.fromteam.id ?? null,
                name: tr.fromteam.name ?? null,
                short_code: tr.fromteam.short_code ?? null,
                image_path: tr.fromteam.image_path ?? null,
                colorPrimary: fromColors.colorPrimary,
                colorSecondary: fromColors.colorSecondary,
              }
            : null,
          toteam: tr.toteam
            ? {
                id: tr.toteam.id ?? null,
                name: tr.toteam.name ?? null,
                short_code: tr.toteam.short_code ?? null,
                image_path: tr.toteam.image_path ?? null,
                colorPrimary: toColors.colorPrimary,
                colorSecondary: toColors.colorSecondary,
              }
            : null,
          player: tr.player
            ? {
                firstname: tr.player.firstname ?? null,
                lastname: tr.player.lastname ?? null,
                name: tr.player.name ?? null,
                image_path: tr.player.image_path ?? null,
              }
            : null,
          type: tr.type ? { name: tr.type.name ?? null } : null,
          detailedposition: tr.detailedposition
            ? { name: tr.detailedposition.name ?? null }
            : null,
        };
      })
    : [];

  return { teamInfo, schedule, squad, transfers };
}

// GET /football/team/:teamId
// Phase 1: schedule (also yields the active season ID for downstream filters).
// Phase 2: team info (with stats filter) + squad + transfers — all in parallel.
app.get("/football/team/:teamId", async (req, res) => {
  const teamId = req.params.teamId;
  const cacheKey = `team:${teamId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformTeamResponse(cache.get(cacheKey).data),
    });
  }

  try {
    // Phase 1: schedule — season_id embedded in each stage
    const scheduleData = await fetchUrl(
      `${SM_BASE}/schedules/teams/${teamId}?api_token=${SM_TOKEN}`,
    );

    const activeSeasonId = scheduleData?.data?.[0]?.season_id ?? null;
    const statsFilter = activeSeasonId
      ? `&filters=teamstatisticSeasons:${activeSeasonId}`
      : "";
    const squadFilter = activeSeasonId
      ? `&filters=playerstatisticSeasons:${activeSeasonId}`
      : "";

    // Phase 2: team info (with season stats filter) + squad + transfers in parallel
    const [teamInfo, squadData, transfersData] = await Promise.all([
      fetchUrl(
        `${SM_BASE}/teams/${teamId}?api_token=${SM_TOKEN}` +
          `&include=country;coaches.coach;trophies.trophy;trophies.season;trophies.league;rivals;sidelined.player;sidelined.type;activeSeasons.league;venue;rankings;statistics.details.type` +
          statsFilter,
      ),
      fetchUrl(
        `${SM_BASE}/squads/teams/${teamId}?api_token=${SM_TOKEN}` +
          `&include=player.country;player.statistics.details.type` +
          squadFilter,
      ),
      fetchUrl(
        `${SM_BASE}/transfers/teams/${teamId}?api_token=${SM_TOKEN}` +
          `&include=fromteam;toteam;player;type;detailedPosition`,
      ),
    ]);

    const combined = { teamInfo, scheduleData, squadData, transfersData };
    cacheSet(cacheKey, combined);

    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformTeamResponse(combined) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch team data", details: err.message });
  }
});

// Transforms raw SM player response into a slimmed structure with SAP colors on every team.
function transformPlayerResponse(raw) {
  const p = raw?.data;
  if (!p) return null;
  const colorMap = buildSapColorMap();

  // Slim a team sub-object, keeping only the requested fields, and append SAP colors.
  function slimTeam(t, fields) {
    if (!t) return null;
    const colors = findSapColors(t.name, colorMap);
    const out = {};
    for (const f of fields) out[f] = t[f] ?? null;
    out.colorPrimary = colors.colorPrimary;
    out.colorSecondary = colors.colorSecondary;
    return out;
  }

  return {
    id: p.id ?? null,
    firstname: p.firstname ?? null,
    lastname: p.lastname ?? null,
    name: p.name ?? null,
    image_path: p.image_path ?? null,
    height: p.height ?? null,
    weight: p.weight ?? null,
    date_of_birth: p.date_of_birth ?? null,
    country: p.country
      ? {
          name: p.country.name ?? null,
          image_path: p.country.image_path ?? null,
        }
      : null,
    teams: Array.isArray(p.teams)
      ? p.teams.map((t) => ({
          id: t.id ?? null,
          start: t.start ?? null,
          end: t.end ?? null,
          jersey_number: t.jersey_number ?? null,
          team: slimTeam(t.team, [
            "id",
            "name",
            "short_code",
            "image_path",
            "type",
          ]),
        }))
      : [],
    detailedposition: p.detailedposition
      ? { name: p.detailedposition.name ?? null }
      : null,
    metadata: Array.isArray(p.metadata)
      ? p.metadata.map((m) => ({
          values: m.values ?? null,
          type: m.type ? { name: m.type.name ?? null } : null,
        }))
      : [],
    trophies: Array.isArray(p.trophies)
      ? p.trophies
          .filter((t) => t.season != null)
          .map((t) => ({
            trophy: t.trophy ? { name: t.trophy.name ?? null } : null,
            season: t.season ? { name: t.season.name ?? null } : null,
            league: t.league
              ? {
                  id: t.league.id ?? null,
                  name: t.league.name ?? null,
                  image_path: t.league.image_path ?? null,
                }
              : null,
            team: slimTeam(t.team, ["id", "name", "image_path"]),
          }))
      : [],
    statistics: Array.isArray(p.statistics)
      ? p.statistics.map((s) => ({
          team_id: s.team_id ?? null,
          season_id: s.season_id ?? null,
          jersey_number: s.jersey_number ?? null,
          details: Array.isArray(s.details)
            ? s.details.map((d) => ({
                value: d.value ?? null,
                type: d.type ? { name: d.type.name ?? null } : null,
              }))
            : [],
          team: slimTeam(s.team, ["id", "name", "image_path"]),
          season: s.season
            ? {
                name: s.season.name ?? null,
                league: s.season.league
                  ? {
                      id: s.season.league.id ?? null,
                      name: s.season.league.name ?? null,
                      image_path: s.season.league.image_path ?? null,
                    }
                  : null,
              }
            : null,
        }))
      : [],
    latest: Array.isArray(p.latest)
      ? p.latest
          .filter((l) => l.fixture != null)
          .map((l) => ({
            fixture_id: l.fixture_id ?? null,
            fixture: {
              starting_at: l.fixture.starting_at ?? null,
              result_info: l.fixture.result_info ?? null,
              participants: Array.isArray(l.fixture.participants)
                ? l.fixture.participants.map((pt) => {
                    const colors = findSapColors(pt.name, colorMap);
                    return {
                      name: pt.name ?? null,
                      image_path: pt.image_path ?? null,
                      colorPrimary: colors.colorPrimary,
                      colorSecondary: colors.colorSecondary,
                      meta: pt.meta
                        ? {
                            location: pt.meta.location ?? null,
                            winner: pt.meta.winner ?? null,
                          }
                        : null,
                    };
                  })
                : [],
              league: l.fixture.league
                ? { name: l.fixture.league.name ?? null }
                : null,
              details: Array.isArray(l.details)
                ? l.details.map((d) => ({
                    data: d.data ?? null,
                    type: d.type ? { name: d.type.name ?? null } : null,
                  }))
                : [],
            },
          }))
      : [],
    transfers: Array.isArray(p.transfers)
      ? p.transfers.map((t) => ({
          date: t.date ?? null,
          amount: t.amount ?? null,
          fromteam: slimTeam(t.fromteam, [
            "id",
            "name",
            "short_code",
            "image_path",
          ]),
          toteam: slimTeam(t.toteam, [
            "id",
            "name",
            "short_code",
            "image_path",
          ]),
        }))
      : [],
  };
}

// GET /football/player/:playerId
app.get("/football/player/:playerId", async (req, res) => {
  const playerId = req.params.playerId;
  const cacheKey = `player:${playerId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformPlayerResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const data = await fetchUrl(
      `${SM_BASE}/players/${playerId}?api_token=${SM_TOKEN}` +
        `&include=country;teams.team;detailedPosition;metadata.type;trophies.trophy;trophies.season;trophies.league;trophies.team;statistics.details.type;statistics.team;statistics.season.league;latest.fixture.participants;latest.fixture.league;latest.details.type;transfers.fromTeam;transfers.toTeam`,
    );

    cacheSet(cacheKey, data);
    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformPlayerResponse(data) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch player data", details: err.message });
  }
});

// Transforms raw SM coach response per a.txt spec.
function transformCoachResponse(raw) {
  const d = raw?.data;
  if (!d) return null;
  const colorMap = buildSapColorMap();

  return {
    id: d.id ?? null,
    firstname: d.firstname ?? null,
    lastname: d.lastname ?? null,
    name: d.name ?? null,
    image_path: d.image_path ?? null,
    date_of_birth: d.date_of_birth ?? null,
    country: d.country
      ? {
          name: d.country.name ?? null,
          image_path: d.country.image_path ?? null,
        }
      : null,
    statistics: Array.isArray(d.statistics)
      ? d.statistics.map((s) => ({
          team_id: s.team_id ?? null,
          season_id: s.season_id ?? null,
          season: s.season
            ? {
                name: s.season.name ?? null,
                league: s.season.league
                  ? {
                      id: s.season.league.id ?? null,
                      name: s.season.league.name ?? null,
                      image_path: s.season.league.image_path ?? null,
                    }
                  : null,
                details: Array.isArray(s.details)
                  ? s.details.map((det) => ({
                      value: det.value ?? null,
                      type: det.type
                        ? {
                            name: det.type.name ?? null,
                            stat_group: det.type.stat_group ?? null,
                          }
                        : null,
                    }))
                  : [],
              }
            : null,
        }))
      : [],
    trophies: Array.isArray(d.trophies)
      ? d.trophies
          .filter((tr) => tr.season != null)
          .map((tr) => ({
            trophy: tr.trophy ? { name: tr.trophy.name ?? null } : null,
            season: tr.season ? { name: tr.season.name ?? null } : null,
            league: tr.league
              ? {
                  id: tr.league.id ?? null,
                  name: tr.league.name ?? null,
                  image_path: tr.league.image_path ?? null,
                  sub_type: tr.league.sub_type ?? null,
                }
              : null,
          }))
      : [],
    teams: Array.isArray(d.teams)
      ? d.teams.map((t) => {
          const colors = t.team
            ? findSapColors(t.team.name, colorMap)
            : { colorPrimary: null, colorSecondary: null };
          return {
            team_id: t.team_id ?? null,
            start: t.start ?? null,
            end: t.end ?? null,
            team: t.team
              ? {
                  name: t.team.name ?? null,
                  short_code: t.team.short_code ?? null,
                  image_path: t.team.image_path ?? null,
                  colorPrimary: colors.colorPrimary,
                  colorSecondary: colors.colorSecondary,
                }
              : null,
          };
        })
      : [],
  };
}

// GET /football/coach/:coachId
app.get("/football/coach/:coachId", async (req, res) => {
  const coachId = req.params.coachId;
  const cacheKey = `coach:${coachId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformCoachResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const data = await fetchUrl(
      `${SM_BASE}/coaches/${coachId}?api_token=${SM_TOKEN}` +
        `&include=country;statistics.season.league;statistics.details.type;trophies.trophy;trophies.season;trophies.league;teams.team`,
    );

    cacheSet(cacheKey, data);
    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformCoachResponse(data) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch coach data", details: err.message });
  }
});

// Transforms raw SM referee response per b.txt spec.
function transformRefereeResponse(raw) {
  const d = raw?.data;
  if (!d) return null;

  return {
    id: d.id ?? null,
    firstname: d.firstname ?? null,
    lastname: d.lastname ?? null,
    name: d.name ?? null,
    image_path: d.image_path ?? null,
    country: d.country
      ? {
          name: d.country.name ?? null,
          image_path: d.country.image_path ?? null,
        }
      : null,
    statistics: Array.isArray(d.statistics)
      ? d.statistics.map((s) => ({
          season_id: s.season_id ?? null,
          season: s.season
            ? {
                name: s.season.name ?? null,
                league: s.season.league
                  ? {
                      id: s.season.league.id ?? null,
                      name: s.season.league.name ?? null,
                      image_path: s.season.league.image_path ?? null,
                    }
                  : null,
              }
            : null,
          details: Array.isArray(s.details)
            ? s.details.map((det) => ({
                value: det.value ?? null,
                type: det.type
                  ? {
                      name: det.type.name ?? null,
                      stat_group: det.type.stat_group ?? null,
                    }
                  : null,
              }))
            : [],
        }))
      : [],
  };
}

// GET /football/referee/:refereeId
app.get("/football/referee/:refereeId", async (req, res) => {
  const refereeId = req.params.refereeId;
  const cacheKey = `referee:${refereeId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformRefereeResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const data = await fetchUrl(
      `${SM_BASE}/referees/${refereeId}?api_token=${SM_TOKEN}` +
        `&include=country;statistics.season.league;statistics.details.type`,
    );

    cacheSet(cacheKey, data);
    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformRefereeResponse(data) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch referee data", details: err.message });
  }
});

// Builds a lookup map from the SAP standings cache: lowercased name -> colors.
// Both `name` and `longName` are indexed so either can match.
function buildSapColorMap() {
  const map = new Map();
  for (const compId of SAP_COMPETITION_IDS) {
    const entry = cache.get(`sap:standings:${compId}`);
    if (!entry?.data?.standings) continue;
    for (const stage of entry.data.standings) {
      if (!Array.isArray(stage.rows)) continue;
      for (const row of stage.rows) {
        const c = row.competitor;
        if (!c) continue;
        const colors = {
          colorPrimary: c.color ?? null,
          colorSecondary: c.awayColor ?? null,
        };
        if (c.name) map.set(c.name.toLowerCase(), colors);
        if (c.longName) map.set(c.longName.toLowerCase(), colors);
      }
    }
  }
  return map;
}

// Strip common football suffixes so "Celtic FC" matches "Celtic", etc.
function normalizeName(str) {
  return str
    .toLowerCase()
    .replace(
      /\b(fc|if|fk|ac|sk|sc|bk|cf|afc|rfc|utd|united|city|town|hotspur)\b/g,
      "",
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns { colorPrimary, colorSecondary } for a participant name, trying
// progressively looser matching against the SAP color map.
function findSapColors(name, colorMap) {
  const empty = { colorPrimary: null, colorSecondary: null };
  if (!name || colorMap.size === 0) return empty;

  const lower = name.toLowerCase();
  const norm = normalizeName(name);

  // 1. Exact match
  if (colorMap.has(lower)) return colorMap.get(lower);

  // 2. Normalized exact match
  for (const [key, colors] of colorMap) {
    if (normalizeName(key) === norm) return colors;
  }

  // 3. One raw string contains the other
  for (const [key, colors] of colorMap) {
    if (key.includes(lower) || lower.includes(key)) return colors;
  }

  // 4. One normalized string contains the other (must be ≥ 4 chars to avoid noise)
  if (norm.length >= 4) {
    for (const [key, colors] of colorMap) {
      const kn = normalizeName(key);
      if (kn.length >= 4 && (kn.includes(norm) || norm.includes(kn)))
        return colors;
    }
  }

  return empty;
}

// Transforms raw SM fixture-date response into a league-grouped structure.
// Raw data is kept in cache untouched so TTL helpers can still read state fields.
function transformFixtureDateResponse(raw) {
  const fixtures = Array.isArray(raw?.data) ? raw.data : [];
  const colorMap = buildSapColorMap();
  const leagueMap = new Map(); // leagueId -> { league meta + matches[] }

  for (const f of fixtures) {
    const leagueId = f.league_id;

    // Bootstrap league entry on first encounter
    if (!leagueMap.has(leagueId)) {
      const lg = f.league ?? {};
      leagueMap.set(leagueId, {
        id: lg.id ?? leagueId,
        name: lg.name ?? null,
        image_path: lg.image_path ?? null,
        country: lg.country
          ? {
              name: lg.country.name ?? null,
              image_path: lg.country.image_path ?? null,
            }
          : null,
        matches: [],
      });
    }

    // Slim participants, enriched with SAP colors
    const participants = Array.isArray(f.participants)
      ? f.participants.map((p) => {
          const colors = findSapColors(p.name, colorMap);
          return {
            id: p.id,
            name: p.name ?? null,
            short_code: p.short_code ?? null,
            image_path: p.image_path ?? null,
            colorPrimary: colors.colorPrimary,
            colorSecondary: colors.colorSecondary,
            meta: p.meta
              ? {
                  location: p.meta.location ?? null,
                  position: p.meta.position ?? null,
                  winner: p.meta.winner ?? null,
                }
              : null,
          };
        })
      : [];

    // Only CURRENT score entries, return just the inner score object
    const scores = Array.isArray(f.scores)
      ? f.scores
          .filter((s) => s.description === "CURRENT")
          .map((s) => s.score ?? null)
          .filter(Boolean)
      : [];

    leagueMap.get(leagueId).matches.push({
      id: f.id,
      league_id: f.league_id,
      season_id: f.season_id,
      stage_id: f.stage_id,
      starting_at: f.starting_at ?? null,
      leg: f.leg ?? null,
      state: f.state
        ? {
            state: f.state.state ?? null,
            name: f.state.name ?? null,
            short_name: f.state.short_name ?? null,
          }
        : null,
      participants,
      scores,
      venue: f.venue ? { name: f.venue.name ?? null } : null,
    });
  }

  // Convert map to array; preserve insertion order (matches API response order)
  const leagues = {};
  for (const [id, data] of leagueMap) {
    leagues[id] = data;
  }
  return leagues;
}

// GET /football/fixture/:date  (date = YYYYMMDD)
// Auto-refreshes every 1 h normally; switches to every 30 s when any game is
// live or within 15 minutes of kick-off.
app.get("/football/fixture/:date", async (req, res) => {
  const raw = req.params.date;
  if (!/^\d{8}$/.test(raw)) {
    return res.status(400).json({ error: "Date must be in YYYYMMDD format" });
  }

  const isoDate = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const cacheKey = `fixture:date:${raw}`;
  const url =
    `${SM_BASE}/fixtures/date/${isoDate}?api_token=${SM_TOKEN}` +
    `&per_page=50&include=state;participants;scores;venue;league.country`;

  // Serve from cache if still valid under the dynamic TTL
  const entry = cache.get(cacheKey);
  if (entry) {
    const { ttl } = fixtureDateTtlInfo(entry.data?.data);
    if (Date.now() - entry.fetchedAt < ttl) {
      manageFixtureDateInterval(cacheKey, url, entry.data);
      setCacheControl(res, ttl);
      return res.json({
        source: "cache",
        data: transformFixtureDateResponse(entry.data),
      });
    }
  }

  try {
    const data = await fetchAndCache(cacheKey, url);
    const { ttl } = fixtureDateTtlInfo(data?.data);

    manageFixtureDateInterval(cacheKey, url, data);

    setCacheControl(res, ttl);
    res.json({ source: "origin", data: transformFixtureDateResponse(data) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch fixtures", details: err.message });
  }
});

// Transforms a single raw SM fixture (from /fixtures/:id) per a.txt spec.
function transformFixtureGameResponse(raw) {
  const f = raw?.data;
  if (!f) return null;
  const colorMap = buildSapColorMap();

  const participants = Array.isArray(f.participants)
    ? f.participants.map((p) => {
        const colors = findSapColors(p.name, colorMap);
        return {
          id: p.id ?? null,
          name: p.name ?? null,
          short_code: p.short_code ?? null,
          image_path: p.image_path ?? null,
          colorPrimary: colors.colorPrimary,
          colorSecondary: colors.colorSecondary,
          meta: p.meta
            ? {
                location: p.meta.location ?? null,
                winner: p.meta.winner ?? null,
                position: p.meta.position ?? null,
              }
            : null,
        };
      })
    : [];

  const scores = Array.isArray(f.scores)
    ? f.scores.map((s) => ({
        score: s.score
          ? {
              goals: s.score.goals ?? null,
              participant: s.score.participant ?? null,
            }
          : null,
        description: s.description ?? null,
      }))
    : [];

  const league = f.league
    ? {
        id: f.league.id ?? null,
        name: f.league.name ?? null,
        image_path: f.league.image_path ?? null,
        country: f.league.country
          ? {
              name: f.league.country.name ?? null,
              image_path: f.league.country.image_path ?? null,
            }
          : null,
      }
    : null;

  const comments = Array.isArray(f.comments)
    ? f.comments.map((c) => ({
        comment: c.comment ?? null,
        extra_minute: c.extra_minute ?? null,
        is_goal: c.is_goal ?? null,
        is_important: c.is_important ?? null,
        order: c.order ?? null,
      }))
    : [];

  const formations = Array.isArray(f.formations)
    ? f.formations.map((fm) => ({
        participant_id: fm.participant_id ?? null,
        formation: fm.formation ?? null,
        location: fm.location ?? null,
      }))
    : [];

  const venue = f.venue
    ? {
        name: f.venue.name ?? null,
        capacity: f.venue.capacity ?? null,
        image_path: f.venue.image_path ?? null,
        city_name: f.venue.city_name ?? null,
        surface: f.venue.surface ?? null,
      }
    : null;

  const wr = f.weatherreport;
  const weatherreport = wr
    ? {
        temperature: wr.temperature
          ? { day: wr.temperature.day ?? null }
          : null,
        feelslike: wr.feels_like ? { day: wr.feels_like.day ?? null } : null,
        wind: wr.wind
          ? {
              speed: wr.wind.speed ?? null,
              direction: wr.wind.direction ?? null,
            }
          : null,
        humidity: wr.humidity ?? null,
        pressure: wr.pressure ?? null,
        clouds: wr.clouds ?? null,
        description: wr.description ?? null,
      }
    : null;

  const events = Array.isArray(f.events)
    ? f.events.map((e) => ({
        participant_id: e.participant_id ?? null,
        player_id: e.player_id ?? null,
        related_player_id: e.related_player_id ?? null,
        player_name: e.player_name ?? null,
        related_player_name: e.related_player_name ?? null,
        result: e.result ?? null,
        info: e.info ?? null,
        addition: e.addition ?? null,
        minute: e.minute ?? null,
        extra_minute: e.extra_minute ?? null,
        injured: e.injured ?? null,
        rescinded: e.rescinded ?? null,
      }))
    : [];

  const statistics = Array.isArray(f.statistics)
    ? f.statistics.map((s) => ({
        participant_id: s.participant_id ?? null,
        data: s.data ? { value: s.data.value ?? null } : null,
        location: s.location ?? null,
        type: s.type
          ? { name: s.type.name ?? null, stat_group: s.type.stat_group ?? null }
          : null,
      }))
    : [];

  const sidelined = Array.isArray(f.sidelined)
    ? f.sidelined.map((sl) => ({
        participant_id: sl.participant_id ?? null,
        player_id: sl.player_id ?? null,
        player: sl.player
          ? {
              firstname: sl.player.firstname ?? null,
              lastname: sl.player.lastname ?? null,
              name: sl.player.name ?? null,
              image_path: sl.player.image_path ?? null,
            }
          : null,
        type: sl.type ? { name: sl.type.name ?? null } : null,
        sideline: sl.sideline ?? null,
      }))
    : [];

  const lineups = Array.isArray(f.lineups)
    ? f.lineups.map((l) => ({
        player_id: l.player_id ?? null,
        team_id: l.team_id ?? null,
        formation_field: l.formation_field ?? null,
        jersey_number: l.jersey_number ?? null,
        player: l.player
          ? {
              firstname: l.player.firstname ?? null,
              lastname: l.player.lastname ?? null,
              name: l.player.name ?? null,
              image_path: l.player.image_path ?? null,
              height: l.player.height ?? null,
              weight: l.player.weight ?? null,
              date_of_birth: l.player.date_of_birth ?? null,
            }
          : null,
        detailedposition: l.detailedposition
          ? { name: l.detailedposition.name ?? null }
          : null,
        details: Array.isArray(l.details)
          ? l.details.map((d) => ({
              data: d.data ? { value: d.data.value ?? null } : null,
              type: d.type
                ? {
                    name: d.type.name ?? null,
                    stat_group: d.type.stat_group ?? null,
                  }
                : null,
            }))
          : [],
      }))
    : [];

  const coaches = Array.isArray(f.coaches)
    ? f.coaches.map((c) => ({
        id: c.id ?? null,
        firstname: c.firstname ?? null,
        lastname: c.lastname ?? null,
        name: c.name ?? null,
        image_path: c.image_path ?? null,
      }))
    : [];

  const referees = Array.isArray(f.referees)
    ? f.referees.map((r) => ({
        referee_id: r.referee_id ?? null,
        referee: r.referee
          ? {
              firstname: r.referee.firstname ?? null,
              lastname: r.referee.lastname ?? null,
              name: r.referee.name ?? null,
              image_path: r.referee.image_path ?? null,
            }
          : null,
      }))
    : [];

  return {
    id: f.id ?? null,
    league_id: f.league_id ?? null,
    starting_at: f.starting_at ?? null,
    state: f.state
      ? {
          state: f.state.state ?? null,
          name: f.state.name ?? null,
          short_name: f.state.short_name ?? null,
        }
      : null,
    participants,
    scores,
    league,
    comments,
    formations,
    venue,
    weatherreport,
    events,
    statistics,
    sidelined,
    lineups,
    coaches,
    referees,
  };
}

// Transforms raw SM head-to-head response per b.txt spec.
function transformH2hResponse(raw) {
  const fixtures = Array.isArray(raw?.data) ? raw.data : [];
  const colorMap = buildSapColorMap();

  return fixtures.map((f) => {
    const participants = Array.isArray(f.participants)
      ? f.participants.map((p) => {
          const colors = findSapColors(p.name, colorMap);
          return {
            id: p.id ?? null,
            name: p.name ?? null,
            short_code: p.short_code ?? null,
            image_path: p.image_path ?? null,
            colorPrimary: colors.colorPrimary,
            colorSecondary: colors.colorSecondary,
            meta: p.meta
              ? {
                  location: p.meta.location ?? null,
                  winner: p.meta.winner ?? null,
                  position: p.meta.position ?? null,
                }
              : null,
          };
        })
      : [];

    const scores = Array.isArray(f.scores)
      ? f.scores
          .filter((s) => s.description === "CURRENT")
          .map((s) => ({
            score: s.score
              ? {
                  goals: s.score.goals ?? null,
                  participant: s.score.participant ?? null,
                }
              : null,
          }))
      : [];

    return {
      id: f.id ?? null,
      league: f.league
        ? {
            id: f.league.id ?? null,
            name: f.league.name ?? null,
            image_path: f.league.image_path ?? null,
          }
        : null,
      participants,
      scores,
      venue: f.venue ? { name: f.venue.name ?? null } : null,
    };
  });
}

// GET /football/game/:fixtureId/:team1/:team2
//
// Combines detailed fixture data with head-to-head history.
// H2H is fetched once and cached for 24 h independently.
// Fixture caching rules:
//   - finished game         → 24 h (no auto-polling)
//   - scheduled > 1 h away  → 1 h  (no auto-polling)
//   - scheduled 15 min–1 h  → cache until 15 min before kick-off
//   - scheduled ≤ 15 min    → 30 s  + activity-based polling
//   - live                  → 30 s  + activity-based polling
// Activity-based polling stops after 60 s of no incoming requests and
// restarts on the next request.
app.get("/football/game/:fixtureId/:team1/:team2", async (req, res) => {
  const { fixtureId, team1, team2 } = req.params;
  const fixtureCacheKey = `game:${fixtureId}:${team1}:${team2}`;
  const h2hCacheKey = `h2h:${team1}:${team2}`;

  const fixtureUrl =
    `${SM_BASE}/fixtures/${fixtureId}?api_token=${SM_TOKEN}` +
    `&include=state;participants;scores;league.country;comments;formations;venue;weatherReport;events;statistics.type;formations;sidelined.player;sidelined.type;sidelined.sideline;lineups.player;lineups.detailedPosition;coaches;referees.referee;lineups.details.type`;

  const h2hUrl =
    `${SM_BASE}/fixtures/head-to-head/${team1}/${team2}?api_token=${SM_TOKEN}` +
    `&include=league;participants;scores;venue`;

  // Update activity timestamp
  const act = gameActivity.get(fixtureCacheKey);
  if (act) act.lastRequest = Date.now();

  // Resolve fixture data (dynamic TTL)
  let fixtureData;
  const fixtureEntry = cache.get(fixtureCacheKey);
  if (fixtureEntry) {
    const { ttl } = gameTtlInfo(fixtureEntry.data?.data);
    if (Date.now() - fixtureEntry.fetchedAt < ttl) {
      fixtureData = fixtureEntry.data;
    }
  }

  // Resolve H2H data (24 h TTL, fetch-once)
  let h2hData;
  if (cacheValid(h2hCacheKey, TTL_24H)) {
    h2hData = cache.get(h2hCacheKey).data;
  }

  // If both are cached, respond immediately
  if (fixtureData && h2hData) {
    const { ttl } = gameTtlInfo(fixtureData?.data);
    ensureGamePolling(fixtureCacheKey, fixtureUrl, fixtureData?.data);
    setCacheControl(res, ttl);
    return res.json({
      source: "cache",
      data: {
        fixtureData: transformFixtureGameResponse(fixtureData),
        h2hData: transformH2hResponse(h2hData),
      },
    });
  }

  try {
    // Fetch only what's missing in parallel
    const [freshFixture, freshH2h] = await Promise.all([
      fixtureData ? Promise.resolve(fixtureData) : fetchUrl(fixtureUrl),
      h2hData ? Promise.resolve(h2hData) : fetchUrl(h2hUrl),
    ]);

    cacheSet(fixtureCacheKey, freshFixture);
    if (!h2hData) cacheSet(h2hCacheKey, freshH2h);

    const fixture = freshFixture?.data;
    const { ttl } = gameTtlInfo(fixture);

    ensureGamePolling(fixtureCacheKey, fixtureUrl, fixture);

    setCacheControl(res, ttl);
    res.json({
      source: "origin",
      data: {
        fixtureData: transformFixtureGameResponse(freshFixture),
        h2hData: transformH2hResponse(freshH2h),
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch game data", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache-sap
// Returns a combined, deduplicated list of teams from all cached SAP standings,
// sorted alphabetically by team name.
app.get("/football/cache-sap", (_req, res) => {
  const seen = new Map(); // keyed by competitor id to deduplicate

  for (const compId of SAP_COMPETITION_IDS) {
    const entry = cache.get(`sap:standings:${compId}`);
    if (!entry?.data?.standings) continue;

    for (const stage of entry.data.standings) {
      if (!Array.isArray(stage.rows)) continue;
      for (const row of stage.rows) {
        const c = row.competitor;
        if (!c?.id || seen.has(c.id)) continue;
        seen.set(c.id, {
          teamName: c.name ?? null,
          teamLong: c.longName ?? null,
          teamAbbr: c.symbolicName ?? null,
          colorPrimary: c.color ?? null,
          colorSecondary: c.awayColor ?? null,
        });
      }
    }
  }

  const standings = Array.from(seen.values()).sort((a, b) =>
    (a.teamName ?? "").localeCompare(b.teamName ?? ""),
  );

  res.json({ standings });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache data helpers — leagues / teams / fixtures bulk endpoints
// ─────────────────────────────────────────────────────────────────────────────

// Fixture date window: end = yesterday in UTC-1, start = end − 100 days.
function getFixtureDateRange() {
  const utcMinus1Now = new Date(Date.now() - 60 * 60 * 1000);
  const end = new Date(utcMinus1Now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 100);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

// Transform a league item per a.txt spec.
function transformCacheLeague(item) {
  return {
    id: item.id,
    name: item.name ?? null,
    image_path: item.image_path ?? null,
    sub_type: item.sub_type ?? null,
    currentseason: item.currentseason
      ? { id: item.currentseason.id, name: item.currentseason.name ?? null }
      : null,
  };
}

// Transform a team item per b.txt spec.
function transformCacheTeam(item) {
  const mapPlayer = (p) => ({
    player_id: p.player_id ?? null,
    player: p.player
      ? {
          firstname: p.player.firstname ?? null,
          lastname: p.player.lastname ?? null,
          name: p.player.name ?? null,
          display_name: p.player.display_name ?? null,
          image_path: p.player.image_path ?? null,
        }
      : null,
  });
  return {
    id: item.id,
    name: item.name ?? null,
    short_code: item.short_code ?? null,
    image_path: item.image_path ?? null,
    rankings: Array.isArray(item.rankings)
      ? item.rankings.map((r) => ({
          position: r.position ?? null,
          points: r.points ?? null,
          type: r.type ?? null,
        }))
      : [],
    activeseasons: Array.isArray(item.activeseasons)
      ? item.activeseasons.map((s) => ({
          league: s.league
            ? { id: s.league.id, name: s.league.name ?? null }
            : null,
        }))
      : [],
    sidelined: Array.isArray(item.sidelined)
      ? item.sidelined.map(mapPlayer)
      : [],
    players: Array.isArray(item.players) ? item.players.map(mapPlayer) : [],
  };
}

// Builds a lowercased-name → team lookup from the teams cache.
function buildTeamsNameMap() {
  const map = new Map();
  for (const team of cache.get("cache:teams")?.data ?? []) {
    if (team.name) map.set(team.name.toLowerCase(), team);
  }
  return map;
}

// Resolve a team using the same progressive matching logic as findSapColors.
function findTeamByName(name, teamsNameMap) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (teamsNameMap.has(lower)) return teamsNameMap.get(lower);
  const norm = normalizeName(name);
  for (const [key, team] of teamsNameMap) {
    if (normalizeName(key) === norm) return team;
  }
  for (const [key, team] of teamsNameMap) {
    if (key.includes(lower) || lower.includes(key)) return team;
  }
  if (norm.length >= 4) {
    for (const [key, team] of teamsNameMap) {
      const kn = normalizeName(key);
      if (kn.length >= 4 && (kn.includes(norm) || norm.includes(kn)))
        return team;
    }
  }
  return null;
}

// Transform a raw fixture per c.txt spec + team enrichment.
// Fixture name format: "Away Team vs Home Team" (left = away, right = home).
function transformCacheFixture(item, teamsNameMap, colorMap) {
  const name = item.name ?? "";
  const sepIdx = name.indexOf(" vs ");
  const awayName = sepIdx !== -1 ? name.slice(0, sepIdx).trim() : null;
  const homeName = sepIdx !== -1 ? name.slice(sepIdx + 4).trim() : null;

  const buildSide = (teamName) => {
    const team = findTeamByName(teamName, teamsNameMap);
    const colors = findSapColors(teamName ?? "", colorMap);
    return {
      id: team?.id ?? null,
      name: teamName ?? null,
      image_path: team?.image_path ?? null,
      colorPrimary: colors.colorPrimary,
      colorSecondary: colors.colorSecondary,
    };
  };

  return {
    fixture_id: item.id ?? null,
    league_id: item.league_id ?? null,
    name: item.name ?? null,
    starting_at: item.starting_at ?? null,
    homeTeam: buildSide(homeName),
    awayTeam: buildSide(awayName),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache data warm-up
// ─────────────────────────────────────────────────────────────────────────────

async function warmCacheLeagues() {
  try {
    let page = 1;
    let all = [];
    while (true) {
      const url = `${SM_BASE}/leagues?api_token=${SM_TOKEN}&include=currentSeason&page=${page}`;
      const resp = await fetchUrl(url);
      if (!resp?.data || !Array.isArray(resp.data)) break;
      all = all.concat(resp.data);
      if (!resp.pagination?.has_more) break;
      page++;
    }
    cacheSet("cache:leagues", all.map(transformCacheLeague));
    console.log(`[startup] Cache leagues ready — ${all.length} entries`);
  } catch (err) {
    console.warn("[startup] Cache leagues failed:", err.message);
  }
}

async function warmCacheTeams() {
  try {
    let page = 1;
    let all = [];
    while (true) {
      const url =
        `${SM_BASE}/teams?api_token=${SM_TOKEN}` +
        `&include=rankings;activeSeasons.league;sidelined.player;players.player` +
        `&per_page=50&filters=teamCountries:320,1161,462,17,251,32,11,75285&page=${page}`;
      const resp = await fetchUrl(url);
      if (!resp?.data || !Array.isArray(resp.data)) break;
      all = all.concat(resp.data);
      if (!resp.pagination?.has_more) break;
      page++;
    }
    cacheSet("cache:teams", all.map(transformCacheTeam));
    console.log(`[startup] Cache teams ready — ${all.length} entries`);
  } catch (err) {
    console.warn("[startup] Cache teams failed:", err.message);
  }
}

async function warmCacheFixturesFetch() {
  try {
    const { start, end } = getFixtureDateRange();
    let page = 1;
    let all = [];
    while (true) {
      const url = `${SM_BASE}/fixtures/between/${start}/${end}?api_token=${SM_TOKEN}&filters=populate&page=${page}`;
      const resp = await fetchUrl(url);
      if (!resp?.data || !Array.isArray(resp.data)) break;
      all = all.concat(resp.data);
      if (!resp.pagination?.has_more) break;
      page++;
    }
    cacheSet("cache:fixtures:raw", all);
    console.log(
      `[startup] Cache fixtures raw — ${all.length} entries (${start}→${end})`,
    );
  } catch (err) {
    console.warn("[startup] Cache fixtures fetch failed:", err.message);
  }
}

function enrichCacheFixtures() {
  const rawEntry = cache.get("cache:fixtures:raw");
  if (!rawEntry?.data) return;
  const teamsNameMap = buildTeamsNameMap();
  const colorMap = buildSapColorMap();
  const enriched = rawEntry.data.map((f) =>
    transformCacheFixture(f, teamsNameMap, colorMap),
  );
  cacheSet("cache:fixtures", enriched);
  console.log(`[startup] Cache fixtures enriched — ${enriched.length} entries`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache/leagues  —  all leagues (24 h TTL)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/cache/leagues", (_req, res) => {
  const entry = cache.get("cache:leagues");
  if (!entry?.data) return res.status(503).json({ error: "Cache not ready" });
  setCacheControl(res, TTL_24H);
  res.json({ data: entry.data });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache/teams  —  all teams (24 h TTL)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/cache/teams", (_req, res) => {
  const entry = cache.get("cache:teams");
  if (!entry?.data) return res.status(503).json({ error: "Cache not ready" });
  const colorMap = buildSapColorMap();
  const data = entry.data.map((t) => {
    const { colorPrimary } = findSapColors(t.name ?? "", colorMap);
    const { sidelined: _s, players: _p, ...rest } = t;
    return { ...rest, colorPrimary };
  });
  setCacheControl(res, TTL_24H);
  res.json({ data });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache/players  —  all players (squad + sidelined) from teams (24 h)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/cache/players", (_req, res) => {
  const entry = cache.get("cache:teams");
  if (!entry?.data) return res.status(503).json({ error: "Cache not ready" });
  const colorMap = buildSapColorMap();
  const seen = new Set();
  const players = [];
  for (const team of entry.data) {
    const { colorPrimary } = findSapColors(team.name ?? "", colorMap);
    const addPlayer = (p) => {
      if (!p.player || seen.has(p.player_id)) return;
      seen.add(p.player_id);
      players.push({
        player_id: p.player_id,
        team_id: team.id,
        team_name: team.name,
        team_colorPrimary: colorPrimary,
        ...p.player,
      });
    };
    for (const p of team.players ?? []) addPlayer(p);
    for (const p of team.sidelined ?? []) addPlayer(p);
  }
  setCacheControl(res, TTL_24H);
  res.json({ data: players });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache/fixtures  —  enriched fixture window (24 h TTL)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/cache/fixtures", (_req, res) => {
  const entry = cache.get("cache:fixtures");
  if (!entry?.data) return res.status(503).json({ error: "Cache not ready" });
  setCacheControl(res, TTL_24H);
  res.json({ data: entry.data });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/search  —  combined { leagues, teams, players, matches }
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/search", (_req, res) => {
  const leagues = cache.get("cache:leagues")?.data ?? [];
  const rawTeams = cache.get("cache:teams")?.data ?? [];
  const matches = cache.get("cache:fixtures")?.data ?? [];
  const colorMap = buildSapColorMap();

  // Teams: strip sidelined/players arrays, add colorPrimary
  const teams = rawTeams.map((t) => {
    const { colorPrimary } = findSapColors(t.name ?? "", colorMap);
    const { sidelined: _s, players: _p, ...rest } = t;
    return { ...rest, colorPrimary };
  });

  // Players: squad + sidelined, deduped, with team colorPrimary
  const seen = new Set();
  const players = [];
  for (const team of rawTeams) {
    const { colorPrimary } = findSapColors(team.name ?? "", colorMap);
    const addPlayer = (p) => {
      if (!p.player || seen.has(p.player_id)) return;
      seen.add(p.player_id);
      players.push({
        player_id: p.player_id,
        team_id: team.id,
        team_name: team.name,
        team_colorPrimary: colorPrimary,
        ...p.player,
      });
    };
    for (const p of team.players ?? []) addPlayer(p);
    for (const p of team.sidelined ?? []) addPlayer(p);
  }

  setCacheControl(res, TTL_24H);
  res.json({ leagues, teams, players, matches });
});

// Health & root
// ─────────────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  const entries = {};
  for (const [k, v] of cache.entries()) {
    entries[k] = { ageMs: Date.now() - v.fetchedAt };
  }
  res.json({ status: "ok", cachedKeys: cache.size, entries });
});

app.get("/", (_req, res) => {
  res.json({ message: "Football server running", port: PORT });
});

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  console.log("[init] Warming caches…");
  // All independent fetches in parallel — SAP standings, league meta, and the
  // three bulk cache endpoints (1-3.txt) run simultaneously.
  await Promise.allSettled([
    warmSapStandings(),
    warmLeagueMeta(),
    warmCacheLeagues(),
    warmCacheTeams(),
    warmCacheFixturesFetch(),
  ]);
  // Enrich fixtures with team data + colors (requires phase above to complete).
  enrichCacheFixtures();
  console.log("[init] Warm-up complete");

  // Auto-refresh bulk cache every 24 h.
  const id = setInterval(async () => {
    try {
      await Promise.allSettled([
        warmCacheLeagues(),
        warmCacheTeams(),
        warmCacheFixturesFetch(),
      ]);
      enrichCacheFixtures();
    } catch (e) {
      console.error("[auto-refresh] cache data:", e.message);
    }
  }, TTL_24H);
  refreshIntervals.set("cache:data", id);
}

app.listen(PORT, () => {
  console.log(`Football server listening on port ${PORT}`);
  init().catch((err) => console.error("[init] Fatal error:", err));
});
