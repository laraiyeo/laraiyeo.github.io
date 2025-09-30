import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFavorites } from '../context/FavoritesContext';
import { useTheme } from '../context/ThemeContext';

const FavoritesManagementScreen = ({ navigation }) => {
  const { theme, colors, getTeamLogoUrl, isDarkMode } = useTheme();
  const { favorites, removeFavorite, getFavoriteTeams, clearAllFavorites } = useFavorites();

  const favoriteTeams = getFavoriteTeams();

  const normalizeAbbreviation = (sport, abbrev) => {
    if (!abbrev) return abbrev;
    const a = String(abbrev).toLowerCase();
    
    if (sport === 'nba') {
      const map = { 'gs': 'gsw', 'sa': 'sas', 'no': 'nop', 'ny': 'nyk', 'bkn': 'bk' };
      return (map[a] || abbrev).toString();
    } else if (sport === 'nhl') {
      const map = { 'lak': 'la', 'sjs': 'sj', 'tbl': 'tb' };
      return (map[a] || abbrev).toString();
    }
    
    return abbrev;
  };

  // F1 constructor colors (matches StandingsScreen)
  const constructorColors = {
    'Mercedes': '#27F4D2',
    'Red Bull': '#3671C6', 
    'Ferrari': '#E8002D',
    'McLaren': '#FF8000',
    'Alpine': '#FF87BC',
    'Racing Bulls': '#6692FF',
    'Aston Martin': '#229971',
    'Williams': '#64C4FF',
    'Sauber': '#52E252',
    'Haas': '#B6BABD'
  };

  // F1 constructor logo helper (matches StandingsScreen logic)
  const getF1ConstructorLogo = (constructorName) => {
    if (!constructorName) return null;
    const nameMap = {
      'McLaren': 'mclaren',
      'Ferrari': 'ferrari',
      'Red Bull': 'redbullracing',
      'Mercedes': 'mercedes',
      'Aston Martin': 'astonmartin',
      'Alpine': 'alpine',
      'Williams': 'williams',
      'RB': 'rb',
      'Haas': 'haas',
      'Sauber': 'kicksauber'
    };

    const logoName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
    // use the same media.formula1.com pattern from StandingsScreen
    const variant = isDarkMode ? 'logowhite' : 'logoblack';
    // Some environments may not expose isDarkMode on theme; default behavior handled in URL
    return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/2025/${logoName}/2025${logoName}${variant}.webp`;
  };

  // ESPN manufacturer IDs for F1 constructors
  const espnManufacturerIds = {
    'McLaren': '106892',
    'Ferrari': '106842',
    'Red Bull': '106921',
    'Mercedes': '106893',
    'Aston Martin': '123986',
    'Alpine': '106922',
    'Williams': '106967',
    'RB': '123988',
    'Racing Bulls': '123988',
    'Haas': '111427',
    'Sauber': '106925'
  };

  // Get F1 constructor color
  const getF1ConstructorColor = (constructorName) => {
    return constructorColors[constructorName] || '#FF8000'; // Default to McLaren orange
  };

  // Get ESPN manufacturer ID for F1 constructor
  const getESPNManufacturerId = (constructorName) => {
    return espnManufacturerIds[constructorName] || null;
  };

  const confirmRemoveFavorite = (item) => {
    Alert.alert(
      'Remove Favorite',
      `Are you sure you want to remove ${item.displayName || item.teamName || 'this team'} from your favorites?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (item.teamId) {
              await removeFavorite(item.teamId);
            }
          },
        },
      ]
    );
  };

  const confirmResetFavorites = () => {
    Alert.alert(
      'Reset All Favorites',
      'Are you sure you want to remove all favorite teams? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: async () => {
            await clearAllFavorites();
          },
        },
      ]
    );
  };

  const renderFavoriteTeam = (item, index) => {
    const rawSport = item.sport || '';
    
    // Normalize soccer-related sports to 'soccer' for logo URL generation
    const sport = (() => {
      const sportLower = rawSport.toLowerCase();
      if (sportLower === 'soccer' || 
          sportLower === 'champions league' ||
          sportLower === 'uefa champions' ||
          sportLower === 'europa league' ||
          sportLower === 'uefa europa' ||
          sportLower === 'europa conference' ||
          sportLower === 'uefa europa conf' ||
          sportLower === 'premier league' ||
          sportLower === 'england' ||
          sportLower === 'la liga' ||
          sportLower === 'serie a' ||
          sportLower === 'bundesliga' ||
          sportLower === 'ligue 1') {
        return 'soccer';
      }
      return rawSport;
    })();
    
    const abbreviation = normalizeAbbreviation(sport, item.abbreviation);

    const handlePress = () => {
      try {
        // Debug logging to understand the data structure
        console.log('FavoriteCard pressed:', {
          sport,
          rawSport,
          item: {
            teamId: item.teamId,
            id: item.id,
            abbreviation: item.abbreviation,
            teamName: item.teamName,
            displayName: item.displayName
          }
        });

        if (sport === 'f1') {
          const constructorName = item.teamName || item.displayName;
          const constructorColor = getF1ConstructorColor(constructorName);
          const constructorId = getESPNManufacturerId(constructorName);
          
          console.log('F1 Navigation - Constructor:', constructorName, 'ID:', constructorId, 'Color:', constructorColor);
          
          navigation.navigate('F1ConstructorDetails', {
            constructorId, // Use proper ESPN manufacturer ID
            constructorName,
            constructorColor,
          });
        } else if (sport === 'soccer') {
          // For soccer, determine the correct league-specific team page based on rawSport
          const getSoccerRoute = (leagueType) => {
            const routeMap = {
              'champions league': 'UCLTeamPage',
              'uefa champions': 'UCLTeamPage',
              'europa league': 'UELTeamPage', 
              'uefa europa': 'UELTeamPage',
              'europa conference': 'UECLTeamPage',
              'uefa europa conf': 'UECLTeamPage',
              'premier league': 'EnglandTeamPage',
              'england': 'EnglandTeamPage',
              'la liga': 'SpainTeamPage',
              'serie a': 'ItalyTeamPage',
              'bundesliga': 'GermanyTeamPage',
              'ligue 1': 'FranceTeamPage',
              'soccer': 'SpainTeamPage' // fallback to Spain for generic soccer
            };
            return routeMap[leagueType.toLowerCase()] || 'SpainTeamPage';
          };

          let teamId = item.teamId || item.id || abbreviation;
          
          // Strip sport/league suffix if present
          if (teamId && typeof teamId === 'string' && teamId.includes('_')) {
            const stripped = teamId.split('_')[0];
            console.log('Stripped soccer teamId for navigation:', stripped, 'from', teamId);
            teamId = stripped;
          }
          
          const routeName = getSoccerRoute(rawSport);
          console.log('Navigating to soccer route:', routeName, 'with teamId:', teamId);
          navigation.navigate(routeName, { teamId, sport: 'soccer' });
        } else {
          // For other sports (MLB, NBA, NFL, NHL)
          let teamId = item.teamId || item.id || abbreviation;
          
          // If teamId has sport suffix, strip it for navigation
          if (teamId && typeof teamId === 'string' && teamId.includes('_')) {
            const stripped = teamId.split('_')[0];
            console.log('Stripped teamId for navigation:', stripped, 'from', teamId);
            teamId = stripped;
          }
          
          console.log('Navigating to TeamPage with:', { teamId, sport });
          navigation.navigate('TeamPage', { teamId, sport });
        }
      } catch (e) {
        console.warn('Navigation error in FavoritesManagementScreen:', e);
      }
    };

    return (
      <TouchableOpacity
        key={item.teamId || index}
        activeOpacity={0.85}
        onPress={handlePress}
        style={[
          styles.favoriteCard,
          { 
            backgroundColor: theme.surface,
            borderColor: colors.primary,
          }
        ]}
      >
        <View style={styles.teamContent}>
          <Image
            source={{ uri: sport === 'f1' ? getF1ConstructorLogo(item.teamName || item.displayName) : getTeamLogoUrl(sport, abbreviation || item.teamId) }}
            style={styles.teamLogo}
            defaultSource={
              sport === 'nfl' ? require('../../assets/nfl.png') :
              sport === 'mlb' ? require('../../assets/mlb.png') :
              sport === 'nba' ? require('../../assets/nba.png') :
              sport === 'nhl' ? require('../../assets/nhl.png') :
              sport === 'f1' ? require('../../assets/f1.png') :
              require('../../assets/soccer.png')
            }
          />
          <View style={styles.teamInfo}>
            <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
              {item.displayName || item.teamName || 'Unnamed Team'}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamSport, { color: theme.textSecondary }]}>
              {rawSport.toUpperCase()} {item.abbreviation ? `- ${item.abbreviation}` : ''}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={[styles.removeButton, { backgroundColor: colors.error || '#ff4d4f' }]}
          onPress={() => confirmRemoveFavorite(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, paddingTop: 60 }]}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.title, { color: theme.text }]}>
          Manage Favorites
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Reset Button */}
        {favoriteTeams.length > 0 && (
          <TouchableOpacity
            style={[styles.resetAllButton, { backgroundColor: colors.error || '#ff4d4f' }]}
            onPress={confirmResetFavorites}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color="#fff" style={styles.resetIcon} />
            <Text allowFontScaling={false} style={styles.resetAllButtonText}>
              Reset All Favorites
            </Text>
          </TouchableOpacity>
        )}

        {/* Favorites List */}
        {favoriteTeams.length > 0 ? (
          <View style={styles.favoritesList}>
            {favoriteTeams.map((item, index) => renderFavoriteTeam(item, index))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="star-outline" size={64} color={theme.textSecondary} />
            <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.text }]}>
              No Favorite Teams
            </Text>
            <Text allowFontScaling={false} style={[styles.emptyDescription, { color: theme.textSecondary }]}>
              Add teams to your favorites by tapping the star icon on team pages or game details.
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40, // Same width as back button for centering
  },
  content: {
    flex: 1,
    padding: 16,
  },
  resetAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  resetIcon: {
    marginRight: 8,
  },
  resetAllButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  favoritesList: {
    gap: 12,
  },
  favoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  teamContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 48,
    height: 48,
    marginRight: 16,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  teamSport: {
    fontSize: 12,
    marginBottom: 2,
  },
  teamAbbreviation: {
    fontSize: 12,
  },
  removeButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default FavoritesManagementScreen;