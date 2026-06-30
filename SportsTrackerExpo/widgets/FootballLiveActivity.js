// widgets/FootballLiveActivity.js
import { Platform } from "react-native";

// Dynamically require Expo UI only on iOS. Static `import` of `@expo/ui`
// triggers native module resolution and crashes in Expo Go (no native
// ExpoUI present). Use guarded `require()` to avoid that.
let HStack, Text, VStack, ZStack, Rectangle, Circle, Image;
let frame,
  padding,
  foregroundStyle,
  opacity,
  font,
  lineLimit,
  multilineTextAlignment,
  rotationEffect,
  widgetURL,
  resizable;

if (Platform.OS === "ios") {
  try {
    // eslint-disable-next-line global-require
    const swiftUI = require("@expo/ui/swift-ui");
    // eslint-disable-next-line global-require
    const modifiers = require("@expo/ui/swift-ui/modifiers");

    HStack = swiftUI.HStack;
    Text = swiftUI.Text;
    VStack = swiftUI.VStack;
    ZStack = swiftUI.ZStack;
    Rectangle = swiftUI.Rectangle;
    Circle = swiftUI.Circle;
    Image = swiftUI.Image;

    frame = modifiers.frame;
    padding = modifiers.padding;
    foregroundStyle = modifiers.foregroundStyle;
    opacity = modifiers.opacity;
    font = modifiers.font;
    lineLimit = modifiers.lineLimit;
    multilineTextAlignment = modifiers.multilineTextAlignment;
    rotationEffect = modifiers.rotationEffect;
    widgetURL = modifiers.widgetURL;
    resizable = modifiers.resizable;
  } catch (e) {
    console.warn("Expo UI modules not available:", e?.message || e);
  }
}

// Only require expo-widgets on iOS. On Android the native module isn't
// available and attempting to statically import it crashes the app.
let createLiveActivity = null;
if (Platform.OS === "ios") {
  try {
    // eslint-disable-next-line global-require
    createLiveActivity = require("expo-widgets").createLiveActivity;
  } catch (e) {
    createLiveActivity = null;
    console.warn(
      "expo-widgets not available in FootballLiveActivity:",
      e?.message || e,
    );
  }
}

