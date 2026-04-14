import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { NHLService } from "../../services/NHLService";

const { width } = require("react-native").Dimensions.get("window");

const TABS = ["Player", "Game Log", "Career", "Advanced Stats", "Awards"];
const GAME_LOG_PAGE_SIZE = 15;

const toPctNumber = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
};

const pctileSuffix = (n) => {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  if (n % 10 === 1) return "st";
  if (n % 10 === 2) return "nd";
  if (n % 10 === 3) return "rd";
  return "th";
};

const formatPercentileBadge = (value) => {
  const p = toPctNumber(value);
  if (!Number.isFinite(p)) return null;
  const rounded = Math.max(0, Math.min(99, Math.round(p)));
  if (rounded < 50) return `<50th`;
  return `${rounded}${pctileSuffix(rounded)}`;
};

const formatSeasonHeader = (season) => {
  const s = String(season || "").trim();
  if (!/^\d{8}$/.test(s)) return "Regular Season";
  return `${s.slice(0, 4)}-${s.slice(6, 8)} Regular Season`;
};

const asNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const getTextOnColor = (hex) => {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return "#FFFFFF";
  const c = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#FFFFFF";
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#FFFFFF";
};

const blendHexWithWhite = (hex, ratio) => {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return "#D9D9D9";
  const clean = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#D9D9D9";
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  const nr = Math.round(r + (255 - r) * t);
  const ng = Math.round(g + (255 - g) * t);
  const nb = Math.round(b + (255 - b) * t);
  return `#${[nr, ng, nb]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
};

const getPercentileTierColor = (percentile, teamColor) => {
  const p = toPctNumber(percentile);
  const base = String(teamColor || "#2563EB");
  if (!Number.isFinite(p)) {
    return {
      fill: blendHexWithWhite(base, 0.72),
      text: getTextOnColor(blendHexWithWhite(base, 0.72)),
      tier: "low",
      label: "1st-50th",
    };
  }
  if (p >= 81) {
    return {
      fill: base,
      text: getTextOnColor(base),
      tier: "high",
      label: "81st-99th",
    };
  }
  if (p >= 51) {
    const fill = blendHexWithWhite(base, 0.42);
    return {
      fill,
      text: getTextOnColor(fill),
      tier: "mid",
      label: "51st-80th",
    };
  }
  const fill = blendHexWithWhite(base, 0.72);
  return {
    fill,
    text: getTextOnColor(fill),
    tier: "low",
    label: "1st-50th",
  };
};

const formatSeason = (season) => {
  const s = String(season || "").trim();
  if (s.length !== 8) return s || "-";
  return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
};

const toLabel = (key) =>
  String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const fmtPct = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
};

const fmtPlusMinus = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n > 0 ? `+${n}` : String(n);
};

const toPositionName = (position) =>
  position === "G"
    ? "Goalie"
    : position === "C"
      ? "Center"
      : position === "D"
        ? "Defenseman"
        : position === "L"
          ? "Left Wing"
          : position === "R"
            ? "Right Wing"
            : position || "Player";

const NHL_SHARE_SKATER_STATS = [
  { key: "goals", label: "GLS" },
  { key: "assists", label: "AST" },
  { key: "points", label: "PTS" },
  { key: "sog", label: "SOG" },
  { key: "shots", label: "SHT", pct: "shootingPctg" },
  { key: "hits", label: "HIT" },
  { key: "blockedShots", label: "BLK" },
  { key: "plusMinus", label: "+/-" },
  { key: "pim", label: "PIM" },
  { key: "toi", label: "TOI" },
  { key: "avgTimeOnIce", label: "AVG TOI" },
];

const NHL_SHARE_GOALIE_STATS = [
  { key: "wins", label: "W" },
  { key: "losses", label: "L" },
  { key: "otLosses", label: "OTL" },
  { key: "savePctg", label: "SV%" },
  { key: "saves", label: "SV" },
  { key: "goalsAgainst", label: "GA" },
  { key: "shotsAgainst", label: "SA" },
  { key: "powerPlayGoalsAgainst", label: "PP GA" },
  { key: "shutouts", label: "SO" },
  { key: "toi", label: "TOI" },
];

const NHL_SHARE_TOP_PRIORITY = {
  skater: ["GLS", "AST", "SOG", "SHT", "HIT", "TOI", "AVG TOI"],
  goalie: ["W", "SO", "SV%", "SV", "SA", "TOI"],
};

const NHL_GAME_TYPE_LABELS = {
  1: "Preseason",
  2: "Regular Season",
  3: "Playoffs",
  4: "All-Star",
  5: "International",
  6: "Exhibition",
};

const NHL_CAREER_STAT_COLS = [
  { key: "gamesPlayed", label: "GP" },
  { key: "goals", label: "G" },
  { key: "assists", label: "A" },
  { key: "points", label: "PTS" },
  { key: "plusMinus", label: "+/-" },
];

const getNhlTeamLogoUrl = (abbr, isDarkMode) => {
  const clean = String(abbr || "")
    .trim()
    .toUpperCase();
  if (!clean) return null;
  return `https://assets.nhle.com/logos/nhl/svg/${clean}_${isDarkMode ? "dark" : "light"}.svg`;
};

const parseToiSeconds = (value) => {
  const text = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return null;
  const [m, s] = text.split(":").map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
  return m * 60 + s;
};

