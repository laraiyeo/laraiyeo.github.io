const fs = require("fs");
const path = require("path");

function readJsonLike(filePath) {
  let txt = fs.readFileSync(filePath, "utf8");
  const firstBrace = txt.indexOf("{");
  if (firstBrace > 0) txt = txt.slice(firstBrace);
  return JSON.parse(txt);
}

const oddsPath = path.resolve(__dirname, "..", "1.txt");
const summaryPath = path.resolve(__dirname, "..", "1a.txt");
const outPath = path.resolve(__dirname, "..", "1b.txt");

const odds = readJsonLike(oddsPath);
const summary = readJsonLike(summaryPath);

function compScores() {
  const comps = summary.header?.competitions?.[0]?.competitors || [];
  const homeIndex = comps.findIndex((c) => c.homeAway === "home");
  const awayIndex = comps.findIndex((c) => c.homeAway === "away");
  const homeScore = parseInt(comps[homeIndex]?.score || 0, 10);
  const awayScore = parseInt(comps[awayIndex]?.score || 0, 10);
  return { homeIndex, awayIndex, homeScore, awayScore, comps };
}

function findAthleteByName(name) {
  const teams = summary.boxscore?.teams || [];
  for (const t of teams) {
    const athletes = t.statistics?.athletes || [];
    for (const item of athletes) {
      const a = item.athlete;
      if (!a) continue;
      const display = (a.displayName || "").toLowerCase();
      if (display && name.toLowerCase().includes(display))
        return { athlete: a, stats: item.stats, team: t.team };
      if (
        a.fullName &&
        name.toLowerCase().includes((a.fullName || "").toLowerCase())
      )
        return { athlete: a, stats: item.stats, team: t.team };
    }
  }
  return null;
}

function normalizeMarketKey(m) {
  return `${m.marketName}|||${m.statEntityID || ""}`;
}

const seen = new Set();
const blocks = [];

function addBlock(market, extra) {
  const key = normalizeMarketKey(market);
  if (seen.has(key)) return;
  seen.add(key);
  blocks.push({ market, extra });
}

const ev = odds.events?.[0];
if (!ev) throw new Error("no event in odds");

// collect team markets
for (const side of ["home", "away"]) {
  const arr = ev.odds?.teams?.[side] || [];
  for (const m of arr) addBlock(Object.assign({}, m, { _side: side }));
}
// collect all-team markets
for (const m of ev.odds?.teams?.all || [])
  addBlock(Object.assign({}, m, { _side: "all" }));
// players
for (const playerKey of Object.keys(ev.odds?.players || {})) {
  const arr = ev.odds.players[playerKey] || [];
  for (const m of arr)
    addBlock(Object.assign({}, m, { _playerKey: playerKey }));
}

// produce textual block for each
const { homeIndex, awayIndex, homeScore, awayScore, comps } = compScores();

