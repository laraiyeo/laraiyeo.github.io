// widgets/FootballLiveActivity.js
import { Text, VStack, Image } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

console.log("[FootballLiveActivity] Importing FootballLiveActivity widget...");

const FootballLiveActivity = (props) => {
  "widget"; // required for Expo Widgets

  console.log("[FootballLiveActivity] Widget render called with props:", props);

  const home = props.home || { name: "Home", score: 0 };
  const away = props.away || { name: "Away", score: 0 };
  const status = props.status || { short_name: "LIVE" };
  const league = props.league || { name: "Demo League" };

  console.log("[FootballLiveActivity] Parsed props:", { home, away, status, league });

  return {
    banner: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle('#007AFF')]}>
          {status.short_name}
        </Text>
        <Text modifiers={[font({ size: 14 })]}>
          {home.name} {home.score} - {away.score} {away.name}
        </Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#666')]}>
          {league.name}
        </Text>
      </VStack>
    ),
    compactLeading: <Image systemName="sportscourt.fill" color="#007AFF" />,
    compactTrailing: <Text>{`${home.score} - ${away.score}`}</Text>,
    minimal: <Text>{`${home.score} - ${away.score}`}</Text>,
  };
};

const factory = createLiveActivity("FootballLiveActivity", FootballLiveActivity);

console.log("[FootballLiveActivity] FootballLiveActivity factory created:", factory);

export default factory;