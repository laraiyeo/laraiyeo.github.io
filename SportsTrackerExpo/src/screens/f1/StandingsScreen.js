import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';

const StandingsScreen = ({ route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigation = useNavigation();
  
  const [selectedType, setSelectedType] = useState('DRIVERS');
  const [driverStandings, setDriverStandings] = useState([]);
  const [constructorStandings, setConstructorStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const standingTypes = [
    { key: 'DRIVERS', name: 'Drivers' },
    { key: 'CONSTRUCTORS', name: 'Constructors' }
  ];

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

  // Helper to format color from API (adds # if missing)
  const formatColor = (color) => {
    if (!color) return '#000000';
    return color.startsWith('#') ? color : `#${color}`;
  };

  // Helper to get F1 team ID for favorites (use team name as ID for F1)
  const getF1TeamId = (teamName) => {
    if (!teamName) return null;
    // Use team name as ID for F1 since there's no consistent numeric ID
    return `f1_${teamName.toLowerCase().replace(/\s+/g, '_')}`;
  };

  // Helper to handle team favorite toggle
  const handleTeamFavoriteToggle = async (teamName, teamColor) => {
    if (!teamName) return;
    
    const teamId = getF1TeamId(teamName);
    try {
      await toggleFavorite({
        teamId: teamId,
        teamName: teamName,
        sport: 'f1',
        leagueCode: 'f1',
        teamColor: teamColor
      });
    } catch (error) {
      console.error('Error toggling F1 team favorite:', error);
    }
  };

  useEffect(() => {
    fetchStandings();
  }, []);

  const fetchStandings = async () => {
    try {
      setLoading(true);
      
      // Fetch driver standings
      const driversResponse = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0');
      const driversData = await driversResponse.json();
      
      if (driversData && driversData.standings) {
        // Process driver standings with team information
        const driversWithDetails = await Promise.all(
          driversData.standings.map(async (standing, index) => {
            try {
              // Get athlete details
              const athleteResponse = await fetch(convertToHttps(standing.athlete.$ref));
              const athleteData = await athleteResponse.json();
              
              // Get team information from event log (following standings.js pattern)
              let teamName = 'Unknown Team';
              let teamColor = '#000000';
              
              try {
                if (athleteData.eventLog && athleteData.eventLog.$ref) {
                  const eventLogResponse = await fetch(convertToHttps(athleteData.eventLog.$ref));
                  const eventLogData = await eventLogResponse.json();
                  
                  if (eventLogData.events?.items?.length > 0) {
                    const items = eventLogData.events.items;
                    let lastEvent = null;

                    for (let i = items.length - 1; i >= 0; i--) {
                      if (items[i].played === true) {
                        lastEvent = items[i];
                        break;
                      }
                    }

                    if (lastEvent.competitor?.$ref) {
                      const competitorResponse = await fetch(convertToHttps(lastEvent.competitor.$ref));
                      const competitorData = await competitorResponse.json();
                      
                      if (competitorData.vehicle?.manufacturer) {
                        teamName = competitorData.vehicle.manufacturer;
                        teamColor = formatColor(constructorColors[teamName]) || '#000000';
                      }
                    }
                  }
                }
                
                // Fallback to vehicles array if eventLog approach fails
                if (teamName === 'Unknown Team' && athleteData.vehicles && athleteData.vehicles.length > 0) {
                  teamName = athleteData.vehicles[0].team || teamName;
                  teamColor = formatColor(constructorColors[teamName]) || '#000000';
                }
              } catch (teamError) {
                console.log('Could not fetch team data for driver:', athleteData.displayName);
                // Final fallback to vehicles array
                if (athleteData.vehicles && athleteData.vehicles.length > 0) {
                  teamName = athleteData.vehicles[0].team || teamName;
                  teamColor = formatColor(constructorColors[teamName]) || '#000000';
                }
              }
              
              return {
                position: index + 1,
                driver: {
                  id: athleteData.id || null,
                  name: athleteData.displayName || athleteData.name || 'Unknown Driver',
                  firstName: athleteData.firstName || '',
                  lastName: athleteData.lastName || '',
                  nationality: athleteData.citizenship || '',
                  headshot: buildESPNHeadshotUrl(athleteData.id) || athleteData.headshot?.href || null
                },
                team: {
                  name: teamName,
                  color: teamColor
                },
                points: standing.records?.[0]?.stats?.find(stat => stat.name === 'championshipPts')?.displayValue || '0',
                wins: standing.records?.[0]?.stats?.find(stat => stat.name === 'wins')?.displayValue || '0',
                podiums: standing.records?.[0]?.stats?.find(stat => stat.name === 'top5')?.displayValue || '0'
              };
            } catch (error) {
              console.error('Error processing driver standing:', error);
              return {
                position: index + 1,
                driver: { name: 'Unknown Driver', id: null },
                team: { name: 'Unknown Team', color: '#000000' },
                points: '0',
                wins: '0',
                podiums: '0'
              };
            }
          })
        );
        
        setDriverStandings(driversWithDetails);
        
        // Fetch constructor standings separately using the proper endpoint
        const constructorsResponse = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/1');
        const constructorsData = await constructorsResponse.json();
        
        if (constructorsData && constructorsData.standings) {
          const constructorsWithDetails = await Promise.all(
            constructorsData.standings.map(async (standing, index) => {
              try {
                // Get manufacturer details
                const manufacturerResponse = await fetch(convertToHttps(standing.manufacturer.$ref));
                const manufacturerData = await manufacturerResponse.json();
                
                const stats = standing.records?.[0]?.stats || [];
                
                return {
                  position: index + 1,
                  id: manufacturerData.id || null,
                  name: manufacturerData.displayName || manufacturerData.name || 'Unknown Constructor',
                  color: constructorColors[manufacturerData.displayName || manufacturerData.name] || '#000000',
                  points: stats.find(stat => stat.name === 'points')?.displayValue || '0',
                  wins: stats.find(stat => stat.name === 'wins')?.displayValue || '0',
                  drivers: [] // Will be populated below
                };
              } catch (error) {
                console.error('Error processing constructor standing:', error);
                return {
                  position: index + 1,
                  name: 'Unknown Constructor',
                  color: '#000000',
                  points: '0',
                  wins: '0',
                  drivers: []
                };
              }
            })
          );
          
          // Add drivers to each constructor
          constructorsWithDetails.forEach(constructor => {
            constructor.drivers = driversWithDetails
              .filter(driver => driver.team.name === constructor.name)
              .map(driver => driver.driver.name);
          });
          
          setConstructorStandings(constructorsWithDetails);
        }
      }
    } catch (error) {
      console.error('Error fetching F1 standings:', error);
      Alert.alert('Error', 'Failed to fetch F1 standings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const convertToHttps = (url) => {
    if (url && url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  };

  // Build ESPN headshot URL from athlete ID
  const buildESPNHeadshotUrl = (athleteId) => {
    if (!athleteId) return null;
    return `https://a.espncdn.com/i/headshots/rpm/players/full/${athleteId}.png`;
  };

  // Helper to get initials from a name
  const getInitials = (firstName = '', lastName = '') => {
    const first = firstName?.trim()?.[0] || '';
    const last = lastName?.trim()?.[0] || '';
    return (first + last).toUpperCase() || '--';
  };

  // Component for driver image with fallback to initials
  const DriverImage = ({ driver, teamColor }) => {
    const [imageError, setImageError] = useState(false);
    
    if (!driver.headshot || imageError) {
      return (
        <View style={[
          styles.driverImagePlaceholder, 
          { backgroundColor: teamColor || theme.border }
        ]}>
          <Text allowFontScaling={false} style={[styles.driverInitials, { color: '#fff' }]}>
            {getInitials(driver.firstName, driver.lastName)}
          </Text>
        </View>
      );
    }
    
    return (
      <Image
        source={{ uri: driver.headshot }}
        style={styles.driverImage}
        onError={() => setImageError(true)}
      />
    );
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchStandings();
  }, []);

  const renderDriverStanding = (standing) => (
    <TouchableOpacity
      key={`driver-${standing.position}`}
      style={[styles.standingItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => {
        navigation.navigate('F1RacerDetails', {
          racerId: standing.driver.id,
          racerName: standing.driver.name,
          teamColor: standing.team.color
        });
      }}
    >
      <View style={styles.positionContainer}>
        <Text allowFontScaling={false} style={[styles.position, { color: theme.text }]}>
          {standing.position}
        </Text>
      </View>
      
      <View style={[styles.teamColorBar, { backgroundColor: standing.team.color }]} />
      
      <View style={styles.driverInfo}>
        <DriverImage driver={standing.driver} teamColor={standing.team?.color} />
        
        <View style={styles.driverDetails}>
          <Text allowFontScaling={false} style={[styles.driverName, { color: theme.text }]} numberOfLines={1}>
            {standing.driver.name}
          </Text>
          <View style={styles.teamNameContainer}>
            {isFavorite(getF1TeamId(standing.team.name)) && (
              <TouchableOpacity 
                onPress={() => handleTeamFavoriteToggle(standing.team.name, standing.team.color)}
                activeOpacity={0.7}
                style={styles.teamFavoriteButton}
              >
                <Text allowFontScaling={false} style={[styles.teamFavoriteIcon, { color: colors.primary }]}>
                  ★
                </Text>
              </TouchableOpacity>
            )}
            <Text allowFontScaling={false} style={[styles.teamName, { color: isFavorite(getF1TeamId(standing.team.name)) ? colors.primary : theme.textSecondary }]} numberOfLines={1}>
              {standing.team.name}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
            {standing.points}
          </Text>
          <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
            PTS
          </Text>
        </View>
        
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
            {standing.wins}
          </Text>
          <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
            WINS
          </Text>
        </View>
        
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
            {standing.podiums}
          </Text>
          <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
            TOP 5
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderConstructorStanding = (standing) => (
    <TouchableOpacity
      key={`constructor-${standing.position}`}
      style={[styles.standingItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => {
        navigation.navigate('F1ConstructorDetails', {
          constructorId: standing.id,
          constructorName: standing.name,
          constructorColor: standing.color
        });
      }}
    >
      <View style={styles.positionContainer}>
        <Text allowFontScaling={false} style={[styles.position, { color: theme.text }]}>
          {standing.position}
        </Text>
      </View>
      
      <View style={[styles.teamColorBar, { backgroundColor: standing.color }]} />
      
      <View style={styles.constructorInfo}>
        <ConstructorLogo name={standing.name} color={standing.color} />
        
        <View style={styles.constructorDetails}>
          <View style={styles.constructorNameContainer}>
            {isFavorite(getF1TeamId(standing.name)) && (
              <TouchableOpacity 
                onPress={() => handleTeamFavoriteToggle(standing.name, standing.color)}
                activeOpacity={0.7}
                style={styles.constructorFavoriteButton}
              >
                <Text allowFontScaling={false} style={[styles.constructorFavoriteIcon, { color: colors.primary }]}>
                  ★
                </Text>
              </TouchableOpacity>
            )}
            <Text allowFontScaling={false} style={[styles.constructorName, { color: isFavorite(getF1TeamId(standing.name)) ? colors.primary : theme.text }]} numberOfLines={1}>
              {standing.name}
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.driversText, { color: theme.textSecondary }]} numberOfLines={1}>
            {standing.drivers.join(', ')}
          </Text>
        </View>
      </View>
      
      <View style={styles.constructorStatsContainer}>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
            {standing.points}
          </Text>
          <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
            POINTS
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Build constructor logo URL using the same mapping as teams.js
  const getConstructorLogo = (constructorName, forceWhite = false) => {
    if (!constructorName) return '';

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
    const variant = isDarkMode ? 'logowhite' : 'logoblack';
    return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/2025/${logoName}/2025${logoName}${variant}.webp`;
  };

  const ConstructorLogo = ({ name, color }) => {
    const uri = getConstructorLogo(name);
    if (!uri) {
      return (
        <View style={[styles.constructorInitialsContainer, { backgroundColor: color }]}>
          <Text allowFontScaling={false} style={[styles.constructorInitials, { color: '#fff' }]}>
            {name.split(' ').map(word => word[0]).join('').substring(0, 2)}
          </Text>
        </View>
      );
    }

    return (
      <Image source={{ uri }} style={styles.constructorLogoImage} resizeMode="contain" />
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      backgroundColor: colors.primary,
      paddingTop: 50,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#fff',
      textAlign: 'center',
    },
    typeContainer: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
      marginHorizontal: 20,
      marginVertical: 15,
      borderRadius: 8,
      padding: 4,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 6,
    },
    activeTypeButton: {
      backgroundColor: colors.primary,
    },
    typeButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    activeTypeButtonText: {
      color: '#fff',
    },
    inactiveTypeButtonText: {
      color: theme.textSecondary,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 10,
      fontSize: 16,
      color: theme.textSecondary,
    },
    standingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3.84,
      elevation: 5,
    },
    positionContainer: {
      width: 30,
      alignItems: 'center',
    },
    position: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    teamColorBar: {
      width: 4,
      height: 50,
      borderRadius: 2,
      marginHorizontal: 12,
    },
    driverInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    driverImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.border,
    },
    driverImagePlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    driverInitials: {
      fontSize: 14,
      fontWeight: 'bold',
    },
    driverDetails: {
      flex: 1,
      marginLeft: 12,
    },
    driverName: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    teamName: {
      fontSize: 12,
      marginTop: 2,
    },
    teamNameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    teamFavoriteButton: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginRight: 4,
    },
    teamFavoriteIcon: {
      fontSize: 12,
      fontWeight: 'bold',
    },
    constructorNameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    constructorFavoriteButton: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginRight: 6,
    },
    constructorFavoriteIcon: {
      fontSize: 14,
      fontWeight: 'bold',
    },
    statsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statItem: {
      alignItems: 'center',
      marginLeft: 16,
      minWidth: 35,
    },
    statValue: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    statLabel: {
      fontSize: 10,
      marginTop: 2,
    },
    constructorInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    constructorLogoImage: {
      width: 40,
      height: 40,
    },
    constructorInitialsContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    constructorInitials: {
      fontSize: 14,
      fontWeight: 'bold',
    },
    constructorDetails: {
      flex: 1,
      marginLeft: 12,
    },
    constructorName: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    driversText: {
      fontSize: 12,
      marginTop: 2,
    },
    constructorStatsContainer: {
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
      textAlign: 'center',
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.typeContainer}>
          {standingTypes.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.typeButton,
                selectedType === type.key && styles.activeTypeButton,
              ]}
              onPress={() => setSelectedType(type.key)}
            >
              <Text allowFontScaling={false}
                style={[
                  styles.typeButtonText,
                  selectedType === type.key
                    ? styles.activeTypeButtonText
                    : styles.inactiveTypeButtonText,
                ]}
              >
                {type.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={styles.loadingText}>Loading F1 Standings...</Text>
        </View>
      </View>
    );
  }

  const currentStandings = selectedType === 'DRIVERS' ? driverStandings : constructorStandings;

  return (
    <View style={styles.container}>
      <View style={styles.typeContainer}>
        {standingTypes.map((type) => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.typeButton,
              selectedType === type.key && styles.activeTypeButton,
            ]}
            onPress={() => setSelectedType(type.key)}
          >
            <Text allowFontScaling={false}
              style={[
                styles.typeButtonText,
                selectedType === type.key
                  ? styles.activeTypeButtonText
                  : styles.inactiveTypeButtonText,
              ]}
            >
              {type.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {currentStandings.length > 0 ? (
          currentStandings.map(selectedType === 'DRIVERS' ? renderDriverStanding : renderConstructorStanding)
        ) : (
          <View style={styles.emptyContainer}>
            <Text allowFontScaling={false} style={styles.emptyText}>
              No standings data available
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default StandingsScreen;