import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const VehiclesScreen = () => {
  const { theme, colors } = useTheme();
  const [constructors, setConstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logoUrls, setLogoUrls] = useState({});
  const [carUrls, setCarUrls] = useState({});

  // Team color mapping (same as teams.js)
  const getTeamColor = (constructorName) => {
    const colorMap = {
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
    
    return colorMap[constructorName] || '#000000';
  };

  // Get constructor logo (same as teams.js)
  const getConstructorLogo = (constructorName, forceWhite = false) => {
    if (!constructorName) {
      console.error('Constructor name is undefined in getConstructorLogo');
      return '';
    }
    
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

    const blackLogoConstructors = ['Williams', 'Alpine', 'Mercedes', 'Sauber'];
    const logoColor = (forceWhite || !blackLogoConstructors.includes(constructorName)) ? 'logowhite' : 'logoblack';

    const logoName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
    
    // Use current year for logo URLs
    const currentYear = new Date().getFullYear();
    
    // Return current year URL
    return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${logoName}/${currentYear}${logoName}${logoColor}.webp`;
  };

  // Get constructor car (same as teams.js)
  const getConstructorCar = (constructorName) => {
    if (!constructorName) {
      console.error('Constructor name is undefined in getConstructorCar');
      return '';
    }
    
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
    
    const carName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
    
    // Use current year for car URLs
    const currentYear = new Date().getFullYear();
    
    // Return current year URL
    return `https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000000/common/f1/${currentYear}/${carName}/${currentYear}${carName}carright.webp`;
  };

  // Fetch constructors data
  const fetchConstructors = async () => {
    try {
      setLoading(true);
      const currentYear = new Date().getFullYear();
      const response = await fetch(`https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${currentYear}/types/2/standings/1`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const standingsRawData = await response.json();
      
      // Validate that we have relevant data
      console.log('Validating F1 constructor standings data for vehicles:', standingsRawData);
      const standings = standingsRawData?.standings || standingsRawData?.data?.standings;
      if (!(standings && standings.length > 0)) {
        throw new Error('No constructor standings data found');
      }
      
      const data = { data: standingsRawData, year: currentYear };
      
      console.log('[VehiclesScreen] data:', data ? 'exists' : 'null');
      const standingsData = data?.standings || data?.data?.standings;
      console.log('[VehiclesScreen] standingsData:', standingsData ? `array with ${standingsData.length} items` : 'null/undefined');
      
      if (standingsData && standingsData.length > 0) {
        console.log(`[VehiclesScreen] Processing ${standingsData.length} constructors`);
        // Process each constructor
        const constructorPromises = standingsData.map(async (standing, index) => {
          try {
            // Use the same approach as StandingsScreen - fetch manufacturer details from $ref
            if (standing.manufacturer && standing.manufacturer.$ref) {
              const manufacturerResponse = await fetch(standing.manufacturer.$ref.replace('http://', 'https://'));
              const manufacturerData = await manufacturerResponse.json();
              
              // Extract stats from the records array (same as StandingsScreen)
              const stats = standing.records?.[0]?.stats || [];
              const points = stats.find(stat => stat.name === 'points')?.displayValue || '0';
              const wins = stats.find(stat => stat.name === 'wins')?.displayValue || '0';
              
              return {
                id: manufacturerData.id || null,
                name: manufacturerData.displayName || manufacturerData.name || 'Unknown Constructor',
                rank: index + 1, // Use index + 1 as rank since standings are already sorted
                points: parseInt(points) || 0,
                wins: parseInt(wins) || 0,
              };
            }

            // Fallback for unexpected structure
            console.error('Unexpected standing structure - no manufacturer.$ref found:', standing);
            return {
              id: null,
              name: 'Unknown Constructor',
              rank: index + 1,
              points: 0,
              wins: 0,
            };
          } catch (error) {
            console.error('Error fetching constructor details:', error, 'standing:', standing);
            return null;
          }
        });
        
        const constructorResults = await Promise.all(constructorPromises);
        const validConstructors = constructorResults.filter(c => c !== null);
        
        console.log(`[VehiclesScreen] Successfully processed ${validConstructors.length} valid constructors`);
        console.log('[VehiclesScreen] Sample constructor data:', validConstructors[0]);
        // Already sorted by API standings order, no need to re-sort
        setConstructors(validConstructors);
        console.log('[VehiclesScreen] Set constructors in state');
      }
    } catch (error) {
      console.error('Error fetching constructors:', error);
      Alert.alert('Error', 'Failed to load constructor data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConstructors();
  }, []);

  const getLogoUrl = (constructorName) => {
    return logoUrls[constructorName] || getConstructorLogo(constructorName);
  };

  const getCarUrlForConstructor = (constructorName) => {
    return carUrls[constructorName] || getConstructorCar(constructorName);
  };

  const handleLogoError = (constructorName) => {
    const currentYear = new Date().getFullYear();
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
    const blackLogoConstructors = ['Williams', 'Alpine', 'Mercedes', 'Sauber'];
    const logoColor = !blackLogoConstructors.includes(constructorName) ? 'logowhite' : 'logoblack';
    const logoName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
    const fallbackUrl = `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${logoName}/${currentYear}${logoName}${logoColor}.webp`;
    
    setLogoUrls(prev => ({
      ...prev,
      [constructorName]: fallbackUrl
    }));
  };

  const handleCarError = (constructorName) => {
    const currentYear = new Date().getFullYear();
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
    const carName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
    const fallbackUrl = `https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000000/common/f1/${currentYear}/${carName}/${currentYear}${carName}carright.webp`;
    
    setCarUrls(prev => ({
      ...prev,
      [constructorName]: fallbackUrl
    }));
  };

  const renderConstructorCard = (constructor) => {
    const teamColor = getTeamColor(constructor.name);
    const logoUrl = getLogoUrl(constructor.name);
    const carUrl = getCarUrlForConstructor(constructor.name);

    const blackTextConstructors = ['Williams', 'Alpine', 'Mercedes', 'Sauber', 'Haas'];
    const needsBlackText = blackTextConstructors.includes(constructor.name);

    return (
      <View key={constructor.id} style={[styles.constructorCard, { backgroundColor: teamColor }]}>
        <View style={styles.cardHeader}>
          <Image 
            source={{ uri: logoUrl }} 
            style={styles.teamLogo}
            resizeMode="contain"
            onError={() => handleLogoError(constructor.name)}
          />
          <View style={styles.teamInfo}>
            <Text style={[styles.teamName, {color: needsBlackText ? '#000' : '#fff'}]}>{constructor.name}</Text>
            <Text style={[styles.teamRank, {color: needsBlackText ? '#000' : '#fff'}]}>Championship Position: #{constructor.rank}</Text>
            <View style={styles.statsRow}>
              <Text style={[styles.statText, {color: needsBlackText ? '#000' : '#fff'}]}>Points: {constructor.points}</Text>
              <Text style={[styles.statText, {color: needsBlackText ? '#000' : '#fff'}]}>Wins: {constructor.wins}</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.carContainer}>
          <Image 
            source={{ uri: carUrl }} 
            style={styles.carImage}
            resizeMode="contain"
            onError={() => handleCarError(constructor.name)}
          />
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading vehicles...</Text>
      </View>
    );
  }

  console.log(`[VehiclesScreen] Render - constructors.length: ${constructors.length}`);
  console.log('[VehiclesScreen] Render - loading:', loading);
  
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.headerText, { color: theme.text }]}>Formula 1 Vehicles</Text>
        
        {constructors.map(renderConstructorCard)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  constructorCard: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamLogo: {
    width: 57.5,
    height: 57.5,
    marginRight: 10,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  teamRank: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  carContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  carImage: {
    width: '100%',
    height: 120,
  },
});

export default VehiclesScreen;