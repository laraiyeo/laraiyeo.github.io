import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { NBAService } from '../../services/NBAService';

const NBACompareScreen = ({ route, navigation }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  
  const [selectedTeam1, setSelectedTeam1] = useState(null);
  const [selectedTeam2, setSelectedTeam2] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);

  const selectTeam = (teamSlot) => {
    navigation.navigate('Search', { 
      sport: 'nba',
      selectMode: true,
      onSelect: (team) => {
        if (teamSlot === 1) {
          setSelectedTeam1(team);
        } else {
          setSelectedTeam2(team);
        }
        navigation.goBack();
      }
    });
  };

  const compareTeams = async () => {
    if (!selectedTeam1 || !selectedTeam2) {
      Alert.alert('Error', 'Please select two teams to compare');
      return;
    }

    setLoading(true);
    try {
      // Get detailed team data for comparison
      const team1Data = await NBAService.getTeamDetails(selectedTeam1.id);
      const team2Data = await NBAService.getTeamDetails(selectedTeam2.id);
      
      setComparisonData({
        team1: team1Data,
        team2: team2Data
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to load team comparison data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeAbbreviation = (abbrev) => {
    if (!abbrev) return abbrev;
    const a = String(abbrev).toLowerCase();
    const map = { 'gs': 'gsw', 'sa': 'sas', 'no': 'nop', 'ny': 'nyk', 'bkn': 'bk' };
    return (map[a] || abbrev).toString();
  };

  const renderTeamSelector = (teamSlot, selectedTeam) => (
    <TouchableOpacity
      style={[styles.teamSelector, { backgroundColor: theme.surface }]}
      onPress={() => selectTeam(teamSlot)}
      activeOpacity={0.7}
    >
      {selectedTeam ? (
        <View style={styles.selectedTeamContainer}>
          <Image
            source={{ uri: getTeamLogoUrl('nba', normalizeAbbreviation(selectedTeam.abbreviation)) }}
            style={styles.teamLogo}
            defaultSource={require('../../../assets/nba.png')}
          />
          <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
            {selectedTeam.displayName}
          </Text>
        </View>
      ) : (
        <View style={styles.emptyTeamSelector}>
          <Ionicons name="add-circle-outline" size={48} color={theme.textSecondary} />
          <Text allowFontScaling={false} style={[styles.selectTeamText, { color: theme.textSecondary }]}>
            Select Team {teamSlot}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Team Selectors */}
        <View style={styles.selectorContainer}>
          {renderTeamSelector(1, selectedTeam1)}
          <View style={styles.vsContainer}>
            <Text allowFontScaling={false} style={[styles.vsText, { color: colors.primary }]}>
              VS
            </Text>
          </View>
          {renderTeamSelector(2, selectedTeam2)}
        </View>

        {/* Compare Button */}
        <TouchableOpacity
          style={[
            styles.compareButton, 
            { 
              backgroundColor: (selectedTeam1 && selectedTeam2) ? colors.primary : theme.textSecondary,
              opacity: (selectedTeam1 && selectedTeam2) ? 1 : 0.5
            }
          ]}
          onPress={compareTeams}
          disabled={!selectedTeam1 || !selectedTeam2 || loading}
          activeOpacity={0.7}
        >
          <Text allowFontScaling={false} style={styles.compareButtonText}>
            {loading ? 'Comparing...' : 'Compare Teams'}
          </Text>
        </TouchableOpacity>

        {/* Comparison Results */}
        {comparisonData && (
          <View style={styles.comparisonContainer}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
              Team Comparison
            </Text>
            
            <View style={[styles.comparisonCard, { backgroundColor: theme.surface }]}>
              <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
                Detailed team comparison coming soon!
              </Text>
              <Text allowFontScaling={false} style={[styles.comingSoonSubtext, { color: theme.textSecondary }]}>
                This feature will include head-to-head stats, recent performance, and more.
              </Text>
            </View>
          </View>
        )}

        {/* Coming Soon Message */}
        {!comparisonData && (
          <View style={styles.comingSoonContainer}>
            <Ionicons name="analytics-outline" size={64} color={theme.textSecondary} />
            <Text allowFontScaling={false} style={[styles.comingSoonTitle, { color: theme.text }]}>
              Team Comparison
            </Text>
            <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
              Select two NBA teams to compare their stats, recent performance, and head-to-head records.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  selectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  teamSelector: {
    flex: 1,
    height: 120,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedTeamContainer: {
    alignItems: 'center',
  },
  teamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyTeamSelector: {
    alignItems: 'center',
  },
  selectTeamText: {
    fontSize: 14,
    marginTop: 8,
  },
  vsContainer: {
    marginHorizontal: 16,
  },
  vsText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  compareButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  compareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  comparisonContainer: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  comparisonCard: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  comingSoonSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default NBACompareScreen;