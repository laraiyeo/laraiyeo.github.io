import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getRankings } from '../../../services/valorantService';

// Region mapping for API calls
const regionMapping = {
  'AMER': 'AMERICAS',
  'EMEA': 'EMEA',
  'PAC': 'PACIFIC',
  'CN': 'CHINA'
};

const TeamLogo = ({ logoUrl, size, style, iconStyle }) => {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);
  
  if (!logoUrl || imageError) {
    return (
      <Ionicons 
        name="trophy" 
        size={size} 
        color={colors.primary} 
        style={iconStyle}
      />
    );
  }
  
  return (
    <Image
      source={{ uri: logoUrl }}
      style={style}
      onError={() => setImageError(true)}
    />
  );
};

const VALRankScreen = () => {
  const { theme, colors } = useTheme();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('AMER');

  useEffect(() => {
    fetchRankings();
  }, [selectedRegion]);

  const fetchRankings = async () => {
    setLoading(true);
    try {
      const apiRegion = regionMapping[selectedRegion];
      const data = await getRankings(apiRegion);
      setRankings(data || []);
    } catch (error) {
      console.error('Error fetching rankings:', error);
      setRankings([]);
    } finally {
      setLoading(false);
    }
  };

  const renderTeamRow = (team, index) => {
    return (
      <TouchableOpacity
        key={team.id}
        style={[styles.teamRow, { backgroundColor: theme.surface }]}
        onPress={() => {
          navigation.navigate('VALTeamPage', {
            teamId: team.id,
            teamName: team.name
          });
        }}
      >
        <View style={styles.teamRank}>
          <Text allowFontScaling={false} style={[styles.rankText, { color: theme.text }]}>
            {index + 1}
          </Text>
        </View>

        <TeamLogo
          logoUrl={team.logo_url}
          size={32}
          style={[styles.teamLogo, { backgroundColor: theme.background }]}
          iconStyle={styles.teamLogo}
        />

        <View style={styles.teamInfo}>
          <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
            {team.name}
          </Text>
        </View>

        <View style={styles.teamStats}>
          <Text allowFontScaling={false} style={[styles.statText, { color: theme.textSecondary }]}>
            {team.ending_elo}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Rankings...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.rankingsContainer}>
          <View style={styles.regionButtonsContainer}>
            {['AMER', 'EMEA', 'PAC', 'CN'].map((region) => (
              <TouchableOpacity
                key={region}
                style={[
                  styles.regionButton,
                  {
                    backgroundColor: selectedRegion === region ? colors.primary : theme.surface,
                    borderColor: colors.primary,
                  }
                ]}
                onPress={() => setSelectedRegion(region)}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.regionButtonText,
                    {
                      color: selectedRegion === region ? '#fff' : theme.text,
                    }
                  ]}
                >
                  {region}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {rankings.map((team, index) => renderTeamRow(team, index))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  rankingsContainer: {
    marginBottom: 24,
  },
  regionButtonsContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  regionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 1,
  },
  regionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 2,
    borderRadius: 8,
  },
  teamRank: {
    width: 30,
    marginRight: 12,
  },
  rankText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  teamLogo: {
    width: 40,
    height: 40,
    borderRadius: 16,
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  teamName: {
    fontSize: 18,
    fontWeight: '600',
  },
  teamStats: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default VALRankScreen;