import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import WBCService from '../../services/WBCService';
import { loadWBCSearchData } from '../../services/WBCSearchCache';

const CompareScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, isDarkMode } = useTheme();

  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [player1Year, setPlayer1Year] = useState(new Date().getFullYear());
  const [player2Year, setPlayer2Year] = useState(new Date().getFullYear());
  const [comparisonStats, setComparisonStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchingForPlayer, setSearchingForPlayer] = useState(null);
  const [allPlayersLoading, setAllPlayersLoading] = useState(false);

  const [showYear1Picker, setShowYear1Picker] = useState(false);
  const [showYear2Picker, setShowYear2Picker] = useState(false);

  // All WBC players in compare-ready shape
  const [allWBCPlayers, setAllWBCPlayers] = useState([]);

  const currentYear = new Date().getFullYear();
  const startYear = 2022;
  const yearOptions = Array.from(
    { length: currentYear - startYear + 1 },
    (_, i) => currentYear - i,
  );

  // Load from cache on mount
  useEffect(() => {
    let mounted = true;
    setAllPlayersLoading(true);
    loadWBCSearchData()
      .then(({ teams, players }) => {
        if (!mounted) return;
        const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]));
        const mapped = players.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          position: p.primaryPosition?.abbreviation || 'N/A',
          positionName: p.primaryPosition?.name || '',
          jersey: p.primaryNumber || 'N/A',
          teamId: p.currentTeam?.id,
          teamName: teamMap[p.currentTeam?.id]?.name || '',
          teamAbbr: teamMap[p.currentTeam?.id]?.abbreviation || '',
          headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.id}/headshot/67/current`,
          isTwoWayPlayer: false,
        }));
        setAllWBCPlayers(mapped);
      })
      .catch((e) => {
        console.error('WBC compare data load error:', e);
        if (mounted) Alert.alert('Error', 'Failed to load WBC player data.');
      })
      .finally(() => { if (mounted) setAllPlayersLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (player1 && player2) loadComparison();
  }, [player1, player2, player1Year, player2Year]);

  // Debounced client-side search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchText.length >= 2) {
        setSearchLoading(true);
        const q = searchText.toLowerCase();
        const results = allWBCPlayers
          .filter((p) => p.fullName.toLowerCase().includes(q))
          .slice(0, 15);
        setSearchResults(results);
        setSearchLoading(false);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchText, allWBCPlayers]);

  const selectPlayer = (player, playerNumber) => {
    if (playerNumber === 1) setPlayer1(player);
    else setPlayer2(player);
    setShowSearchModal(false);
    setSearchText('');
    setSearchResults([]);
  };

  const clearPlayer = (playerNumber) => {
    if (playerNumber === 1) setPlayer1(null);
    else setPlayer2(null);
    setComparisonStats(null);
  };

  const openPlayerSearch = (playerNumber) => {
    setSearchingForPlayer(playerNumber);
    setShowSearchModal(true);
  };

  const loadComparison = async () => {
    if (!player1 || !player2) return;
    setLoading(true);
    try {
      const isPitcher = (pos) =>
        ['P', 'SP', 'RP', 'CP', 'Pitcher'].includes(pos);
      const isPitcher1 = isPitcher(player1.position);
      const isPitcher2 = isPitcher(player2.position);

      if (isPitcher1 !== isPitcher2) {
        Alert.alert('Invalid Comparison', 'Can only compare pitchers with pitchers or hitters with hitters.');
        setComparisonStats(null);
        setLoading(false);
        return;
      }

      const group = isPitcher1 ? 'pitching' : 'hitting';
      const [res1, res2] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${player1.id}/stats?stats=season&group=${group}&season=${player1Year}`),
        fetch(`https://statsapi.mlb.com/api/v1/people/${player2.id}/stats?stats=season&group=${group}&season=${player2Year}`),
      ]);
      const [d1, d2] = await Promise.all([res1.json(), res2.json()]);
      const stats1 = d1.stats?.[0]?.splits?.[0]?.stat;
      const stats2 = d2.stats?.[0]?.splits?.[0]?.stat;

      if (!stats1 && !stats2) {
        setComparisonStats({ error: 'No statistics available for comparison' });
        setLoading(false);
        return;
      }

      const defs = isPitcher1
        ? [
            { key: 'era',           label: 'ERA',   higherIsBetter: false },
            { key: 'whip',          label: 'WHIP',  higherIsBetter: false },
            { key: 'wins',          label: 'W',     higherIsBetter: true  },
            { key: 'strikeOuts',    label: 'SO',    higherIsBetter: true  },
            { key: 'saves',         label: 'SV',    higherIsBetter: true  },
            { key: 'inningsPitched',label: 'IP',    higherIsBetter: true  },
            { key: 'baseOnBalls',   label: 'BB',    higherIsBetter: false },
            { key: 'losses',        label: 'L',     higherIsBetter: false },
            { key: 'hits',          label: 'H',     higherIsBetter: false },
            { key: 'homeRuns',      label: 'HR',    higherIsBetter: false },
          ]
        : [
            { key: 'avg',        label: 'AVG', higherIsBetter: true  },
            { key: 'homeRuns',   label: 'HR',  higherIsBetter: true  },
            { key: 'rbi',        label: 'RBI', higherIsBetter: true  },
            { key: 'obp',        label: 'OBP', higherIsBetter: true  },
            { key: 'slg',        label: 'SLG', higherIsBetter: true  },
            { key: 'ops',        label: 'OPS', higherIsBetter: true  },
            { key: 'hits',       label: 'H',   higherIsBetter: true  },
            { key: 'runs',       label: 'R',   higherIsBetter: true  },
            { key: 'stolenBases',label: 'SB',  higherIsBetter: true  },
            { key: 'strikeOuts', label: 'SO',  higherIsBetter: false },
          ];

      const compData = defs.map((def) => {
        const isDecimal =
          ['avg', 'obp', 'slg', 'ops', 'era', 'whip'].includes(def.key);
        const fallback = isDecimal ? '0.000' : '0';
        const v1 = stats1?.[def.key] ?? fallback;
        const v2 = stats2?.[def.key] ?? fallback;
        const n1 = parseFloat(v1) || 0;
        const n2 = parseFloat(v2) || 0;
        let p1Better = false, p2Better = false;
        if (n1 !== 0 || n2 !== 0) {
          if (def.higherIsBetter) { p1Better = n1 > n2; p2Better = n2 > n1; }
          else                    { p1Better = n1 < n2; p2Better = n2 < n1; }
        }
        return { ...def, player1Value: v1, player2Value: v2, player1Better: p1Better, player2Better: p2Better };
      });

      setComparisonStats({
        isPitcher: isPitcher1,
        stats: compData,
        comparisonType: isPitcher1 ? 'Pitching' : 'Hitting',
      });
    } catch (e) {
      console.error('Compare error:', e);
      setComparisonStats({ error: 'Error loading comparison statistics' });
    }
    setLoading(false);
  };

  const renderPlayerCard = (player, playerNumber) => {
    const isP1 = playerNumber === 1;
    const logo = player?.teamId
      ? WBCService.getTeamLogo(player.teamId, isDarkMode)
      : null;

    return (
      <View style={[styles.playerCard, { backgroundColor: theme.surface }]}>
        {player ? (
          <>
            <TouchableOpacity style={styles.clearButton} onPress={() => clearPlayer(playerNumber)}>
              <Text allowFontScaling={false} style={styles.clearButtonText}>×</Text>
            </TouchableOpacity>

            {logo && (
              <View style={styles.teamHeader}>
                <Image source={{ uri: logo }} style={styles.teamLogo} resizeMode="contain" />
                <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
                  {player.teamAbbr}
                </Text>
              </View>
            )}

            <View style={styles.playerImageContainer}>
              <Image source={{ uri: player.headshot }} style={styles.playerImage} />
            </View>

            <View style={styles.playerNameContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.playerName, { color: theme.text }]}
                numberOfLines={2}
              >
                {player.fullName}
              </Text>
              <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
                #{player.jersey} | {player.position}
              </Text>
            </View>

            <View style={styles.yearSelector}>
              <Text allowFontScaling={false} style={[styles.yearLabel, { color: theme.text }]}>Year:</Text>
              <TouchableOpacity
                style={[styles.yearButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => isP1 ? setShowYear1Picker(true) : setShowYear2Picker(true)}
              >
                <Text allowFontScaling={false} style={[styles.yearButtonText, { color: theme.text }]}>
                  {isP1 ? player1Year : player2Year}
                </Text>
                <Text allowFontScaling={false} style={[styles.yearButtonArrow, { color: theme.textSecondary }]}>▼</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity style={styles.addPlayerButton} onPress={() => openPlayerSearch(playerNumber)}>
            <Text allowFontScaling={false} style={[styles.addPlayerIcon, { color: colors.secondary }]}>+</Text>
            <Text allowFontScaling={false} style={[styles.addPlayerText, { color: colors.secondary }]}>
              Add Player {playerNumber}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderComparisonStats = () => {
    if (!comparisonStats) return null;
    if (comparisonStats.error) {
      return (
        <View style={styles.errorContainer}>
          <Text allowFontScaling={false} style={[styles.errorText, { color: theme.textSecondary }]}>
            {comparisonStats.error}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.statsContainer}>
        {comparisonStats.comparisonType && (
          <View style={styles.comparisonHeader}>
            <Text allowFontScaling={false} style={[styles.comparisonType, { color: theme.text }]}>
              {comparisonStats.comparisonType} Statistics
            </Text>
          </View>
        )}
        {comparisonStats.stats.map((stat, index) => (
          <View key={index} style={[styles.statRow, { backgroundColor: theme.surface }]}>
            <View style={[
              styles.statBox,
              {
                backgroundColor: stat.player1Better ? colors.secondary + '20' : theme.background,
                borderColor: stat.player1Better ? colors.secondary : theme.border,
                borderWidth: stat.player1Better ? 2 : 1,
              },
            ]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: stat.player1Better ? colors.secondary : theme.text }]}>
                {stat.player1Value}
              </Text>
            </View>
            <View style={styles.statLabelContainer}>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.text }]}>{stat.label}</Text>
            </View>
            <View style={[
              styles.statBox,
              {
                backgroundColor: stat.player2Better ? colors.secondary + '20' : theme.background,
                borderColor: stat.player2Better ? colors.secondary : theme.border,
                borderWidth: stat.player2Better ? 2 : 1,
              },
            ]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: stat.player2Better ? colors.secondary : theme.text }]}>
                {stat.player2Value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderSearchModal = () => (
    <Modal
      visible={showSearchModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowSearchModal(false)}
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>
            Select Player {searchingForPlayer}
          </Text>
          <TouchableOpacity onPress={() => setShowSearchModal(false)} style={styles.modalCloseButton}>
            <Text allowFontScaling={false} style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            placeholder="Search for a player..."
            placeholderTextColor={theme.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
          />
        </View>

        <ScrollView style={styles.searchResults}>
          {(allPlayersLoading || searchLoading) ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text allowFontScaling={false} style={{ marginTop: 12, color: theme.textSecondary }}>
                {allPlayersLoading ? 'Loading WBC roster...' : 'Searching...'}
              </Text>
            </View>
          ) : (
            searchResults.map((player) => {
              const logo = WBCService.getTeamLogo(player.teamId, isDarkMode);
              return (
                <TouchableOpacity
                  key={player.id}
                  style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                  onPress={() => selectPlayer(player, searchingForPlayer)}
                >
                  <Image source={{ uri: player.headshot }} style={styles.searchResultImage} />
                  <View style={styles.searchResultInfo}>
                    <Text allowFontScaling={false} style={[styles.searchResultName, { color: theme.text }]}>{player.fullName}</Text>
                    <Text allowFontScaling={false} style={[styles.searchResultDetails, { color: theme.textSecondary }]}>
                      #{player.jersey} | {player.position}
                    </Text>
                    {player.teamName ? (
                      <Text allowFontScaling={false} style={[styles.searchResultTeam, { color: theme.textSecondary }]}>
                        {player.teamName}
                      </Text>
                    ) : null}
                  </View>
                  {logo ? (
                    <Image source={{ uri: logo }} style={styles.searchResultTeamLogo} resizeMode="contain" />
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderYearPicker = (visible, onClose, currentVal, onSelect, playerName) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.yearPickerModal, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.yearPickerTitle, { color: theme.text }]}>
            Select Year for {playerName}
          </Text>
          <ScrollView style={styles.yearOptions}>
            {yearOptions.map((year) => (
              <TouchableOpacity
                key={year}
                style={[styles.yearOption, { backgroundColor: year === currentVal ? colors.primary : 'transparent' }]}
                onPress={() => { onSelect(year); onClose(); }}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.yearOptionText, { color: year === currentVal ? 'white' : theme.text }]}
                >
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={[styles.yearPickerCancel, { borderTopColor: theme.border }]}
            onPress={onClose}
          >
            <Text allowFontScaling={false} style={[styles.yearPickerCancelText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text allowFontScaling={false} style={[styles.title, { color: colors.primary }]}>Player Comparison</Text>
          <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
            Compare WBC players side by side
          </Text>
        </View>

        <View style={styles.playersHeader}>
          {renderPlayerCard(player1, 1)}
          <View style={styles.vsContainer}>
            <Text allowFontScaling={false} style={[styles.vsText, { color: theme.text }]}>VS</Text>
          </View>
          {renderPlayerCard(player2, 2)}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading comparison...</Text>
          </View>
        ) : (
          renderComparisonStats()
        )}
      </ScrollView>

      {renderSearchModal()}
      {renderYearPicker(showYear1Picker, () => setShowYear1Picker(false), player1Year, setPlayer1Year, player1?.fullName)}
      {renderYearPicker(showYear2Picker, () => setShowYear2Picker(false), player2Year, setPlayer2Year, player2?.fullName)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center' },
  playersHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 16 },
  playerCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    position: 'relative',
    minHeight: 240,
    justifyContent: 'flex-start',
  },
  teamHeader: { alignItems: 'center', marginBottom: 8 },
  teamLogo: { width: 28, height: 28, marginBottom: 4 },
  teamName: { fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  playerImageContainer: { alignItems: 'center', marginBottom: 6 },
  playerNameContainer: { height: 45, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  clearButton: {
    position: 'absolute', top: 8, right: 8,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#dc3545', alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  clearButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  playerImage: { width: 60, height: 60, borderRadius: 30, marginBottom: 12 },
  playerName: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  playerDetails: { fontSize: 14, textAlign: 'center', marginBottom: 16 },
  yearSelector: { alignItems: 'center', gap: 8 },
  yearLabel: { fontSize: 14, fontWeight: '500' },
  yearButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, minWidth: 80,
  },
  yearButtonText: { fontSize: 16, fontWeight: '500' },
  yearButtonArrow: { fontSize: 12, marginLeft: 8 },
  addPlayerButton: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  addPlayerIcon: { fontSize: 48, fontWeight: 'bold', marginBottom: 8 },
  addPlayerText: { fontSize: 16, fontWeight: '500', textAlign: 'center' },
  vsContainer: { alignItems: 'center', justifyContent: 'center' },
  vsText: { fontSize: 20, fontWeight: 'bold' },
  statsContainer: { gap: 8, marginTop: 8 },
  comparisonHeader: { alignItems: 'center', paddingVertical: 8, marginBottom: 12 },
  comparisonType: { fontSize: 18, fontWeight: 'bold' },
  statRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, gap: 12 },
  statBox: { flex: 1, padding: 12, borderRadius: 6, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold' },
  statLabelContainer: { width: 80, alignItems: 'center' },
  statLabel: { fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  errorContainer: { padding: 20, alignItems: 'center' },
  errorText: { fontSize: 16, textAlign: 'center' },
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalCloseButton: { padding: 8 },
  modalCloseText: { fontSize: 16, fontWeight: '500' },
  searchContainer: { padding: 16 },
  searchInput: { padding: 12, borderRadius: 8, borderWidth: 1, fontSize: 16 },
  searchResults: { flex: 1, padding: 16 },
  searchResultItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 8, marginBottom: 8, gap: 12,
  },
  searchResultImage: { width: 40, height: 40, borderRadius: 20 },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 16, fontWeight: 'bold' },
  searchResultDetails: { fontSize: 14, marginTop: 2 },
  searchResultTeam: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  searchResultTeamLogo: { width: 24, height: 24 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  yearPickerModal: { width: 280, maxHeight: 400, borderRadius: 12, margin: 20 },
  yearPickerTitle: {
    fontSize: 18, fontWeight: 'bold', textAlign: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#ddd',
  },
  yearOptions: { maxHeight: 250 },
  yearOption: { padding: 16, alignItems: 'center' },
  yearOptionText: { fontSize: 16, fontWeight: '500' },
  yearPickerCancel: { padding: 16, alignItems: 'center', borderTopWidth: 1 },
  yearPickerCancelText: { fontSize: 16, fontWeight: '500' },
});

export default CompareScreen;