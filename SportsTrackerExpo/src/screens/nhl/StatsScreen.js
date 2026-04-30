import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import NHLService from "../../services/NHLService";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper } from "../../services/ads";

const fmtLabel = (value) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatNumber = (value, decimals = 3) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
};

const normalizeHexColor = (value, fallback = "#888888") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (raw.startsWith("#")) return raw;
  if (/^[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(raw)) return `#${raw}`;
  return fallback;
};

const parseIdFromHeadshot = (url) => {
  const match = String(url || "").match(/\/(\d+)\.png(?:\?|$)/i);
  return match ? Number(match[1]) : null;
};

const getEdgeSlugFromUrl = (url) => {
  const raw = String(url || "");
  const marker = "/edge/";
  const idx = raw.indexOf(marker);
  if (idx < 0) return "";
  const rest = raw.slice(idx + marker.length);
  return rest.split("/")[0] || "";
};

const getEdgeTitleFromUrl = (url) => {
  const slug = getEdgeSlugFromUrl(url);
  if (!slug) return "";

  const banned = new Set(["team", "skater", "goalie", "edge", "top", "10"]);
  const words = slug
    .split("-")
    .map((w) => String(w || "").trim())
    .filter(Boolean)
    .filter((w) => !banned.has(w.toLowerCase()));

if (slug.includes("save-pctg")) return "Save Pctg (900+)";
if (slug.includes("5v5")) return "5v5 Save Pctg";
if (slug.includes("goalie-shot-location")) return "Shot Location Save Pctg";

  if (words.length === 0) return fmtLabel(slug);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

const detectEdgeKindFromUrl = (url) => {
  const slug = getEdgeSlugFromUrl(url).toLowerCase();
  if (slug.includes("zone-time")) return "zone-time";
  if (slug.includes("shot-location")) return "shot-location";
  if (slug.includes("shot-speed")) return "shot-speed";
  if (slug.includes("5v5")) return "fivev5";
  if (slug.includes("save-pctg")) return "save-pctg";
  if (slug.includes("distance")) return "distance";
  if (slug.includes("speed")) return "speed";
  return "generic";
};

const readMetricValue = (value) => {
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === "object") {
    if (Number.isFinite(Number(value.metric))) return Number(value.metric);
    if (Number.isFinite(Number(value.imperial))) return Number(value.imperial);
  }
  return null;
};

const getEdgeMainValue = (row, edgeKind) => {
  if (!row || typeof row !== "object") return "-";

  if (edgeKind === "zone-time") {
    const a = Number(row.offensiveZoneTime || 0);
    const b = Number(row.neutralZoneTime || 0);
    const c = Number(row.defensiveZoneTime || 0);
    return formatNumber((a + b + c) / 3, 3);
  }

  if (edgeKind === "shot-location") return formatNumber(row.all, 3);
  if (edgeKind === "distance")
    return formatNumber(readMetricValue(row.distanceTotal), 3);
  if (edgeKind === "speed")
    return formatNumber(readMetricValue(row.maxSkatingSpeed), 3);
  if (edgeKind === "shot-speed")
    return formatNumber(readMetricValue(row.hardestShot), 3);
  if (edgeKind === "save-pctg") return formatNumber(row.gamesOver900, 3);
  if (edgeKind === "fivev5") return formatNumber(row.savePctg, 3);

  return "-";
};

