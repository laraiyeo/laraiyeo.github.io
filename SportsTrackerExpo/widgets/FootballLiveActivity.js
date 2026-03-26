// widgets/FootballLiveActivity.js
import {
  HStack,
  Text,
  VStack,
  ZStack,
  Rectangle,
  Circle,
  Image,
} from "@expo/ui/swift-ui";
import {
  frame,
  padding,
  foregroundStyle,
  font,
  lineLimit,
  multilineTextAlignment,
  widgetURL,
  resizable,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity } from "expo-widgets";

const FootballLiveActivity = (props) => {
  "widget"; // required for Expo Widgets

  const home =
    props && props.home && props.home.name ? props.home : { name: "Home" };
  const away =
    props && props.away && props.away.name ? props.away : { name: "Away" };
  const league =
    props && props.league && props.league.name
      ? props.league
      : { name: "League" };
  const colors =
    props && props.colors
      ? props.colors
      : { home: "#FF6B35", away: "#F7931E", blended: "#FFD23F" };
  const status =
    props && props.status && props.status.short_name
      ? props.status
      : { short_name: "Status" };
  const venue =
    props && props.venue && props.venue.name ? props.venue : { name: "Venue" };

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

    const time = startingAtProp?.time ?? "--:--";
    const ampm = startingAtProp?.ampm ?? "";
    return {
      line1: time,
      line2: ampm,
      isLive: false,
      isFinished: false,
      isScheduled: true,
    };
  };

  const widgetLink =
    (props && (props.url || props.widgetUrl || props.widgetURL)) ||
    (props && (props.id || props.fixtureId)
      ? `sportsheart://football/fixture/${props.id || props.fixtureId}`
      : null);
  const zModifiers = widgetLink ? [widgetURL(widgetLink)] : [];

  const statusInfo = getStatusInfo(status, props.startingAt);

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
                    font({ weight: home.winner ? "bold" : !statusInfo.isFinished ? "bold" : "light", size: 30 }),
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
                    font({ weight: away.winner ? "bold" : !statusInfo.isFinished ? "bold" : "light", size: 30 }),
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

const factory = createLiveActivity(
  "FootballLiveActivity",
  FootballLiveActivity,
);

export default factory;
