import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Image
} from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getSpecificMatchDetails, getCS2MapImageUrl, getRoundData, getWeaponStats, getHitGroupStats, getMapDisplayName } from '../../../services/cs2MatchService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const CS2MatchScreen = ({ navigation, route }) => {
  const { gameId, seriesSlug, mapName } = route.params;
  const { colors, theme } = useTheme();
  const [matchData, setMatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedRound, setSelectedRound] = useState(null);
  const [expandedPlayers, setExpandedPlayers] = useState({});
  const [roundDataCache, setRoundDataCache] = useState({});
  const [loadingRound, setLoadingRound] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [weaponStats, setWeaponStats] = useState(null);
  const [hitGroupStats, setHitGroupStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [expandedWeapons, setExpandedWeapons] = useState({});

  useEffect(() => {
    loadMatchData();
  }, [gameId]);

  // Auto-select first round if none selected and we have rounds (for economy tab)
  useEffect(() => {
    const rounds = matchData?.rounds || matchData?.gameData?.game_rounds || [];
    if (activeTab === 'economy' && !selectedRound && rounds.length > 0) {
      selectRound(rounds[0].round_number); // Use selectRound to auto-load data
    } else if (activeTab !== 'economy') {
      setSelectedRound(null); // Reset when leaving economy tab
    }
  }, [activeTab, selectedRound, matchData]);

  // Load stats data when stats tab is active
  useEffect(() => {
    if (activeTab === 'stats' && !weaponStats && !hitGroupStats && !loadingStats) {
      loadStatsData();
    }
  }, [activeTab, gameId]);

  const loadMatchData = async () => {
    try {
      setLoading(true);
      const data = await getSpecificMatchDetails(gameId, seriesSlug, mapName);
      console.log('🔍 Raw match data from API:', data);
      console.log('🔍 Does data have gameData?', !!data?.gameData);
      console.log('🔍 Data keys:', Object.keys(data || {}));
      setMatchData(data);
    } catch (error) {
      console.error('Error loading match data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMatchData();
    setRefreshing(false);
  };

  // Handle round selection with caching
  const selectRound = async (roundNumber) => {
    if (!roundNumber || !gameId) return;
    
    setSelectedRound(roundNumber);
    
    // Check if we already have data for this round
    if (roundDataCache[roundNumber]) {
      console.log(`✅ Using cached data for round ${roundNumber}`);
      return;
    }
    
    // Fetch round data if not cached
    try {
      setLoadingRound(roundNumber);
      console.log(`🔄 Fetching data for round ${roundNumber}`);
      
      const roundData = await getRoundData(gameId, roundNumber);
      
      // Cache the round data
      setRoundDataCache(prev => ({
        ...prev,
        [roundNumber]: roundData
      }));
      
      console.log(`✅ Cached data for round ${roundNumber}`);
    } catch (error) {
      console.error(`Error fetching round ${roundNumber} data:`, error);
    } finally {
      setLoadingRound(null);
    }
  };

  // Load stats data for the Stats tab
  const loadStatsData = async () => {
    if (!gameId) return;
    
    try {
      setLoadingStats(true);
      console.log('🔄 Fetching weapon and hit group stats...');
      
      const [weaponData, hitGroupData] = await Promise.all([
        getWeaponStats(gameId),
        getHitGroupStats(gameId)
      ]);
      

      
      setWeaponStats(weaponData);
      setHitGroupStats(hitGroupData);
      
      // Auto-select first player if none selected
      if (!selectedPlayer && weaponData && weaponData.length > 0) {
        setSelectedPlayer(weaponData[0]);
      }
      
      console.log('✅ Stats data loaded');
    } catch (error) {
      console.error('Error loading stats data:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Toggle weapon expansion
  const toggleWeaponExpansion = (weaponName) => {
    setExpandedWeapons(prev => ({
      ...prev,
      [weaponName]: !prev[weaponName]
    }));
  };

  const renderTabNavigation = () => (
    <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
      {[
        { key: 'overview', label: 'Overview', icon: 'analytics' },
        { key: 'economy', label: 'Economy', icon: 'cash' },
        { key: 'stats', label: 'Stats', icon: 'stats-chart' }
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tabButton,
            { backgroundColor: activeTab === tab.key ? colors.primary : 'transparent' }
          ]}
          onPress={() => setActiveTab(tab.key)}
        >
          <Ionicons 
            name={tab.icon} 
            size={16} 
            color={activeTab === tab.key ? '#fff' : theme.textSecondary} 
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === tab.key ? '#fff' : theme.textSecondary }
          ]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderMatchHeader = () => {
    if (!matchData) {
      return null;
    }

    // Extract team and match data
    const team1 = matchData.team1;
    const team2 = matchData.team2;
    const team1Score = matchData.team1Score || 0;
    const team2Score = matchData.team2Score || 0;
    const mapDisplayName = matchData.displayName || 'Unknown';
    const status = matchData.completed ? 'COMPLETED' : 'SCHEDULED';

    return (
      <View style={[styles.matchHeader, { backgroundColor: colors.card }]}>
        <View style={styles.matchHeaderContent}>
          {/* Map Background */}
          <Image
            source={{ uri: getCS2MapImageUrl(matchData.mapName?.replace('de_', '') || matchData.displayName?.toLowerCase()) }}
            style={styles.mapBackground}
            resizeMode="cover"
          />
          <View style={styles.mapOverlay} />
          
          {/* Match Info */}
          <View style={styles.matchInfo}>
            <Text style={[styles.mapName, { color: '#fff' }]}>
              {mapDisplayName}
            </Text>
            
            {/* Team Score */}
            <View style={styles.teamScoreContainer}>
              <View style={styles.teamSection}>
                <Image
                  source={{ uri: team1?.logoUrl || 'https://via.placeholder.com/48' }}
                  style={styles.teamLogo}
                  resizeMode="contain"
                />
                <Text style={[styles.teamName, { color: '#fff' }]}>
                  {team1?.name || 'Team 1'}
                </Text>
              </View>
              
              <View style={styles.scoreSection}>
                <Text style={[styles.finalScore, { color: '#fff' }]}>
                  {team1Score} - {team2Score}
                </Text>
                <View style={[styles.statusBadge, { 
                  backgroundColor: status === 'COMPLETED' ? theme.success : theme.warning 
                }]}>
                  <Text style={styles.statusText}>{status}</Text>
                </View>
              </View>
              
              <View style={styles.teamSection}>
                <Image
                  source={{ uri: team2?.logoUrl || 'https://via.placeholder.com/48' }}
                  style={styles.teamLogo}
                  resizeMode="contain"
                />
                <Text style={[styles.teamName, { color: '#fff' }]}>
                  {team2?.name || 'Team 2'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Helper function to calculate CS2 half-time stats from game rounds
  const calculateCS2HalfTimeStats = () => {
    if (!matchData?.rounds || matchData.rounds.length === 0) {
      return null;
    }

    const rounds = matchData.rounds;
    const team1Name = matchData.team1?.name || 'Team 1';
    const team2Name = matchData.team2?.name || 'Team 2';
    
    let firstHalfTeam1 = 0;
    let firstHalfTeam2 = 0;
    let secondHalfTeam1 = 0;
    let secondHalfTeam2 = 0;
    let overtimeTeam1 = 0;
    let overtimeTeam2 = 0;
    
    rounds.forEach(round => {
      const roundNumber = round.round_number;
      const winnerClanName = round.winner_clan_name;
      
      if (roundNumber <= 15) {
        // First half (rounds 1-15)
        if (winnerClanName === team1Name) {
          firstHalfTeam1++;
        } else if (winnerClanName === team2Name) {
          firstHalfTeam2++;
        }
      } else if (roundNumber <= 30) {
        // Second half (rounds 16-30)
        if (winnerClanName === team1Name) {
          secondHalfTeam1++;
        } else if (winnerClanName === team2Name) {
          secondHalfTeam2++;
        }
      } else {
        // Overtime (rounds 31+)
        if (winnerClanName === team1Name) {
          overtimeTeam1++;
        } else if (winnerClanName === team2Name) {
          overtimeTeam2++;
        }
      }
    });
    
    const hasOvertime = overtimeTeam1 > 0 || overtimeTeam2 > 0;
    
    return {
      firstHalf: { team1: firstHalfTeam1, team2: firstHalfTeam2 },
      secondHalf: { team1: secondHalfTeam1, team2: secondHalfTeam2 },
      overtime: { team1: overtimeTeam1, team2: overtimeTeam2 },
      hasOvertime
    };
  };

  // Helper function to get player image URL with square crop
  const getCS2PlayerImageUrl = (steamProfile) => {
    if (steamProfile?.player?.image_url) {
      // Since CS2 player images are vertical rectangles, we'll use a transform to crop the top portion
      return steamProfile.player.image_url;
    }
    return 'https://via.placeholder.com/80x80';
  };

  // Get CS2 end reason icon - same as in CS2ResultsScreen
  const getCS2EndReasonIcon = (endReason) => {
    const iconMap = {
      'TargetBombed': 'bomb',
      'BombDefused': 'wrench',
      'CTWin': 'skull',
      'TerroristsWin': 'skull',
      'TargetSaved': 'clock'
    };
    return iconMap[endReason] || 'skull'; // Default to skull for unknown reasons
  };

  // Convert CS2 end reason to display text
  const getCS2EndReasonDisplayText = (endReason) => {
    const textMap = {
      'TargetBombed': 'BOMB',
      'BombDefused': 'DEFUSED',
      'CTWin': 'KILLS',
      'TerroristsWin': 'KILLS',
      'TargetSaved': 'TIME'
    };
    return textMap[endReason] || 'KILLS'; // Default to KILLS for unknown reasons
  };

  // Get kills matrix data for a specific player in the selected round
  const getPlayerKillsInRound = (playerNickname) => {
    if (!selectedRound || !roundDataCache[selectedRound]?.killsMatrix) return [];
    
    // Get the kills matrix data from cache for the selected round
    const roundKillsData = roundDataCache[selectedRound].killsMatrix;
    
    // Find the team containing this player
    for (const team of roundKillsData) {
      const player = team.players?.find(p => p.steam_profile?.nickname === playerNickname);
      if (player) {
        return player.kills || [];
      }
    }
    
    return [];
  };

  // Get round-specific player stats from hit group stats
  const getPlayerRoundStats = (playerSteamProfileId, teamName) => {
    if (!selectedRound || !roundDataCache[selectedRound]?.hitGroupStats) return null;
    
    // Get the hit group stats data from cache for the selected round
    const hitGroupStats = roundDataCache[selectedRound].hitGroupStats;
    
    // Find the player in the hit group stats data
    const playerStats = hitGroupStats.find(stat => 
      stat.steam_profile_id === playerSteamProfileId && stat.clan_name === teamName
    );
    
    return playerStats || null;
  };

  // CS2 weapon icon mapping - converts weapon names to SVG file names
  const getCS2WeaponIconName = (weaponName) => {
    if (!weaponName) return null;
    
    // Convert to lowercase and remove spaces/dashes/underscores
    const cleanWeapon = weaponName.toLowerCase().replace(/[\s\-_]/g, '');
    
    // Map weapon names to SVG file names (based on the C++ mapping and available SVGs)
    const weaponIconMap = {
      // Pistols
      'deagle': 'deagle',
      'deserteagle': 'deagle',
      'elite': 'elite',
      'fiveseven': 'fiveseven',
      'glock18': 'glock',
      'hkp2000': 'hkp2000',
      'p2000': 'hkp2000',
      'p250': 'p250',
      'cz75auto': 'cz75a',
      'tec9': 'tec9',
      'usp': 'usps',
      'usps': 'usps',
      'uspsilencer': 'usps',
      'revolver': 'revolver',
      
      // Rifles
      'ak47': 'ak47',
      'aug': 'aug',
      'famas': 'famas',
      'galilar': 'galilar',
      'galil': 'galilar',
      'm4a1': 'm4a1',
      'm4a4': 'm4a1',
      'm4a1silencer': 'm4a1silencer',
      'm4a1s': 'm4a1silencer',
      'sg556': 'sg556',
      'sg553': 'sg556',
      
      // Sniper Rifles
      'awp': 'awp',
      'g3sg1': 'g3sg1',
      'scar20': 'scar20',
      'ssg08': 'ssg08',
      'scout': 'ssg08',
      
      // SMGs
      'bizon': 'bizon',
      'mac10': 'mac10',
      'mp5sd': 'mp5sd',
      'mp7': 'mp7',
      'mp9': 'mp9',
      'p90': 'p90',
      'ump45': 'ump451',
      'ump': 'ump451',
      
      // Shotguns
      'mag7': 'mag7',
      'nova': 'nova',
      'sawedoff': 'sawedoff',
      'xm1014': 'xm1014',
      
      // Machine Guns
      'm249': 'm249',
      'negev': 'negev',
      
      // Grenades
      'flashbang': 'flashbang',
      'hegrenade': 'hegrenade',
      'he': 'hegrenade',
      'smokegrenade': 'smokegrenade',
      'smoke': 'smokegrenade',
      'molotov': 'molotov',
      'incgrenade': 'incgrenade0',
      'incendiarygrenade': 'incgrenade0',
      'decoy': 'decoy',
      
      // Knives
      'knife': 'knife',
      'knifet': 'knife_t',
      'knifebayonet': 'knife_bayonet',
      'knifebutterfly': 'knife_butterfly',
      'knifecanis': 'knife_canis',
      'knifecord': 'knife_cord',
      'knifecss': 'knife_css',
      'knifefalchion': 'knife_falchion',
      'knifeflip': 'knife_flip',
      'knifegut': 'knife_gut',
      'knifegypsyjackknife': 'knife_gypsy_jackknife',
      'knifekarambit': 'knife_karambit',
      'knifem9bayonet': 'knife_m9_bayonet',
      'knifeoutdoor': 'knife_outdoor',
      'knifepush': 'knife_push',
      'knifeskeleton': 'knife_skeleton',
      'knifestiletto': 'knife_stiletto',
      'knifesurvivalbowie': 'knife_survival_bowie',
      'knifetactical': 'knife_tactical',
      'knifeursus': 'knife_ursus',
      'knifewidowmaker': 'knife_widowmaker',
      
      // Special
      'c4': 'c4',
      'bomb': 'bomb',
      'taser': 'taser'
    };
    
    return weaponIconMap[cleanWeapon] || null;
  };

  // Get CS2 weapon icon - returns actual SVG component or fallback Ionicon
  // CS2 Weapon PNG Images Map
  const CS2WeaponPNGs = {
    // Pistols
    deagle: require('../../../../assets/icons/deagle.png'),
    elite: require('../../../../assets/icons/elite.png'),
    fiveseven: require('../../../../assets/icons/fiveseven.png'),
    glock: require('../../../../assets/icons/glock.png'),
    hkp2000: require('../../../../assets/icons/hkp2000.png'),
    p250: require('../../../../assets/icons/p250.png'),
    cz75a: require('../../../../assets/icons/cz75a.png'),
    tec9: require('../../../../assets/icons/tec9.png'),
    usps: require('../../../../assets/icons/usp_silencer.png'),
    revolver: require('../../../../assets/icons/revolver.png'),
    
    // Rifles
    ak47: require('../../../../assets/icons/ak47.png'),
    aug: require('../../../../assets/icons/aug.png'),
    famas: require('../../../../assets/icons/famas.png'),
    galilar: require('../../../../assets/icons/galilar.png'),
    m4a1: require('../../../../assets/icons/m4a1.png'),
    m4a1silencer: require('../../../../assets/icons/m4a1_silencer.png'),
    sg556: require('../../../../assets/icons/sg556.png'),
    
    // Sniper Rifles
    awp: require('../../../../assets/icons/awp.png'),
    g3sg1: require('../../../../assets/icons/g3sg1.png'),
    scar20: require('../../../../assets/icons/scar20.png'),
    ssg08: require('../../../../assets/icons/ssg08.png'),
    
    // SMGs
    bizon: require('../../../../assets/icons/bizon.png'),
    mac10: require('../../../../assets/icons/mac10.png'),
    mp5sd: require('../../../../assets/icons/mp5sd.png'),
    mp7: require('../../../../assets/icons/mp7.png'),
    mp9: require('../../../../assets/icons/mp9.png'),
    p90: require('../../../../assets/icons/p90.png'),
    ump451: require('../../../../assets/icons/ump451.png'),
    
    // Shotguns
    mag7: require('../../../../assets/icons/mag7.png'),
    nova: require('../../../../assets/icons/nova.png'),
    sawedoff: require('../../../../assets/icons/sawedoff.png'),
    xm1014: require('../../../../assets/icons/xm1014.png'),
    
    // Machine Guns
    m249: require('../../../../assets/icons/m249.png'),
    negev: require('../../../../assets/icons/negev.png'),
    
    // Grenades
    flashbang: require('../../../../assets/icons/flashbang.png'),
    hegrenade: require('../../../../assets/icons/hegrenade.png'),
    smokegrenade: require('../../../../assets/icons/smokegrenade.png'),
    molotov: require('../../../../assets/icons/molotov.png'),
    incgrenade0: require('../../../../assets/icons/incgrenade0.png'),
    decoy: require('../../../../assets/icons/decoy.png'),
    
    // Knives
    knife: require('../../../../assets/icons/knife.png'),
    knife_t: require('../../../../assets/icons/knife_t.png'),
    knife_bayonet: require('../../../../assets/icons/knife_bayonet.png'),
    knife_butterfly: require('../../../../assets/icons/knife_butterfly.png'),
    knife_canis: require('../../../../assets/icons/knife_canis.png'),
    knife_cord: require('../../../../assets/icons/knife_cord.png'),
    knife_css: require('../../../../assets/icons/knife_css.png'),
    knife_falchion: require('../../../../assets/icons/knife_falchion.png'),
    knife_flip: require('../../../../assets/icons/knife_flip.png'),
    knife_gut: require('../../../../assets/icons/knife_gut.png'),
    knife_gypsy_jackknife: require('../../../../assets/icons/knife_gypsy_jackknife.png'),
    knife_karambit: require('../../../../assets/icons/knife_karambit.png'),
    knife_m9_bayonet: require('../../../../assets/icons/knife_m9_bayonet.png'),
    knife_outdoor: require('../../../../assets/icons/knife_outdoor.png'),
    knife_push: require('../../../../assets/icons/knife_push.png'),
    knife_skeleton: require('../../../../assets/icons/knife_skeleton.png'),
    knife_stiletto: require('../../../../assets/icons/knife_stiletto.png'),
    knife_survival_bowie: require('../../../../assets/icons/knife_survival_bowie.png'),
    knife_tactical: require('../../../../assets/icons/knife_tactical.png'),
    knife_ursus: require('../../../../assets/icons/knife_ursus.png'),
    knife_widowmaker: require('../../../../assets/icons/knife_widowmaker.png'),
    
    // Special
    c4: require('../../../../assets/icons/c4.png'),
    bomb: require('../../../../assets/icons/bomb.png'),
    taser: require('../../../../assets/icons/taser.png')
  };

  // Get CS2 weapon icon - returns PNG image source or fallback Ionicon
  const getCS2WeaponIcon = (weaponName) => {
    const iconName = getCS2WeaponIconName(weaponName);
    
    // Return PNG image source if weapon is recognized
    if (iconName && CS2WeaponPNGs[iconName]) {
      return { type: 'png', source: CS2WeaponPNGs[iconName] };
    }
    
    // Fallback to generic weapon categories with Ionicons
    if (!weaponName) return { type: 'ionicon', name: 'help' };
    
    const weapon = weaponName.toLowerCase();
    if (weapon.includes('awp') || weapon.includes('scout') || weapon.includes('ssg08')) {
      return { type: 'ionicon', name: 'telescope' };
    }
    if (weapon.includes('ak') || weapon.includes('m4') || weapon.includes('rifle')) {
      return { type: 'ionicon', name: 'rifle' };
    }
    if (weapon.includes('glock') || weapon.includes('usp') || weapon.includes('p250') || weapon.includes('pistol')) {
      return { type: 'ionicon', name: 'nuclear' };
    }
    if (weapon.includes('knife')) {
      return { type: 'ionicon', name: 'cut' };
    }
    if (weapon.includes('grenade') || weapon.includes('he') || weapon.includes('flash') || weapon.includes('smoke')) {
      return { type: 'ionicon', name: 'radio-button-on' };
    }
    
    return { type: 'ionicon', name: 'flash' }; // generic weapon icon
  };

  // Get victim player image for kills dropdown
  const getVictimPlayerImage = (victimNickname) => {
    // Look through all player stats to find the victim's image
    const victim = matchData?.playerStats?.find(player => 
      player.steam_profile?.nickname === victimNickname
    );
    return victim ? getCS2PlayerImageUrl(victim.steam_profile) : 'https://via.placeholder.com/24x24';
  };

  // Toggle player expansion in economy tab
  const togglePlayerExpansion = (playerId) => {
    setExpandedPlayers(prev => ({
      ...prev,
      [playerId]: !prev[playerId]
    }));
  };

  const renderOverviewTab = () => (
    <View>
      {/* Roster */}
      {matchData.playerStats && matchData.playerStats.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Roster</Text>
          <View style={styles.teamsContainer}>
            {/* Team 1 */}
            <View style={styles.leftTeamContainer}>
              <Text style={[styles.teamLabel, { color: theme.text }]}>
                {matchData.team1?.name || 'Team 1'}
              </Text>
              <View style={styles.leftPlayersColumn}>
                {(matchData.playerStats || [])
                  .filter(player => 
                    player.clan_name === matchData.team1?.name || 
                    player.team_clan?.team_id === matchData.team1?.id ||
                    player.steam_profile?.player?.team_id === matchData.team1?.id
                  )
                  .slice(0, 5)
                  .map((player, index) => (
                    <View key={index} style={styles.leftPlayerItem}>
                      <Image
                        source={{ uri: getCS2PlayerImageUrl(player.steam_profile) }}
                        style={styles.playerImage}
                        resizeMode="cover"
                      />
                      <View style={styles.playerInfo}>
                        <Text style={[styles.playerName, { color: theme.text }]}>
                          {player.steam_profile?.nickname || 'Unknown'}
                        </Text>
                        <Text style={[styles.playerStats, { color: theme.textSecondary }]}>
                          {player.adr ? Math.round(player.adr) : 0} • {player.kills || 0}/{player.death || 0}/{player.assists || 0}
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            </View>
            
            {/* Team 2 */}
            <View style={styles.rightTeamContainer}>
              <Text style={[styles.teamLabel, { color: theme.text }]}>
                {matchData.team2?.name || 'Team 2'}
              </Text>
              <View style={styles.rightPlayersColumn}>
                {(matchData.playerStats || [])
                  .filter(player => 
                    player.clan_name === matchData.team2?.name || 
                    player.team_clan?.team_id === matchData.team2?.id ||
                    player.steam_profile?.player?.team_id === matchData.team2?.id
                  )
                  .slice(0, 5)
                  .map((player, index) => (
                    <View key={index} style={styles.rightPlayerItem}>
                      <View style={styles.playerInfoRight}>
                        <Text style={[styles.playerName, { color: theme.text, textAlign: 'right' }]}>
                          {player.steam_profile?.nickname || 'Unknown'}
                        </Text>
                        <Text style={[styles.playerStats, { color: theme.textSecondary, textAlign: 'right' }]}>
                          {player.adr ? Math.round(player.adr) : 0} • {player.kills || 0}/{player.death || 0}/{player.assists || 0}
                        </Text>
                      </View>
                      <Image
                        source={{ uri: getCS2PlayerImageUrl(player.steam_profile) }}
                        style={styles.playerImage}
                        resizeMode="cover"
                      />
                    </View>
                  ))}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Half Time Stats */}
      {(() => {
        const halfTimeStats = calculateCS2HalfTimeStats();
        return halfTimeStats && (
          <View style={[styles.section, { backgroundColor: theme.background }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Half Time Breakdown</Text>
            <View style={styles.halfTimeContainer}>
              <View style={styles.halfTimeRow}>
                <View style={[styles.halfCard, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.halfTitle, { color: theme.text }]}>First Half</Text>
                  <Text style={[styles.halfScore, { color: theme.text }]}>
                    {halfTimeStats.firstHalf.team1} - {halfTimeStats.firstHalf.team2}
                  </Text>
                </View>
                <View style={[styles.halfCard, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.halfTitle, { color: theme.text }]}>Second Half</Text>
                  <Text style={[styles.halfScore, { color: theme.text }]}>
                    {halfTimeStats.secondHalf.team1} - {halfTimeStats.secondHalf.team2}
                  </Text>
                </View>
              </View>
              {/* Overtime - Only if there are overtime rounds */}
              {halfTimeStats.hasOvertime && (
                <View style={[styles.overtimeCard, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.halfTitle, { color: theme.text }]}>Overtime</Text>
                  <Text style={[styles.halfScore, { color: theme.text }]}>
                    {halfTimeStats.overtime.team1} - {halfTimeStats.overtime.team2}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })()}
    </View>
  );

  const renderEconomyTab = () => {
    return (
      <View style={styles.contentContainer}>
        <Text style={[styles.sectionTitle, { color: theme.text, marginHorizontal: 16, marginBottom: 16 }]}>Economy By Round</Text>
      
      {/* Round Slider */}
      {(() => {
        const rounds = matchData?.rounds || matchData?.gameData?.game_rounds || [];
        return rounds.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roundsScroll}>
            {rounds.map((round, index) => {
          const winCondition = round.end_reason || 'Elimination';
          const winConditionIcon = getCS2EndReasonIcon(winCondition);
          
          // Determine winning team based on winner_clan_name
          // Compare with team names to determine which team won this round
          let winningTeamNumber = 1;
          if (round.winner_clan_name === matchData.team2?.name) {
            winningTeamNumber = 2;
          } else if (round.winner_clan_name === matchData.team1?.name) {
            winningTeamNumber = 1;
          }
          
          return (
            <TouchableOpacity 
              key={round.id || index} 
              style={[
                styles.roundCard, 
                { 
                  backgroundColor: selectedRound === round.round_number ? colors.primary : theme.surface,
                  borderWidth: selectedRound === round.round_number ? 2 : 0,
                  borderColor: colors.primary
                }
              ]}
              onPress={() => {
                selectRound(round.round_number);
              }}
              disabled={loadingRound !== null}
            >
              <Text style={[styles.roundNumber, { color: selectedRound === round.round_number ? '#fff' : theme.text }]}>
                Round {round.round_number}
              </Text>
              <View style={styles.roundWinnerSection}>
                <Image
                  source={{ 
                    uri: winningTeamNumber === 1 ? matchData.team1?.logoUrl : matchData.team2?.logoUrl
                  }}
                  style={styles.roundWinnerLogo}
                  resizeMode="contain"
                  defaultSource={{ uri: 'https://via.placeholder.com/24x24' }}
                />
                <View style={[
                  styles.roundWinner,
                  { backgroundColor: theme.surfaceSecondary }
                ]}>
                  <View style={styles.winConditionContainer}>
                    <FontAwesome6 
                      name={winConditionIcon} 
                      size={12} 
                      color={theme.text} 
                      style={styles.winConditionIcon}
                    />
                    <Text style={[styles.roundWinnerText, { color: selectedRound === round.round_number ? '#fff' : theme.text }]}>
                      {getCS2EndReasonDisplayText(winCondition)}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
          </ScrollView>
        ) : (
          <View style={styles.comingSoonContainer}>
            <Ionicons name="construct" size={48} color={theme.textSecondary} />
            <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
              No round data available
            </Text>
          </View>
        );
      })()}

      {selectedRound ? (
        <ScrollView style={styles.tabContent}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginHorizontal: 16, marginBottom: 16 }]}>
            Round {selectedRound} Economy
          </Text>
          
          {/* Team 1 Table */}
          {renderCS2TeamTable(1)}
          
          {/* Team 2 Table */}
          {renderCS2TeamTable(2)}
        </ScrollView>
      ) : (
        <View style={styles.comingSoonContainer}>
          <Ionicons name="construct" size={48} color={theme.textSecondary} />
          <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            Select a round to view economy data
          </Text>
        </View>
      )}
    </View>
    );
  };

  const renderCS2TeamTable = (teamNumber) => {
    const team = teamNumber === 1 ? matchData.team1 : matchData.team2;
    const rounds = matchData?.rounds || matchData?.gameData?.game_rounds || [];
    const selectedRoundData = rounds.find(round => round.round_number === selectedRound);
    
    if (!team || !selectedRoundData) {
      return (
        <View style={[styles.teamTableContainer, { backgroundColor: theme.surface, marginHorizontal: 16, marginBottom: 16 }]}>
          <View style={[styles.teamTableHeader, { backgroundColor: theme.surfaceSecondary }]}>
            <Image source={{ uri: team?.logoUrl || 'https://via.placeholder.com/24x24' }} style={styles.teamHeaderLogo} />
            <Text style={[styles.teamHeaderName, { color: theme.text }]}>{team?.name || `Team ${teamNumber}`}</Text>
          </View>
          <View style={styles.teamTable}>
            <Text style={[styles.comingSoonText, { color: theme.textSecondary, padding: 16 }]}>
              No economy data available for this round
            </Text>
          </View>
        </View>
      );
    }

    // Get team players from playerStats
    const teamPlayers = (matchData.playerStats || []).filter(player => 
      player.clan_name === team.name || 
      player.team_clan?.team_id === team.id ||
      player.steam_profile?.player?.team_id === team.id
    ).slice(0, 5);

    // Get round clan data for this team
    const roundTeamData = selectedRoundData.game_round_team_clans?.find(clan => 
      clan.clan_name === team.name
    );

    return (
      <View style={[styles.teamTableContainer, { backgroundColor: theme.surface, marginHorizontal: 16, marginBottom: 16 }]}>
        {/* Team Header */}
        <View style={[styles.teamTableHeader, { backgroundColor: theme.surfaceSecondary }]}>
          <Image source={{ uri: team.logoUrl }} style={styles.teamHeaderLogo} />
          <Text style={[styles.teamHeaderName, { color: theme.text }]}>{team.name}</Text>
        </View>
        
        {/* Table Content */}
        <View style={styles.teamTable}>
          {teamPlayers.map((player, index) => {
            // Get player's round-specific stats from hit group stats
            const playerRoundData = getPlayerRoundStats(player.steam_profile?.id, team.name);

            const kills = playerRoundData?.kills || 0;
            const deaths = playerRoundData?.death || 0;
            const assists = playerRoundData?.assists || 0;
            const damage = playerRoundData?.cumulative_damage || 0;
            const money = playerRoundData?.total_equipment_value || 0;
            const survived = deaths === 0;
            const isDead = deaths > 0;

            // Get kills data from kills matrix for this player
            const playerKills = getPlayerKillsInRound(player.steam_profile?.nickname);
            const hasKills = playerKills.length > 0;
            const playerId = `${teamNumber}-${player.steam_profile?.id || index}`;
            const isExpanded = expandedPlayers[playerId];

            return (
              <View key={player.steam_profile?.id || index}>
                <TouchableOpacity
                  style={[
                    styles.playerTableRow, 
                    { backgroundColor: index % 2 === 0 ? theme.surface : theme.surfaceSecondary }
                  ]}
                  onPress={() => hasKills && togglePlayerExpansion(playerId)}
                  disabled={!hasKills}
                >
                  {/* First Row: Player Image, Name, K/A */}
                  <View style={styles.playerFirstRow}>
                    <View style={styles.playerLeftSection}>
                      <Image 
                        source={{ uri: getCS2PlayerImageUrl(player.steam_profile) }} 
                        style={[styles.agentImageMedium, { opacity: isDead ? 0.5 : 1 }]}
                      />
                      <View style={styles.playerNameSection}>
                        <Text style={[styles.playerTableName, { 
                          color: isDead ? theme.textSecondary : theme.text 
                        }]}>
                          {player.steam_profile?.nickname || 'Unknown'}
                        </Text>
                        <Text style={[styles.playerHeadshot, { color: theme.textSecondary }]}>
                          {player.steam_profile?.player?.country?.name || 'Unknown'}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.killAssistSection}>
                      <View style={styles.killAssistContainer}>
                        <Text style={[styles.killAssistText, { color: theme.text }]}>
                          K • {kills} | A • {assists}
                        </Text>
                        {hasKills && (
                          <Ionicons 
                            name={isExpanded ? "chevron-up" : "chevron-down"} 
                            size={16} 
                            color={theme.textSecondary} 
                            style={styles.expandIcon}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                  
                  {/* Second Row: Damage and Equipment Placeholder */}
                  <View style={styles.playerSecondRow}>
                    <View style={styles.equipmentSection}>
                      <Text style={[styles.creditsInfo, { color: theme.textSecondary }]}>
                        Damage: {damage}
                      </Text>
                    </View>
                    <View style={styles.economySection}>
                      <Text style={[styles.creditsInfo, { color: theme.textSecondary }]}>
                        Equipment Value: ${money}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Expanded Kills Section */}
                {isExpanded && hasKills && (
                  <View style={[styles.killsDropdown, { backgroundColor: theme.surfaceSecondary }]}>
                    <Text style={[styles.killsDropdownTitle, { color: theme.text }]}>
                      Kills in Round {selectedRound}
                    </Text>
                    {playerKills.map((kill, killIndex) => (
                      <View key={killIndex} style={styles.killItem}>
                        <View style={styles.weaponSection}>
                          <View style={styles.weaponPlaceholder}>
                            {(() => {
                              const weaponIcon = getCS2WeaponIcon(kill.weapon_names);
                              
                              if (weaponIcon.type === 'png' && weaponIcon.source) {
                                return (
                                  <Image 
                                    source={weaponIcon.source} 
                                    style={[styles.weaponIcon, { width: 30, height: 25, tintColor: theme.text }]}
                                    resizeMode="contain"
                                  />
                                );
                              } else {
                                // Fallback to Ionicon
                                return (
                                  <Ionicons 
                                    name={weaponIcon.name} 
                                    size={14} 
                                    color={theme.text} 
                                    style={styles.weaponIcon}
                                  />
                                );
                              }
                            })()}
                            <Text style={[styles.weaponText, { color: theme.text }]}>
                              {kill.weapon_names || 'Unknown'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.victimSection}>
                          <Image
                            source={{ uri: getVictimPlayerImage(kill.sp_victim_nickname) }}
                            style={styles.victimImage}
                            resizeMode="cover"
                          />
                          <Text style={[styles.victimName, { color: theme.text }]}>
                            {kill.sp_victim_nickname}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderPlayerStats = () => {
    if (!selectedPlayer) return null;

    // Find hit group stats for selected player
    const playerHitGroupStats = hitGroupStats?.find(stats => 
      stats.steam_profile_id === selectedPlayer.steam_profile_id
    );

    return (
      <View>
        {/* Cumulative Damage Chart */}
        {renderCumulativeDamageChart()}
        
        {/* Body Parts Hit Visualization */}
        {renderBodyPartsVisualization()}
        
        {/* Weapon Stats */}
        {renderWeaponStatsTable()}
      </View>
    );
  };

  const renderCumulativeDamageChart = () => {
    if (!selectedPlayer?.cumulative_round_damages) return null;

    const damages = selectedPlayer.cumulative_round_damages;
    const rounds = Object.keys(damages).map(Number).sort((a, b) => a - b);
    const maxDamage = Math.max(...Object.values(damages));

    return (
      <View style={[styles.statsSection, { backgroundColor: theme.surface, marginHorizontal: 16, marginBottom: 16 }]}>
        <Text style={[styles.statsSectionTitle, { color: theme.text }]}>
          {selectedPlayer.steam_profile?.nickname?.toUpperCase()} DAMAGE
        </Text>
        
        <View style={styles.chartContainer}>
          <View style={styles.chartYAxis}>
            <Text style={[styles.chartAxisLabel, { color: theme.textSecondary }]}>{maxDamage}</Text>
            <Text style={[styles.chartAxisLabel, { color: theme.textSecondary }]}>{Math.floor(maxDamage * 0.5)}</Text>
            <Text style={[styles.chartAxisLabel, { color: theme.textSecondary }]}>0</Text>
          </View>
          
          <View style={styles.chartContent}>
            <View style={styles.chartArea}>
              {/* Background lines connecting dots */}
              <View style={styles.chartLinesContainer}>
                {rounds.map((round, index) => {
                  if (index === 0) return null;
                  
                  const damage = damages[round] || 0;
                  const prevDamage = damages[rounds[index - 1]] || 0;
                  const height = maxDamage > 0 ? (damage / maxDamage) * 150 : 0;
                  const prevHeight = maxDamage > 0 ? (prevDamage / maxDamage) * 150 : 0;
                  
                  const pointWidth = 100 / rounds.length;
                  const leftPos = (index - 1) * pointWidth;
                  const rightPos = index * pointWidth;
                  
                  return (
                    <View
                      key={`line-${round}`}
                      style={[
                        styles.chartConnectingLine,
                        {
                          position: 'absolute',
                          left: `${leftPos + (pointWidth / 2)}%`,
                          width: `${pointWidth}%`,
                          height: 2,
                          backgroundColor: colors.primary,
                          bottom: prevHeight,
                          transform: [
                            { 
                              rotate: `${Math.atan2(height - prevHeight, pointWidth) * (180 / Math.PI)}deg` 
                            }
                          ],
                          transformOrigin: 'left center',
                        }
                      ]}
                    />
                  );
                })}
              </View>
              
              {/* Dots */}
              {rounds.map((round, index) => {
                const damage = damages[round] || 0;
                const height = maxDamage > 0 ? (damage / maxDamage) * 150 : 0;
                
                return (
                  <View key={round} style={styles.chartPoint}>
                    <View 
                      style={[
                        styles.chartDot,
                        { 
                          backgroundColor: colors.primary,
                          bottom: height - 3
                        }
                      ]}
                    />
                  </View>
                );
              })}
            </View>
            
            <View style={styles.chartXAxis}>
              {rounds.map(round => (
                <View key={round} style={styles.chartXAxisItem}>
                  <Text style={[styles.chartAxisLabel, { color: theme.textSecondary, textAlign: 'center' }]}>
                    {round}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderBodyPartsVisualization = () => {
    const playerHitGroupStats = hitGroupStats?.find(stats => 
      stats.steam_profile_id === selectedPlayer.steam_profile_id
    );

    if (!playerHitGroupStats?.steam_profile?.player_hit_groups_stats) return null;

    // Process real hit group stats data
    const hitGroupData = playerHitGroupStats.steam_profile.player_hit_groups_stats;
    const totalHits = hitGroupData.reduce((sum, group) => sum + (group.hits_sum || 0), 0);

    // Group data by body part names, combining same parts from different team sides
    const bodyPartsMap = new Map();
    
    hitGroupData.forEach(group => {
      const hitGroupName = group.hit_group;
      
      // Map hit group names to display names and combine similar parts
      let displayName;
      switch(hitGroupName) {
        case 'Head':
          displayName = 'Head';
          break;
        case 'Chest':
          displayName = 'Chest';
          break;
        case 'Stomach':
          displayName = 'Stom.';
          break;
        case 'LeftArm':
        case 'RightArm':
          displayName = 'Arms';
          break;
        case 'LeftLeg':
        case 'RightLeg':
          displayName = 'Legs';
          break;
        case 'Generic':
        case 'Neck':
        default:
          return; // Skip generic/unknown hit groups
      }
      
      // Combine stats for the same body part
      if (bodyPartsMap.has(displayName)) {
        const existing = bodyPartsMap.get(displayName);
        bodyPartsMap.set(displayName, {
          name: displayName,
          damage: existing.damage + (group.damage_sum || 0),
          hits: existing.hits + (group.hits_sum || 0),
          kills: existing.kills + (group.kills_sum || 0)
        });
      } else {
        bodyPartsMap.set(displayName, {
          name: displayName,
          damage: group.damage_sum || 0,
          hits: group.hits_sum || 0,
          kills: group.kills_sum || 0
        });
      }
    });
    
    // Convert to array, calculate percentages, and order properly
    const orderedParts = ['Head', 'Chest', 'Stom.', 'Arms', 'Legs'];
    const bodyParts = orderedParts
      .map(partName => {
        const part = bodyPartsMap.get(partName);
        return part ? {
          ...part,
          percentage: totalHits > 0 ? Math.round((part.hits / totalHits) * 100) : 0
        } : null;
      })
      .filter(part => part && (part.hits > 0 || part.damage > 0)); // Only show parts with data

    return (
      <View style={[styles.statsSection, { backgroundColor: theme.surface, marginHorizontal: 16, marginBottom: 16 }]}>
        <Text style={[styles.statsSectionTitle, { color: theme.text }]}>
          {selectedPlayer.steam_profile?.nickname?.toUpperCase()} ACCURACY
        </Text>
        
        <View style={styles.bodyStatsContainer}>
          <View style={styles.bodyDiagram}>
            {/* Human body silhouette with opacity based on damage percentage */}
            {(() => {
              const getBodyPartOpacity = (partName) => {
                const part = bodyParts.find(p => p.name.toLowerCase().includes(partName.toLowerCase()));
                if (!part || !part.percentage) return 0.3;
                // Scale opacity from 0.3 to 1.0 based on percentage (0% to 50%+)
                return Math.max(0.3, Math.min(1.0, 0.3 + (part.percentage / 50) * 0.7));
              };

              return (
                <>
                  <View style={[styles.bodyPart, {backgroundColor: colors.primary}, styles.head, { opacity: getBodyPartOpacity('Head') }]} />
                  <View style={[styles.bodyPart, {backgroundColor: colors.primary}, styles.chest, { opacity: getBodyPartOpacity('Chest') }]} />
                  <View style={[styles.bodyPart, {backgroundColor: colors.primary}, styles.stomach, { opacity: getBodyPartOpacity('Stom.') }]} />
                  <View style={[styles.bodyPart, {backgroundColor: colors.primary}, styles.leftArm, { opacity: getBodyPartOpacity('Arms') }]} />
                  <View style={[styles.bodyPart, {backgroundColor: colors.primary}, styles.rightArm, { opacity: getBodyPartOpacity('Arms') }]} />
                  <View style={[styles.bodyPart, {backgroundColor: colors.primary}, styles.leftLeg, { opacity: getBodyPartOpacity('Legs') }]} />
                  <View style={[styles.bodyPart, {backgroundColor: colors.primary}, styles.rightLeg, { opacity: getBodyPartOpacity('Legs') }]} />
                </>
              );
            })()}
          </View>
          
          <View style={styles.bodyStatsTable}>
            <View style={styles.bodyStatsHeader}>
              <Text style={[styles.bodyStatsHeaderText, { color: theme.textSecondary }]}>Part</Text>
              <Text style={[styles.bodyStatsHeaderText, { color: theme.textSecondary }]}>Damage</Text>
              <Text style={[styles.bodyStatsHeaderText, { color: theme.textSecondary }]}>Hits</Text>
              <Text style={[styles.bodyStatsHeaderText, { color: theme.textSecondary }]}>%</Text>
            </View>
            {bodyParts.map((part, index) => (
              <View key={part.name} style={styles.bodyStatsRow}>
                <Text style={[styles.bodyStatsText, { color: theme.text }]}>{part.name}</Text>
                <Text style={[styles.bodyStatsText, { color: theme.text }]}>{part.damage}</Text>
                <Text style={[styles.bodyStatsText, { color: theme.text }]}>{part.hits}</Text>
                <Text style={[styles.bodyStatsText, { color: theme.text }]}>{part.percentage}%</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderWeaponStatsTable = () => {
    if (!selectedPlayer) return null;

    // Find weapon stats for selected player from weapon stats data
    const playerWeaponStats = weaponStats?.find(stats => 
      stats.steam_profile_id === selectedPlayer.steam_profile_id
    );

    if (!playerWeaponStats?.steam_profile?.player_weapons_stats) return null;

    // Process real weapon stats data, consolidate duplicates, and sort by damage_sum (highest to lowest)
    const weaponMap = new Map();
    
    // Consolidate weapons with same name
    playerWeaponStats.steam_profile.player_weapons_stats.forEach(weapon => {
      if (weapon.damage_sum > 0 || weapon.kills_sum > 0) { // Only include weapons that were used
        const weaponName = weapon.weapon_name || 'Unknown';
        
        if (weaponMap.has(weaponName)) {
          // Consolidate stats for duplicate weapons
          const existing = weaponMap.get(weaponName);
          weaponMap.set(weaponName, {
            name: weaponName,
            kills: (existing.kills || 0) + (weapon.kills_sum || 0),
            shots: (existing.shots || 0) + (weapon.shots_sum || 0),
            hits: (existing.hits || 0) + (weapon.hits_sum || 0),
            damage: (existing.damage || 0) + (weapon.damage_sum || 0)
          });
        } else {
          weaponMap.set(weaponName, {
            name: weaponName,
            kills: weapon.kills_sum || 0,
            shots: weapon.shots_sum || 0,
            hits: weapon.hits_sum || 0,
            damage: weapon.damage_sum || 0
          });
        }
      }
    });
    
    // Convert map to array, calculate accuracy, and sort by damage
    const weaponData = Array.from(weaponMap.values())
      .map(weapon => ({
        ...weapon,
        accuracy: weapon.shots > 0 ? Math.round((weapon.hits / weapon.shots) * 100) : 0
      }))
      .sort((a, b) => b.damage - a.damage);

    const weapons = weaponData;

    if (weapons.length === 0) {
      return (
        <View style={[styles.statsSection, { backgroundColor: theme.surface, marginHorizontal: 16, marginBottom: 16 }]}>
          <Text style={[styles.statsSectionTitle, { color: theme.text }]}>{selectedPlayer.steam_profile?.nickname?.toUpperCase()} WEAPONS</Text>
          <Text style={[styles.comingSoonText, { color: theme.textSecondary, padding: 16 }]}>
            No weapon data available for this player
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.statsSection, { backgroundColor: theme.surface, marginHorizontal: 16, marginBottom: 16 }]}>
        <Text style={[styles.statsSectionTitle, { color: theme.text }]}>{selectedPlayer.steam_profile?.nickname?.toUpperCase()} WEAPONS - {getMapDisplayName(matchData?.mapName || '')}</Text>
        
        <View style={styles.weaponsList}>
          {weapons.map((weapon, index) => (
            <View key={weapon.name} style={[styles.weaponContainer, { borderBottomColor: 'rgba(255, 255, 255, 0.1)' }]}>
              {/* Weapon Header Row */}
              <TouchableOpacity
                style={styles.weaponHeaderRow}
                onPress={() => toggleWeaponExpansion(weapon.name)}
              >
                <View style={styles.weaponHeaderLeft}>
                  {(() => {
                    const weaponIcon = getCS2WeaponIcon(weapon.name);
                    return weaponIcon && weaponIcon.type === 'png' ? (
                      <Image
                        source={weaponIcon.source}
                        style={[styles.weaponHeaderIcon, { width: 80, height: 40, tintColor: theme.text }]}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.weaponHeaderIcon, { backgroundColor: theme.surfaceSecondary }]} />
                    );
                  })()}
                  <Text style={[styles.weaponHeaderName, { color: theme.text }]}>{weapon.name}</Text>
                </View>
                <Ionicons
                  name={expandedWeapons[weapon.name] ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>

              {/* Expandable Weapon Stats */}
              {expandedWeapons[weapon.name] && (
                <View style={styles.weaponStatsExpanded}>
                  <View style={styles.weaponStatsGrid}>
                    <View style={styles.weaponStatColumn}>
                      <Text style={[styles.weaponStatNumber, { color: theme.text }]}>{weapon.kills}</Text>
                      <Text style={[styles.weaponStatLabel, { color: theme.textSecondary }]}>Kills</Text>
                    </View>
                    <View style={styles.weaponStatColumn}>
                      <Text style={[styles.weaponStatNumber, { color: theme.text }]}>{weapon.hits}/{weapon.shots}</Text>
                      <Text style={[styles.weaponStatLabel, { color: theme.textSecondary }]}>Hits/Shots</Text>
                    </View>
                    <View style={styles.weaponStatColumn}>
                      <Text style={[styles.weaponStatNumber, { color: theme.text }]}>{weapon.accuracy}%</Text>
                      <Text style={[styles.weaponStatLabel, { color: theme.textSecondary }]}>Accuracy</Text>
                    </View>
                    <View style={styles.weaponStatColumn}>
                      <Text style={[styles.weaponStatNumber, { color: theme.text }]}>{weapon.damage}</Text>
                      <Text style={[styles.weaponStatLabel, { color: theme.textSecondary }]}>Damage</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderStatsTab = () => {
    if (loadingStats) {
      return (
        <View style={styles.comingSoonContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            Loading player statistics...
          </Text>
        </View>
      );
    }

    if (!weaponStats || !hitGroupStats) {
      return (
        <View style={styles.comingSoonContainer}>
          <Ionicons name="stats-chart" size={48} color={theme.textSecondary} />
          <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            No player statistics available
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.contentContainer}>
        <Text style={[styles.sectionTitle, { color: theme.text, marginHorizontal: 16, marginBottom: 16 }]}>
          Player Statistics
        </Text>
        
        {/* Player Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playersScroll}>
          {weaponStats.map((player, index) => (
            <TouchableOpacity 
              key={player.steam_profile_id || index} 
              style={[
                styles.playerCard, 
                { 
                  backgroundColor: selectedPlayer?.steam_profile_id === player.steam_profile_id ? colors.primary : theme.surface,
                  borderWidth: selectedPlayer?.steam_profile_id === player.steam_profile_id ? 2 : 0,
                  borderColor: colors.primary
                }
              ]}
              onPress={() => setSelectedPlayer(player)}
            >
              <Image
                source={{ 
                  uri: player.steam_profile?.player?.image_url || 'https://via.placeholder.com/40x40'
                }}
                style={styles.playerAvatar}
                resizeMode="contain"
                defaultSource={{ uri: 'https://via.placeholder.com/40x40' }}
              />
              <Text style={[styles.playerName, { color: selectedPlayer?.steam_profile_id === player.steam_profile_id ? '#fff' : theme.text }]}>
                {player.steam_profile?.nickname || 'Unknown'}
              </Text>
              <Text style={[styles.playerTeam, { color: selectedPlayer?.steam_profile_id === player.steam_profile_id ? '#fff' : theme.textSecondary }]}>
                {player.clan_name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {selectedPlayer ? (
          <ScrollView style={styles.tabContent}>
            {renderPlayerStats()}
          </ScrollView>
        ) : (
          <View style={styles.comingSoonContainer}>
            <Ionicons name="person" size={48} color={theme.textSecondary} />
            <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
              Select a player to view their statistics
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'economy':
        return renderEconomyTab();
      case 'stats':
        return renderStatsTab();
      default:
        return renderOverviewTab();
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading match details...</Text>
      </View>
    );
  }

  if (!matchData) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle" size={48} color={theme.textTertiary} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>Unable to load match</Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          Please check your connection and try again
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadMatchData}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* Tab Content */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {renderMatchHeader()}
        {renderTabNavigation()}
        {renderContent()}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Header Styles
  // Tab Styles
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  tabContent: {
    flex: 1,
  },
  // Section Styles
  section: {
    marginBottom: 24,
    marginHorizontal: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  // Player Stats Styles
  statsContainer: {
    marginTop: 8,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  teamSection: {
    marginTop: 16,
  },
  teamTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  playerInfo: {
    marginLeft: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  // Kills Matrix Styles
  killsMatrixTeam: {
    marginBottom: 24,
  },
  matrixContainer: {
    marginTop: 8,
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  matrixPlayer: {
    fontSize: 12,
    fontWeight: '500',
    width: 80,
  },
  matrixValues: {
    flexDirection: 'row',
    flex: 1,
  },
  matrixCell: {
    flex: 1,
    alignItems: 'center',
  },
  matrixValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Hit Group Stats Styles  
  hitGroupPlayer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  hitGroupStats: {
    marginTop: 8,
  },
  hitGroupItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  hitGroupLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  hitGroupValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  roundsScroll: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  roundCard: {
    width: 120,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    alignItems: 'center',
  },
  roundNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  roundWinnerSection: {
    alignItems: 'center',
  },
  roundWinnerLogo: {
    width: 24,
    height: 24,
    marginBottom: 4,
  },
  roundWinner: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: -4,
  },
  winConditionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  winConditionIcon: {
    marginRight: 2,
  },
  roundWinnerText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  // Team Table styles (like VAL)
  teamTableContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  teamTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  teamHeaderLogo: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  teamHeaderName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  teamTable: {
    // Container for player rows
  },
  playerTableRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#444',
  },
  playerFirstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playerLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  agentImageMedium: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  playerNameSection: {
    flex: 1,
  },
  playerTableName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  playerHeadshot: {
    fontSize: 12,
  },
  killAssistSection: {
    alignItems: 'flex-end',
  },
  killAssistContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  killAssistText: {
    fontSize: 14,
    fontWeight: '600',
  },
  expandIcon: {
    marginLeft: 4,
  },
  playerSecondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  equipmentSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  economySection: {
    alignItems: 'flex-end',
    flex: 1,
  },
  creditsInfo: {
    fontSize: 12,
  },
  // Kills dropdown styles
  killsDropdown: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#444',
  },
  killsDropdownTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  killItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  weaponSection: {
    flex: 1,
  },
  weaponPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    gap: 6,
  },
  weaponIcon: {
    marginRight: 2,
  },
  weaponText: {
    fontSize: 12,
    fontWeight: '500',
  },
  victimSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  victimImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
  },
  victimName: {
    fontSize: 12,
    fontWeight: '500',
  },
  bottomPadding: {
    height: 32,
  },
  // Header Bar Styles
  headerBar: {
    paddingTop: 44,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButtonTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Match Header Styles (VAL-style)
  matchHeader: {
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  matchHeaderContent: {
    position: 'relative',
    height: 150,
  },
  mapBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  matchInfo: {
    marginTop: -5,
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  mapName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  teamScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  teamSection: {
    alignItems: 'center',
    flex: 1,
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
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  scoreSection: {
    alignItems: 'center',
    flex: 1,
  },
  finalScore: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Roster styles (VAL-style)
  teamsContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  leftTeamContainer: {
    flex: 1,
    paddingRight: 8,
  },
  rightTeamContainer: {
    flex: 1,
    paddingLeft: 8,
  },
  teamLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  leftPlayersColumn: {
    alignItems: 'flex-start',
  },
  rightPlayersColumn: {
    alignItems: 'flex-end',
  },
  leftPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  rightPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  playerInfoRight: {
    marginRight: 12,
  },
  playerImage: {
    width: 50,
    height: 50,
    borderRadius: 20,
    // Apply square crop for CS2 vertical player images
    aspectRatio: 1,
  },
  playerStats: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  // Half Time styles (VAL-style)
  halfTimeContainer: {
    gap: 12,
  },
  halfTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCard: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  overtimeCard: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
    minWidth: 120,
    alignSelf: 'center',
  },
  halfTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  halfScore: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  // Stats Tab Styles
  playersScroll: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  playerCard: {
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    minWidth: 100,
    alignItems: 'center',
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  playerName: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  playerTeam: {
    fontSize: 10,
    textAlign: 'center',
  },
  statsSection: {
    padding: 16,
    borderRadius: 8,
  },
  statsSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  chartContainer: {
    flexDirection: 'row',
    height: 200,
  },
  chartYAxis: {
    width: 40,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  chartAxisLabel: {
    fontSize: 10,
  },
  chartContent: {
    flex: 1,
  },
  chartArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chartPoint: {
    flex: 1,
    height: 150,
    position: 'relative',
    alignItems: 'center',
  },
  chartLine: {
    width: 2,
    position: 'absolute',
  },
  chartDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
  },
  chartXAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartXAxisItem: {
    flex: 1,
    alignItems: 'center',
  },
  bodyStatsContainer: {
    flexDirection: 'row',
  },
  bodyDiagram: {
    width: 120,
    height: 200,
    position: 'relative',
    marginRight: 16,
  },
  bodyPart: {
    position: 'absolute',
    backgroundColor: 'rgba(162, 0, 255, 1)',
  },
  head: {
    width: 30,
    height: 30,
    borderRadius: 15,
    top: 10,
    left: 45,
  },
  chest: {
    width: 50,
    height: 35,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    top: 45,
    left: 35,
  },
  stomach: {
    width: 50,
    height: 50,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    top: 80,
    left: 35,
  },
  leftArm: {
    width: 15,
    height: 70,
    borderRadius: 8,
    top: 50,
    left: 17,
    transform: [{ rotate: '10deg' }],
  },
  rightArm: {
    width: 15,
    height: 70,
    borderRadius: 8,
    top: 50,
    right: 17,
    transform: [{ rotate: '-10deg' }],
  },
  leftLeg: {
    width: 18,
    height: 60,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    bottom: 10,
    left: 40,
  },
  rightLeg: {
    width: 18,
    height: 60,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    bottom: 10,
    right: 40,
  },
  bodyStatsTable: {
    flex: 1,
  },
  bodyStatsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 8,
  },
  bodyStatsHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  bodyStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  bodyStatsText: {
    fontSize: 12,
    flex: 1,
    textAlign: 'center',
  },
  weaponsList: {
    marginTop: 8,
  },
  weaponContainer: {
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  weaponHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  weaponHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  weaponHeaderIcon: {
    width: 30,
    height: 25,
    marginRight: 12,
  },
  weaponHeaderName: {
    fontSize: 16,
    fontWeight: '600',
  },
  weaponStatsExpanded: {
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  weaponStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  weaponStatColumn: {
    flex: 1,
    alignItems: 'center',
  },
  weaponStatNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  weaponStatLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
});

export default CS2MatchScreen;