const FootballLiveActivity = (props) => {
  "widget";

  const isBaseball =
    String(props?.sport || props?.layout || "")
      .toLowerCase()
      .includes("mlb") ||
    String(props?.layout || "").toLowerCase() === "baseball";

  // safe helper (prevents undefined/null crashes)
  const safe = (val, fallback) =>
    val !== undefined && val !== null ? val : fallback;

  const home = {
    name: safe(props?.home?.name, "Home"),
    shortName:
      props?.home?.shortName ||
      props?.home?.short_code ||
      props?.home?.abbr ||
      "",
    logo: props?.home?.logo ?? null,
    winner: props?.home?.winner ?? null,
    score: props?.homeScore ?? props?.home?.score ?? 0,
  };

  const away = {
    name: safe(props?.away?.name, "Away"),
    shortName:
      props?.away?.shortName ||
      props?.away?.short_code ||
      props?.away?.abbr ||
      "",
    logo: props?.away?.logo ?? null,
    winner: props?.away?.winner ?? null,
    score: props?.awayScore ?? props?.away?.score ?? 0,
  };

  const league = {
    name: safe(props?.league?.name, "League"),
    logo: props?.league?.logo ?? null,
  };

  const colors = props?.colors ?? {
    home: "#FF6B35",
    away: "#F7931E",
    blended: "#FFD23F",
  };

  const status = {
    short_name: safe(props?.status?.short_name, "NS"),
    text: props?.status?.text ?? "",
    detailedState: props?.status?.detailedState ?? null,
    statusCode: props?.status?.statusCode ?? null,
    inning: props?.status?.inning ?? null,
    currentInningOrdinal: props?.status?.currentInningOrdinal ?? null,
    inningState: props?.status?.inningState ?? null,
    balls: props?.status?.balls ?? null,
    strikes: props?.status?.strikes ?? null,
    outs: props?.status?.outs ?? null,
    batter: props?.status?.batter ?? null,
    pitcher: props?.status?.pitcher ?? null,
    bases: props?.status?.bases ?? null,
    previousPlayDescription:
      props?.status?.previousPlayDescription ??
      props?.previousPlayDescription ??
      null,
    previousPlayBatterId:
      props?.status?.previousPlayBatterId ??
      props?.previousPlay?.matchup?.batter?.id ??
      null,
    previousPlayPitcherId:
      props?.status?.previousPlayPitcherId ??
      props?.previousPlay?.matchup?.pitcher?.id ??
      null,
    offenseTeamId:
      props?.status?.offenseTeamId ??
      props?.linescoreTeamIds?.offense ??
      props?.previousPlay?.teamIds?.offense ??
      null,
    defenseTeamId:
      props?.status?.defenseTeamId ??
      props?.linescoreTeamIds?.defense ??
      props?.previousPlay?.teamIds?.defense ??
      null,
    minute: props?.status?.minute ?? null,
    seconds: props?.status?.seconds ?? null,
    ticking: props?.status?.ticking ?? false,
  };

  const venue = {
    name: safe(props?.venue?.name, "Venue"),
  };

  const formatLocalStartingAt = (startingAtProp) => {
    try {
      const rawDate = startingAtProp?.iso || startingAtProp?.ms;
      if (!rawDate) {
        return {
          time: startingAtProp?.time ?? "--:--",
          ampm: startingAtProp?.ampm ?? "",
        };
      }

      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) {
        return {
          time: startingAtProp?.time ?? "--:--",
          ampm: startingAtProp?.ampm ?? "",
        };
      }

      const parts = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).formatToParts(date);

      const hour = parts.find((part) => part.type === "hour")?.value || null;
      const minute =
        parts.find((part) => part.type === "minute")?.value || null;
      const ampm =
        parts.find((part) => part.type === "dayPeriod")?.value ||
        startingAtProp?.ampm ||
        "";

      return {
        time:
          hour && minute
            ? `${hour}:${minute}`
            : (startingAtProp?.time ?? "--:--"),
        ampm,
      };
    } catch {
      return {
        time: startingAtProp?.time ?? "--:--",
        ampm: startingAtProp?.ampm ?? "",
      };
    }
  };

  const getTextOnColor = (hex) => {
    if (!hex) return "#FFFFFF";
    const c = String(hex).replace(/^#/, "");
    if (c.length < 6) return "#FFFFFF";
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? "#000000" : "#FFFFFF";
  };

  const getStatusInfo = (statusProp, startingAtProp) => {
    const code = (statusProp?.short_name || "").toUpperCase();
    const long = statusProp?.text || "";
    const minute =
      statusProp?.minute || statusProp?.elapsed || statusProp?.m || null;
    const seconds = statusProp?.seconds ?? null;
    const ticking = statusProp?.ticking === true;

    const isFinished = [
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
      "POST",
      "POSTPONED",
      "CANCELLED",
    ].includes(code);

    const isScheduled =
      !code || ["NS", "TBA", "DELAYED", "SCHEDULED"].includes(code);

    const isLive = !isFinished && !isScheduled;

    if (isLive) {
      if (minute != null && minute !== "") {
        const secText =
          seconds != null ? `:${String(seconds).padStart(2, "0")}` : "";
        return {
          line1: `${minute}${secText}`,
          line2: long || code || "LIVE",
          isLive: true,
          isFinished: false,
          isScheduled: false,
          ticking,
        };
      }

      return {
        line1: code || "LIVE",
        line2: long || "",
        isLive: true,
        isFinished: false,
        isScheduled: false,
        ticking,
      };
    }

    if (isFinished) {
      return {
        line1: code || "FT",
        line2: null,
        isLive: false,
        isFinished: true,
        isScheduled: false,
      };
    }

    const { time, ampm } = formatLocalStartingAt(startingAtProp);

    return {
      line1: time,
      line2: ampm,
      isLive: false,
      isFinished: false,
      isScheduled: true,
    };
  };

  const widgetLink =
    props?.url ||
    props?.widgetUrl ||
    props?.widgetURL ||
    (props?.id || props?.fixtureId
      ? `sportsheart://football/fixture/${props.id || props.fixtureId}`
      : null);

  const zModifiers = widgetLink ? [widgetURL(widgetLink)] : [];

  const statusInfo = getStatusInfo(status, props.startingAt);

  const getBaseballStatusInfo = (statusProp, startingAtProp) => {
    const code = String(
      statusProp?.short_name || statusProp?.statusCode || "",
    ).toUpperCase();
    const long = String(statusProp?.text || statusProp?.detailedState || "");
    const inning = statusProp?.inning ?? null;
    const inningState = String(statusProp?.inningState || "").toLowerCase();
    const basesSource = statusProp?.bases ?? props?.bases ?? {};
    const base1 =
      statusProp?.base1 ??
      props?.base1 ??
      false;
    const base2 =
      statusProp?.base2 ??
      props?.base2 ??
      false;
    const base3 =
      statusProp?.base3 ??
      props?.base3 ??
      false;
    const bases = {
      base1: !!base1,
      base2: !!base2,
      base3: !!base3,
    };
    const balls = statusProp?.balls ?? props?.balls ?? null;
    const strikes = statusProp?.strikes ?? props?.strikes ?? null;
    const outs = statusProp?.outs ?? props?.outs ?? null;
    const batter = statusProp?.batter ?? props?.batter ?? null;
    const pitcher = statusProp?.pitcher ?? props?.pitcher ?? null;
    const matchupText = statusProp?.matchupText ?? props?.matchupText ?? null;
    const previousPlayDescription =
      statusProp?.previousPlayDescription ??
      props?.previousPlayDescription ??
      null;
    const offenseTeamId =
      statusProp?.offenseTeamId ?? props?.linescoreTeamIds?.offense ?? null;
    const homeTeamId = props?.home?.id ?? null;
    const awayTeamId = props?.away?.id ?? null;
    const currentInningOrdinal =
      statusProp?.currentInningOrdinal ?? statusProp?.inning ?? null;
    const startMs = startingAtProp?.ms ?? null;
    const { time, ampm } = formatLocalStartingAt(startingAtProp);
    const nowMs = Date.now();
    const isTopInning = String(inningState || "").startsWith("top");
    const shouldUsePreviousPlayDescription =
      (balls === 0 && strikes === 0) ||
      (isTopInning &&
        offenseTeamId != null &&
        homeTeamId != null &&
        String(offenseTeamId) === String(homeTeamId)) ||
      (!isTopInning &&
        offenseTeamId != null &&
        awayTeamId != null &&
        String(offenseTeamId) === String(awayTeamId));
    const resolvedMatchupText = shouldUsePreviousPlayDescription
      ? previousPlayDescription || matchupText
      : matchupText;

    const isFinished =
      ["F", "O", "R", "D", "C"].includes(code) ||
      long.toLowerCase().includes("final");
    const isScheduled = !code || ["S", "P", "PRE", "SCHEDULED"].includes(code);
    const isStartingSoon =
      isScheduled &&
      startMs != null &&
      startMs > nowMs &&
      startMs - nowMs <= 30 * 60 * 1000;
    const inningNumber =
      inning !== null && inning !== undefined && inning !== ""
        ? Number(inning)
        : null;
    const label = isFinished
      ? `Final${inningNumber !== null && !Number.isNaN(inningNumber) && inningNumber !== 9 ? `/${inningNumber}` : ""}`
      : long || "";

    if (code === "I" || code === "M") {
      return {
        mode: "live",
        line1: null,
        line2: null,
        label: null,
        inningState,
        balls,
        strikes,
        outs,
        batter,
        pitcher,
        matchupText: resolvedMatchupText,
        currentInningOrdinal,
        bases,
        isLive: true,
        isFinished: false,
        isScheduled: false,
      };
    }

    if (isFinished) {
      return {
        mode: "finished",
        line1: ampm ? `${time} ${ampm} EST` : `${time} EST`,
        line2: label || null,
        label,
        bases,
        isLive: false,
        isFinished: true,
        isScheduled: false,
      };
    }

    if (isStartingSoon) {
      return {
        mode: "startingSoon",
        line1: ampm ? `${time} ${ampm} EST` : `${time} EST`,
        line2: "Starting Soon",
        label: "Starting Soon",
        bases,
        isLive: false,
        isFinished: false,
        isScheduled: true,
      };
    }

    if (isScheduled) {
      return {
        mode: "scheduled",
        line1: ampm ? `${time} ${ampm} EST` : `${time} EST`,
        line2: long || "Scheduled",
        label: long || "Scheduled",
        bases,
        isLive: false,
        isFinished: false,
        isScheduled: true,
      };
    }

    const inningLabel =
      inning != null
        ? `${inningState.startsWith("bot") ? "Bot" : "Top"} ${inning}`
        : code || "LIVE";

    return {
      mode: "live",
      line1: inningLabel,
      line2: long || "In Progress",
      label: long || "In Progress",
      inningState,
      balls,
      strikes,
      outs,
      batter,
      pitcher,
      matchupText: resolvedMatchupText,
      currentInningOrdinal,
      bases,
      isLive: true,
      isFinished: false,
      isScheduled: false,
    };
  };

  const baseballStatusInfo = getBaseballStatusInfo(status, props.startingAt);

  const renderBaseballCenter = () => {
    const centeredContainerModifiers = [
      frame({ width: 96, height: 74, alignment: "center" }),
    ];
    const centeredTextModifiers = [
      font({ size: 11, weight: "light" }),
      multilineTextAlignment("center"),
      lineLimit(2),
      frame({ maxWidth: 96, alignment: "center" }),
    ];

    if (baseballStatusInfo.mode === "live") {
      const inningArrow = baseballStatusInfo.inningState === "top" ? "▲" : "▼";
      const inningOrdinal =
        baseballStatusInfo.currentInningOrdinal != null &&
        baseballStatusInfo.currentInningOrdinal !== ""
          ? String(baseballStatusInfo.currentInningOrdinal)
          : baseballStatusInfo.line1 || "";
      const balls = baseballStatusInfo.balls ?? 0;
      const strikes = baseballStatusInfo.strikes ?? 0;
      const outs = Math.max(0, Math.min(3, baseballStatusInfo.outs ?? 0));
      const bases = baseballStatusInfo.bases ?? {};

      const renderBaseSquare = (baseName) => {
        const occupied = !!bases?.[baseName];
        return (
          <ZStack alignment="center">
            <Rectangle
              modifiers={[
                frame({ width: 11, height: 11 }),
                foregroundStyle({ color: colors.blended }),
                rotationEffect(45),
                opacity(occupied ? 1 : 0.35),
              ]}
            />
          </ZStack>
        );
      };

      const renderOutDot = (index) => {
        const occupied = outs > index;
        return (
          <Circle
            modifiers={[
              frame({ width: 7, height: 7 }),
              foregroundStyle({ color: colors.blended }),
              opacity(occupied ? 1 : 0.35),
            ]}
          />
        );
      };

      return (
        <ZStack modifiers={centeredContainerModifiers}>
          <VStack
            spacing={6}
            modifiers={[padding({ top: -10 }), frame({ alignment: "center" })]}
          >
            <Text
              modifiers={[
                font({ size: 11, weight: "bold" }),
                multilineTextAlignment("center"),
                frame({ maxWidth: 96, alignment: "center" }),
              ]}
            >
              {`${inningArrow} ${inningOrdinal} · ${balls}-${strikes}`}
            </Text>
            <VStack spacing={3} modifiers={[frame({ alignment: "center" })]}>
              <VStack spacing={2} modifiers={[frame({ alignment: "center" })]}>
                {renderBaseSquare("base2")}
                <HStack spacing={16} alignment="center">
                  {renderBaseSquare("base3")}
                  {renderBaseSquare("base1")}
                </HStack>
              </VStack>
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[padding({ top: 5 })]}
              >
                {renderOutDot(0)}
                {renderOutDot(1)}
                {renderOutDot(2)}
              </HStack>
            </VStack>
          </VStack>
        </ZStack>
      );
    }

    return (
      <ZStack modifiers={centeredContainerModifiers}>
        <VStack spacing={2} modifiers={[padding({ top: -30 }), frame({ alignment: "center" })]}>
          <Text
            modifiers={[
              font({ weight: "bold", size: 13 }),
              frame({ maxWidth: 96, alignment: "center" }),
            ]}
          >
            {baseballStatusInfo.line1}
          </Text>
          <Text modifiers={centeredTextModifiers}>
            {baseballStatusInfo.line2}
          </Text>
        </VStack>
      </ZStack>
    );
  };

  const showBaseballScores = !baseballStatusInfo.isScheduled;

  if (isBaseball) {
    const baseballWidgetLink =
      props?.url ||
      props?.widgetUrl ||
      props?.widgetURL ||
      (props?.gamePk || props?.id
        ? `sportsheart://mlb/game/${props.gamePk || props.id}`
        : null);

    const baseballModifiers = baseballWidgetLink
      ? [widgetURL(baseballWidgetLink)]
      : [];

    return {
      banner: (
        <ZStack modifiers={baseballModifiers}>
          <VStack>
            <Rectangle
              modifiers={[
                frame({ width: "100%", height: "100%" }),
                foregroundStyle({
                  type: "linearGradient",
                  colors: [
                    colors.away + "99",
                    colors.blended + "99",
                    colors.home + "99",
                  ],
                  startPoint: { x: 0, y: 0 },
                  endPoint: { x: 1, y: 0 },
                }),
              ]}
            />
          </VStack>

          <VStack spacing={10} modifiers={[padding({ top: 14, bottom: 14 })]}>
            <VStack>
              <HStack alignment="center" spacing={6}>
                {league.logo ? (
                  <Image
                    uiImage={league.logo}
                    modifiers={[resizable(), frame({ width: 14, height: 14 })]}
                  />
                ) : null}
                <Text
                  modifiers={[
                    font({ size: 12, weight: "light", family: "Helvetica" }),
                    frame({ alignment: "center" }),
                    opacity(0.8),
                  ]}
                >
                  {venue.name} · {league.name}
                </Text>
              </HStack>
            </VStack>

            <HStack alignment="center" spacing={12}>
              <VStack
                spacing={4}
                modifiers={[frame({ width: 98, height: 74, alignment: "top" })]}
              >
                <HStack alignment="center" spacing={8}>
                  <ZStack alignment="center">
                    {!away.logo ? (
                      <Circle
                        modifiers={[
                          frame({ width: 40, height: 40 }),
                          foregroundStyle({ color: colors.away }),
                        ]}
                      />
                    ) : null}

                    {away.logo ? (
                      <Image
                        uiImage={away.logo}
                        modifiers={[
                          resizable(),
                          frame({ width: 40, height: 40 }),
                        ]}
                      />
                    ) : (
                      <Text
                        modifiers={[
                          foregroundStyle(getTextOnColor(colors.away)),
                          font({ weight: "bold", size: 14 }),
                          frame({ alignment: "center" }),
                        ]}
                      >
                        {away.shortName}
                      </Text>
                    )}
                  </ZStack>

                  {showBaseballScores ? (
                    <Text
                      modifiers={[
                        font({
                          weight: away.winner
                            ? "bold"
                            : !baseballStatusInfo.isFinished
                              ? "bold"
                              : "light",
                          size: 36,
                        }),
                        scaleEffect({ x: 1, y: 1.075 }),
                        frame({ maxWidth: 50, alignment: "center" }),
                      ]}
                    >
                      {away.score}
                    </Text>
                  ) : null}
                </HStack>

                <Text
                  modifiers={[
                    lineLimit(2),
                    multilineTextAlignment("center"),
                    font({
                      weight: away.winner
                        ? "bold"
                        : !baseballStatusInfo.isFinished
                          ? "bold"
                          : "light",
                      size: 11,
                    }),
                    frame({ maxWidth: 98, minHeight: 26, alignment: "center" }),
                  ]}
                >
                  {away.name}
                </Text>
              </VStack>

              <VStack
                spacing={0}
                modifiers={[
                  frame({ width: 96, height: 74, alignment: "center" }),
                ]}
              >
                {renderBaseballCenter()}
              </VStack>

              <VStack
                spacing={4}
                modifiers={[frame({ width: 98, height: 74, alignment: "top" })]}
              >
                <HStack alignment="center" spacing={8}>
                  {showBaseballScores ? (
                    <Text
                      modifiers={[
                        font({
                          weight: home.winner
                            ? "bold"
                            : !baseballStatusInfo.isFinished
                              ? "bold"
                              : "regular",
                          size: 36,
                        }),
                        scaleEffect({ x: 1, y: 1.075 }),
                        frame({ maxWidth: 50, alignment: "center" }),
                      ]}
                    >
                      {home.score}
                    </Text>
                  ) : null}

                  <ZStack alignment="center">
                    {!home.logo ? (
                      <Circle
                        modifiers={[
                          frame({ width: 40, height: 40 }),
                          foregroundStyle({ color: colors.home }),
                        ]}
                      />
                    ) : null}

                    {home.logo ? (
                      <Image
                        uiImage={home.logo}
                        modifiers={[
                          resizable(),
                          frame({ width: 40, height: 40 }),
                        ]}
                      />
                    ) : (
                      <Text
                        modifiers={[
                          foregroundStyle(getTextOnColor(colors.home)),
                          font({ weight: "bold", size: 14 }),
                          frame({ alignment: "center" }),
                        ]}
                      >
                        {home.shortName}
                      </Text>
                    )}
                  </ZStack>
                </HStack>

                <Text
                  modifiers={[
                    lineLimit(2),
                    multilineTextAlignment("center"),
                    font({
                      weight: home.winner
                        ? "bold"
                        : !baseballStatusInfo.isFinished
                          ? "bold"
                          : "regular",
                      size: 11,
                    }),
                    frame({ maxWidth: 98, minHeight: 26, alignment: "center" }),
                  ]}
                >
                  {home.name}
                </Text>
              </VStack>
            </HStack>

            {baseballStatusInfo.mode === "live" &&
            (baseballStatusInfo.matchupText ||
              (baseballStatusInfo.batter && baseballStatusInfo.pitcher)) ? (
              <VStack alignment="center" modifiers={[padding({ top: -4 })]}>
                <Text
                  modifiers={[
                    font({ size: 10, weight: "light" }),
                    multilineTextAlignment("center"),
                    lineLimit(2),
                    frame({ maxWidth: 350, alignment: "center" }),
                    opacity(0.78),
                    italic(),
                  ]}
                >
                  {baseballStatusInfo.matchupText ||
                    `${baseballStatusInfo.batter} (B.) vs ${baseballStatusInfo.pitcher} (P.)`}
                </Text>
              </VStack>
            ) : null}
          </VStack>
        </ZStack>
      ),

      compactLeading: <Text modifiers={baseballModifiers}>{away.name}</Text>,
      compactTrailing: <Text modifiers={baseballModifiers}>{home.name}</Text>,
      minimal: (
        <Text modifiers={baseballModifiers}>{away.shortName || away.name}</Text>
      ),
    };
  }

  return {
    banner: (
      <ZStack modifiers={zModifiers}>
        <VStack>
          <Rectangle
            modifiers={[
              frame({ width: "100%", height: "100%" }),
              foregroundStyle({
                type: "linearGradient",
                colors: [
                  colors.home + "99",
                  colors.blended + "99",
                  colors.away + "99",
                ],
                startPoint: { x: 0, y: 0 },
                endPoint: { x: 1, y: 0 },
              }),
            ]}
          />
        </VStack>
        ,
        <VStack spacing={5} modifiers={[padding({ top: 15 })]}>
          <VStack>
            <HStack alignment="center" spacing={6}>
              {league.logo ? (
                <Image
                  uiImage={league.logo}
                  modifiers={[resizable(), frame({ width: 14, height: 14 })]}
                />
              ) : null}
              <Text
                modifiers={[
                  font({ size: 12, weight: "light", family: "Helvetica" }),
                  frame({ alignment: "center" }),
                ]}
              >
                {venue.name} · {league.name}
              </Text>
            </HStack>
          </VStack>

          <HStack alignment="center">
            <ZStack alignment="center">
              {!home.logo ? (
                <Circle
                  modifiers={[
                    frame({ width: 45, height: 45 }),
                    foregroundStyle({ color: colors.home }),
                  ]}
                />
              ) : null}

              {home.logo ? (
                <Image
                  uiImage={home.logo}
                  modifiers={[resizable(), frame({ width: 45, height: 45 })]}
                />
              ) : (
                <Text
                  modifiers={[
                    foregroundStyle(getTextOnColor(colors.home)),
                    font({ weight: "bold", size: 15 }),
                    frame({ alignment: "center" }),
                  ]}
                >
                  {home.shortName}
                </Text>
              )}
            </ZStack>

            {statusInfo.isScheduled ? (
              <HStack alignment="center" spacing={2.5}>
                <VStack style={{ alignItems: "center" }}>
                  <Text
                    modifiers={[
                      font({ weight: "bold" }),
                      frame({ maxWidth: 190, alignment: "center" }),
                    ]}
                  >
                    {statusInfo.line1}
                  </Text>
                  <Text
                    modifiers={[
                      font({ size: 11, weight: "light" }),
                      frame({ maxWidth: 190, alignment: "center" }),
                    ]}
                  >
                    {statusInfo.line2}
                  </Text>
                </VStack>
              </HStack>
            ) : (
              <HStack alignment="center">
                <Text
                  modifiers={[
                    font({
                      weight: home.winner
                        ? "bold"
                        : !statusInfo.isFinished
                          ? "bold"
                          : "light",
                      size: 30,
                    }),
                    frame({ maxWidth: 85, alignment: "center" }),
                  ]}
                >
                  {home.score}
                </Text>

                <Text
                  modifiers={[
                    font({ weight: "bold", size: 30 }),
                    frame({ maxWidth: 20, alignment: "center" }),
                  ]}
                >
                  -
                </Text>

                <Text
                  modifiers={[
                    font({
                      weight: away.winner
                        ? "bold"
                        : !statusInfo.isFinished
                          ? "bold"
                          : "light",
                      size: 30,
                    }),
                    frame({ maxWidth: 85, alignment: "center" }),
                  ]}
                >
                  {away.score}
                </Text>
              </HStack>
            )}

            <ZStack alignment="center">
              {!away.logo ? (
                <Circle
                  modifiers={[
                    frame({ width: 45, height: 45 }),
                    foregroundStyle({ color: colors.away }),
                  ]}
                />
              ) : null}

              {away.logo ? (
                <Image
                  uiImage={away.logo}
                  modifiers={[resizable(), frame({ width: 45, height: 45 })]}
                />
              ) : (
                <Text
                  modifiers={[
                    foregroundStyle(getTextOnColor(colors.away)),
                    font({ weight: "bold", size: 15 }),
                    frame({ alignment: "center" }),
                  ]}
                >
                  {away.shortName}
                </Text>
              )}
            </ZStack>
          </HStack>

          <HStack
            alignment="center"
            spacing={15}
            modifiers={[padding({ bottom: 15 })]}
          >
            <Text
              modifiers={[
                lineLimit(2),
                multilineTextAlignment("center"),
                font({
                  weight: home.winner
                    ? "bold"
                    : !statusInfo.isFinished
                      ? "bold"
                      : "light",
                  size: 12,
                }),
                frame({ maxWidth: 100, alignment: "center" }),
              ]}
            >
              {home.name}
            </Text>

            {statusInfo.isScheduled ? (
              <VStack style={{ alignItems: "center" }}>
                <Text
                  modifiers={[
                    font({ weight: "bold" }),
                    frame({ maxWidth: 100, alignment: "center" }),
                  ]}
                >
                  UPCOMING
                </Text>
              </VStack>
            ) : (
              <VStack style={{ alignItems: "center" }}>
                <Text
                  modifiers={[
                    font({ weight: "bold" }),
                    frame({ maxWidth: 100, alignment: "center" }),
                  ]}
                >
                  {statusInfo.line1}
                </Text>
                <Text
                  modifiers={[
                    font({ size: 11, weight: "light" }),
                    frame({ maxWidth: 100, alignment: "center" }),
                  ]}
                >
                  {statusInfo.line2}
                </Text>
              </VStack>
            )}

            <Text
              modifiers={[
                lineLimit(2),
                multilineTextAlignment("center"),
                font({
                  weight: away.winner
                    ? "bold"
                    : !statusInfo.isFinished
                      ? "bold"
                      : "light",
                  size: 12,
                }),
                frame({ maxWidth: 100, alignment: "center" }),
              ]}
            >
              {away.name}
            </Text>
          </HStack>
        </VStack>
      </ZStack>
    ),

    compactLeading: <Text>{home.name}</Text>,
    compactTrailing: <Text>{away.name}</Text>,
    minimal: <Text>{home.name}</Text>,
  };
};

const factory =
  typeof createLiveActivity === "function"
    ? createLiveActivity("FootballLiveActivity", FootballLiveActivity)
    : null;

export default factory;