function jsEscape(s) {
  return (s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ensure output file is empty
fs.writeFileSync(
  outPath,
  "NFL market retrieval mapping (generated)\n\n",
  "utf8"
);

for (const b of blocks) {
  const m = b.market;
  const mn = m.marketName;
  const sid = m.statEntityID || "";
  let how = "";
  let result = "null";

  if (/moneyline/i.test(mn) && sid === "home") {
    how =
      'won = summary.header.competitions[0]?.status.type.state === "post" && parseInt(summary.header.competitions[0]?.competitors.find(c=>c.homeAway==="home")?.score||0,10) > parseInt(summary.header.competitions[0]?.competitors.find(c=>c.homeAway==="away")?.score||0,10) ? true : false';
    result =
      homeScore > awayScore &&
      summary.header.competitions[0]?.status?.type?.state === "post"
        ? "true"
        : "false";
  } else if (/moneyline/i.test(mn) && sid === "away") {
    how =
      'won = summary.header.competitions[0]?.status.type.state === "post" && parseInt(summary.header.competitions[0]?.competitors.find(c=>c.homeAway==="away")?.score||0,10) > parseInt(summary.header.competitions[0]?.competitors.find(c=>c.homeAway==="home")?.score||0,10) ? true : false';
    result =
      awayScore > homeScore &&
      summary.header.competitions[0]?.status?.type?.state === "post"
        ? "true"
        : "false";
  } else if (/Spread/i.test(mn)) {
    how =
      "spread = variants[0]?.byBookmaker?.draftkings?.spread (string/number); teamScore = parseInt(selected competitor.score); covered = (teamScore + Number(spread)) > opponentScore";
    result = "unknown";
  } else if (/Over\/Under/i.test(mn) && sid === "all") {
    how =
      'line = summary.pickcenter?.overUnder || summary.pickcenter?.total?.over?.home?.line; matchTotal = parseInt(summary.header.competitions[0]?.competitors.find(c=>c.homeAway==="home")?.score||0,10) + parseInt(summary.header.competitions[0]?.competitors.find(c=>c.homeAway==="away")?.score||0,10); over = matchTotal > line';
    const line =
      summary.pickcenter?.overUnder ||
      (summary.pickcenter &&
        summary.pickcenter.total &&
        summary.pickcenter.total.over &&
        summary.pickcenter.total.over.home &&
        summary.pickcenter.total.over.home.line);
    if (typeof line === "number")
      result = homeScore + awayScore > line ? "over" : "under";
    else result = "unknown";
  } else if (b.market._playerKey) {
    const playerDisplay =
      ev.odds?.playerMeta?.[b.market._playerKey] ||
      b.market._playerKey.replace(/_\d+_NFL$/, "").replace(/_/g, " ");
    const found = findAthleteByName(playerDisplay || b.market._playerKey);
    if (/firstTouchdown/i.test(mn)) {
      how = `summary.firstTouchdown?.athleteId === "${
        found ? found.athlete.id : ""
      }"`;
      result =
        summary.firstTouchdown?.athleteId &&
        found &&
        summary.firstTouchdown.athleteId === found.athlete.id
          ? "true"
          : "false";
    } else if (/lastTouchdown/i.test(mn)) {
      how = `summary.lastTouchdown?.athleteId === "${
        found ? found.athlete.id : ""
      }"`;
      result =
        summary.lastTouchdown?.athleteId &&
        found &&
        summary.lastTouchdown.athleteId === found.athlete.id
          ? "true"
          : "false";
    } else if (/touchdowns/i.test(m.marketName) || m.statID === "touchdowns") {
      how = `playerTDs = found?.stats?.touchdowns || found?.stats?.passing_touchdowns || found?.stats?.rushing_touchdowns || found?.stats?.receiving_touchdowns`;
      const tds =
        found &&
        found.stats &&
        (found.stats.touchdowns ||
          found.stats.passing_touchdowns ||
          found.stats.rushing_touchdowns ||
          found.stats.receiving_touchdowns)
          ? Number(
              found.stats.touchdowns ||
                found.stats.passing_touchdowns ||
                found.stats.rushing_touchdowns ||
                found.stats.receiving_touchdowns
            )
          : 0;
      result = String(tds);
    } else if (m.statID) {
      how = `athlete stat lookup: athlete.stats.${m.statID}`;
      const sidKey = m.statID;
      let val = null;
      if (found && found.stats) {
        val = found.stats[sidKey] || found.stats[sidKey.toLowerCase()];
      }
      result = val != null ? String(val) : "0";
    } else {
      how = "player stat lookup in boxscore.players arrays";
      result = "unknown";
    }
  } else {
    how =
      "Market uses linescores / period totals / pickcenter; see mapping rules in README";
    result = "unknown";
  }

  const block = `"marketName": "${jsEscape(mn)}", "statEntityID": "${jsEscape(
    sid
  )}"\n{\n    How to find: ${how}\n    Result: ${result}\n}\n\n`;
  fs.appendFileSync(outPath, block, "utf8");
}

console.log("Generated", blocks.length, "market blocks to", outPath);