const getEdgeModalStats = (row, edgeKind) => {
  if (!row || typeof row !== "object") return [];

  if (edgeKind === "zone-time") {
    return [
      {
        label: "Offensive Zone Time",
        value: formatNumber(row.offensiveZoneTime, 3),
      },
      {
        label: "Neutral Zone Time",
        value: formatNumber(row.neutralZoneTime, 3),
      },
      {
        label: "Defensive Zone Time",
        value: formatNumber(row.defensiveZoneTime, 3),
      },
    ];
  }

  if (edgeKind === "shot-location") {
    return [
      { label: "High Danger", value: formatNumber(row.highDanger, 3) },
      { label: "Mid Range", value: formatNumber(row.midRange, 3) },
      { label: "Long Range", value: formatNumber(row.longRange, 3) },
    ];
  }

  if (edgeKind === "distance") {
    return [
      {
        label: "Per 60",
        value: formatNumber(readMetricValue(row.distancePer60), 3),
      },
      {
        label: "Max Per Game",
        value: formatNumber(readMetricValue(row.distanceMaxPerGame), 3),
      },
      {
        label: "Max Per Period",
        value: formatNumber(readMetricValue(row.distanceMaxPerPeriod), 3),
      },
    ];
  }

  if (edgeKind === "speed") {
    return [
      { label: "18 To 20", value: formatNumber(row.bursts18To20, 3) },
      { label: "20 To 22", value: formatNumber(row.bursts20To22, 3) },
      { label: "Over 22", value: formatNumber(row.burstsOver22, 3) },
    ];
  }

  if (edgeKind === "shot-speed") {
    return [
      { label: "70 To 80", value: formatNumber(row.shotAttempts70To80, 3) },
      { label: "80 To 90", value: formatNumber(row.shotAttempts80To90, 3) },
      { label: "90 To 100", value: formatNumber(row.shotAttempts90To100, 3) },
      { label: "Over 100", value: formatNumber(row.shotAttemptsOver100, 3) },
    ];
  }

  if (edgeKind === "save-pctg") {
    return [
      {
        label: "PCTG Games Over 900",
        value: formatNumber(row.pctgGamesOver900, 3),
        inline: true,
      },
    ];
  }

  if (edgeKind === "fivev5") {
    return [
      { label: "SV% Close", value: formatNumber(row.savePctgClose, 3) },
      { label: "Shots", value: formatNumber(row.shots, 3) },
      { label: "Per 60", value: formatNumber(row.shotsPer60, 3) },
    ];
  }

  return [];
};

const pickTeamAbbr = (team) => {
  const raw =
    team?.abbreviation ||
    team?.abbrev ||
    team?.triCode ||
    team?.rawTricode ||
    "";
  return String(raw || "").toUpperCase() || "NHL";
};

const getNhlSvgLogoUrl = (teamAbbr, isDarkMode) => {
  const abbr = String(teamAbbr || "NHL").toUpperCase();
  const variant = isDarkMode ? "dark" : "light";
  return `https://assets.nhle.com/logos/nhl/svg/${abbr}_${variant}.svg`;
};

const pickTeamName = (team) => {
  if (!team) return "NHL Team";
  if (team.fullName) return String(team.fullName);
  if (team.displayName) return String(team.displayName);
  if (team.name) return String(team.name);
  if (team.commonName || team.placeNameWithPreposition) {
    return `${team.placeNameWithPreposition || ""} ${team.commonName || ""}`.trim();
  }
  return pickTeamAbbr(team);
};

const pickPlayerName = (player) => {
  if (!player) return "Unknown Player";
  if (player.fullName) return String(player.fullName);
  const first = String(player.firstName || "").trim();
  const last = String(player.lastName || "").trim();
  const full = `${first} ${last}`.trim();
  return full || "Unknown Player";
};

const pickPlayerId = (player) => {
  const direct = Number(player?.id || player?.playerId);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return parseIdFromHeadshot(player?.headshot);
};

const formatKey = (key) => {
  if (key === "offensiveZoneTime") return "Average Zone Time";
  return key;
};

