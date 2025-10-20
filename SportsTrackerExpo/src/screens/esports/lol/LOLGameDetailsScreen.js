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
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../../context/ThemeContext';
import { getSafeImageUri } from '../../../utils/imageUtils';
import {
  getMatchWindow,
  getMatchLiveDetails,
  calculateVodStartingTime,
  calculateMatchDateWith2359
} from '../../../services/lolService';const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// SVG Icon Components
const InhibitorIcon = ({ size = 24, color = "#555d64" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path 
      d="M12,2 C17.522,2 22,6.478 22,12 C22,17.522 17.522,22 12,22 C6.477,22 2,17.522 2,12 C2,6.478 6.477,2 12,2 Z M12,4 C7.639,4 4,7.635 4,12 C4,16.365 7.639,20 12,20 C16.362,20 20,16.365 20,12 C20,7.635 16.362,4 12,4 Z M12,8 L16,12 L12,16 L8,12 L12,8 Z"
      fill={color}
    />
  </Svg>
);

const BaronIcon = ({ size = 24, color = "#555d64" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path 
      d="M17,12.5049 C17,13.3299 16.331,13.9999 15.504,13.9999 L15.496,13.9999 C14.669,13.9999 14,13.3299 14,12.5049 L14,12.4949 C14,11.6699 14.669,10.9999 15.496,10.9999 L15.504,10.9999 C16.331,10.9999 17,11.6699 17,12.4949 L17,12.5049 Z M13,10.0079 C13,10.5559 12.556,10.9999 12.008,10.9999 L11.992,10.9999 C11.444,10.9999 11,10.5559 11,10.0079 L11,9.9919 C11,9.4439 11.444,8.9999 11.992,8.9999 L12.008,8.9999 C12.556,8.9999 13,9.4439 13,9.9919 L13,10.0079 Z M13,15.0099 C13,15.5569 12.557,15.9999 12.01,15.9999 L11.99,15.9999 C11.443,15.9999 11,15.5569 11,15.0099 L11,14.9899 C11,14.4429 11.443,13.9999 11.99,13.9999 L12.01,13.9999 C12.557,13.9999 13,14.4429 13,14.9899 L13,15.0099 Z M10,12.5139 C10,13.3349 9.334,13.9999 8.514,13.9999 L8.486,13.9999 C7.666,13.9999 7,13.3349 7,12.5139 L7,12.4859 C7,11.6659 7.666,10.9999 8.486,10.9999 L8.514,10.9999 C9.334,10.9999 10,11.6659 10,12.4859 L10,12.5139 Z M22,5.9999 L15,1.9999 L15,3.9999 L18,6.9999 L16,8.9999 L12,4.9999 L8,8.9999 L6,6.9999 L9,3.9999 L9,1.9999 L2,5.9999 L6,10.9999 L2,14.9999 L5,18.9999 L5,14.9999 L7,14.9999 L8,19.9999 L10,21.9999 L10,17.9999 L12,19.9999 L14,17.9999 L14,21.9999 L16,19.9999 L17,14.9999 L19,14.9999 L19,18.9999 L22,14.9999 L18,10.9999 L22,5.9999 Z"
      fill={color}
    />
  </Svg>
);

const TowerIcon = ({ size = 24, color = "#555d64" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path 
      d="M9.0004,1.0004 L9.0004,5.9994 L6.9994,5.0004 L4.0004,6.9994 L4.9994,11.0004 L12.0004,14.9994 L19.0004,11.0004 L20.0004,6.9994 L16.9994,5.0004 L14.9994,5.9994 L14.9994,1.0004 L9.0004,1.0004 Z M11.0004,5.9994 L11.0004,3.0004 L13.0004,3.0004 L13.0004,5.9994 L12.0004,6.9994 L11.0004,5.9994 Z M15.9994,8.9994 L12.0004,12.0004 L7.9994,8.9994 L12.0004,10.0004 L15.9994,8.9994 Z M12.0001,16.9997 L16.0001,14.9997 L15.0001,21.0007 L16.9991,21.0007 L16.9991,22.9997 L7.0001,22.9997 L7.0001,21.0007 L9.0001,21.0007 L7.9991,14.9997 L12.0001,16.9997 Z"
      fill={color}
    />
  </Svg>
);

// Dragon Icons
const DragonIcon = ({ type, size = 18 }) => {
  const dragonColors = {
    chemtech: "#A4B72B",
    mountain: "#A8805D", 
    infernal: "#F26C23",
    hextech: "#81D9F5",
    ocean: "#67C4B0",
    cloud: "#ADD2ED",
    elder: "#C9BCDC"
  };

  const color = dragonColors[type] || "#555d64";

  switch (type) {
    case 'chemtech':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path 
            d="M15.8377 6.24546C16.8672 6.24546 17.2548 5.31013 16.7519 4.29806C19.0471 5.60353 21.6148 9.13739 19.0471 11.381C16.9304 13.2303 14.7314 12.2534 12.9652 10.2592C11.8045 8.94874 8.13507 8.00911 8.13507 10.739C8.13507 12.2439 9.19042 13.1114 10.6993 13.3874C10.2969 13.1114 9.51962 12.1294 10.2969 11.1793C11.2292 10.0399 13.2537 12.3425 14.7229 13.1114C16.456 14.0183 18.2637 12.9588 19.2522 13.1771C22.3776 13.8678 21.231 19.3125 16.456 18.6449C14.197 18.3291 12.8524 17.8037 11.9707 18.6449C10.8823 19.6832 13.3545 20.8856 14.2515 20.8856C12.3763 21.5236 7.06641 19.3849 9.41883 17.1584C10.0521 16.559 10.6749 16.3194 11.184 16.3316C11.184 17.5007 12.9846 17.2448 13.7648 16.9625C15.4769 16.3432 14.9583 14.428 13.3163 14.0183C11.2766 13.5096 10.1287 17.3467 5.56753 15.8745C3.83222 15.3145 3 13.9529 3 12.6649C3 11.3768 3.84781 10.592 4.25016 10.0399C3.9193 7.3383 4.8087 5.43267 6.15552 4.29806C8.00363 2.74117 11.9707 2.39384 13.2701 4.31965C13.6292 4.85177 14.4026 6.24546 15.8377 6.24546Z"
            fill={color}
          />
        </Svg>
      );
    case 'mountain':
      return (
        <Svg width={size} height={size} viewBox="0 0 14 18">
          <Path 
            d="M3,4.5 L6,16 L5,17 L1,12.0302388 L1,7.07612197 L3,4.5 Z M6.50012207,13 L4.5,3 L6,1 L8,1 L9.5,3 L7.5,13 L6.50012207,13 Z M11,4.5 L13,7.07612197 L13,12.0302388 L9,17 L8,16 L11,4.5 Z"
            fill={color}
          />
        </Svg>
      );
    case 'infernal':
      return (
        <Svg width={size} height={size} viewBox="0 0 14 18">
          <Path 
            d="M6.185725,0 C6.185725,0 6.68325,2.9099 6.23805,3.343375 C5.79285,3.77685 2.274125,7.10675 2.274125,7.10675 L1.1004,5.78095 L0,9.82625 C0,9.82625 1.6954,11.38935 2.48955,14.728 L7,17 L13.4652,12.0666 L14,9.041025 L12.7162,7.765625 C12.7162,7.765625 12.951225,9.4052 12.354825,9.4052 C11.75825,9.4052 10.6764,6.8957 9.88715,6.8957 C9.098075,6.8957 8.401575,7.10115 6.9097,7.4508 C5.718475,7.7301 5.26015,9.698675 5.12365,10.48075 C5.090225,10.6729 5.171425,10.8668 5.33435,10.97985 L6.9097,12.347825 C6.9097,12.347825 8.385125,11.378325 8.385125,10.723825 C8.385125,10.221575 7.146825,10.252025 7.146825,9.30265 C7.146825,8.75 7.6391,8.52985 8.262625,8.52985 C9.99355,8.52985 10.6708,10.5721 10.6708,10.5721 C9.404675,13.03785 6.9951,14.595 6.9951,14.595 C6.9951,14.595 3.436475,12.154625 3.436475,10.63195 C3.436475,6.427225 8.33595,5.31125 8.33595,5.31125 L8.98555,3.1598 L6.185725,0 Z"
            fill={color}
          />
        </Svg>
      );
    case 'hextech':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path 
            d="M13.4142 3V5.78423L20 12.2808L13.4142 18.7773L11.0572 21V19.2414L4 12.2808L11.0572 5.32019L13.4142 3ZM15.1231 10.1346L17 11.9822L12 16.9041L7.00003 11.9822L8.87694 10.1346L12 13.2089L15.1231 10.1346ZM14.0624 9.09049L12 11.1207L9.9376 9.09055L12 7.06034L14.0624 9.09049Z"
            fill={color}
            fillRule="evenodd"
            clipRule="evenodd"
          />
        </Svg>
      );
    case 'ocean':
      return (
        <Svg width={size} height={size} viewBox="0 0 14 18">
          <Path 
            d="M14,11.272025 C14,9.952875 12.87125,9.44695 12.87125,9.44695 C12.87125,9.44695 13.38225,8.4323 13.38225,7.648825 C13.38225,4.919525 11.339125,2 7.911225,2 C3.984225,2 2.41325,6.1566 2.41325,6.1566 C2.41325,6.1566 1.932875,5.452575 2.08425,3.761025 C2.08425,3.761025 0,5.522225 0,9.19355 C0,12.138275 2.055375,15.65 5.7512,15.65 C8.239,15.65 9.910075,13.554725 9.910075,11.2869 C9.910075,9.141925 8.16095,7.872475 6.523125,7.872475 C5.453525,7.872475 4.567675,8.64755 4.567675,8.64755 C4.86745,7.1303 6.50195,6.52375 6.50195,6.52375 C7.092925,3.727425 10.506825,4.049425 10.506825,4.049425 C10.506825,4.049425 9.08005,4.797375 8.588475,6.1524 C8.588475,6.1524 12.0211,7.341525 12.0211,11.19765 C12.0211,13.94445 10.213875,15.407275 10.213875,15.407275 C10.213875,15.407275 11.930625,14.51145 13.0858,12.63615 C13.323975,12.94065 13.347075,13.3806 13.347075,13.3806 C13.347075,13.3806 14,12.591175 14,11.272025"
            fill={color}
          />
        </Svg>
      );
    case 'cloud':
      return (
        <Svg width={size} height={size} viewBox="0 0 14 18">
          <Path 
            d="M3.839325,1 C3.839325,1 8.2243,2.667575 8.2243,6.623975 C8.2243,10.4591 1.939175,10.2722 1.939175,14.969375 C1.939175,15.96705 2.63515,17.3401 2.63515,17.3401 C2.63515,17.3401 0,15.71505 0,13.447575 C0,9.575175 4.95565,11.117975 4.95565,4.486 C4.95565,2.01885 3.839325,1 3.839325,1 M12.4478333,8.7884625 C12.4478333,10.2183875 11.3421833,12.5586625 8.51803332,12.5586625 C4.30910832,12.5586625 3.72618332,14.4448125 3.72618332,14.4448125 C2.98505832,11.7594375 10.5375333,9.9887875 10.5375333,5.9735875 C10.5375333,4.1395875 9.63558332,3.1321125 9.63558332,3.1321125 C9.63558332,3.1321125 12.4478333,5.0774125 12.4478333,8.7884625 M4.55,15.75691 C5.138175,14.079535 6.3917,13.71641 6.3917,13.71641 C6.3917,13.71641 7.9394,14.238085 8.6177,14.238085 C11.88495,14.238085 13.846175,10.297785 13.846175,10.297785 C13.846175,10.297785 14.870975,13.87391 11.552275,17.450035 C11.552275,17.450035 9.60295,15.161035 7.14315,15.161035 C5.651975,15.161035 4.55,15.75691 4.55,15.75691"
            fill={color}
          />
        </Svg>
      );
    case 'elder':
      return (
        <Svg width={size} height={size} viewBox="0 0 14 18">
          <Path 
            d="M9.282525,10.64335 C8.611225,11.44178.069075,11.3129 8.069075,11.3129 L8.5337,10.192725 L9.721425,9.252625 C9.721425,9.252625 9.953825,9.845 9.282525,10.64335 M7.843325,16.17685 C7.843325,16.17685 7.503475,15.613875 7.33355,15.332475 L6.999825,15.84645 L6.6661,15.332475 C6.496175,15.613875 6.156325,16.17685 6.156325,16.17685 C6.156325,16.17685 5.438825,15.278575 5.438825,14.298925 C5.438825,13.31945 5.6182,12.50605 5.6182,12.50605 L6.107325,13.987425 L6.49425,13.6978 C6.49425,13.6978 6.605025,14.05165 6.999825,14.5693 C7.39445,14.05165 7.505225,13.6978 7.505225,13.6978 L7.892325,13.987425 L8.381275,12.50605 C8.381275,12.50605 8.560825,13.31945 8.560825,14.298925 C8.560825,15.278575 7.843325,16.17685 7.843325,16.17685 M4.149775,9.252625 L5.424125,10.192725 L5.922875,11.4956 C5.922875,11.4956 4.149775,11.213325 4.149775,9.252625 M9.493575,-0.0005 L9.02265,0.513475 L9.194325,4.331625 C9.194325,4.331625 10.231725,5.096725 10.231725,6.0405 C10.231725,6.730525 9.767975,7.222975 9.276225,7.222975 C8.56765,7.222975 8.02585,6.47275 8.29395,5.55505 L7.000175,3.375775 L6.999825,3.375775 L5.705875,5.55505 C5.973975,6.47275 5.432175,7.222975 4.723775,7.222975 C4.232025,7.222975 3.768275,6.730525 3.768275,6.0405 C3.768275,5.096725 4.8055,4.331625 4.8055,4.331625 L4.977175,0.513475 L4.50625,-0.0005 C4.50625,3.448925 0,6.669975 0,10.24505 C0,12.510425 2.260475,13.944725 2.260475,16.217625 C2.260475,16.217625 2.6649,15.643625 2.6649,14.24555 C2.6649,12.8473 2.1504,12.74125 2.1504,11.87395 C2.1504,11.006825 2.927225,10.17225 2.927225,10.17225 C2.927225,11.666925 4.60985,12.917825 4.60985,13.628675 C4.60985,14.612525 5.48485,17.4995 7,17.4995 C8.514975,17.4995 9.39015,14.612525 9.39015,13.628675 C9.39015,12.917825 11.0726,11.666925 11.0726,10.17225 C11.0726,10.17225 11.849425,11.006825 11.849425,11.87395 C11.849425,12.74125 11.334925,12.8473 11.334925,14.24555 C11.334925,15.643625 11.73935,16.217625 11.73935,16.217625 C11.73935,13.944725 14,12.510425 14,10.24505 C14,6.669975 9.493575,3.448925 9.493575,-0.0005"
            fill={color}
          />
        </Svg>
      );
    default:
      return null;
  }
};

const LOLGameDetailsScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { gameId, matchDetails, teams } = route.params;
  
  const [activeTab, setActiveTab] = useState('overview');
  const [windowData, setWindowData] = useState(null);
  const [detailsData, setDetailsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [expandedTeams, setExpandedTeams] = useState({});

  useEffect(() => {
    loadGameData();
  }, [gameId]);





  const loadGameData = async () => {
    try {
      setLoading(true);
      
      let windowResponse = null;
      let detailsResponse = null;

      // First, try to find the game data from matchDetails to calculate time
      let gameData = null;
      if (matchDetails?.match?.games) {
        gameData = matchDetails.match.games.find(game => game.id === gameId);
      }

      // Try match date with 23:59 first
      if (gameData) {
        const matchWith2359 = calculateMatchDateWith2359(gameData);
        
        if (matchWith2359) {
          try {
            console.log(`Using match date 23:59: ${matchWith2359} for game ${gameId}`);
            
            // Try to load both window and details data with match date 23:59
            const [windowResult, detailsResult] = await Promise.allSettled([
              getMatchWindow(gameId, matchWith2359),
              getMatchLiveDetails(gameId, matchWith2359)
            ]);

            if (windowResult.status === 'fulfilled' && windowResult.value) {
              windowResponse = windowResult.value;
            }
            
            if (detailsResult.status === 'fulfilled' && detailsResult.value) {
              detailsResponse = detailsResult.value;
            }

            // If we got at least one successful response, we're done
            if (windowResponse || detailsResponse) {
              console.log(`Success with match date 23:59: ${matchWith2359} for game ${gameId}`);
              setWindowData(windowResponse);
              setDetailsData(detailsResponse);
              return;
            }
          } catch (error) {
            console.log(`Failed with match date 23:59: ${matchWith2359} for game ${gameId}`, error.message);
          }
        }

        // Try VOD calculated time as backup
        const calculatedTime = calculateVodStartingTime(gameData);
        
        if (calculatedTime) {
          try {
            console.log(`Using VOD calculated time: ${calculatedTime} for game ${gameId}`);
            
            // Try to load both window and details data with calculated time
            const [windowResult, detailsResult] = await Promise.allSettled([
              getMatchWindow(gameId, calculatedTime),
              getMatchLiveDetails(gameId, calculatedTime)
            ]);

            if (windowResult.status === 'fulfilled' && windowResult.value) {
              windowResponse = windowResult.value;
            }
            
            if (detailsResult.status === 'fulfilled' && detailsResult.value) {
              detailsResponse = detailsResult.value;
            }

            // If we got at least one successful response, we're done
            if (windowResponse || detailsResponse) {
              console.log(`Success with VOD calculated time: ${calculatedTime} for game ${gameId}`);
              setWindowData(windowResponse);
              setDetailsData(detailsResponse);
              return;
            }
          } catch (error) {
            console.log(`Failed with VOD calculated time: ${calculatedTime} for game ${gameId}`, error.message);
          }
        }
      }

      // Fallback to hardcoded time candidates with proper buffer if both methods fail
      const now = new Date();
      const bufferTime = new Date(now.getTime() - 30000); // 30 seconds ago
      const rounded = new Date(Math.floor(bufferTime.getTime() / 10000) * 10000);
      const minus = new Date(rounded.getTime() - 10000);
      const added = new Date(rounded.getTime() + 10000);
      const iso1 = minus.toISOString();
      const iso2 = added.toISOString();
      const iso = rounded.toISOString();
      console.log(`Using buffered times (30s old): ${iso}, ${iso1}, ${iso2}`);
      
      const gameDateCandidates = [
        `${iso1}`,
        `${iso2}`,
        `${iso}`,
        '2025-10-16T15:32:30.000Z'
      ];

      // Try each time candidate until one succeeds
      for (const gameDate of gameDateCandidates) {
        try {
          console.log(`Testing hardcoded fallback date: ${gameDate} for game ${gameId}`);
          
          // Try to load both window and details data
          const [windowResult, detailsResult] = await Promise.allSettled([
            getMatchWindow(gameId, gameDate),
            getMatchLiveDetails(gameId, gameDate)
          ]);

          if (windowResult.status === 'fulfilled' && windowResult.value) {
            windowResponse = windowResult.value;
          }
          
          if (detailsResult.status === 'fulfilled' && detailsResult.value) {
            detailsResponse = detailsResult.value;
          }

          // If we got at least one successful response, break
          if (windowResponse || detailsResponse) {
            console.log(`Success with fallback date: ${gameDate} for game ${gameId}`);
            break;
          }
        } catch (error) {
          console.log(`Failed with fallback date: ${gameDate} for game ${gameId}`, error.message);
          continue;
        }
      }

      setWindowData(windowResponse);
      setDetailsData(detailsResponse);
      
      if (!windowResponse && !detailsResponse) {
        console.warn(`No working time found for game ${gameId}`);
      }
      
    } catch (error) {
      console.error('Error loading game data:', error);
      Alert.alert('Error', 'Failed to load game details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGameData();
    setRefreshing(false);
  };

  // Get final game scores from window data
  const getGameScores = () => {
    if (!windowData?.frames || !windowData?.gameMetadata) {
      return { team1Score: 0, team2Score: 0, hasFinished: false };
    }

    // Find the frame with gameState "finished"
    const finishedFrame = windowData.frames.find(frame => frame.gameState === 'finished');
    
    if (!finishedFrame) {
      return { team1Score: 0, team2Score: 0, hasFinished: false };
    }

    // Get team IDs from match details
    const team1Id = teams[0]?.id; // First team in UI
    const team2Id = teams[1]?.id; // Second team in UI

    const { blueTeamMetadata, redTeamMetadata } = windowData.gameMetadata;
    const blueTeamKills = finishedFrame.blueTeam?.totalKills || 0;
    const redTeamKills = finishedFrame.redTeam?.totalKills || 0;

    // Map kills to correct teams based on esportsTeamId instead of sides
    let team1Score = 0;
    let team2Score = 0;

    // Check which team (blue or red) corresponds to which actual team
    if (blueTeamMetadata?.esportsTeamId === team1Id) {
      team1Score = blueTeamKills;
      team2Score = redTeamKills;
    } else if (redTeamMetadata?.esportsTeamId === team1Id) {
      team1Score = redTeamKills;
      team2Score = blueTeamKills;
    } else {
      // Fallback to blue/red if team IDs don't match (shouldn't happen normally)
      team1Score = blueTeamKills;
      team2Score = redTeamKills;
    }

    return { 
      team1Score, 
      team2Score, 
      hasFinished: true,
      winningTeam: team1Score > team2Score ? 1 : team2Score > team1Score ? 2 : 0 // 0 = tie
    };
  };

  // Get real player data from window data
  const getPlayerData = () => {
    if (!windowData?.gameMetadata || !windowData?.frames) {
      return null;
    }

    const { blueTeamMetadata, redTeamMetadata } = windowData.gameMetadata;
    
    // Find the finished frame to get player stats
    const finishedFrame = windowData.frames.find(frame => frame.gameState === 'finished');
    
    // Get team IDs from match details
    const team1Id = teams[0]?.id; // First team in UI
    const team2Id = teams[1]?.id; // Second team in UI
    
    const getTeamPlayers = (teamMetadata, teamFrameData) => {
      if (!teamMetadata?.participantMetadata) return [];
      
      return teamMetadata.participantMetadata.map(participant => {
        // Find the player's stats from the finished frame
        const playerStats = teamFrameData?.participants?.find(
          p => p.participantId === participant.participantId
        );
        
        return {
          name: participant.summonerName,
          champion: participant.championId,
          role: participant.role,
          kills: playerStats?.kills || 0,
          deaths: playerStats?.deaths || 0,
          assists: playerStats?.assists || 0,
          participantId: participant.participantId
        };
      });
    };

    // Match teams by esportsTeamId instead of sides (red/blue can change between games)
    let team1Players = [];
    let team2Players = [];

    // Check which metadata (blue or red) corresponds to which actual team
    if (blueTeamMetadata?.esportsTeamId === team1Id) {
      team1Players = getTeamPlayers(blueTeamMetadata, finishedFrame?.blueTeam);
      team2Players = getTeamPlayers(redTeamMetadata, finishedFrame?.redTeam);
    } else if (redTeamMetadata?.esportsTeamId === team1Id) {
      team1Players = getTeamPlayers(redTeamMetadata, finishedFrame?.redTeam);
      team2Players = getTeamPlayers(blueTeamMetadata, finishedFrame?.blueTeam);
    } else {
      // Fallback to blue/red if team IDs don't match (shouldn't happen normally)
      team1Players = getTeamPlayers(blueTeamMetadata, finishedFrame?.blueTeam);
      team2Players = getTeamPlayers(redTeamMetadata, finishedFrame?.redTeam);
    }

    return {
      team1: team1Players,
      team2: team2Players
    };
  };

  // Calculate team totals for KDA
  const getTeamTotals = (teamPlayers) => {
    if (!teamPlayers || teamPlayers.length === 0) {
      return { kills: 0, deaths: 0, assists: 0 };
    }
    
    return teamPlayers.reduce((totals, player) => ({
      kills: totals.kills + (player.kills || 0),
      deaths: totals.deaths + (player.deaths || 0),
      assists: totals.assists + (player.assists || 0)
    }), { kills: 0, deaths: 0, assists: 0 });
  };

  // Get detailed player data from details data (last frame)
  const getDetailedPlayerData = (participantId) => {
    if (!detailsData?.frames || detailsData.frames.length === 0) {
      return null;
    }
    
    const lastFrame = detailsData.frames[detailsData.frames.length - 1];
    const participant = lastFrame.participants?.find(p => p.participantId === participantId);
    
    return participant;
  };

  // Format gold to K format
  const formatGold = (gold) => {
    if (gold >= 1000) {
      return (gold / 1000).toFixed(1) + 'K';
    }
    return gold.toString();
  };

  // Toggle expanded state for player rows
  const togglePlayerExpanded = (teamIndex, playerIndex) => {
    const key = `${teamIndex}-${playerIndex}`;
    setExpandedRows(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Toggle expanded state for team rows
  const toggleTeamExpanded = (teamIndex) => {
    setExpandedTeams(prev => ({
      ...prev,
      [teamIndex]: !prev[teamIndex]
    }));
  };

  // Get team stats from window data (finished frame)
  const getTeamStats = (teamIndex) => {
    if (!windowData?.frames) {
      return null;
    }

    const finishedFrame = windowData.frames.find(frame => frame.gameState === 'finished');
    if (!finishedFrame) {
      return null;
    }

    const { blueTeamMetadata, redTeamMetadata } = windowData.gameMetadata;
    const team1Id = teams[0]?.id;
    const team2Id = teams[1]?.id;

    let teamData = null;

    // Map team data based on esportsTeamId
    if (teamIndex === 0) {
      if (blueTeamMetadata?.esportsTeamId === team1Id) {
        teamData = finishedFrame.blueTeam;
      } else if (redTeamMetadata?.esportsTeamId === team1Id) {
        teamData = finishedFrame.redTeam;
      }
    } else {
      if (blueTeamMetadata?.esportsTeamId === team2Id) {
        teamData = finishedFrame.blueTeam;
      } else if (redTeamMetadata?.esportsTeamId === team2Id) {
        teamData = finishedFrame.redTeam;
      }
    }

    if (!teamData) return null;

    const result = {
      totalGold: teamData.totalGold || 0,
      totalKills: teamData.totalKills || 0,
      inhibitors: teamData.inhibitors || 0,
      towers: teamData.towers || 0,
      barons: teamData.barons || 0,
      dragons: teamData.dragons || []
    };

    // Debug logging
    console.log(`Team ${teamIndex} stats:`, result);
    console.log(`Team ${teamIndex} raw dragons:`, teamData.dragons);

    return result;
  };

  const renderTabButton = (tab, title) => (
    <TouchableOpacity
      key={tab}
      style={[
        styles.tabButton,
        { borderBottomColor: activeTab === tab ? colors.primary : 'transparent' }
      ]}
      onPress={() => setActiveTab(tab)}
    >
      <Text style={[
        styles.tabText,
        { color: activeTab === tab ? colors.primary : theme.textSecondary }
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderOverviewTab = () => {
    const gameScores = getGameScores();
    const playerData = getPlayerData();

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Hero Section with Map Background */}
        <View style={styles.heroSection}>
          <Image
            source={{ uri: 'https://i.redd.it/wofey4h7koba1.jpg' }}
            style={styles.mapBackground}
            resizeMode="cover"
          />
          <View style={styles.heroOverlay} />
          
          <View style={styles.heroContent}>
            <Text style={styles.mapName}>Summoner's Rift</Text>
            
            <View style={styles.scoreContainer}>
              <View style={styles.teamScoreSection}>
                <Image
                  source={{ uri: getSafeImageUri(teams[0]?.image) }}
                  style={[
                    styles.teamLogoHero,
                    { opacity: gameScores.hasFinished && gameScores.winningTeam === 2 ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
                <Text style={[styles.teamCodeHero, { color: 'white' }]}>
                  {teams[0]?.code || 'Team 1'}
                </Text>
              </View>
              
              <View style={styles.scoreDisplay}>
                <Text style={[
                  styles.scoreText,
                  { 
                    color: 'white',
                    opacity: gameScores.hasFinished && gameScores.winningTeam === 2 ? 0.6 : 1
                  }
                ]}>
                  {gameScores.team1Score}
                </Text>
                <Text style={[styles.scoreSeparator, { color: 'white' }]}>-</Text>
                <Text style={[
                  styles.scoreText,
                  { 
                    color: 'white',
                    opacity: gameScores.hasFinished && gameScores.winningTeam === 1 ? 0.6 : 1
                  }
                ]}>
                  {gameScores.team2Score}
                </Text>
              </View>
              
              <View style={styles.teamScoreSection}>
                <Image
                  source={{ uri: getSafeImageUri(teams[1]?.image) }}
                  style={[
                    styles.teamLogoHero,
                    { opacity: gameScores.hasFinished && gameScores.winningTeam === 1 ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
                <Text style={[styles.teamCodeHero, { color: 'white' }]}>
                  {teams[1]?.code || 'Team 2'}
                </Text>
              </View>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: theme.success }]}>
              <Text style={styles.statusText}>FINISHED</Text>
            </View>
          </View>
        </View>

        {/* Roster Section */}
        {playerData && (
          <View style={[styles.rosterSection, { backgroundColor: theme.background }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Roster</Text>
            
            <View style={styles.rosterContainer}>
              <View style={styles.teamColumn}>
                <Text style={[styles.teamLabel, { color: theme.text }]}>
                  {teams[0]?.code || 'Team 1'}
                </Text>
                {playerData.team1.map((player, index) => (
                  <View key={index} style={styles.playerRow}>
                    <Image
                      source={{ uri: `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/${player.champion}.png` }}
                      style={styles.championAvatar}
                      resizeMode="cover"
                    />
                    <View style={styles.playerInfo}>
                      <Text style={[styles.playerName, { color: theme.text }]}>
                        {player.name}
                      </Text>
                      <Text style={[styles.championName, { color: theme.textSecondary }]}>
                        {player.champion}
                      </Text>
                      <Text style={[styles.kdaStats, { color: theme.textSecondary }]}>
                        {player.kills}/{player.deaths}/{player.assists}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.teamColumn}>
                <Text style={[styles.teamLabel, { color: theme.text }]}>
                  {teams[1]?.code || 'Team 2'}
                </Text>
                {playerData.team2.map((player, index) => (
                  <View key={index} style={styles.playerRowRight}>
                    <View style={styles.playerInfoRight}>
                      <Text style={[styles.playerNameRight, { color: theme.text }]}>
                        {player.name}
                      </Text>
                      <Text style={[styles.championNameRight, { color: theme.textSecondary }]}>
                        {player.champion}
                      </Text>
                      <Text style={[styles.kdaStatsRight, { color: theme.textSecondary }]}>
                        {player.kills}/{player.deaths}/{player.assists}
                      </Text>
                    </View>
                    <Image
                      source={{ uri: `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/${player.champion}.png` }}
                      style={styles.championAvatar}
                      resizeMode="cover"
                    />
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderTeamStats = (teamData) => {
    if (!teamData) return null;

    const dragons = teamData.dragons || [];
    
    // Debug logging for dragons
    console.log('Team stats data:', teamData);
    console.log('Dragons array:', dragons);
    console.log('Dragons length:', dragons.length);
    dragons.forEach((dragon, index) => {
      console.log(`Dragon ${index}:`, dragon, 'Type:', typeof dragon);
    });

    return (
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={[styles.teamStatsContainer, { backgroundColor: theme.surfaceSecondary, borderTopColor: theme.surfaceSecondary }]}
        contentContainerStyle={styles.teamStatsContent}
      >
        {/* Gold */}
        <View style={styles.statItem}>
          <Text style={[styles.statValue, {color: theme.text}]}>{formatGold(teamData.totalGold || 0)}</Text>
          <Text style={[styles.statLabel, {color: theme.textSecondary}]}>GOLD</Text>
        </View>

        {/* Kills */}
        <View style={styles.statItem}>
          <Text style={[styles.statValue, {color: theme.text}]}>{teamData.totalKills || 0}</Text>
          <Text style={[styles.statLabel, {color: theme.textSecondary}]}>KILLS</Text>
        </View>

        {/* Inhibitors */}
        <View style={styles.statItem}>
          <InhibitorIcon size={20} color={theme.text} />
          <Text style={[styles.statValue, {color: theme.textSecondary}]}>{teamData.inhibitors || 0}</Text>
        </View>

        {/* Towers */}
        <View style={styles.statItem}>
          <TowerIcon size={20} color={theme.text} />
          <Text style={[styles.statValue, {color: theme.textSecondary}]}>{teamData.towers || 0}</Text>
        </View>

        {/* Barons */}
        <View style={styles.statItem}>
          <BaronIcon size={20} color={theme.text} />
          <Text style={[styles.statValue, {color: theme.textSecondary}]}>{teamData.barons || 0}</Text>
        </View>

        {/* Dragons */}
        {dragons.map((dragon, index) => {
          console.log(`Rendering dragon ${index}:`, dragon);
          return (
            <View key={index} style={styles.statItem}>
              <DragonIcon type={dragon} size={24} />
              <Text style={[styles.dragonLabel, {color: theme.textSecondary}]}>{dragon?.toUpperCase()}</Text>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderStatsTab = () => {
    const gameScores = getGameScores();
    const playerData = getPlayerData();

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Hero Section with Map Background */}
        <View style={styles.heroSection}>
          <Image
            source={{ uri: 'https://i.redd.it/wofey4h7koba1.jpg' }}
            style={styles.mapBackground}
            resizeMode="cover"
          />
          <View style={styles.heroOverlay} />
          
          <View style={styles.heroContent}>
            <Text style={styles.mapName}>Summoner's Rift</Text>
            
            <View style={styles.scoreContainer}>
              <View style={styles.teamScoreSection}>
                <Image
                  source={{ uri: getSafeImageUri(teams[0]?.image) }}
                  style={[
                    styles.teamLogoHero,
                    { opacity: gameScores.hasFinished && gameScores.winningTeam === 2 ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
                <Text style={[styles.teamCodeHero, { color: 'white' }]}>
                  {teams[0]?.code || 'Team 1'}
                </Text>
              </View>
              
              <View style={styles.scoreDisplay}>
                <Text style={[
                  styles.scoreText,
                  { 
                    color: 'white',
                    opacity: gameScores.hasFinished && gameScores.winningTeam === 2 ? 0.6 : 1
                  }
                ]}>
                  {gameScores.team1Score}
                </Text>
                <Text style={[styles.scoreSeparator, { color: 'white' }]}>-</Text>
                <Text style={[
                  styles.scoreText,
                  { 
                    color: 'white',
                    opacity: gameScores.hasFinished && gameScores.winningTeam === 1 ? 0.6 : 1
                  }
                ]}>
                  {gameScores.team2Score}
                </Text>
              </View>
              
              <View style={styles.teamScoreSection}>
                <Image
                  source={{ uri: getSafeImageUri(teams[1]?.image) }}
                  style={[
                    styles.teamLogoHero,
                    { opacity: gameScores.hasFinished && gameScores.winningTeam === 1 ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
                <Text style={[styles.teamCodeHero, { color: 'white' }]}>
                  {teams[1]?.code || 'Team 2'}
                </Text>
              </View>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: theme.success }]}>
              <Text style={styles.statusText}>FINISHED</Text>
            </View>
          </View>
        </View>

        {/* Team Stats Tables */}
        {playerData && (
          <View style={styles.statsTabContainer}>
            {/* Team 1 Table */}
            <View style={[styles.teamStatsTable, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.teamStatsHeader, { backgroundColor: theme.surface }]}>
                <Image
                  source={{ uri: getSafeImageUri(teams[0]?.image) }}
                  style={styles.teamStatsLogo}
                  resizeMode="contain"
                />
                <Text style={[styles.teamStatsName, { color: theme.text }]}>
                  {teams[0]?.code || 'Team 1'}
                </Text>
              </View>
              
              <View style={styles.teamStatsBody}>
                {/* Team Summary Row */}
                <TouchableOpacity 
                  style={[styles.teamSummaryRow, { borderBottomColor: theme.border }]}
                  onPress={() => toggleTeamExpanded(0)}
                >
                  <View style={styles.teamSummaryContent}>
                    <Image
                      source={{ uri: getSafeImageUri(teams[0]?.image) }}
                      style={styles.teamSummaryLogo}
                      resizeMode="contain"
                    />
                    <Text style={[styles.teamSummaryNameCentered, { color: theme.text }]}>
                      {teams[0]?.name || 'Team 1'}
                    </Text>
                  </View>
                  <View style={styles.dropdownIcon}>
                    <Ionicons 
                      name={expandedTeams[0] ? "chevron-up" : "chevron-down"} 
                      size={16} 
                      color={theme.textSecondary} 
                    />
                  </View>
                </TouchableOpacity>

                {/* Team Stats (Expanded) */}
                {expandedTeams[0] && renderTeamStats(getTeamStats(0))}
                
                {/* Player Rows */}
                {playerData.team1.map((player, index) => {
                  const isExpanded = expandedRows[`0-${index}`];
                  const detailedData = getDetailedPlayerData(player.participantId);
                  
                  return (
                    <View key={index}>
                      <TouchableOpacity 
                        style={[styles.playerStatsRow, { borderBottomColor: theme.border }]}
                        onPress={() => togglePlayerExpanded(0, index)}
                      >
                        <View style={styles.playerStatsLeft}>
                          <Image
                            source={{ uri: `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/${player.champion}.png` }}
                            style={styles.championAvatarStats}
                            resizeMode="cover"
                          />
                          <View style={styles.playerStatsInfo}>
                            <Text style={[styles.playerStatsName, { color: theme.text }]}>
                              {player.name}
                            </Text>
                            <Text style={[styles.championStatsName, { color: theme.textSecondary }]}>
                              {player.champion}
                            </Text>
                          </View>
                        </View>
                        
                        <View style={styles.playerStatsRight}>
                          <View style={styles.kdaStatsContainer}>
                            <View style={styles.statColumn}>
                              <Text style={[styles.statValue, { color: theme.text }]}>{player.kills}</Text>
                              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>K</Text>
                            </View>
                            <Text style={[styles.statSeparator, { color: theme.textSecondary }]}>|</Text>
                            <View style={styles.statColumn}>
                              <Text style={[styles.statValue, { color: theme.text }]}>{player.deaths}</Text>
                              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>D</Text>
                            </View>
                            <Text style={[styles.statSeparator, { color: theme.textSecondary }]}>|</Text>
                            <View style={styles.statColumn}>
                              <Text style={[styles.statValue, { color: theme.text }]}>{player.assists}</Text>
                              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>A</Text>
                            </View>
                          </View>
                          <View style={styles.dropdownIcon}>
                            <Ionicons 
                              name={isExpanded ? "chevron-up" : "chevron-down"} 
                              size={16} 
                              color={theme.textSecondary} 
                            />
                          </View>
                        </View>
                      </TouchableOpacity>
                      
                      {/* Expanded Content */}
                      {isExpanded && detailedData && (
                        <View style={[styles.expandedContent, { backgroundColor: theme.surfaceSecondary }]}>
                          {/* Stats Section */}
                          <View style={[styles.expandedSection, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>STATS</Text>
                            <View style={styles.statsRow}>
                              <View style={styles.statItem}>
                                <Text style={[styles.statNumber, { color: theme.text }]}>{detailedData.level}</Text>
                                <Text style={[styles.statName, { color: theme.textSecondary }]}>LEVEL</Text>
                              </View>
                              <View style={styles.statItem}>
                                <Text style={[styles.statNumber, { color: theme.text }]}>{formatGold(detailedData.totalGoldEarned || 0)}</Text>
                                <Text style={[styles.statName, { color: theme.textSecondary }]}>GOLD</Text>
                              </View>
                              <View style={styles.statItem}>
                                <Text style={[styles.statNumber, { color: theme.text }]}>{detailedData.creepScore || 0}</Text>
                                <Text style={[styles.statName, { color: theme.textSecondary }]}>SCORE</Text>
                              </View>
                              <View style={styles.statItem}>
                                <Text style={[styles.statNumber, { color: theme.text }]}>{Math.round((detailedData.killParticipation || 0) * 100)}%</Text>
                                <Text style={[styles.statName, { color: theme.textSecondary }]}>KP %</Text>
                              </View>
                            </View>
                          </View>
                          
                          {/* Items Section */}
                          <View style={[styles.expandedSection, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ITEMS</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                              <View style={styles.itemsRow}>
                                {detailedData.items?.map((itemId, itemIndex) => (
                                  <Image
                                    key={itemIndex}
                                    source={{ uri: `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/item/${itemId}.png` }}
                                    style={styles.itemImage}
                                    resizeMode="cover"
                                  />
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                          
                          {/* Abilities Section */}
                          <View style={[styles.expandedSection, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ABILITIES</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                              <View style={styles.abilitiesRow}>
                                {detailedData.abilities?.map((abilitySlot, abilityIndex) => (
                                  <View key={abilityIndex} style={styles.abilityItem}>
                                    <Image
                                      source={{ uri: `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/spell/${player.champion}${abilitySlot}.png` }}
                                      style={styles.abilityImage}
                                      resizeMode="cover"
                                    />
                                    <Text style={[styles.abilityText, { color: theme.text }]}>
                                      {abilityIndex + 1} - {abilitySlot}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Team 2 Table */}
            <View style={[styles.teamStatsTable, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.teamStatsHeader, { backgroundColor: theme.surface }]}>
                <Image
                  source={{ uri: getSafeImageUri(teams[1]?.image) }}
                  style={styles.teamStatsLogo}
                  resizeMode="contain"
                />
                <Text style={[styles.teamStatsName, { color: theme.text }]}>
                  {teams[1]?.code || 'Team 2'}
                </Text>
              </View>
              
              <View style={styles.teamStatsBody}>
                {/* Team Summary Row */}
                <TouchableOpacity 
                  style={[styles.teamSummaryRow, { borderBottomColor: theme.border }]}
                  onPress={() => toggleTeamExpanded(1)}
                >
                  <View style={styles.teamSummaryContent}>
                    <Image
                      source={{ uri: getSafeImageUri(teams[1]?.image) }}
                      style={styles.teamSummaryLogo}
                      resizeMode="contain"
                    />
                    <Text style={[styles.teamSummaryNameCentered, { color: theme.text }]}>
                      {teams[1]?.name || 'Team 2'}
                    </Text>
                  </View>
                  <View style={styles.dropdownIcon}>
                    <Ionicons 
                      name={expandedTeams[1] ? "chevron-up" : "chevron-down"} 
                      size={16} 
                      color={theme.textSecondary} 
                    />
                  </View>
                </TouchableOpacity>

                {/* Team Stats (Expanded) */}
                {expandedTeams[1] && renderTeamStats(getTeamStats(1))}
                
                {/* Player Rows */}
                {playerData.team2.map((player, index) => {
                  const isExpanded = expandedRows[`1-${index}`];
                  const detailedData = getDetailedPlayerData(player.participantId);
                  
                  return (
                    <View key={index}>
                      <TouchableOpacity 
                        style={[styles.playerStatsRow, { borderBottomColor: theme.border }]}
                        onPress={() => togglePlayerExpanded(1, index)}
                      >
                        <View style={styles.playerStatsLeft}>
                          <Image
                            source={{ uri: `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/${player.champion}.png` }}
                            style={styles.championAvatarStats}
                            resizeMode="cover"
                          />
                          <View style={styles.playerStatsInfo}>
                            <Text style={[styles.playerStatsName, { color: theme.text }]}>
                              {player.name}
                            </Text>
                            <Text style={[styles.championStatsName, { color: theme.textSecondary }]}>
                              {player.champion}
                            </Text>
                          </View>
                        </View>
                        
                        <View style={styles.playerStatsRight}>
                          <View style={styles.kdaStatsContainer}>
                            <View style={styles.statColumn}>
                              <Text style={[styles.statValue, { color: theme.text }]}>{player.kills}</Text>
                              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>K</Text>
                            </View>
                            <Text style={[styles.statSeparator, { color: theme.textSecondary }]}>|</Text>
                            <View style={styles.statColumn}>
                              <Text style={[styles.statValue, { color: theme.text }]}>{player.deaths}</Text>
                              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>D</Text>
                            </View>
                            <Text style={[styles.statSeparator, { color: theme.textSecondary }]}>|</Text>
                            <View style={styles.statColumn}>
                              <Text style={[styles.statValue, { color: theme.text }]}>{player.assists}</Text>
                              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>A</Text>
                            </View>
                          </View>
                          <View style={styles.dropdownIcon}>
                            <Ionicons 
                              name={isExpanded ? "chevron-up" : "chevron-down"} 
                              size={16} 
                              color={theme.textSecondary} 
                            />
                          </View>
                        </View>
                      </TouchableOpacity>
                      
                      {/* Expanded Content */}
                      {isExpanded && detailedData && (
                        <View style={[styles.expandedContent, { backgroundColor: theme.surfaceSecondary }]}>
                          {/* Stats Section */}
                          <View style={[styles.expandedSection, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>STATS</Text>
                            <View style={styles.statsRow}>
                              <View style={styles.statItem}>
                                <Text style={[styles.statNumber, { color: theme.text }]}>{detailedData.level}</Text>
                                <Text style={[styles.statName, { color: theme.textSecondary }]}>LEVEL</Text>
                              </View>
                              <View style={styles.statItem}>
                                <Text style={[styles.statNumber, { color: theme.text }]}>{formatGold(detailedData.totalGoldEarned || 0)}</Text>
                                <Text style={[styles.statName, { color: theme.textSecondary }]}>GOLD</Text>
                              </View>
                              <View style={styles.statItem}>
                                <Text style={[styles.statNumber, { color: theme.text }]}>{detailedData.creepScore || 0}</Text>
                                <Text style={[styles.statName, { color: theme.textSecondary }]}>SCORE</Text>
                              </View>
                              <View style={styles.statItem}>
                                <Text style={[styles.statNumber, { color: theme.text }]}>{Math.round((detailedData.killParticipation || 0) * 100)}%</Text>
                                <Text style={[styles.statName, { color: theme.textSecondary }]}>KP %</Text>
                              </View>
                            </View>
                          </View>
                          
                          {/* Items Section */}
                          <View style={[styles.expandedSection, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ITEMS</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                              <View style={styles.itemsRow}>
                                {detailedData.items?.map((itemId, itemIndex) => (
                                  <Image
                                    key={itemIndex}
                                    source={{ uri: `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/item/${itemId}.png` }}
                                    style={styles.itemImage}
                                    resizeMode="cover"
                                  />
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                          
                          {/* Abilities Section */}
                          <View style={[styles.expandedSection, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ABILITIES</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                              <View style={styles.abilitiesRow}>
                                {detailedData.abilities?.map((abilitySlot, abilityIndex) => (
                                  <View key={abilityIndex} style={styles.abilityItem}>
                                    <Image
                                      source={{ uri: `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/spell/${player.champion}${abilitySlot}.png` }}
                                      style={styles.abilityImage}
                                      resizeMode="cover"
                                    />
                                    <Text style={[styles.abilityText, { color: theme.text }]}>
                                      {abilityIndex + 1} - {abilitySlot}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading game details...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Tab Navigation */}
      <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
        {renderTabButton('overview', 'Overview')}
        {renderTabButton('stats', 'Stats')}
      </View>

      {/* Tab Content */}
      <View style={styles.contentContainer}>
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'stats' && renderStatsTab()}
        </ScrollView>
      </View>
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  heroSection: {
    height: 200,
    position: 'relative',
    marginBottom: 20,
  },
  mapBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  heroContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  mapName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  teamScoreSection: {
    alignItems: 'center',
    flex: 1,
  },
  teamLogoHero: {
    width: 60,
    height: 60,
    marginBottom: 8,
  },
  teamCodeHero: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  scoreDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  scoreSeparator: {
    fontSize: 36,
    fontWeight: 'bold',
    marginHorizontal: 12,
  },
  statusBadge: {
    marginTop: -15,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 10,
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  rosterSection: {
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  rosterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  teamColumn: {
    flex: 1,
    marginHorizontal: 8,
  },
  teamLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  playerRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    justifyContent: 'flex-end',
  },
  championAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: 8,
  },
  playerInfo: {
    flex: 1,
  },
  playerInfoRight: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  playerNameRight: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  kdaStats: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 2,
    fontWeight: '500',
  },
  kdaStatsRight: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 2,
    fontWeight: '500',
    textAlign: 'right',
  },
  championName: {
    fontSize: 12,
    marginTop: 2,
  },
  championNameRight: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'right',
  },
  section: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Stats Tab Styles
  statsTabContainer: {
    padding: 16,
    gap: 20,
  },
  teamStatsTable: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  teamStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  teamStatsLogo: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  teamStatsName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  teamStatsBody: {
    // No additional styles needed, container for player rows
  },
  playerStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  playerStatsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  championAvatarStats: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  playerStatsInfo: {
    flex: 1,
  },
  playerStatsName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  championStatsName: {
    fontSize: 12,
  },
  playerStatsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kdaStatsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    justifyContent: 'space-between',
  },
  teamSummaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 12,
  },
  teamSummaryLogo: {
    width: 24,
    height: 24,
  },
  teamSummaryNameCentered: {
    fontSize: 14,
    fontWeight: '600',
  },
  statColumn: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '400',
  },
  statSeparator: {
    fontSize: 14,
    fontWeight: '300',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  statSeparator: {
    fontSize: 14,
    fontWeight: '300',
  },
  dropdownIcon: {
    marginLeft: 4,
  },
  // Expanded Content Styles
  expandedContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  expandedSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statName: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  horizontalScroll: {
    marginHorizontal: -4,
  },
  itemsRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    gap: 8,
  },
  itemImage: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  abilitiesRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    gap: 16,
  },
  abilityItem: {
    alignItems: 'center',
    gap: 4,
  },
  abilityImage: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  abilityText: {
    fontSize: 10,
    fontWeight: '500',
  },
  teamStatsContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  teamStatsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
  },
  dragonLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
    marginTop: 2,
  },
});

export default LOLGameDetailsScreen;