const formatNhlStatVal = (key, value) => {
  if (value == null || value === "") return "-";
  if (key === "plusMinus") {
    const n = Number(value);
    if (Number.isFinite(n)) return n > 0 ? `+${n}` : String(n);
    return String(value);
  }
  if (key === "savePctg" || /pctg$|pct$/i.test(String(key || ""))) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(1)}%`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    if (Number.isInteger(value)) return String(value);
    return String(value.toFixed(2)).replace(/\.00$/, "");
  }
  return String(value);
};

const statNumericValue = (key, value) => {
  if (key === "toi" || key === "avgTimeOnIce") return parseToiSeconds(value);
  if (key === "plusMinus") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const buildNhlTopFourStats = (stats, mode) => {
  const defs =
    mode === "goalie" ? NHL_SHARE_GOALIE_STATS : NHL_SHARE_SKATER_STATS;
  const priority =
    NHL_SHARE_TOP_PRIORITY[mode] || NHL_SHARE_TOP_PRIORITY.skater;

  const items = defs
    .filter(({ key }) => stats?.[key] != null && stats?.[key] !== "")
    .map(({ key, label }) => ({
      key,
      label,
      value: formatNhlStatVal(key, stats[key]),
      numeric: statNumericValue(key, stats[key]),
    }));

  const itemMap = new Map(items.map((item) => [item.label, item]));
  const ordered = priority.map((label) => itemMap.get(label)).filter(Boolean);

  const hasMeaningfulValue = (item) => {
    const raw = String(item?.value ?? "").trim();
    if (!raw || raw === "-") return false;
    if (raw === "0" || raw === "0.0" || raw === "0%" || raw === "0.0%")
      return false;
    return true;
  };

  const prioritized = [
    ...ordered.filter(hasMeaningfulValue),
    ...ordered.filter((it) => !hasMeaningfulValue(it)),
  ];
  const remaining = items
    .filter((item) => !prioritized.some((p) => p.key === item.key))
    .sort((a, b) => {
      const av = Number.isFinite(a.numeric) ? a.numeric : -Infinity;
      const bv = Number.isFinite(b.numeric) ? b.numeric : -Infinity;
      return bv - av;
    });

  return [...prioritized, ...remaining].slice(0, 4);
};

const NHLRinkGraphic = ({
  xCoord,
  yCoord,
  teamColor,
  teamSide,
  homeTeamDefendingSide,
  isScoring,
  showTargetPath = false,
  orientation = "vertical",
}) => {
  const blue = "#0B71B8";
  const red = "#F0131E";
  const rinkFrame = { x: 10, y: 10, width: 300, height: 168 };
  const leftGoalRect = { x: 28, y: 82, width: 6, height: 24 };
  const rightGoalRect = { x: 286, y: 82, width: 6, height: 24 };
  const coordBounds = {
    xMin: -99,
    xMax: 99,
    yMin: -42,
    yMax: 42,
  };
  const toCoordX = (rinkPx) =>
    coordBounds.xMin +
    ((rinkPx - rinkFrame.x) / rinkFrame.width) *
      (coordBounds.xMax - coordBounds.xMin);
  const toCoordY = (rinkPy) =>
    coordBounds.yMin +
    ((rinkPy - rinkFrame.y) / rinkFrame.height) *
      (coordBounds.yMax - coordBounds.yMin);
  const goalSampleRects = {
    left: {
      x: toCoordX(leftGoalRect.x + leftGoalRect.width / 2),
      y: toCoordY(leftGoalRect.y + leftGoalRect.height / 2),
    },
    right: {
      x: toCoordX(rightGoalRect.x + rightGoalRect.width / 2),
      y: toCoordY(rightGoalRect.y + rightGoalRect.height / 2),
    },
  };

  const safeTeamColor = String(teamColor || "#2563eb");
  const safeTeamSide = String(teamSide || "")
    .trim()
    .toLowerCase();
  const safeDefendingSide = String(homeTeamDefendingSide || "")
    .trim()
    .toLowerCase();
  const shotXRaw =
    xCoord === null || xCoord === undefined || xCoord === ""
      ? null
      : Number(xCoord);
  const shotYRaw =
    yCoord === null || yCoord === undefined || yCoord === ""
      ? null
      : Number(yCoord);
  const hasShot = Number.isFinite(shotXRaw) && Number.isFinite(shotYRaw);
  const shotX = hasShot ? shotXRaw : null;
  const shotY = hasShot ? shotYRaw : null;

  let targetGoal = goalSampleRects.right;
  if (safeDefendingSide === "left") {
    targetGoal =
      safeTeamSide === "away" ? goalSampleRects.left : goalSampleRects.right;
  } else if (safeDefendingSide === "right") {
    targetGoal =
      safeTeamSide === "home" ? goalSampleRects.left : goalSampleRects.right;
  } else if (hasShot) {
    targetGoal = shotX < 0 ? goalSampleRects.left : goalSampleRects.right;
  }

  const shotBorderColor = isScoring ? "#FFFFFF" : safeTeamColor;
  const shotFillColor = isScoring ? safeTeamColor : "#FFFFFF";
  const goalFillColor = safeTeamColor;
  const shotRadius = 7.5;
  const goalRadius = 4;
  const isHorizontal = String(orientation || "").toLowerCase() === "horizontal";
  const shouldShowTargetPath = Boolean(showTargetPath);
  const rinkX = (x) =>
    rinkFrame.x +
    ((x - coordBounds.xMin) / (coordBounds.xMax - coordBounds.xMin)) *
      rinkFrame.width;
  const rinkY = (y) =>
    rinkFrame.y +
    ((y - coordBounds.yMin) / (coordBounds.yMax - coordBounds.yMin)) *
      rinkFrame.height;

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={isHorizontal ? "0 0 320 188" : "0 0 188 320"}
    >
      <G transform={isHorizontal ? undefined : "translate(188 0) rotate(90)"}>
        <Rect
          x="10"
          y="10"
          width="300"
          height="168"
          rx="36"
          fill="#FFFFFF"
          stroke={blue}
          strokeWidth="3.5"
        />

        <Line
          x1="160"
          y1="10"
          x2="160"
          y2="178"
          stroke={red}
          strokeWidth="2.5"
        />
        <Line
          x1="108"
          y1="10"
          x2="108"
          y2="178"
          stroke={blue}
          strokeWidth="2"
        />
        <Line
          x1="212"
          y1="10"
          x2="212"
          y2="178"
          stroke={blue}
          strokeWidth="2"
        />
        <Line x1="34" y1="10" x2="34" y2="178" stroke={red} strokeWidth="1.8" />
        <Line
          x1="286"
          y1="10"
          x2="286"
          y2="178"
          stroke={red}
          strokeWidth="1.8"
        />

        <Circle
          cx="160"
          cy="94"
          r="22"
          fill="none"
          stroke={blue}
          strokeWidth="2"
        />
        <Circle cx="160" cy="94" r="2.3" fill={blue} />

        <Circle
          cx="70"
          cy="53"
          r="22"
          fill="none"
          stroke={red}
          strokeWidth="2"
        />
        <Circle
          cx="70"
          cy="135"
          r="22"
          fill="none"
          stroke={red}
          strokeWidth="2"
        />
        <Circle
          cx="250"
          cy="53"
          r="22"
          fill="none"
          stroke={red}
          strokeWidth="2"
        />
        <Circle
          cx="250"
          cy="135"
          r="22"
          fill="none"
          stroke={red}
          strokeWidth="2"
        />

        <Line x1="64" y1="53" x2="76" y2="53" stroke={red} strokeWidth="1.6" />
        <Line x1="70" y1="47" x2="70" y2="59" stroke={red} strokeWidth="1.6" />
        <Line
          x1="244"
          y1="53"
          x2="256"
          y2="53"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="250"
          y1="47"
          x2="250"
          y2="59"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="64"
          y1="135"
          x2="76"
          y2="135"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="70"
          y1="129"
          x2="70"
          y2="141"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="244"
          y1="135"
          x2="256"
          y2="135"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="250"
          y1="129"
          x2="250"
          y2="141"
          stroke={red}
          strokeWidth="1.6"
        />

        <Line x1="62" y1="30" x2="62" y2="38" stroke={red} strokeWidth="1.6" />
        <Line x1="78" y1="30" x2="78" y2="38" stroke={red} strokeWidth="1.6" />
        <Line
          x1="62"
          y1="150"
          x2="62"
          y2="158"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="78"
          y1="150"
          x2="78"
          y2="158"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="242"
          y1="30"
          x2="242"
          y2="38"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="258"
          y1="30"
          x2="258"
          y2="38"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="242"
          y1="150"
          x2="242"
          y2="158"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="258"
          y1="150"
          x2="258"
          y2="158"
          stroke={red}
          strokeWidth="1.6"
        />

        <Circle cx="128" cy="57" r="1.9" fill={red} />
        <Circle cx="192" cy="57" r="1.9" fill={red} />
        <Circle cx="128" cy="131" r="1.9" fill={red} />
        <Circle cx="192" cy="131" r="1.9" fill={red} />

        <Circle
          cx="34"
          cy="94"
          r="12"
          fill="none"
          stroke={blue}
          strokeWidth="2"
        />
        <Circle
          cx="286"
          cy="94"
          r="12"
          fill="none"
          stroke={blue}
          strokeWidth="2"
        />
        <Rect
          x={leftGoalRect.x}
          y={leftGoalRect.y}
          width={leftGoalRect.width}
          height={leftGoalRect.height}
          rx="3"
          fill="#FFFFFF"
          stroke={red}
          strokeWidth="1.6"
        />
        <Rect
          x={rightGoalRect.x}
          y={rightGoalRect.y}
          width={rightGoalRect.width}
          height={rightGoalRect.height}
          rx="3"
          fill="#FFFFFF"
          stroke={red}
          strokeWidth="1.6"
        />

        {hasShot && shouldShowTargetPath && (
          <Line
            x1={rinkX(shotX)}
            y1={rinkY(shotY)}
            x2={rinkX(targetGoal.x)}
            y2={rinkY(targetGoal.y)}
            stroke={safeTeamColor}
            strokeWidth="1.6"
            strokeOpacity="0.9"
          />
        )}

        {hasShot && (
          <Circle
            cx={rinkX(shotX)}
            cy={rinkY(shotY)}
            r={shotRadius + 2}
            fill="none"
            stroke={shotFillColor}
            strokeWidth="1.3"
          />
        )}

        {hasShot && (
          <Circle
            cx={rinkX(shotX)}
            cy={rinkY(shotY)}
            r={shotRadius}
            fill={shotFillColor}
            stroke={shotBorderColor}
            strokeWidth="2.6"
          />
        )}

        {shouldShowTargetPath && (
          <Circle
            cx={rinkX(targetGoal.x)}
            cy={rinkY(targetGoal.y)}
            r={goalRadius + 1.6}
            fill="none"
            stroke={goalFillColor}
            strokeWidth="1.1"
          />
        )}

        {shouldShowTargetPath && (
          <Circle
            cx={rinkX(targetGoal.x)}
            cy={rinkY(targetGoal.y)}
            r={goalRadius}
            fill={goalFillColor}
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        )}
      </G>
    </Svg>
  );
};

const PlayerPageScreen = ({ route, navigation }) => {
  const { playerId, playerName: routePlayerName } = route.params ?? {};
  const { theme, colors, isDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [activeTab, setActiveTab] = useState("Player");
  const [headerHeight, setHeaderHeight] = useState(170);
  const [gameLogPage, setGameLogPage] = useState(0);
  const [careerExpandedRows, setCareerExpandedRows] = useState({});

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!playerId) {
        setError("Missing player id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${NHLService.BACKEND_URL}/nhl/player/${playerId}`,
        );
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (!mounted) return;
        setPayload(data?.data || data || null);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load player data.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [playerId]);

  const info = payload?.info || null;
  const gameLog = payload?.gameLog?.gameLog || [];
  const tracking = payload?.stats || {};
  const seasonTotals = info?.seasonTotals || [];
  const awards = info?.awards || [];

  const displayName =
    `${String(info?.firstName || "").trim()} ${String(info?.lastName || "").trim()}`.trim() ||
    info?.fullName ||
    routePlayerName ||
    "Player";

  const teamAbbrev = info?.currentTeamAbbrev || "NHL";
  const teamName = info?.fullTeamName || "";
  const teamColor = NHLService.getTeamColor(teamAbbrev, colors.primary);
  const headerTextColor = getTextOnColor(teamColor);
  const teamLogo = isDarkMode
    ? info?.teamLogoDark || info?.teamLogoLight
    : info?.teamLogoLight || info?.teamLogoDark;

  const featured = info?.featuredStats?.regularSeason?.subSeason || {};
  const careerRegular = info?.careerTotals?.regularSeason || {};
  const careerPlayoffs = info?.careerTotals?.playoffs || {};

  const headerBadge = [
    info?.position || "",
    toPositionName(info?.position),
    info?.sweaterNumber ? `#${info.sweaterNumber}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const topChips = useMemo(
    () => [
      { label: "GLS", value: featured?.goals },
      { label: "AST", value: featured?.assists },
      { label: "PTS", value: featured?.points },
      { label: "GP", value: featured?.gamesPlayed },
      { label: "+/-", value: fmtPlusMinus(featured?.plusMinus) },
      { label: "SHT", value: featured?.shots },
      { label: "SHT%", value: fmtPct(featured?.shootingPctg) },
      { label: "AVG TOI", value: featured?.avgToi },
    ],
    [featured],
  );

  const regularCareerChips = useMemo(
    () => [
      { label: "GP", value: careerRegular?.gamesPlayed },
      { label: "GLS", value: careerRegular?.goals },
      { label: "AST", value: careerRegular?.assists },
      { label: "PTS", value: careerRegular?.points },
      { label: "+/-", value: fmtPlusMinus(careerRegular?.plusMinus) },
      { label: "SHT", value: careerRegular?.shots },
      { label: "SHT%", value: fmtPct(careerRegular?.shootingPctg) },
      { label: "AVG TOI", value: careerRegular?.avgToi },
    ],
    [careerRegular],
  );

  const playoffCareerChips = useMemo(
    () => [
      { label: "GP", value: careerPlayoffs?.gamesPlayed },
      { label: "GLS", value: careerPlayoffs?.goals },
      { label: "AST", value: careerPlayoffs?.assists },
      { label: "PTS", value: careerPlayoffs?.points },
      { label: "+/-", value: fmtPlusMinus(careerPlayoffs?.plusMinus) },
      { label: "SHT", value: careerPlayoffs?.shots },
      { label: "SHT%", value: fmtPct(careerPlayoffs?.shootingPctg) },
      { label: "AVG TOI", value: careerPlayoffs?.avgToi },
    ],
    [careerPlayoffs],
  );

  const gameLogPages = Math.max(
    1,
    Math.ceil(gameLog.length / GAME_LOG_PAGE_SIZE),
  );
  const gameLogSlice = gameLog.slice(
    gameLogPage * GAME_LOG_PAGE_SIZE,
    gameLogPage * GAME_LOG_PAGE_SIZE + GAME_LOG_PAGE_SIZE,
  );

  const stickyThreshold = Math.max(headerHeight - 40, 90);
  const stickyOpacity = scrollY.interpolate({
    inputRange: [stickyThreshold, stickyThreshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [stickyThreshold, stickyThreshold + 40],
    outputRange: [0, 56],
    extrapolate: "clamp",
  });

  const renderStatBubble = (title, chips) => (
    <View
      style={[
        styles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.bubbleTitle, { color: theme.textSecondary }]}>
        {title}
      </Text>
      <View style={styles.chipsGrid}>
        {chips.map((chip, idx) => (
          <View
            key={`${title}-${chip.label}-${idx}`}
            style={[styles.chip, { backgroundColor: theme.background }]}
          >
            <Text style={[styles.chipValue, { color: theme.text }]}>
              {chip.value ?? "-"}
            </Text>
            <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>
              {chip.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderPlayerTab = () => (
    <View style={styles.tabWrap}>
      {renderStatBubble("Season", topChips)}
      {renderStatBubble("Career Regular Season", regularCareerChips)}
      {renderStatBubble("Career Playoffs", playoffCareerChips)}

      <View
        style={[
          styles.bubble,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.bubbleTitle, { color: theme.text }]}>Bio</Text>
        {[
          ["Height", info?.heightInInches ? `${info.heightInInches} in` : "-"],
          ["Weight", info?.weightInPounds ? `${info.weightInPounds} lb` : "-"],
          ["Shoots", info?.shootsCatches || "-"],
          ["Birth Date", info?.birthDate || "-"],
          [
            "Birth Place",
            [info?.birthCity, info?.birthStateProvince, info?.birthCountry]
              .filter(Boolean)
              .join(", ") || "-",
          ],
          [
            "Draft",
            info?.draftDetails?.year
              ? `${info.draftDetails.year} · R${info.draftDetails.round} · P${info.draftDetails.pickInRound} (${info.draftDetails.teamAbbrev})`
              : "Undrafted / N/A",
          ],
        ].map(([k, v], idx, arr) => (
          <View
            key={k}
            style={[
              styles.bioRow,
              idx !== arr.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.bioKey, { color: theme.textSecondary }]}>
              {k}
            </Text>
            <Text style={[styles.bioVal, { color: theme.text }]}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderGameLogTab = () => (
    <View style={{ paddingTop: 6, paddingBottom: 40 }}>
      {gameLogSlice.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No game log entries.
          </Text>
        </View>
      ) : (
        gameLogSlice.map((entry, idx) => {
          const gameId = entry?.gameId || entry?.id || null;
          const gameDate = entry?.gameDate || entry?.date || "";
          const opponentAbbrev = String(
            entry?.opponentAbbrev ||
              entry?.opponent?.abbrev ||
              entry?.opponent?.abbreviation ||
              "",
          )
            .trim()
            .toUpperCase();
          const opponentCommonName =
            entry?.opponentCommonName ||
            entry?.opponent?.commonName ||
            entry?.opponentName ||
            entry?.opponent?.name ||
            "Opponent";
          const homeRoadFlag = String(entry?.homeRoadFlag || "")
            .trim()
            .toUpperCase();
          const homeRoadPrefix =
            homeRoadFlag === "H" ? "vs" : homeRoadFlag === "R" ? "@" : "";
          const oppDisplay = [opponentAbbrev, opponentCommonName]
            .filter(Boolean)
            .join(" · ");
          const oppLogoUrl = getNhlTeamLogoUrl(opponentAbbrev, isDarkMode);
          const playerTeamLogoUrl = getNhlTeamLogoUrl(teamAbbrev, isDarkMode);
          const oppColor = NHLService.getTeamColor(
            opponentAbbrev || opponentCommonName,
            "#888888",
          );

          const formatGameDate = (d) => {
            if (!d) return "";
            try {
              return new Date(d).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
            } catch {
              return d;
            }
          };

          const mode =
            String(info?.position || "").toUpperCase() === "G"
              ? "goalie"
              : "skater";
          const statSource = {
            goals: entry?.goals,
            assists: entry?.assists,
            points: entry?.points,
            sog: entry?.sog ?? entry?.shots,
            shots: entry?.shots,
            hits: entry?.hits,
            blockedShots: entry?.blockedShots,
            plusMinus: entry?.plusMinus,
            pim: entry?.pim,
            toi: entry?.toi,
            avgTimeOnIce: entry?.avgToi,
            wins: entry?.wins,
            losses: entry?.losses,
            otLosses: entry?.otLosses,
            savePctg: entry?.savePctg,
            saves: entry?.saves,
            goalsAgainst: entry?.goalsAgainst,
            shotsAgainst: entry?.shotsAgainst,
            shutouts: entry?.shutouts,
          };
          const topFour = buildNhlTopFourStats(statSource, mode);

          const gradId = `nhl_gl_${idx}`;

          return (
            <View key={`gamelog-${idx}-${gameDate}`} style={styles.cardWrap}>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.surface }]}
                activeOpacity={0.75}
                onPress={() =>
                  gameId != null &&
                  navigation.navigate("GameDetails", {
                    sport: "nhl",
                    gameId: String(gameId),
                  })
                }
              >
                <Svg
                  style={StyleSheet.absoluteFill}
                  width="100%"
                  height="100%"
                  pointerEvents="none"
                >
                  <Defs>
                    <SvgLinearGradient
                      id={gradId}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <Stop
                        offset="0%"
                        stopColor={teamColor}
                        stopOpacity="0.15"
                      />
                      <Stop
                        offset="40%"
                        stopColor={theme.surface}
                        stopOpacity="0"
                      />
                      <Stop
                        offset="60%"
                        stopColor={theme.surface}
                        stopOpacity="0"
                      />
                      <Stop
                        offset="100%"
                        stopColor={oppColor}
                        stopOpacity="0.15"
                      />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
                </Svg>

                <View style={styles.cardInner}>
                  <View style={styles.leftCol}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.dateText, { color: theme.textSecondary }]}
                      numberOfLines={2}
                    >
                      {formatGameDate(gameDate)}
                    </Text>
                    {playerTeamLogoUrl ? (
                      <Image
                        source={{ uri: playerTeamLogoUrl }}
                        style={styles.leftLogo}
                        contentFit="contain"
                      />
                    ) : (
                      <View
                        style={[
                          styles.leftLogoFallback,
                          { backgroundColor: `${teamColor}33` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.leftLogoFallbackText,
                            { color: teamColor },
                          ]}
                        >
                          {(teamAbbrev[0] ?? "").toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.middle}>
                    <View style={styles.topStatGrid}>
                      {topFour.map((item) => (
                        <View
                          key={`${gameId}-${item.label}`}
                          style={styles.topStatCell}
                        >
                          <Text
                            allowFontScaling={false}
                            style={[styles.topStatValue, { color: theme.text }]}
                            numberOfLines={1}
                          >
                            {item.value}
                          </Text>
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.topStatLabel,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={[styles.oppRow, { borderTopColor: theme.border }]}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.oppPrefix, { color: theme.textSecondary }]}
                  >
                    {homeRoadPrefix}
                  </Text>
                  {oppLogoUrl ? (
                    <Image
                      source={{ uri: oppLogoUrl }}
                      style={styles.oppLogo}
                      contentFit="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.oppLogoFallback,
                        { backgroundColor: `${oppColor}33` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.oppLogoFallbackText,
                          { color: oppColor },
                        ]}
                      >
                        {(
                          opponentAbbrev[0] ??
                          opponentCommonName[0] ??
                          "?"
                        ).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text
                    allowFontScaling={false}
                    style={[styles.oppName, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {oppDisplay || "Opponent"}
                  </Text>
                  <Text
                    style={[styles.oppChevron, { color: theme.textSecondary }]}
                  >
                    ›
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          );
        })
      )}

      {gameLogPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[
              styles.pageBtnMlb,
              {
                backgroundColor: theme.surface,
                opacity: gameLogPage === 0 ? 0.35 : 1,
              },
            ]}
            disabled={gameLogPage === 0}
            onPress={() => setGameLogPage((p) => p - 1)}
            activeOpacity={0.75}
          >
            <Text style={[styles.pageBtnTextMlb, { color: teamColor }]}>
              ‹ Prev
            </Text>
          </TouchableOpacity>
          <Text style={[styles.pageLabelMlb, { color: theme.textSecondary }]}>
            {gameLogPage + 1} / {gameLogPages}
          </Text>
          <TouchableOpacity
            style={[
              styles.pageBtnMlb,
              {
                backgroundColor: theme.surface,
                opacity: gameLogPage === gameLogPages - 1 ? 0.35 : 1,
              },
            ]}
            disabled={gameLogPage === gameLogPages - 1}
            onPress={() => setGameLogPage((p) => p + 1)}
            activeOpacity={0.75}
          >
            <Text style={[styles.pageBtnTextMlb, { color: teamColor }]}>
              Next ›
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderCareerTab = () => (
    <View style={styles.careerContainer}>
      {(() => {
        const hasStatValue = (row) =>
          NHL_CAREER_STAT_COLS.some(({ key }) => row?.[key] != null);

        const formatCareerValue = (key, value) => {
          if (value == null) return "-";
          if (key === "plusMinus") return fmtPlusMinus(value);
          return String(value);
        };

        const getCareerStatColor = (key, value) => {
          if (key !== "plusMinus") return theme.text;
          const n = Number(value);
          if (!Number.isFinite(n)) return theme.text;
          if (n > 0) return theme.success ?? "#22C55E";
          if (n < 0) return theme.error ?? "#EF4444";
          return theme.text;
        };

        const sumRows = (rows) =>
          rows.reduce(
            (acc, row) => ({
              gamesPlayed:
                (acc.gamesPlayed || 0) + Number(row?.gamesPlayed || 0),
              goals: (acc.goals || 0) + Number(row?.goals || 0),
              assists: (acc.assists || 0) + Number(row?.assists || 0),
              points: (acc.points || 0) + Number(row?.points || 0),
              plusMinus: (acc.plusMinus || 0) + Number(row?.plusMinus || 0),
            }),
            { gamesPlayed: 0, goals: 0, assists: 0, points: 0, plusMinus: 0 },
          );

        const regularCareer = info?.careerTotals?.regularSeason || null;
        const playoffCareer = info?.careerTotals?.playoffs || null;
        const totalsRows = [regularCareer, playoffCareer].filter(hasStatValue);
        const totalsSummary = sumRows(totalsRows);
        const totalsExpanded = !!careerExpandedRows.__totals__;

        const nhlRows = seasonTotals.filter(
          (row) => String(row?.leagueAbbrev || "").toUpperCase() === "NHL",
        );
        const otherRows = seasonTotals.filter(
          (row) => String(row?.leagueAbbrev || "").toUpperCase() !== "NHL",
        );

        const renderSeasonSection = (title, rows, sectionKey) => {
          if (rows.length === 0) {
            return (
              <View
                style={[
                  styles.careerBubble,
                  { backgroundColor: theme.surface },
                ]}
              >
                <View
                  style={[
                    styles.careerBubbleHeader,
                    {
                      borderBottomColor: teamColor,
                      backgroundColor: `${teamColor}33`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.careerBubbleTitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {title}
                  </Text>
                </View>
                <Text
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  No data available.
                </Text>
              </View>
            );
          }

          const bySeason = rows.reduce((acc, row) => {
            const key = String(row?.season || "Unknown");
            if (!acc[key]) acc[key] = [];
            acc[key].push(row);
            return acc;
          }, {});

          const seasons = Object.keys(bySeason).sort(
            (a, b) => Number(b) - Number(a),
          );

          return (
            <View
              style={[styles.careerBubble, { backgroundColor: theme.surface }]}
            >
              <View
                style={[
                  styles.careerBubbleHeader,
                  {
                    borderBottomColor: teamColor,
                    backgroundColor: `${teamColor}33`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.careerBubbleTitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  {title}
                </Text>
              </View>

              {seasons.map((season, idx) => {
                const entries = [...bySeason[season]].sort(
                  (a, b) => Number(a?.sequence || 0) - Number(b?.sequence || 0),
                );
                const summary = sumRows(entries);
                const uniqueTeams = [
                  ...new Set(entries.map((r) => r?.teamName).filter(Boolean)),
                ];
                const displayTeam =
                  uniqueTeams.length > 1
                    ? "Multiple Teams"
                    : uniqueTeams[0] || entries[0]?.teamName || "Team";
                const placeholderWord =
                  String(displayTeam || "")
                    .trim()
                    .split(/\s+/)[0] || "";
                const placeholderToken =
                  placeholderWord.slice(0, 3).toUpperCase() || "---";

                const sectionRowKey = `${sectionKey}_${season}`;
                const expanded = !!careerExpandedRows[sectionRowKey];

                const teamAbbrev =
                  sectionKey === "nhl"
                    ? NHLService.resolveTeamAbbrevFuzzy(
                        uniqueTeams[0] || entries[0]?.teamName,
                      ) ||
                      NHLService.resolveTeamAbbrevFuzzy(entries[0]?.teamAbbrev)
                    : null;
                const rowColor =
                  sectionKey === "nhl"
                    ? NHLService.getTeamColor(
                        teamAbbrev || displayTeam,
                        teamColor,
                      )
                    : teamColor;
                const rowLogo =
                  sectionKey === "nhl"
                    ? getNhlTeamLogoUrl(teamAbbrev, isDarkMode)
                    : null;

                return (
                  <View
                    key={`${sectionKey}-${season}`}
                    style={
                      idx < seasons.length - 1
                        ? {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.border,
                          }
                        : undefined
                    }
                  >
                    <TouchableOpacity
                      onPress={() =>
                        setCareerExpandedRows((prev) => ({
                          ...prev,
                          [sectionRowKey]: !prev[sectionRowKey],
                        }))
                      }
                      style={styles.careerYearRow}
                      activeOpacity={0.75}
                    >
                      {rowLogo ? (
                        <Image
                          source={{ uri: rowLogo }}
                          style={styles.careerRowLogo}
                          contentFit="contain"
                        />
                      ) : (
                        <View
                          style={[
                            styles.careerRowLogoFallback,
                            { backgroundColor: `${rowColor}33` },
                          ]}
                        >
                          <Text
                            style={[
                              styles.careerRowLogoFallbackText,
                              { color: rowColor },
                            ]}
                          >
                            {placeholderToken}
                          </Text>
                        </View>
                      )}

                      <View style={styles.careerRowInfo}>
                        <Text
                          style={[styles.careerRowTeam, { color: theme.text }]}
                        >
                          {displayTeam}
                        </Text>
                        <Text
                          style={[
                            styles.careerRowYear,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {formatSeason(season)}
                        </Text>
                      </View>

                      <View style={styles.careerRowStats}>
                        {NHL_CAREER_STAT_COLS.map(({ key, label }) => (
                          <View
                            key={`${sectionRowKey}-${label}`}
                            style={styles.careerRowStatCell}
                          >
                            <Text
                              style={[
                                styles.careerRowStatVal,
                                {
                                  color: getCareerStatColor(key, summary[key]),
                                },
                              ]}
                            >
                              {formatCareerValue(key, summary[key])}
                            </Text>
                            <Text
                              style={[
                                styles.careerRowStatLbl,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {label}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <Text
                        style={[
                          styles.careerChevron,
                          { color: theme.textSecondary },
                          {
                            transform: [
                              { rotate: expanded ? "90deg" : "0deg" },
                            ],
                          },
                        ]}
                      >
                        ›
                      </Text>
                    </TouchableOpacity>

                    {expanded && (
                      <View
                        style={[
                          styles.careerDropdownContainer,
                          {
                            borderTopColor: theme.border,
                            borderLeftColor: rowColor,
                          },
                        ]}
                      >
                        {entries.map((entry, rowIdx) => (
                          <View
                            key={`${sectionRowKey}-${entry?.sequence || rowIdx}`}
                            style={[
                              styles.careerDropdownRow,
                              rowIdx < entries.length - 1 && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: theme.border,
                              },
                            ]}
                          >
                            <View style={styles.careerDropdownBadge}>
                              <Text
                                style={[
                                  styles.careerDropdownBadgeText,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {NHL_GAME_TYPE_LABELS[entry?.gameTypeId] ||
                                  `Type ${entry?.gameTypeId ?? "-"}`}
                              </Text>
                              <Text
                                style={[
                                  styles.careerDropdownTeamName,
                                  { color: theme.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {`${entry?.leagueAbbrev || "League"} · ${entry?.teamName || "Team"}`}
                              </Text>
                            </View>
                            <View style={styles.careerRowStats}>
                              {NHL_CAREER_STAT_COLS.map(({ key }) => (
                                <View
                                  key={`${sectionRowKey}-${rowIdx}-${key}`}
                                  style={styles.careerRowStatCell}
                                >
                                  <Text
                                    style={[
                                      styles.careerRowStatVal,
                                      {
                                        color: getCareerStatColor(
                                          key,
                                          entry?.[key],
                                        ),
                                      },
                                    ]}
                                  >
                                    {formatCareerValue(key, entry?.[key])}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        };

        return (
          <>
            {totalsRows.length > 0 && (
              <View
                style={[
                  styles.careerBubble,
                  { backgroundColor: theme.surface },
                ]}
              >
                <View
                  style={[
                    styles.careerBubbleHeader,
                    {
                      borderBottomColor: teamColor,
                      backgroundColor: `${teamColor}33`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.careerBubbleTitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Career Totals
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() =>
                    setCareerExpandedRows((prev) => ({
                      ...prev,
                      __totals__: !prev.__totals__,
                    }))
                  }
                  style={styles.careerYearRow}
                  activeOpacity={0.75}
                >
                  <View style={styles.careerRowInfo}>
                    <Text style={[styles.careerRowTeam, { color: theme.text }]}>
                      All Game Types
                    </Text>
                    <Text
                      style={[
                        styles.careerRowYear,
                        { color: theme.textSecondary },
                      ]}
                    >
                      NHL Career
                    </Text>
                  </View>
                  <View style={styles.careerRowStats}>
                    {NHL_CAREER_STAT_COLS.map(({ key, label }) => (
                      <View
                        key={`totals-${label}`}
                        style={styles.careerRowStatCell}
                      >
                        <Text
                          style={[
                            styles.careerRowStatVal,
                            {
                              color: getCareerStatColor(
                                key,
                                totalsSummary[key],
                              ),
                            },
                          ]}
                        >
                          {formatCareerValue(key, totalsSummary[key])}
                        </Text>
                        <Text
                          style={[
                            styles.careerRowStatLbl,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text
                    style={[
                      styles.careerChevron,
                      { color: theme.textSecondary },
                      {
                        transform: [
                          { rotate: totalsExpanded ? "90deg" : "0deg" },
                        ],
                      },
                    ]}
                  >
                    ›
                  </Text>
                </TouchableOpacity>

                {totalsExpanded && (
                  <View
                    style={[
                      styles.careerDropdownContainer,
                      {
                        borderTopColor: theme.border,
                        borderLeftColor: teamColor,
                      },
                    ]}
                  >
                    {[regularCareer, playoffCareer]
                      .filter(hasStatValue)
                      .map((row, idx, arr) => (
                        <View
                          key={`total-row-${idx}`}
                          style={[
                            styles.careerDropdownRow,
                            idx < arr.length - 1 && {
                              borderBottomWidth: StyleSheet.hairlineWidth,
                              borderBottomColor: theme.border,
                            },
                          ]}
                        >
                          <View style={styles.careerDropdownBadge}>
                            <Text
                              style={[
                                styles.careerDropdownBadgeText,
                                { color: theme.text },
                              ]}
                            >
                              {idx === 0 ? "Regular Season" : "Playoffs"}
                            </Text>
                          </View>
                          <View style={styles.careerRowStats}>
                            {NHL_CAREER_STAT_COLS.map(({ key }) => (
                              <View
                                key={`total-${idx}-${key}`}
                                style={styles.careerRowStatCell}
                              >
                                <Text
                                  style={[
                                    styles.careerRowStatVal,
                                    {
                                      color: getCareerStatColor(
                                        key,
                                        row?.[key],
                                      ),
                                    },
                                  ]}
                                >
                                  {formatCareerValue(key, row?.[key])}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                  </View>
                )}
              </View>
            )}

            {renderSeasonSection("Career - NHL", nhlRows, "nhl")}
            {renderSeasonSection("Career - Other", otherRows, "other")}
          </>
        );
      })()}
    </View>
  );

  const renderAdvancedStatsTab = () => {
    const isCompactLayout = width < 900;
    const topShotSpeed = tracking?.topShotSpeed || null;
    const maxSkatingSpeed = tracking?.skatingSpeed?.speedMax || null;
    const maxDistanceGame = tracking?.distanceMaxGame || null;
    const sogSummary = Array.isArray(tracking?.sogSummary)
      ? tracking.sogSummary
      : [];
    const sogDetails = Array.isArray(tracking?.sogDetails)
      ? tracking.sogDetails
      : [];

    const hasAnyAdvanced =
      !!topShotSpeed ||
      !!maxSkatingSpeed ||
      !!maxDistanceGame ||
      sogSummary.length > 0 ||
      sogDetails.length > 0;

    if (!hasAnyAdvanced) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No advanced stats available.
          </Text>
        </View>
      );
    }

    const seasonBanner = formatSeasonHeader(info?.featuredStats?.season);
    const seasonLineStats = [
      ["GP", info?.featuredStats?.regularSeason?.subSeason?.gamesPlayed],
      ["G", info?.featuredStats?.regularSeason?.subSeason?.goals],
      ["A", info?.featuredStats?.regularSeason?.subSeason?.assists],
      ["P", info?.featuredStats?.regularSeason?.subSeason?.points],
    ];

    const getOverlayLines = (overlay) => {
      if (!overlay || typeof overlay !== "object") return [];
      const lines = [];
      if (overlay?.gameDate) lines.push(`Game: ${overlay.gameDate}`);
      const away = overlay?.awayTeam;
      const home = overlay?.homeTeam;
      if (away?.abbrev && home?.abbrev) {
        lines.push(
          `${away.abbrev} ${away?.score ?? ""} at ${home.abbrev} ${home?.score ?? ""}`.trim(),
        );
      }
      const period = overlay?.periodDescriptor?.number;
      const tip = [period ? `P${period}` : "", overlay?.timeInPeriod || ""]
        .filter(Boolean)
        .join(" ");
      if (tip) lines.push(tip);
      return lines;
    };

    const MetricCard = ({ title, value, unit, percentile, overlay }) => {
      const badge = formatPercentileBadge(percentile);
      const pctColor = getPercentileTierColor(percentile, teamColor);
      const overlayLines = getOverlayLines(overlay);
      return (
        <View
          style={[
            styles.advMetricCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.advMetricTopRow}>
            {badge ? (
              <View
                style={[
                  styles.advPctBadge,
                  {
                    backgroundColor: pctColor.fill,
                    borderColor: pctColor.fill,
                  },
                ]}
              >
                <Text style={[styles.advPctText, { color: pctColor.text }]}>
                  {badge}
                </Text>
              </View>
            ) : (
              <View />
            )}
          </View>
          <Text style={[styles.advMetricValue, { color: theme.text }]}>
            {value}
          </Text>
          <Text
            style={[styles.advMetricTitle, { color: theme.textSecondary }]}
          >{`${title} ${unit ? `• ${unit}` : ""}`}</Text>
          {overlayLines.length > 0 && (
            <View style={styles.advOverlayWrap}>
              {overlayLines.map((line, idx) => (
                <Text
                  key={`${title}-ov-${idx}`}
                  style={[
                    styles.advOverlayText,
                    { color: theme.textTertiary ?? theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      );
    };

    const summaryByCode = sogSummary.reduce((acc, row) => {
      const key = String(row?.locationCode || "").toLowerCase();
      if (key) acc[key] = row;
      return acc;
    }, {});

    const zoneRows = [
      { code: "all", label: "All Locations" },
      { code: "high", label: "High-Danger" },
      { code: "mid", label: "Mid-Range" },
      { code: "long", label: "Long-Range" },
    ];

    const zoneSnapshotItems = [
      {
        key: "defensive",
        title: "Defensive Zone",
        value: asNum(tracking?.zoneTimeDetails?.defensiveZonePctg),
        avg: asNum(tracking?.zoneTimeDetails?.defensiveZoneLeagueAvg),
        pct: tracking?.zoneTimeDetails?.defensiveZonePercentile,
      },
      {
        key: "neutral",
        title: "Neutral Zone",
        value: asNum(tracking?.zoneTimeDetails?.neutralZonePctg),
        avg: asNum(tracking?.zoneTimeDetails?.neutralZoneLeagueAvg),
        pct: tracking?.zoneTimeDetails?.neutralZonePercentile,
      },
      {
        key: "offensive",
        title: "Offensive Zone",
        value: asNum(tracking?.zoneTimeDetails?.offensiveZonePctg),
        avg: asNum(tracking?.zoneTimeDetails?.offensiveZoneLeagueAvg),
        pct: tracking?.zoneTimeDetails?.offensiveZonePercentile,
      },
    ];

    const percentileLegend = [
      { key: "low", label: "1st-50th percentile", pct: 35 },
      { key: "mid", label: "51st-80th percentile", pct: 65 },
      { key: "high", label: "81st-99th percentile", pct: 90 },
    ].map((item) => ({
      ...item,
      color: getPercentileTierColor(item.pct, teamColor),
    }));

    const detailBars = sogDetails.map((row, idx) => {
      const shots = asNum(row?.shots) ?? 0;
      const areaLabel =
        row?.area ||
        row?.locationName ||
        row?.location ||
        row?.locationCode ||
        row?.code ||
        `Area ${idx + 1}`;
      return {
        key: String(areaLabel).toLowerCase().replace(/\s+/g, "-") + `-${idx}`,
        areaLabel: toLabel(areaLabel),
        shots,
        shotsPercentile: row?.shotsPercentile,
      };
    });
    const maxDetailShots = Math.max(1, ...detailBars.map((bar) => bar.shots));

    const renderedSections = ["Season Header"];
    if (topShotSpeed) renderedSections.push("Hardest Shot");
    if (maxSkatingSpeed) renderedSections.push("Max Skating Speed");
    if (maxDistanceGame) renderedSections.push("Most Miles Skated");
    renderedSections.push("Shots On Goal Zone");
    renderedSections.push("Zone Snapshots");

    if (__DEV__) {
      console.log("[NHL Advanced Stats] Render sections", {
        playerId: String(playerId || ""),
        count: renderedSections.length,
        sections: renderedSections,
      });
    }

    return (
      <View style={styles.advWrap}>
        <View
          style={[
            styles.advSeasonBar,
            isCompactLayout && styles.advSeasonBarCompact,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.advSeasonTitle, { color: theme.text }]}>
            {seasonBanner}
          </Text>
          <View
            style={[
              styles.advSeasonStatsRow,
              isCompactLayout && styles.advSeasonStatsRowCompact,
            ]}
          >
            {seasonLineStats.map(([label, val]) => (
              <View
                key={`adv-season-${label}`}
                style={[
                  styles.advSeasonStatCell,
                  { borderLeftColor: theme.border },
                ]}
              >
                <Text
                  style={[
                    styles.advSeasonStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[styles.advSeasonStatValue, { color: theme.text }]}
                >
                  {val ?? "-"}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.advMetricGrid}>
          {topShotSpeed && (
            <MetricCard
              title="Hardest Shot"
              value={Number(topShotSpeed?.imperial || 0).toFixed(2)}
              unit="MPH"
              percentile={topShotSpeed?.percentile}
              overlay={topShotSpeed?.overlay}
            />
          )}
          {maxSkatingSpeed && (
            <MetricCard
              title="Max Skating Speed"
              value={Number(maxSkatingSpeed?.imperial || 0).toFixed(2)}
              unit="MPH"
              percentile={maxSkatingSpeed?.percentile}
              overlay={maxSkatingSpeed?.overlay}
            />
          )}
          {maxDistanceGame && (
            <MetricCard
              title="Most Miles Skated"
              value={Number(maxDistanceGame?.imperial || 0).toFixed(2)}
              unit="Game"
              percentile={maxDistanceGame?.percentile}
              overlay={maxDistanceGame?.overlay}
            />
          )}
        </View>

        <View style={styles.advSectionStack}>
          <View
            style={[
              styles.advSectionCardWide,
              styles.advSectionCardFull,
              styles.advShotZoneCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.advSectionTitle, { color: theme.text }]}>
              Shots On Goal Zone
            </Text>

            <View style={styles.advZoneTopGrid}>
              {zoneRows.map(({ code, label }) => {
                const row = summaryByCode[code] || {};
                const badge = formatPercentileBadge(row?.shotsPercentile);
                const pctColor = getPercentileTierColor(
                  row?.shotsPercentile,
                  teamColor,
                );
                return (
                  <View
                    key={`zone-${code}`}
                    style={[
                      styles.advZoneTopCard,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.advZoneTopBadgeWrap}>
                      {badge ? (
                        <View
                          style={[
                            styles.advPctBadge,
                            {
                              backgroundColor: pctColor.fill,
                              borderColor: pctColor.fill,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.advPctText,
                              { color: pctColor.text },
                            ]}
                          >
                            {badge}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[styles.advZoneTopValue, { color: theme.text }]}
                    >
                      {row?.shots ?? "-"}
                    </Text>
                    <Text
                      style={[
                        styles.advZoneTopLabel,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View
              style={[
                styles.advZoneSplitDivider,
                { borderColor: theme.border },
              ]}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.advZoneBarScrollContent}
            >
              {detailBars.map((bar) => {
                const normalized = Math.max(0, bar.shots) / maxDetailShots;
                const barHeight =
                  bar.shots > 0 ? Math.max(8, Math.round(normalized * 120)) : 0;
                const percentileText =
                  formatPercentileBadge(bar.shotsPercentile) || "-";
                const pctColor = getPercentileTierColor(
                  bar.shotsPercentile,
                  teamColor,
                );
                return (
                  <View
                    key={`sog-detail-${bar.key}`}
                    style={[
                      styles.advZoneBarCard,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.advZoneBarLabel,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      {bar.areaLabel}
                    </Text>
                    <View
                      style={[
                        styles.advZoneBarTrack,
                        { backgroundColor: `${pctColor.fill}18` },
                      ]}
                    >
                      <View
                        style={[
                          styles.advZoneBarFill,
                          { height: barHeight, backgroundColor: pctColor.fill },
                        ]}
                      />
                    </View>
                    <Text
                      style={[styles.advZoneBarShots, { color: theme.text }]}
                    >{`Shots: ${bar.shots}`}</Text>
                    <Text
                      style={[
                        styles.advZoneBarPct,
                        { color: theme.textSecondary },
                      ]}
                    >{`Pctile: ${percentileText}`}</Text>
                  </View>
                );
              })}
            </ScrollView>

            {detailBars.length === 0 && (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No zone detail bars available.
              </Text>
            )}
          </View>

          <View
            style={[
              styles.advSectionCardNarrow,
              styles.advSectionCardFull,
              styles.advZoneSnapshotsCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.advSectionTitle, { color: theme.text }]}>
              Zone Snapshots
            </Text>
            <View
              style={[
                styles.advSnapshotsRinkWrap,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.advSnapshotsRinkInner}>
                <NHLRinkGraphic
                  teamColor={teamColor}
                  orientation="horizontal"
                />
              </View>
              <View style={styles.advSnapshotsOverlay}>
                {zoneSnapshotItems.map((snap) => {
                  const badge = formatPercentileBadge(snap.pct);
                  const pctColor = getPercentileTierColor(snap.pct, teamColor);
                  const valueText = Number.isFinite(snap.value)
                    ? `${(snap.value * 100).toFixed(1)}%`
                    : "-";
                  const avgText = Number.isFinite(snap.avg)
                    ? `${(snap.avg * 100).toFixed(1)}%`
                    : "-";
                  return (
                    <View
                      key={`snapshot-bubble-${snap.key}`}
                      style={[
                        styles.advSnapshotBubble,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                          transform: [{ translateY: 57.5 }],
                        },
                      ]}
                    >
                      {badge && (
                        <View style={{ alignItems: "center" }}>
                          <View
                            style={[
                              styles.advPctBadge,
                              {
                                backgroundColor: pctColor.fill,
                                borderColor: pctColor.fill,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.advPctText,
                                { color: pctColor.text },
                              ]}
                            >
                              {badge}
                            </Text>
                          </View>
                        </View>
                      )}
                      <Text
                        style={[styles.advSnapshotValue, { color: theme.text }]}
                      >
                        {valueText}
                      </Text>
                      <Text
                        style={[styles.advSnapshotLabel, { color: theme.text }]}
                      >
                        {snap.title.toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          styles.advSnapshotAvg,
                          { color: theme.textSecondary },
                        ]}
                      >{`NHL Average: ${avgText}`}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          <View
            style={[
              styles.advLegendWrap,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.advLegendTitle, { color: theme.text }]}>
              Percentile Legend
            </Text>
            <View style={styles.advLegendRow}>
              {percentileLegend.map((item) => (
                <View key={`legend-${item.key}`} style={styles.advLegendItem}>
                  <View
                    style={[
                      styles.advLegendSwatch,
                      {
                        backgroundColor: item.color.fill,
                        borderColor: item.color.fill,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.advLegendLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderAwardsTab = () => {
    if (!awards || awards.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No awards listed.
          </Text>
        </View>
      );
    }

    const formatSeasonId = (seasonId) => {
      const s = String(seasonId || "").trim();
      if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}/${s.slice(4, 8)}`;
      return s || "-";
    };

    const seasonRows = seasonTotals.reduce((acc, row) => {
      const seasonKey = String(row?.season || "").trim();
      if (!seasonKey) return acc;
      if (!acc[seasonKey]) acc[seasonKey] = [];
      acc[seasonKey].push(row);
      return acc;
    }, {});

    const resolveSeasonTeamInfo = (seasonId) => {
      const rows = seasonRows[String(seasonId || "")] || [];
      if (rows.length === 0)
        return { teamText: "", teamColorForAward: teamColor };

      const nhlRows = rows.filter(
        (row) =>
          String(row?.leagueAbbrev || "")
            .trim()
            .toUpperCase() === "NHL" && row?.teamName,
      );

      if (nhlRows.length > 0) {
        const teamNameForSeason = nhlRows[0]?.teamName;
        const abbr = NHLService.resolveTeamAbbrevFuzzy(teamNameForSeason);
        return {
          teamText: teamNameForSeason || "",
          teamColorForAward: NHLService.getTeamColor(
            abbr || teamNameForSeason,
            teamColor,
          ),
        };
      }

      const uniqueTeams = [
        ...new Set(rows.map((row) => row?.teamName).filter(Boolean)),
      ];
      return {
        teamText: uniqueTeams.join(" · "),
        teamColorForAward: teamColor,
      };
    };

    const flattened = [];
    awards.forEach((award, idx) => {
      const trophyName =
        award?.name ||
        award?.trophy ||
        award?.awardName ||
        toLabel(Object.keys(award || {})[0]) ||
        "Award";

      const seasons = Array.isArray(award?.seasons) ? award.seasons : [];
      if (seasons.length === 0) {
        const sid = award?.seasonId || award?.season || award?.year;
        if (sid != null) {
          const teamInfo = resolveSeasonTeamInfo(sid);
          flattened.push({
            key: `${idx}-${sid}-${trophyName}`,
            seasonId: sid,
            trophyName,
            ...teamInfo,
          });
        }
        return;
      }

      seasons.forEach((seasonObj, sIdx) => {
        const sid = seasonObj?.seasonId || seasonObj?.season || seasonObj?.year;
        if (sid == null) return;
        const teamInfo = resolveSeasonTeamInfo(sid);
        flattened.push({
          key: `${idx}-${sIdx}-${sid}-${trophyName}`,
          seasonId: sid,
          trophyName,
          ...teamInfo,
        });
      });
    });

    if (flattened.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No awards listed.
          </Text>
        </View>
      );
    }

    const grouped = {};
    flattened.forEach((item) => {
      const seasonKey = String(item.seasonId);
      if (!grouped[seasonKey]) grouped[seasonKey] = [];
      grouped[seasonKey].push(item);
    });

    const seasons = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

    return (
      <View style={{ paddingBottom: 24 }}>
        {seasons.map((seasonKey) => (
          <View key={`awards-season-${seasonKey}`}>
            <View
              style={[
                styles.awardsYearHeader,
                { backgroundColor: `${teamColor}18` },
              ]}
            >
              <Text style={[styles.awardsYearText, { color: teamColor }]}>
                {formatSeasonId(seasonKey)}
              </Text>
            </View>
            {grouped[seasonKey].map((awardItem, idx) => (
              <View
                key={awardItem.key}
                style={[
                  styles.awardRow,
                  {
                    backgroundColor: theme.surface,
                    borderBottomColor: theme.border,
                    borderBottomWidth:
                      idx < grouped[seasonKey].length - 1
                        ? StyleSheet.hairlineWidth
                        : 0,
                  },
                ]}
              >
                <View
                  style={[
                    styles.awardDot,
                    {
                      backgroundColor: awardItem.teamColorForAward || teamColor,
                    },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.awardName, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {awardItem.trophyName}
                  </Text>
                  {!!awardItem.teamText && (
                    <Text
                      style={[styles.awardTeam, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      {awardItem.teamText}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading player...
        </Text>
      </View>
    );
  }

  if (error || !info) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>
          {error || "Player data unavailable."}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
          },
        )}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.header,
            {
              backgroundColor: `${teamColor}33`,
              borderBottomColor: teamColor,
            },
          ]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerMain}>
            <Image
              source={{ uri: info?.headshot || "" }}
              style={[
                styles.headerHeadshot,
                { borderColor: teamColor, backgroundColor: `${teamColor}66` },
              ]}
              contentFit="cover"
            />
            <View style={styles.headerTextBlock}>
              <Text
                style={[styles.headerName, { color: theme.text }]}
                numberOfLines={2}
              >
                {displayName}
              </Text>
              <Text
                style={[styles.headerSub, { color: theme.text }]}
                numberOfLines={1}
              >
                {teamName || "NHL"}
              </Text>
              <Text
                style={[styles.headerSub2, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {headerBadge || "NHL Player"}
              </Text>
            </View>
            {teamLogo ? (
              <Image
                source={{ uri: teamLogo }}
                style={styles.headerLogo}
                contentFit="contain"
              />
            ) : (
              <View
                style={[
                  styles.headerLogoFallback,
                  { backgroundColor: "rgba(255,255,255,0.2)" },
                ]}
              >
                <Text
                  style={[
                    styles.headerLogoFallbackText,
                    { color: headerTextColor },
                  ]}
                >
                  {teamAbbrev}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={[
            styles.stickyWrap,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <Animated.View
            style={[
              styles.stickyMini,
              {
                height: stickyMiniHeight,
                opacity: stickyOpacity,
                overflow: "hidden",
              },
            ]}
          >
            <Svg
              style={StyleSheet.absoluteFill}
              width="100%"
              height={60}
              pointerEvents="none"
            >
              <Defs>
                <SvgLinearGradient
                  id="nhlPlayerGrad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop
                    offset="0%"
                    stopColor={theme.surfaceSecondary ?? theme.surface}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="55%"
                    stopColor={theme.surfaceSecondary ?? theme.surface}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="100%"
                    stopColor={teamColor}
                    stopOpacity="0.65"
                  />
                </SvgLinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#nhlPlayerGrad)" />
            </Svg>

            <View style={styles.stickyMiniContent}>
              <Image
                source={{ uri: info?.headshot || "" }}
                style={[
                  styles.stickyMiniLogo,
                  { borderColor: teamColor, backgroundColor: `${teamColor}66` },
                ]}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.stickyMiniName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                <Text
                  style={[
                    styles.stickyMiniLeague,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {teamName || `${teamAbbrev}  ${headerBadge}`}
                </Text>
              </View>
            </View>
          </Animated.View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBarContent}
            style={[styles.tabBar, { borderBottomColor: theme.border }]}
          >
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => {
                  if (tab === "Game Log") setGameLogPage(0);
                  setActiveTab(tab);
                }}
                style={styles.tabBarBtn}
                activeOpacity={0.75}
              >
                <Text
                  style={{
                    color: activeTab === tab ? theme.text : theme.textSecondary,
                    fontWeight: activeTab === tab ? "700" : "500",
                  }}
                >
                  {tab}
                </Text>
                {activeTab === tab && (
                  <View
                    style={[
                      styles.tabBarIndicator,
                      { backgroundColor: teamColor },
                    ]}
                  />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {activeTab === "Player" && renderPlayerTab()}
        {activeTab === "Game Log" && renderGameLogTab()}
        {activeTab === "Career" && renderCareerTab()}
        {activeTab === "Advanced Stats" && renderAdvancedStatsTab()}
        {activeTab === "Awards" && renderAwardsTab()}
      </Animated.ScrollView>
    </View>
  );
};

const CHIP_GAP = 8;
const CHIP_COLS = 4;
const CHIP_W =
  (width - 2 * 12 - 2 * 14 - CHIP_GAP * (CHIP_COLS - 1)) / CHIP_COLS;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: { marginTop: 10, fontSize: 14 },
  errorText: { fontSize: 14, textAlign: "center" },
  header: {
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomWidth: 2,
  },
  headerMain: { flexDirection: "row", alignItems: "center" },
  headerLogo: {
    width: 80,
    height: 44,
    borderRadius: 22,
    marginLeft: 10,
    opacity: 0.85,
  },
  headerLogoFallback: {
    width: 80,
    height: 44,
    borderRadius: 22,
    marginLeft: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogoFallbackText: { fontSize: 12, fontWeight: "800" },
  headerTextBlock: { flex: 1, minWidth: 0 },
  headerName: { fontSize: 22, fontWeight: "800" },
  headerSub: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  headerSub2: { fontSize: 12, marginTop: 2 },
  headerHeadshot: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "transparent",
    marginRight: 12,
  },
  stickyWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  stickyMini: {
    overflow: "hidden",
  },
  stickyMiniContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  stickyMiniLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 4,
    borderWidth: 1.5,
  },
  stickyMiniName: { fontSize: 14, fontWeight: "700" },
  stickyMiniLeague: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  tabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    flexGrow: 1,
    justifyContent: "space-evenly",
  },
  tabBarBtn: {
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    position: "relative",
  },
  tabBarIndicator: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    height: 2.5,
    borderRadius: 2,
  },
  tabWrap: { padding: 12, paddingBottom: 36, gap: 10 },
  bubble: {
    borderRadius: 16,
    padding: 14,
  },
  bubbleTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginBottom: 14,
    textTransform: "uppercase",
  },
  chipsGrid: { flexDirection: "row", flexWrap: "wrap", gap: CHIP_GAP },
  chip: {
    width: CHIP_W,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    position: "relative",
    overflow: "visible",
  },
  chipValue: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  bioRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 12,
  },
  bioKey: { fontSize: 13, fontWeight: "500", flex: 1 },
  bioVal: { fontSize: 13, fontWeight: "600", flex: 2, textAlign: "right" },
  cardWrap: {
    marginHorizontal: 12,
    marginTop: 10,
    position: "relative",
    overflow: "visible",
  },
  card: {
    borderRadius: 12,
    overflow: "hidden",
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  leftCol: {
    width: 52,
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 11,
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 15,
  },
  leftLogo: { width: 55, height: 32 },
  leftLogoFallback: {
    width: 55,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  leftLogoFallbackText: { fontSize: 14, fontWeight: "800" },
  middle: { flex: 1, gap: 3 },
  topStatGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  topStatCell: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  topStatValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  topStatLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.25,
  },
  oppRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  oppLogo: { width: 40, height: 20, marginHorizontal: -10 },
  oppLogoFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  oppLogoFallbackText: { fontSize: 9, fontWeight: "800" },
  oppPrefix: { fontSize: 11, fontWeight: "600", width: 18 },
  oppName: { fontSize: 12, fontWeight: "500", flex: 1 },
  oppChevron: { fontSize: 20, lineHeight: 24, paddingLeft: 2 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 4,
  },
  pageBtnMlb: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pageBtnTextMlb: { fontSize: 14, fontWeight: "700" },
  pageLabelMlb: { fontSize: 13, fontWeight: "600" },
  gameTypeBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 1,
  },
  gameTypeBadgeText: { fontSize: 10, fontWeight: "700" },
  careerRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  careerHead: { gap: 2 },
  careerSeason: { fontSize: 14, fontWeight: "800" },
  careerLeague: { fontSize: 12, fontWeight: "500" },
  careerStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  careerStatCell: { flex: 1, alignItems: "center" },
  careerStatVal: { fontSize: 14, fontWeight: "800" },
  careerStatLbl: { fontSize: 10, marginTop: 2 },
  careerContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },
  careerBubble: {
    borderRadius: 16,
    overflow: "hidden",
  },
  careerBubbleHeader: {
    borderBottomWidth: 2,
  },
  careerBubbleTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  careerYearRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  careerRowLogo: { width: 40, height: 32 },
  careerRowLogoFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  careerRowLogoFallbackText: { fontSize: 13, fontWeight: "800" },
  careerRowInfo: { flex: 1 },
  careerRowTeam: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  careerRowYear: { fontSize: 11, fontWeight: "500" },
  careerRowStats: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  careerRowStatCell: { alignItems: "center", minWidth: 30 },
  careerRowStatVal: { fontSize: 13, fontWeight: "700" },
  careerRowStatLbl: { fontSize: 10, fontWeight: "500", marginTop: 1 },
  careerChevron: { fontSize: 22, lineHeight: 26, paddingLeft: 2 },
  careerDropdownContainer: {
    marginLeft: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
  careerDropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingRight: 14,
    gap: 10,
  },
  careerDropdownBadge: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 3,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  careerDropdownBadgeText: { fontSize: 12, fontWeight: "600" },
  careerDropdownTeamName: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  splitRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  splitTitle: { fontSize: 13, fontWeight: "700" },
  splitValuesRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  splitVal: { fontSize: 14, fontWeight: "800" },
  splitValSub: { fontSize: 12, fontWeight: "500" },
  awardsYearHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 12,
  },
  awardsYearText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  awardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  awardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  awardName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  awardTeam: { fontSize: 12 },
  advWrap: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 10,
  },
  advSeasonBar: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  advSeasonTitle: { fontSize: 17, fontWeight: "800", flex: 1 },
  advSeasonStatsRow: { flexDirection: "row", gap: 14 },
  advSeasonStatCell: {
    alignItems: "center",
    minWidth: 34,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
  },
  advSeasonStatLabel: { fontSize: 11, fontWeight: "700" },
  advSeasonStatValue: { fontSize: 16, fontWeight: "800", marginTop: 1 },
  advMetricGrid: { flexDirection: "row", gap: 8 },
  advMetricCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  advMetricTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 10,
  },
  advInfoIcon: {
    fontSize: 14,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 10,
    width: 18,
    height: 18,
    textAlign: "center",
    lineHeight: 18,
  },
  advPctBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  advPctText: { fontSize: 12, fontWeight: "800" },
  advMetricValue: {
    marginTop: 8,
    fontSize: 30,
    lineHeight: 40,
    fontWeight: "800",
    textAlign: "center",
  },
  advMetricTitle: {
    marginTop: 2,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  advOverlayWrap: { marginTop: 8, gap: 2 },
  advOverlayText: { fontSize: 10 },
  advSectionRow: { flexDirection: "row", gap: 8 },
  advSectionStack: { flexDirection: "column", gap: 8 },
  advSectionCardWide: {
    flex: 2,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  advSectionCardNarrow: {
    flex: 1.2,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  advSectionCardFull: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "100%",
  },
  advShotZoneCard: {
    maxHeight: 560,
    overflow: "hidden",
  },
  advZoneSnapshotsCard: {
    maxHeight: 320,
    overflow: "hidden",
  },
  advSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  advZoneTopGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  advZoneTopCard: {
    width: "48.5%",
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  advZoneTopBadgeWrap: {
    minHeight: 24,
    justifyContent: "flex-start",
  },
  advZoneTopValue: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
  },
  advZoneTopLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
  },
  advZoneSplitDivider: {
    marginTop: 10,
    marginBottom: 10,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  advZoneBarScrollContent: {
    paddingRight: 8,
    gap: 8,
  },
  advZoneBarCard: {
    width: 102,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  advZoneBarLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    textAlign: "center",
    minHeight: 28,
  },
  advZoneBarTrack: {
    width: 36,
    height: 124,
    borderRadius: 8,
    justifyContent: "flex-end",
    overflow: "hidden",
    marginTop: 6,
  },
  advZoneBarFill: {
    width: "100%",
    borderRadius: 8,
  },
  advZoneBarShots: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  advZoneBarPct: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  advSnapCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  advSnapVals: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  advSnapValue: {
    fontSize: 50,
    lineHeight: 52,
    fontWeight: "800",
    textAlign: "center",
  },
  advSnapAvg: { fontSize: 24, fontWeight: "500" },
  advSnapTitle: { fontSize: 12, textAlign: "center" },
  advZoneTimeRinkWrap: { minHeight: 150 },
  advZoneTimeCards: { flexDirection: "row", gap: 8, marginTop: 8 },
  advZoneTimeCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    alignItems: "center",
  },
  advZoneTimeValue: { fontSize: 26, fontWeight: "800", marginTop: 6 },
  advZoneTimeLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
    textAlign: "center",
  },
  advZoneTimeAvg: { fontSize: 11, marginTop: 6 },
  advSnapshotsRinkWrap: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    height: 250,
    position: "relative",
  },
  advSnapshotsRinkInner: {
    ...StyleSheet.absoluteFillObject,
  },
  advSnapshotsOverlay: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 12,
    flexDirection: "row",
    gap: 8,
  },
  advSnapshotBubble: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  advSnapshotValue: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  advSnapshotLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
    textAlign: "center",
  },
  advSnapshotAvg: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
  },
  advLegendWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  advLegendTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  advLegendRow: {
    flexDirection: "row",
    gap: 10,
  },
  advLegendItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  advLegendSwatch: {
    width: 28,
    height: 12,
    borderRadius: 4,
    borderWidth: 1,
  },
  advLegendLabel: {
    fontSize: 10,
    textAlign: "center",
    fontWeight: "600",
  },
  emptyText: { textAlign: "center", marginTop: 20, fontSize: 14 },
});

export default PlayerPageScreen;