const extractMetric = (row) => {
  if (!row || typeof row !== "object") return { key: "value", value: "-" };

  const blocked = new Set(["player", "team", "teams"]);
  const keys = Object.keys(row).filter((k) => !blocked.has(k));

  for (const key of keys) {
    const displayKey = formatKey(key);
    const val = row[key];

    if (typeof val === "number") {
      if (Math.abs(val) < 1 && key.toLowerCase().includes("pct")) {
        return { key: displayKey, value: `${(val * 100).toFixed(1)}%` };
      }
      return {
        key: displayKey,
        value: Number.isInteger(val)
          ? String(val)
          : String(Math.round(val * 1000) / 1000),
      };
    }

    if (val && typeof val === "object") {
      if (Number.isFinite(val.metric)) {
        return {
          key: displayKey,
          value: Number.isInteger(val.metric)
            ? String(val.metric)
            : String(Math.round(val.metric * 1000) / 1000),
        };
      }
      if (Number.isFinite(val.imperial)) {
        return {
          key: displayKey,
          value: Number.isInteger(val.imperial)
            ? String(val.imperial)
            : String(Math.round(val.imperial * 1000) / 1000),
        };
      }
    }
  }

  return { key: "value", value: "-" };
};

const parseCategoryTitle = (entry) => {
  const rawUrl = String(entry?.url || "");
  const url = rawUrl.split("?")[0];

  const edgeTitle = getEdgeTitleFromUrl(url);
  if (edgeTitle) return edgeTitle;

  const parts = url.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";

  if (last.toLowerCase() === "gaa") {
    return "Goals Against Average";
  }

  if (last.toLowerCase() === "savepctg") {
    return "Save Pctg";
  }

  if (url.includes("/leaders/")) {
    return fmtLabel(last);
  }

  return fmtLabel(last || `Category ${entry?.id || ""}`);
};

const toPlayerLeaders = (rows, edgeKind) =>
  (Array.isArray(rows) ? rows : []).map((row) => {
    const player = row?.player || {};
    const team = row?.team || player?.team || {};
    const teamAbbr = pickTeamAbbr(team);
    const teamColor = normalizeHexColor(
      team?.color || NHLService.getTeamColor(teamAbbr, "#888888"),
      NHLService.getTeamColor(teamAbbr, "#888888"),
    );
    const metric = extractMetric(row);
    const edgeValue = edgeKind ? getEdgeMainValue(row, edgeKind) : null;

    return {
      playerId: pickPlayerId(player),
      playerName: pickPlayerName(player),
      headshot: player?.headshot || null,
      teamAbbr,
      teamName: pickTeamName(team),
      teamColor,
      position: player?.positionCode || player?.position || "",
      value: edgeKind ? edgeValue : metric.value,
      metricLabel: fmtLabel(metric.key),
      raw: row,
    };
  });

const toTeamLeaders = (rows, edgeKind) =>
  (Array.isArray(rows) ? rows : []).map((row) => {
    const team = row?.teams || row?.team || {};
    const teamAbbr = pickTeamAbbr(team);
    const teamColor = normalizeHexColor(
      team?.color || NHLService.getTeamColor(teamAbbr, "#888888"),
      NHLService.getTeamColor(teamAbbr, "#888888"),
    );
    const metric = extractMetric(row);
    const edgeValue = edgeKind ? getEdgeMainValue(row, edgeKind) : null;

    return {
      teamAbbr,
      teamName: pickTeamName(team),
      teamColor,
      value: edgeKind ? edgeValue : metric.value,
      metricLabel: fmtLabel(metric.key),
      raw: row,
    };
  });

const sectionForEntry = (entry) => {
  const url = String(entry?.url || "").toLowerCase();
  if (url.includes("isrookie")) return "Rookies";
  if (url.includes("/goalies/") || url.includes("/goalie-")) return "Goalies";
  return "Skaters";
};

const StatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, isDarkMode } = useTheme();
  const navigation = useNavigation();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;

  const [selectedType, setSelectedType] = useState("ATHLETES");
  const [loading, setLoading] = useState(true);
  const [athleteSections, setAthleteSections] = useState({
    Skaters: [],
    Rookies: [],
    Goalies: [],
  });
  const [teamCategories, setTeamCategories] = useState([]);
  const [expandedSections, setExpandedSections] = useState({
    Skaters: true,
    Rookies: false,
    Goalies: false,
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalTitle, setModalTitle] = useState("");
  const [modalType, setModalType] = useState("ATHLETES");
  const [modalIsEdge, setModalIsEdge] = useState(false);
  const [modalEdgeKind, setModalEdgeKind] = useState("generic");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);

        const [playerRes, teamRes] = await Promise.all([
          fetch(`${NHLService.BACKEND_URL}/nhl/player-stats`),
          fetch(`${NHLService.BACKEND_URL}/nhl/team-stats`),
        ]);

        const playerJson = playerRes.ok ? await playerRes.json() : { data: [] };
        const teamJson = teamRes.ok ? await teamRes.json() : { data: [] };

        const nextAthleteSections = {
          Skaters: [],
          Rookies: [],
          Goalies: [],
        };

        for (const entry of Array.isArray(playerJson?.data)
          ? playerJson.data
          : []) {
          const edgeKind = detectEdgeKindFromUrl(entry?.url);
          const rows = Array.isArray(entry?.data?.data)
            ? entry.data.data
            : Array.isArray(entry?.data)
              ? entry.data
              : [];
          const leaders = toPlayerLeaders(
            rows,
            edgeKind !== "generic" ? edgeKind : null,
          ).filter((l) => l.playerName);
          if (leaders.length === 0) continue;

          const isEdge = String(entry?.url || "").includes("/edge/");
          nextAthleteSections[sectionForEntry(entry)].push({
            id: String(entry?.id || entry?.url || Math.random()),
            title: parseCategoryTitle(entry) + "",
            leaders,
            isEdge,
            edgeKind,
          });
        }

        const nextTeamCategories = [];
        for (const entry of Array.isArray(teamJson?.data)
          ? teamJson.data
          : []) {
          const edgeKind = detectEdgeKindFromUrl(entry?.url);
          const rows = Array.isArray(entry?.data?.data)
            ? entry.data.data
            : Array.isArray(entry?.data)
              ? entry.data
              : [];
          const leaders = toTeamLeaders(
            rows,
            edgeKind !== "generic" ? edgeKind : null,
          ).filter((l) => l.teamName);
          if (leaders.length === 0) continue;
          const isEdge = String(entry?.url || "").includes("/edge/");

          nextTeamCategories.push({
            id: String(entry?.id || entry?.url || Math.random()),
            title: parseCategoryTitle(entry),
            leaders,
            isEdge,
            edgeKind,
          });
        }

        if (!mounted) return;
        setAthleteSections(nextAthleteSections);
        setTeamCategories(nextTeamCategories);
      } catch (error) {
        console.error("Error loading NHL stats:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const statTypes = useMemo(
    () => [
      { key: "ATHLETES", name: "Athletes" },
      { key: "TEAMS", name: "Teams" },
    ],
    [],
  );

  const toggleSection = (name) => {
    setExpandedSections((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const openModal = (
    leaders,
    title,
    type,
    isEdge = false,
    edgeKind = "generic",
  ) => {
    setModalData(leaders);
    setModalTitle(title);
    setModalType(type);
    setModalIsEdge(Boolean(isEdge));
    setModalEdgeKind(edgeKind || "generic");
    setModalVisible(true);
  };

  const onPressAthlete = (leader) => {
    const playerId = Number(leader?.playerId);
    if (!Number.isFinite(playerId) || playerId <= 0) return;

    setModalVisible(false);
    navigation.navigate("PlayerPage", {
      playerId,
      playerName: leader?.playerName,
      teamId: leader?.teamAbbr,
      sport: "nhl",
    });
  };

  const onPressTeam = (leader) => {
    setModalVisible(false);
    navigation.navigate("TeamPage", {
      teamId: leader?.teamAbbr,
      teamName: leader?.teamName,
      sport: "nhl",
    });
  };

  const renderTopRow = (leader, isAthlete) => (
    <View style={styles.firstLeaderRow}>
      {isAthlete ? (
        <Image
          source={{
            uri:
              leader?.headshot ||
              `https://assets.nhle.com/mugs/nhl/20252026/${leader?.teamAbbr || "NHL"}/${leader?.playerId || ""}.png`,
          }}
          style={[
            styles.playerHeadshot,
            {
              backgroundColor: `${leader?.teamColor || "#888888"}66`,
              borderColor: leader?.teamColor || "#888888",
              borderWidth: 1.5,
            },
          ]}
        />
      ) : (
        <Image
          source={{ uri: getNhlSvgLogoUrl(leader?.teamAbbr, isDarkMode) }}
          style={styles.teamLogoLarge}
        />
      )}

      <View style={styles.firstLeaderInfo}>
        <View style={styles.playerNameRow}>
          {isAthlete ? (
            <Image
              source={{ uri: getNhlSvgLogoUrl(leader?.teamAbbr, isDarkMode) }}
              style={styles.teamLogoSmall}
            />
          ) : null}
          <Text
            allowFontScaling={false}
            style={[styles.playerName, { color: theme.text }]}
          >
            {isAthlete ? leader?.playerName : leader?.teamName}
          </Text>
        </View>
        <Text
          allowFontScaling={false}
          style={[styles.teamName, { color: theme.textSecondary }]}
        >
          {isAthlete ? leader?.teamName : leader?.metricLabel}
        </Text>
      </View>

      <Text
        allowFontScaling={false}
        style={[styles.statValue, { color: colors.primary }]}
      >
        {leader?.value}
      </Text>
    </View>
  );

  const renderLeaderRow = (leader, index, isAthlete) => {
    if (index === 0) return renderTopRow(leader, isAthlete);

    return (
      <View
        key={`${leader?.teamAbbr || "NHL"}-${index}`}
        style={[styles.leaderRow, { borderTopColor: theme.border }]}
      >
        <Text
          allowFontScaling={false}
          style={[styles.rank, { color: theme.textSecondary }]}
        >
          {index + 1}
        </Text>
        <Image
          source={{ uri: getNhlSvgLogoUrl(leader?.teamAbbr, isDarkMode) }}
          style={styles.teamLogoSmall}
        />
        <Text
          allowFontScaling={false}
          style={[styles.playerNameCompact, { color: theme.text }]}
        >
          {isAthlete ? leader?.playerName : leader?.teamName}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.statValueCompact, { color: colors.primary }]}
        >
          {leader?.value}
        </Text>
      </View>
    );
  };

  const renderCategory = (category, type) => {
    const isAthlete = type === "ATHLETES";
    const leaders = category?.leaders || [];

    return (
      <TouchableOpacity
        key={category?.id}
        style={[
          styles.categoryContainer,
          {
            backgroundColor: theme.surface,
            borderColor: category?.isEdge ? colors.secondary : theme.border,
          },
        ]}
        onPress={() =>
          openModal(
            leaders,
            category?.title,
            type,
            category?.isEdge,
            category?.edgeKind,
          )
        }
      >
        <View style={styles.categoryHeader}>
          <Text
            allowFontScaling={false}
            style={[styles.categoryTitle, { color: colors.primary }]}
          >
            {category?.title}
          </Text>
          {category?.isEdge ? (
            <View
              style={[
                styles.edgeBadge,
                {
                  backgroundColor: `${colors.secondary}22`,
                  borderColor: `${colors.secondary}66`,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.edgeBadgeText, { color: colors.secondary }]}
              >
                EDGE
              </Text>
            </View>
          ) : null}
        </View>

        {leaders.slice(0, 5).map((leader, idx) => (
          <View key={`${category?.id}-${idx}`}>
            {renderLeaderRow(leader, idx, isAthlete)}
          </View>
        ))}

        {leaders.length > 5 ? (
          <Text
            allowFontScaling={false}
            style={[styles.viewMore, { color: colors.secondary }]}
          >
            Tap to view all {leaders.length} leaders
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderAthleteSections = () => {
    const names = ["Skaters", "Rookies", "Goalies"];

    return names.map((name) => {
      const categories = athleteSections[name] || [];
      const expanded = !!expandedSections[name];

      return (
        <View key={name} style={styles.sectionWrap}>
          <TouchableOpacity
            style={[
              styles.sectionHeader,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={() => toggleSection(name)}
          >
            <Text
              allowFontScaling={false}
              style={[styles.sectionTitle, { color: theme.text }]}
            >
              {name}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.sectionCount, { color: theme.textSecondary }]}
            >
              {categories.length}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.sectionChevron, { color: theme.textSecondary }]}
            >
              {expanded ? "▾" : "▸"}
            </Text>
          </TouchableOpacity>

          {expanded
            ? categories.map((c) => renderCategory(c, "ATHLETES"))
            : null}
        </View>
      );
    });
  };

  const renderModalItem = ({ item, index }) => {
    const isAthlete = modalType === "ATHLETES";
    const edgeStats = modalIsEdge
      ? getEdgeModalStats(item?.raw, modalEdgeKind)
      : [];

    return (
      <TouchableOpacity
        style={[
          styles.modalItem,
          {
            backgroundColor: theme.surface,
            borderColor: item?.teamColor || theme.border,
          },
        ]}
        onPress={() => (isAthlete ? onPressAthlete(item) : onPressTeam(item))}
      >
        <View style={styles.modalMainRow}>
          <Text
            allowFontScaling={false}
            style={[styles.modalRank, { color: theme.textSecondary }]}
          >
            {index + 1}
          </Text>

          {isAthlete ? (
            <Image
              source={{
                uri:
                  item?.headshot ||
                  `https://assets.nhle.com/mugs/nhl/20252026/${item?.teamAbbr || "NHL"}/${item?.playerId || ""}.png`,
              }}
              style={[
                styles.modalHeadshot,
                {
                  backgroundColor: `${item?.teamColor || "#888888"}66`,
                  borderColor: item?.teamColor || "#888888",
                  borderWidth: 1.5,
                },
              ]}
            />
          ) : (
            <Image
              source={{ uri: getNhlSvgLogoUrl(item?.teamAbbr, isDarkMode) }}
              style={styles.modalHeadshot}
            />
          )}

          <View style={styles.modalPlayerInfo}>
            <View style={styles.modalNameRow}>
              {isAthlete ? (
                <Image
                  source={{ uri: getNhlSvgLogoUrl(item?.teamAbbr, isDarkMode) }}
                  style={styles.modalTeamLogo}
                />
              ) : null}
              <Text
                allowFontScaling={false}
                style={[styles.modalPlayerName, { color: theme.text }]}
              >
                {isAthlete ? item?.playerName : item?.teamName}
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              style={[styles.modalTeamName, { color: theme.textSecondary }]}
            >
              {isAthlete ? item?.teamName : item?.metricLabel}
            </Text>
          </View>

          <Text
            allowFontScaling={false}
            style={[styles.modalStatValue, { color: colors.primary }]}
          >
            {item?.value}
          </Text>
        </View>

        {modalIsEdge && edgeStats.length > 0 ? (
          <View style={styles.edgeModalWrap}>
            {edgeStats.map((stat, idx) =>
              stat.inline ? (
                <View key={`inline-${idx}`} style={styles.edgeInlineRow}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.edgeInlineLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {stat.label}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[styles.edgeInlineValue, { color: colors.primary }]}
                  >
                    {stat.value}
                  </Text>
                </View>
              ) : (
                <View
                  key={`card-${idx}`}
                  style={[
                    styles.edgeStatCard,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.edgeStatValue, { color: theme.text }]}
                  >
                    {stat.value}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    numberOfLines={2}
                    style={[
                      styles.edgeStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {stat.label}
                  </Text>
                </View>
              ),
            )}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          allowFontScaling={false}
          style={[styles.loadingText, { color: theme.textSecondary }]}
        >
          Loading stats...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.leagueSelector,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            gap: 50,
          },
        ]}
      >
        {statTypes.map((type) => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.leagueButton,
              {
                backgroundColor:
                  selectedType === type.key ? colors.secondary : "transparent",
                borderColor:
                  selectedType === type.key ? colors.secondary : colors.primary,
              },
            ]}
            onPress={() => setSelectedType(type.key)}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.leagueButtonText,
                { color: selectedType === type.key ? "#fff" : colors.primary },
              ]}
            >
              {type.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isPro ? 32 : 32 + AD_SPACE }}
      >
        <Text
          allowFontScaling={false}
          style={[styles.sectionIntroTitle, { color: theme.text }]}
        >
          {selectedType === "ATHLETES" ? "Player Leaders" : "Team Leaders"}
        </Text>

        {selectedType === "ATHLETES"
          ? renderAthleteSections()
          : teamCategories.map((category) => renderCategory(category, "TEAMS"))}
      </ScrollView>

      {!isPro && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
          }}
        >
          <BannerAdWrapper />
        </View>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.modalHeaderTitle, { color: theme.text }]}
            >
              {modalTitle}
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={styles.modalCloseButton}
            >
              <Text
                allowFontScaling={false}
                style={[styles.modalCloseText, { color: colors.primary }]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={modalData}
            renderItem={renderModalItem}
            keyExtractor={(item, index) =>
              `${modalType}-${item?.playerId || item?.teamAbbr || "row"}-${index}`
            }
            style={styles.modalList}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeader: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topTitle: {
    fontSize: 26,
    fontWeight: "800",
  },
  topSubtitle: {
    marginTop: 2,
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  leagueSelector: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  leagueButton: {
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 110,
    alignItems: "center",
  },
  leagueButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionIntroTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 12,
    textAlign: "center",
  },
  sectionWrap: {
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "700",
    marginRight: 8,
  },
  sectionChevron: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: -4,
  },
  categoryContainer: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 3,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  edgeBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  edgeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  firstLeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 4,
  },
  playerHeadshot: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  teamLogoLarge: {
    width: 50,
    height: 50,
    marginRight: 12,
  },
  firstLeaderInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  teamName: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 19,
    fontWeight: "800",
    minWidth: 58,
    textAlign: "right",
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    fontSize: 13,
    fontWeight: "600",
    width: 28,
    textAlign: "center",
  },
  playerNameCompact: {
    flex: 1,
    fontSize: 13,
    marginLeft: 6,
  },
  statValueCompact: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 46,
    textAlign: "right",
  },
  viewMore: {
    textAlign: "center",
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: "600",
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    paddingRight: 10,
  },
  modalCloseButton: { padding: 8 },
  modalCloseText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalList: {
    flex: 1,
    padding: 16,
  },
  modalMainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalItem: {
    flexDirection: "column",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  modalRank: {
    fontSize: 16,
    fontWeight: "bold",
    width: 30,
    textAlign: "center",
  },
  modalHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: 12,
  },
  modalPlayerInfo: { flex: 1 },
  modalNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  modalTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  modalPlayerName: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  modalTeamName: {
    fontSize: 12,
  },
  modalStatValue: {
    fontSize: 17,
    fontWeight: "700",
    minWidth: 56,
    textAlign: "right",
  },
  edgeModalWrap: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginRight: -8,
  },
  edgeStatCard: {
    width: "31%",
    minWidth: 84,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  edgeStatValue: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  edgeStatLabel: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 12,
  },
  edgeInlineRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  edgeInlineLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  edgeInlineValue: {
    fontSize: 13,
    fontWeight: "800",
  },
});

export default StatsScreen;
