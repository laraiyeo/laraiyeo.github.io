import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

const PlayerStatsPopup = ({ visible, onClose, player, propType, currentLine }) => {
  const { colors, theme } = useTheme();

  if (!player) return null;

  // Generate last 5 games data
  const last5Games = [
    { game: 'vs LAL', value: 28, date: 'Dec 10' },
    { game: 'vs GSW', value: 22, date: 'Dec 8' },
    { game: '@ PHX', value: 31, date: 'Dec 6' },
    { game: 'vs DAL', value: 19, date: 'Dec 4' },
    { game: '@ SAC', value: 26, date: 'Dec 2' },
  ];

  const maxValue = Math.max(...last5Games.map(g => g.value), currentLine) + 5;
  const timesOver = last5Games.filter(g => g.value >= currentLine).length;
  const timesUnder = last5Games.filter(g => g.value < currentLine).length;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.popupContainer, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.playerIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="person" size={24} color="white" />
              </View>
              <View>
                <Text style={[styles.playerName, { color: theme.text }]}>{player.name}</Text>
                <Text style={[styles.propTypeText, { color: theme.textSecondary }]}>
                  {propType} - Last 5 Games
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Stats Summary */}
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: theme.surface }]}>
                <Text style={[styles.statValue, { color: theme.success }]}>{timesOver}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Over {currentLine}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: theme.surface }]}>
                <Text style={[styles.statValue, { color: theme.error }]}>{timesUnder}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Under {currentLine}</Text>
              </View>
            </View>

            {/* Bar Chart */}
            <View style={styles.chartContainer}>
              <Text style={[styles.chartTitle, { color: theme.text }]}>
                Last 5 Games Performance
              </Text>
              
              {/* Line overlay - positioned absolutely */}
              <View
                style={[
                  styles.lineOverlay,
                  {
                    bottom: `${(currentLine / maxValue) * 100}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              >
                <View style={[styles.lineLabel, { backgroundColor: colors.primary }]}>
                  <Text style={styles.lineLabelText}>{currentLine}</Text>
                </View>
              </View>

              <View style={styles.chart}>
                {last5Games.map((game, index) => {
                  const barHeightPercent = (game.value / maxValue) * 100;
                  const isOver = game.value >= currentLine;

                  return (
                    <View key={index} style={styles.barContainer}>
                      <View style={styles.barWrapper}>
                        {/* The bar */}
                        <View
                          style={[
                            styles.bar,
                            {
                              height: `${barHeightPercent}%`,
                              backgroundColor: isOver ? theme.success : theme.error,
                            },
                          ]}
                        >
                          <Text style={styles.barValueText}>{game.value}</Text>
                        </View>
                      </View>
                      {/* Game label */}
                      <Text style={[styles.gameLabel, { color: theme.textSecondary }]}>
                        {game.game}
                      </Text>
                      <Text style={[styles.dateLabel, { color: theme.textTertiary }]}>
                        {game.date}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Y-axis labels */}
              <View style={styles.yAxis}>
                <Text style={[styles.yAxisLabel, { color: theme.textTertiary }]}>{maxValue}</Text>
                <Text style={[styles.yAxisLabel, { color: theme.textTertiary }]}>
                  {Math.round(maxValue / 2)}
                </Text>
                <Text style={[styles.yAxisLabel, { color: theme.textTertiary }]}>0</Text>
              </View>
            </View>

            {/* Game Details */}
            <View style={styles.gamesDetails}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Game Details</Text>
              {last5Games.map((game, index) => (
                <View
                  key={index}
                  style={[
                    styles.gameDetailRow,
                    { backgroundColor: theme.surface, borderLeftColor: game.value >= currentLine ? theme.success : theme.error },
                  ]}
                >
                  <View style={styles.gameDetailLeft}>
                    <Text style={[styles.gameDetailGame, { color: theme.text }]}>{game.game}</Text>
                    <Text style={[styles.gameDetailDate, { color: theme.textSecondary }]}>{game.date}</Text>
                  </View>
                  <Text style={[styles.gameDetailValue, { color: theme.text }]}>
                    {game.value} {propType}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  popupContainer: {
    width: width * 0.9,
    maxHeight: '85%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  playerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  propTypeText: {
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  chartContainer: {
    marginBottom: 24,
    position: 'relative',
    paddingLeft: 35,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  chart: {
    height: 200,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    position: 'relative',
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  barWrapper: {
    width: '100%',
    height: 200,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '80%',
    borderRadius: 6,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 6,
    minHeight: 30,
  },
  barValueText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  gameLabel: {
    fontSize: 11,
    marginTop: 8,
    fontWeight: '600',
  },
  dateLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  lineOverlay: {
    position: 'absolute',
    left: 35,
    right: 0,
    height: 2,
    zIndex: 10,
  },
  lineLabel: {
    position: 'absolute',
    right: 0,
    top: -10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lineLabelText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  yAxis: {
    position: 'absolute',
    left: 0,
    top: 40,
    bottom: 50,
    width: 30,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  yAxisLabel: {
    fontSize: 10,
  },
  gamesDetails: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  gameDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  gameDetailLeft: {
    flex: 1,
  },
  gameDetailGame: {
    fontSize: 14,
    fontWeight: '600',
  },
  gameDetailDate: {
    fontSize: 12,
    marginTop: 2,
  },
  gameDetailValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default PlayerStatsPopup;
