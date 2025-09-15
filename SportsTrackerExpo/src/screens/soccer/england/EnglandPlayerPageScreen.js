import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { EnglandServiceEnhanced } from '../../../services/soccer/EnglandServiceEnhanced';

// Convert HTTP URLs to HTTPS to avoid mixed content issues
const convertToHttps = (url) => {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

const EnglandPlayerPageScreen = ({ route, navigation }) => {
  const { playerId, playerName, teamId, sport } = route.params;
  const { theme, colors, isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState('Stats');
  const [playerData, setPlayerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [gameLogData, setGameLogData] = useState(null);
  const [gameLog, setGameLog] = useState([]);
  const [loadingGameLog, setLoadingGameLog] = useState(false);
  const [selectedGameStats, setSelectedGameStats] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [careerData, setCareerData] = useState(null);
  const [loadingCareer, setLoadingCareer] = useState(false);
  const [selectedSeasonStats, setSelectedSeasonStats] = useState(null);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [failedLogos, setFailedLogos] = useState(new Set());
  const [leagueNames, setLeagueNames] = useState(new Map());
  

  // Helper function to get team logo URL with fallback
  const getTeamLogoUrl = (teamId, useDarkMode = isDarkMode) => {
    if (!teamId) {
      // Return null for no team ID - will use defaultSource
      return null;
    }
    
    // Create unique keys for different logo attempts
    const primaryKey = `${teamId}-${useDarkMode ? '500-dark' : '500'}`;
    const fallbackKey = `${teamId}-${useDarkMode ? '500' : '500-dark'}`;
    
    // If both primary and fallback have failed, return null to use defaultSource
    if (failedLogos.has(primaryKey) && failedLogos.has(fallbackKey)) {
      return null;
    }
    
    // If primary has failed, try fallback
    if (failedLogos.has(primaryKey)) {
      return `https://a.espncdn.com/i/teamlogos/soccer/${useDarkMode ? '500' : '500-dark'}/${teamId}.png`;
    }
    
    // Try primary first
    return `https://a.espncdn.com/i/teamlogos/soccer/${useDarkMode ? '500-dark' : '500'}/${teamId}.png`;
  };

  // Helper function to handle logo loading errors
  const handleLogoError = (teamId, useDarkMode) => {
    const logoKey = `${teamId}-${useDarkMode ? '500-dark' : '500'}`;
    setFailedLogos(prev => new Set([...prev, logoKey]));
  };

  // Helper function to get team logo fallback URL
  const getTeamLogoFallbackUrl = (teamId, useDarkMode = isDarkMode) => {
    if (!teamId) {
      return require('../../../../assets/soccer.png');
    }
    
    // Return the actual logo URL as default first
    return { uri: `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png` };
  };

  // Helper function to get competition logo URL with fallback logic
  const getCompetitionLogoUrl = (logoId, useDarkMode = isDarkMode) => {
    if (!logoId) return null;
    
    // For dark mode: try 500-dark first
    // For light mode: try 500 first
    if (useDarkMode) {
      return `https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${logoId}.png`;
    } else {
      return `https://a.espncdn.com/i/leaguelogos/soccer/500/${logoId}.png`;
    }
  };

  // Helper function to get competition logo fallback URL (alternate version)
  const getCompetitionLogoFallbackUrl = (logoId, useDarkMode = isDarkMode) => {
    if (!logoId) return null;
    
    // Return the alternate version based on theme
    // If primary dark mode link fails, try light mode (500)
    // If primary light mode link fails, try dark mode (500-dark)
    if (useDarkMode) {
      return `https://a.espncdn.com/i/leaguelogos/soccer/500/${logoId}.png`;
    } else {
      return `https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${logoId}.png`;
    }
  };

  // Custom Competition Logo component with fallback logic
  const CompetitionLogo = ({ logoId, style, useDarkMode = isDarkMode }) => {
    const [currentUrl, setCurrentUrl] = useState(() => getCompetitionLogoUrl(logoId, useDarkMode));
    const [failed, setFailed] = useState(false);
    const logoKey = `${logoId}_${useDarkMode ? 'dark' : 'light'}`;
    
    const handleImageError = () => {
      if (!failed) {
        // Try fallback URL (alternate theme)
        const fallbackUrl = getCompetitionLogoFallbackUrl(logoId, useDarkMode);
        setCurrentUrl(fallbackUrl);
        setFailed(true);
      } else {
        // Both primary and fallback failed, hide the image
        setCurrentUrl(null);
      }
    };

    if (!logoId || currentUrl === null) {
      return null; // Don't render anything if no logo or both URLs failed
    }

    return (
      <Image 
        source={{ uri: currentUrl }}
        style={style}
        onError={handleImageError}
      />
    );
  };

  // Get team color like in team page
  const getTeamColor = (team) => {
    if (!team) return colors.primary;
    
    // Use alternate color if main color is too light/problematic
    const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(team.color);
    
    if (isUsingAlternateColor && team.alternateColor) {
      return `#${team.alternateColor}`;
    } else if (team.color) {
      return `#${team.color}`;
    }
    
    return colors.primary;
  };

  useEffect(() => {
    console.log('EnglandPlayerPageScreen received - playerId:', playerId, 'playerName:', playerName, 'teamId:', teamId);
    fetchPlayerData();
  }, [playerId]);

  // Separate function to fetch player transactions
  const fetchPlayerTransactions = async (currentPlayerData = null) => {
    try {
      console.log(`Fetching transaction history for player ${playerId}...`);
      const transactionResponse = await fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/soccer/athletes/${playerId}/transactions?lang=en&region=us`));
      console.log('Transaction response status:', transactionResponse.status);
      console.log('Transaction response object:', transactionResponse);
      
      if (transactionResponse.ok) {
        const transactionData = await transactionResponse.json();
        console.log('RAW TRANSACTION RESPONSE DATA:');
        console.log('==========================================');
        console.log(JSON.stringify(transactionData, null, 2));
        console.log('==========================================');
        console.log(`Transaction history for player ${playerId}:`, transactionData);
        console.log('Transaction items count:', transactionData?.items?.length || 0);
        
        // Add transactions to player data
        setPlayerData(prevData => ({
          ...prevData,
          transactions: transactionData
        }));
        
        console.log('Transaction data successfully added to playerData');
        
        // Parse each transaction and log the details
        if (transactionData && transactionData.items) {
          transactionData.items.forEach((transaction, index) => {
            const transactionDate = new Date(transaction.date);
            const year = transactionDate.getFullYear();
            const month = transactionDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
            
            // Convert to season year: if month is 1-6 (Jan-Jun), it's part of the previous year's season
            // if month is 7-12 (Jul-Dec), it's part of the current year's season
            let seasonYear;
            if (month >= 1 && month <= 6) {
              seasonYear = year - 1; // January 2022 = 2021 season
            } else {
              seasonYear = year; // August 2021 = 2021 season
            }
            
            // Extract FROM team info
            if (transaction.from && transaction.from.$ref) {
              const fromTeamMatch = transaction.from.$ref.match(/teams\/(\d+)/);
              const fromLeagueMatch = transaction.from.$ref.match(/leagues\/([^\/]+)\/seasons/);
              if (fromTeamMatch && fromLeagueMatch) {
                console.log(`From team: id: ${fromTeamMatch[1]} league: ${fromLeagueMatch[1]}`);
              }
            }
            
            // Extract TO team info
            if (transaction.to && transaction.to.$ref) {
              const toTeamMatch = transaction.to.$ref.match(/teams\/(\d+)/);
              const toLeagueMatch = transaction.to.$ref.match(/leagues\/([^\/]+)\/seasons/);
              if (toTeamMatch && toLeagueMatch) {
                console.log(`To team: id: ${toTeamMatch[1]} league: ${toLeagueMatch[1]}`);
              }
            }
            
            console.log(`Year converted: ${seasonYear}`);
          });
        }
      } else {
        console.log('Failed to fetch transaction history');
      }
    } catch (error) {
      console.log('Error fetching transactions:', error);
    }
  };

  // Effect to load stats when Stats tab is selected
  useEffect(() => {
    if (activeTab === 'Stats' && playerData && !loadingStats) {
      fetchPlayerStats();
    }
  }, [activeTab, playerData]);

  // Effect to load game log when Game Log tab is selected
  useEffect(() => {
    if (activeTab === 'Game Log' && playerData && gameLog.length === 0 && !loadingGameLog) {
      fetchGameLog();
    }
  }, [activeTab, playerData]);

  // Effect to load career data when Career tab is selected
  useEffect(() => {
    if (activeTab === 'Career' && playerData && !careerData && !loadingCareer) {
      console.log('Career tab selected, checking transaction data...');
      console.log('playerData.transactions available:', !!playerData?.transactions);
      fetchCareerData();
    }
  }, [activeTab, playerData, playerData?.transactions]);

  const fetchPlayerData = async () => {
    try {
      setLoading(true);
      console.log('Fetching player data for playerId:', playerId);
      
      // Create a basic player object with the data we have from navigation
      const basicPlayerData = {
        id: playerId,
        displayName: playerName,
        fullName: playerName,
        jersey: '10',
        position: { displayName: 'Forward' }, // Better default than 'Unknown'
        team: { 
          id: teamId, 
          displayName: 'Manchester United', // Better default for eng.1 teams
          name: 'Real Madrid'
        },
        headshot: { href: `https://via.placeholder.com/80x80?text=${playerName?.charAt(0) || 'P'}` }
      };

      // Try to fetch enhanced data from ESPN APIs with better error handling
      try {
        console.log('Attempting to fetch from site API...');
        const siteResponse = await fetch(convertToHttps(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/athletes/${playerId}`), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (siteResponse.ok) {
          const siteData = await siteResponse.json();
          console.log('Site API response:', siteData);
          
          if (siteData && siteData.athlete) {
            // Extract position information more carefully
            let position = { displayName: 'Unknown' };
            if (siteData.athlete.position) {
              position = siteData.athlete.position;
            } else if (siteData.athlete.positions && siteData.athlete.positions.length > 0) {
              position = siteData.athlete.positions[0];
            }
            
            // Extract team information more carefully
            let team = { id: teamId, displayName: 'Team' };
            if (siteData.athlete.team) {
              team = {
                id: siteData.athlete.team.id || teamId,
                displayName: siteData.athlete.team.displayName || siteData.athlete.team.name || 'Team'
              };
            }
            
            // Merge with enhanced data, excluding transactions to prevent overwriting
            const { transactions, ...athleteDataWithoutTransactions } = siteData.athlete;
            
            const enhancedData = {
              ...basicPlayerData,
              ...athleteDataWithoutTransactions,
              displayName: siteData.athlete.displayName || playerName,
              fullName: siteData.athlete.fullName || playerName,
              position: position,
              team: team,
              jersey: siteData.athlete.jersey || siteData.athlete.uniformNumber || '10'
            };
            setPlayerData(enhancedData);
            console.log('Enhanced player data loaded:', enhancedData);
            
            // Fetch transactions for this enhanced player data
            await fetchPlayerTransactions(enhancedData);
            
            return; // Exit early on success
          }
        } else {
          console.log('Site API request failed with status:', siteResponse.status);
        }
      } catch (fetchError) {
        console.log('Site API fetch failed, trying core API...', fetchError.message);
      }
        
      // Fallback to core API
      try {
        const coreResponse = await fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1/athletes/${playerId}?lang=en&region=us`));
        if (coreResponse.ok) {
          const coreData = await coreResponse.json();
          console.log('Core API response:', coreData);
          
          // Extract position from core API
          let position = { displayName: 'Unknown' };
          if (coreData.position) {
            position = coreData.position;
          } else if (coreData.positions && coreData.positions.length > 0) {
            position = coreData.positions[0];
          }
          
          // Extract team from core API with proper $ref handling
          let team = { id: teamId, displayName: 'Team' };
          if (coreData.team) {
            // If team is a $ref, fetch the team data
            if (typeof coreData.team === 'object' && coreData.team.$ref) {
              try {
                const teamResponse = await fetch(convertToHttps(coreData.team.$ref));
                if (teamResponse.ok) {
                  const teamData = await teamResponse.json();
                  team = {
                    id: teamData.id || teamId,
                    displayName: teamData.displayName || teamData.name || teamData.shortDisplayName,
                    name: teamData.name || teamData.displayName,
                    color: teamData.color,
                    alternateColor: teamData.alternateColor
                  };
                }
              } catch (error) {
                console.error('Error fetching team data from $ref:', error);
              }
            } else {
              // Direct team object
              team = {
                id: coreData.team.id || teamId,
                displayName: coreData.team.displayName || coreData.team.name,
                name: coreData.team.name || coreData.team.displayName,
                color: coreData.team.color,
                alternateColor: coreData.team.alternateColor
              };
            }
          }
          
          // Exclude transactions from coreData to prevent overwriting our fetched data
          const { transactions, ...coreDataWithoutTransactions } = coreData;
          
          const enhancedData = {
            ...basicPlayerData,
            ...coreDataWithoutTransactions,
            displayName: coreData.displayName || playerName,
            fullName: coreData.fullName || playerName,
            position: position,
            team: team,
            jersey: coreData.jersey || coreData.uniformNumber || '10'
          };
          setPlayerData(enhancedData);
          console.log('Core API player data loaded:', enhancedData);
          
          // Fetch transactions for this enhanced player data
          await fetchPlayerTransactions(enhancedData);
          
          return; // Exit early on success
        } else {
          console.log('Core API also failed');
        }
      } catch (coreError) {
        console.log('Core API also failed:', coreError.message);
      }
      
      // If all APIs fail, use basic data
      console.log('Using basic player data (all APIs failed)');
      setPlayerData(basicPlayerData);
      
      // Fetch transactions even for basic player data
      await fetchPlayerTransactions(basicPlayerData);
      
    } catch (error) {
      console.error('Error in fetchPlayerData:', error);
      // Fallback to basic data even if everything fails
      const fallbackData = {
        id: playerId,
        displayName: playerName,
        fullName: playerName,
        jersey: null,
        position: { displayName: 'Unknown' },
        team: { id: teamId, displayName: 'Team' },
        headshot: { href: `https://via.placeholder.com/80x80?text=${playerName?.charAt(0) || 'P'}` }
      };
      setPlayerData(fallbackData);
      
      // Try to fetch transactions even for fallback data
      try {
        await fetchPlayerTransactions(fallbackData);
      } catch (transactionError) {
        console.log('Failed to fetch transactions in error fallback:', transactionError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get league display name (from cache or fallback to code)
  const getLeagueDisplayName = (leagueCode) => {
    return leagueNames.get(leagueCode) || leagueCode;
  };

  // Function to fetch and cache league names
  const fetchLeagueName = async (leagueCode) => {
    // Check cache first
    if (leagueNames.has(leagueCode)) {
      return leagueNames.get(leagueCode);
    }

    try {
      const url = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}?lang=en&region=us`;
      console.log(`Fetching league name for ${leagueCode} from:`, url);
      
      const response = await fetch(convertToHttps(url));
      if (!response.ok) {
        console.warn(`Failed to fetch league name for ${leagueCode}: ${response.status}`);
        return leagueCode; // Fallback to code
      }
      
      const data = await response.json();
      const leagueName = data.name || data.displayName || leagueCode;
      
      // Cache the result
      setLeagueNames(prev => new Map(prev.set(leagueCode, leagueName)));
      
      console.log(`League name for ${leagueCode}: ${leagueName}`);
      return leagueName;
    } catch (error) {
      console.error(`Error fetching league name for ${leagueCode}:`, error);
      return leagueCode; // Fallback to code
    }
  };

  const fetchPlayerStats = async () => {
    if (!playerData) return;
    
    setLoadingStats(true);
    try {
      console.log('Fetching player stats for playerId:', playerId);
      
      // Get current year for stats
      const currentYear = new Date().getFullYear();
      
      // Define competitions - all use types/0/ as you specified
      const competitions = [
        { code: 'eng.1', name: 'Premier League', seasonType: '0' },
        { code: 'eng.fa', name: 'FA Cup', seasonType: '0' },
        { code: 'eng.league_cup', name: 'EFL Cup', seasonType: '0' }
      ];
      
      const allStats = {};
      
      // Fetch stats for each competition in parallel
      const statsPromises = competitions.map(async (competition) => {
        try {
          const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition.code}/seasons/${currentYear}/types/${competition.seasonType}/athletes/${playerId}/statistics?lang=en&region=us`;
          console.log(`Fetching ${competition.name} stats from:`, statsUrl);
          
          const response = await fetch(convertToHttps(statsUrl));
          if (!response.ok) {
            console.warn(`Failed to fetch ${competition.name} stats: ${response.status}`);
            return null;
          }
          
          const data = await response.json();
          
          // Check if there are stats available
          if (data.splits?.categories && data.splits.categories.length > 0) {
            console.log(`Found ${competition.name} stats with ${data.splits.categories.length} categories`);
            return {
              competition: competition.name,
              data: data
            };
          } else {
            console.log(`No stats found for ${competition.name}`);
            return null;
          }
        } catch (error) {
          console.error(`Error fetching ${competition.name} stats:`, error);
          return null;
        }
      });
      
      const statsResults = await Promise.all(statsPromises);
      const validStats = statsResults.filter(result => result !== null);
      
      // Organize stats by competition
      validStats.forEach(result => {
        allStats[result.competition] = processTeamPageStats(result.data);
      });
      
      console.log(`Successfully fetched stats for ${Object.keys(allStats).length} competitions:`, Object.keys(allStats));
      setPlayerStats(allStats);
      
    } catch (error) {
      console.error('Error in fetchPlayerStats:', error);
      setPlayerStats({});
    } finally {
      setLoadingStats(false);
    }
  };

  const processTeamPageStats = (statsData) => {
    // Process stats exactly like team-page.js does
    const stats = {};
    
    if (statsData.splits && statsData.splits.categories) {
      statsData.splits.categories.forEach(category => {
        if (category.stats) {
          category.stats.forEach(stat => {
            stats[stat.name] = stat.value;
          });
        }
      });
    }
    
    return { general: stats };
  };

  const fetchGameLog = async () => {
    if (!playerData) return;
    
    setLoadingGameLog(true);
    try {
      console.log('Fetching game log for playerId:', playerId);
      
      // Get current year for eventlog (following fantasy.js pattern exactly)
      const currentYear = new Date().getFullYear();
      
      // England competitions to fetch game logs from
      const competitions = ['eng.1', 'eng.fa', 'eng.league_cup'];
      
      // Fetch game logs from all England competitions in parallel
      const fetchPromises = competitions.map(async (competition) => {
        try {
          const gameLogUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition}/seasons/${currentYear}/athletes/${playerId}/eventlog?lang=en&region=us&played=true`;
          
          console.log(`Fetching ${competition} game log from:`, gameLogUrl);
          
          const gameLogResponse = await fetch(convertToHttps(gameLogUrl));
          
          if (gameLogResponse.ok) {
            const gameLogData = await gameLogResponse.json();
            console.log(`${competition} game log API response:`, gameLogData);
            
            let eventsToProcess = null;
            
            // Handle different possible data structures
            if (gameLogData && gameLogData.events && gameLogData.events.items) {
              eventsToProcess = gameLogData.events.items;
              console.log(`Found events.items array for ${competition} with`, gameLogData.events.count, 'total events');
            } else if (gameLogData && gameLogData.events && Array.isArray(gameLogData.events)) {
              eventsToProcess = gameLogData.events;
            } else if (gameLogData && gameLogData.items) {
              eventsToProcess = gameLogData.items;
            } else if (Array.isArray(gameLogData)) {
              eventsToProcess = gameLogData;
            }
            
            if (eventsToProcess && Array.isArray(eventsToProcess)) {
              console.log(`Processing ${eventsToProcess.length} events from ${competition}`);
              return eventsToProcess;
            }
          } else {
            console.log(`${competition} game log API failed with status:`, gameLogResponse.status);
          }
        } catch (error) {
          console.error(`Error fetching ${competition} game log:`, error);
        }
        return [];
      });

      // Wait for all competitions to complete
      const allCompetitionResults = await Promise.all(fetchPromises);
      
      // Flatten all events into a single array
      const allEvents = allCompetitionResults.flat();
      
      if (allEvents.length > 0) {
        console.log('Processing total of', allEvents.length, 'events from all competitions');
        // Process combined game log
        const processedGameLog = await processFantasyGameLog(allEvents);
        setGameLog(processedGameLog);
        console.log('Combined game log loaded:', processedGameLog.length, 'games');
      } else {
        console.log('No events found in any competition');
        setGameLog([]);
      }
    } catch (error) {
      console.error('Error in fetchGameLog:', error);
      setGameLog([]);
    } finally {
      setLoadingGameLog(false);
    }
  };

  // Function to get competition display name from league code
  const getCompetitionName = (leagueCode) => {
    if (!leagueCode) return 'Unknown';
    
    // Map league codes to display names
    switch (leagueCode) {
      case 'eng.1': 
        return 'Premier League';
      case 'eng.fa':
        return 'FA Cup';
      case 'eng.league_cup':
        return 'EFL Cup';
      default:
        return leagueCode.replace('eng.', '').replace('_', ' ').toUpperCase();
    }
  };

  const processFantasyGameLog = async (events) => {
    // Validate input
    if (!events || !Array.isArray(events)) {
      console.log('Invalid events data passed to processFantasyGameLog:', typeof events);
      return [];
    }
    
    // Process all events in parallel
    const eventPromises = events.map(async (eventData) => {
      try {
        // The event and competition are $ref objects that need to be fetched
        if (eventData && eventData.event && eventData.competition) {
          console.log('Fetching event details for:', eventData.event.$ref);
          
          // Extract league code from the event URL
          const eventUrl = eventData.event.$ref;
          const leagueCodeMatch = eventUrl.match(/\/leagues\/([^\/]+)\//);
          const leagueCode = leagueCodeMatch ? leagueCodeMatch[1] : 'eng.1';
          
          // Fetch event, competition, and stats in parallel
          const [eventResponse, competitionResponse, statsResponse] = await Promise.all([
            fetch(convertToHttps(`${eventData.event.$ref}?lang=en&region=us`)),
            fetch(convertToHttps(`${eventData.competition.$ref}?lang=en&region=us`)),
            eventData.statistics?.$ref ? 
              fetch(convertToHttps(`${eventData.statistics.$ref}?lang=en&region=us`)).catch(() => null) : 
              Promise.resolve(null)
          ]);
          
          if (!eventResponse.ok || !competitionResponse.ok) {
            console.log('Failed to fetch event or competition details');
            return null;
          }
          
          const [event, competition] = await Promise.all([
            eventResponse.json(),
            competitionResponse.json()
          ]);
          
          // Process stats if available
          let stats = {};
          if (statsResponse && statsResponse.ok) {
            try {
              const statsData = await statsResponse.json();
              stats = processEventStats(statsData.splits);
            } catch (statsError) {
              console.log('Failed to process stats:', statsError);
            }
          }
          
          // Get opponent data
          const opponent = await getOpponentFromCompetition(competition, eventData.teamId);
          
          // Determine win/loss/draw result
          const result = determineGameResult(competition, eventData.teamId);
          
          // Build game log entry
          const gameEntry = {
            gameId: event.id,
            date: event.date,
            opponent: opponent,
            isHome: isHomeGame(competition, eventData.teamId),
            result: result, // Add result to game entry
            stats: stats,
            competition: competition,
            played: eventData.played || false,
            venue: event.competitions?.[0]?.venue?.shortName || 'Unknown',
            leagueCode: leagueCode // Pass the extracted league code
          };
          
          console.log('Processed game entry:', gameEntry);
          return gameEntry;
        } else {
          console.log('Missing event or competition data:', eventData);
          return null;
        }
      } catch (error) {
        console.error('Error processing event:', error);
        return null;
      }
    });
    
    // Wait for all events to be processed
    const gameLogEntries = await Promise.all(eventPromises);
    
    // Filter out null entries
    const validEntries = gameLogEntries.filter(entry => entry !== null);
    
    // Deduplicate by gameId to prevent duplicate matches
    const uniqueEntries = validEntries.reduce((acc, current) => {
      const existingIndex = acc.findIndex(entry => entry.gameId === current.gameId);
      if (existingIndex === -1) {
        acc.push(current);
      }
      return acc;
    }, []);
    
    // Sort by date (most recent first)
    return uniqueEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const getOpponentFromCompetition = async (competition, teamId) => {
    console.log('Getting opponent from competition competitors:', competition.competitors, 'for teamId:', teamId);
    if (competition && competition.competitors) {
      const opponent = competition.competitors.find(comp => comp.id !== teamId?.toString());
      console.log('Found opponent:', opponent);
      
      if (opponent && opponent.team && opponent.team.$ref) {
        try {
          // Fetch the actual team data from the $ref
          const teamResponse = await fetch(convertToHttps(`${opponent.team.$ref}?lang=en&region=us`));
          if (teamResponse.ok) {
            const teamData = await teamResponse.json();
            console.log('Fetched opponent team data:', teamData);
            return {
              id: opponent.id,
              displayName: teamData.displayName || teamData.shortDisplayName || 'Unknown Team',
              abbreviation: teamData.abbreviation || 'UNK'
            };
          }
        } catch (error) {
          console.log('Error fetching opponent team data:', error);
        }
      }
      
      // Fallback to basic info if fetch fails
      return opponent ? {
        id: opponent.id,
        displayName: opponent.team?.displayName || 'Unknown Team',
        abbreviation: opponent.team?.abbreviation || 'UNK'
      } : null;
    }
    return null;
  };

  const isHomeGame = (competition, teamId) => {
    console.log('Checking home game for competitors:', competition.competitors, 'teamId:', teamId);
    if (competition && competition.competitors) {
      const homeTeam = competition.competitors.find(comp => comp.homeAway === 'home');
      const isHome = homeTeam ? homeTeam.id === teamId?.toString() : false;
      console.log('Is home game:', isHome, 'homeTeam:', homeTeam);
      return isHome;
    }
    return false;
  };

  const determineGameResult = (competition, teamId) => {
    console.log('Determining game result for competitors:', competition.competitors, 'teamId:', teamId);
    if (competition && competition.competitors) {
      const playerTeam = competition.competitors.find(comp => comp.id === teamId?.toString());
      
      if (playerTeam) {
        // Check if player's team won
        if (playerTeam.winner === true) {
          return { result: 'W', color: 'success' };
        }
        
        // Check if player's team lost
        if (playerTeam.winner === false) {
          // Check if it's a draw (both teams have winner: false)
          const opponentTeam = competition.competitors.find(comp => comp.id !== teamId?.toString());
          if (opponentTeam && opponentTeam.winner === false) {
            return { result: 'D', color: 'warning' };
          } else {
            return { result: 'L', color: 'error' };
          }
        }
      }
    }
    
    // Default fallback
    return { result: 'W', color: 'primary' };
  };

  const processEventStats = (statisticsData) => {
    // Process event statistics from the splits structure
    const stats = {};
    
    if (statisticsData && statisticsData.categories) {
      // Process each category (defensive, general, goalKeeping, offensive)
      statisticsData.categories.forEach(category => {
        if (category.stats) {
          category.stats.forEach(stat => {
            if (stat.name && stat.value !== undefined) {
              stats[stat.name] = stat.value;
            }
          });
        }
      });
    } else if (statisticsData && Array.isArray(statisticsData)) {
      // Handle array format
      statisticsData.forEach(stat => {
        if (stat.name && stat.value !== undefined) {
          stats[stat.name] = stat.value;
        }
      });
    } else if (typeof statisticsData === 'object') {
      // Handle direct object format
      Object.keys(statisticsData).forEach(key => {
        if (statisticsData[key] !== undefined) {
          stats[key] = statisticsData[key];
        }
      });
    }
    
    return stats;
  };

  // Function to combine statistics from multiple teams/leagues (exact copy from team-page.js)
  const combinePlayerStatistics = (allStatsData) => {
    if (allStatsData.length === 0) return null;
    if (allStatsData.length === 1) return allStatsData[0].stats;
    
    console.log('Combining statistics from multiple teams:', allStatsData.map(s => `${s.teamId} (${s.league}) (includeStats: ${s.includeStats !== false})`));
    
    // Check if all teams are from the same league
    const statsToInclude = allStatsData.filter(data => data.includeStats !== false);
    const uniqueLeagues = [...new Set(statsToInclude.map(data => data.league))];
    const isSameLeague = uniqueLeagues.length === 1;
    
    console.log('Same league transfer:', isSameLeague, 'Leagues:', uniqueLeagues);
    
    if (statsToInclude.length === 1) {
      // Only one team has stats to include
      return statsToInclude[0].stats;
    }
    
    // Use the first stats structure as the base (should be FROM team)
    const baseStats = JSON.parse(JSON.stringify(allStatsData[0].stats));
    
    // Combine categories from all stats that should be included
    if (baseStats.splits && baseStats.splits.categories) {
      for (let i = 1; i < statsToInclude.length; i++) {
        const additionalStatsData = statsToInclude[i];
        const additionalStats = additionalStatsData.stats;
        
        if (additionalStats.splits && additionalStats.splits.categories) {
          // Combine each category
          baseStats.splits.categories.forEach(baseCategory => {
            const matchingCategory = additionalStats.splits.categories.find(cat => cat.name === baseCategory.name);
            
            if (matchingCategory && baseCategory.stats && matchingCategory.stats) {
              baseCategory.stats.forEach(baseStat => {
                const matchingStat = matchingCategory.stats.find(stat => stat.name === baseStat.name);
                
                if (matchingStat) {
                  const baseValue = baseStat.value || '0';
                  const additionalValue = matchingStat.value || '0';
                  
                  if (isSameLeague) {
                    // Same league transfer - just add the values normally without "FROM / TO" format
                    const baseNumeric = parseFloat(baseValue) || 0;
                    baseStat.value = baseNumeric;
                    baseStat.displayValue = baseNumeric;
                  } else {
                    // Inter-league transfer - show as "FROM / TO" format
                    baseStat.displayValue = `${baseValue} / ${additionalValue}`;
                    
                    // Keep mathematical sum for internal calculations if needed
                    const baseNumeric = parseFloat(baseValue) || 0;
                    const additionalNumeric = parseFloat(additionalValue) || 0;
                    baseStat.value = (baseNumeric + additionalNumeric).toString();
                  }
                }
              });
            }
          });
        }
      }
    }
    
    console.log('Combined stats with transfer format:', baseStats);
    return baseStats;
  };

  // Function to determine teams and leagues for a player in a given season based on transactions (exact copy from team-page.js)
  const getPlayerTeamsForSeason = (transactions, season) => {
    console.log(`getPlayerTeamsForSeason called with season: ${season}, transactions:`, transactions);
    const teams = [];
    
    if (!transactions || !transactions.items || transactions.items.length === 0) {
      console.log('No transaction data available');
      return teams; // No transaction data available
    }
    
    // Season runs from August of current year to July of next year
    // For season 2021: August 2021 to July 2022
    const seasonStart = new Date(`${season}-08-01`);
    const seasonEnd = new Date(`${season + 1}-07-31`);
    
    // Find all transactions that occurred during this season
    const seasonTransactions = transactions.items.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= seasonStart && transactionDate <= seasonEnd;
    });
    
    console.log(`Season ${season} range: ${seasonStart.toISOString()} to ${seasonEnd.toISOString()}`);
    console.log(`Found ${seasonTransactions.length} transactions for season ${season}:`, seasonTransactions);
    
    if (seasonTransactions.length === 0) {
      console.log('No transfers during this season');
      return teams; // No transfers during this season
    }
    
    // For each transaction, extract team and league info
    seasonTransactions.forEach((transaction, index) => {
      // Extract FROM team info
      if (transaction.from && transaction.from.$ref) {
        const fromTeamMatch = transaction.from.$ref.match(/teams\/(\d+)/);
        const fromLeagueMatch = transaction.from.$ref.match(/leagues\/([^\/]+)\/seasons/);
        if (fromTeamMatch && fromLeagueMatch) {
          console.log(`From team: ID: ${fromTeamMatch[1]} League: ${fromLeagueMatch[1]}`);
          teams.push({
            teamId: fromTeamMatch[1],
            league: fromLeagueMatch[1],
            period: 'from',
            transactionDate: transaction.date,
            order: index * 2
          });
        }
      }
      
      // Extract TO team info
      if (transaction.to && transaction.to.$ref) {
        const toTeamMatch = transaction.to.$ref.match(/teams\/(\d+)/);
        const toLeagueMatch = transaction.to.$ref.match(/leagues\/([^\/]+)\/seasons/);
        if (toTeamMatch && toLeagueMatch) {
          console.log(`To team: ID: ${toTeamMatch[1]} League: ${toLeagueMatch[1]}`);
          teams.push({
            teamId: toTeamMatch[1],
            league: toLeagueMatch[1],
            period: 'to',
            transactionDate: transaction.date,
            order: index * 2 + 1
          });
        }
      }
    });
    
    // Sort by transaction order to maintain from->to sequence
    teams.sort((a, b) => a.order - b.order);
    
    return teams;
  };

  // Main function to load player stats for a specific year (exact copy from team-page.js)
  const loadPlayerStatsForYear = async (playerId, position, year) => {
    try {
      console.log('loadPlayerStatsForYear called for year:', year);
      
      // Get the player's team and league for the specific year
      let teamIdForYear = playerData?.team?.id || ''; // Default to current team
      let leagueForYear = 'eng.1'; // Default to Premier League
      
      // If not current year, try to get team/league for the specific year
      if (year !== new Date().getFullYear()) {
        try {
          const playerSeasonResponse = await fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueForYear}/seasons/${year}/athletes/${playerId}?lang=en&region=us`));
          
          if (playerSeasonResponse.ok) {
            const playerSeasonData = await playerSeasonResponse.json();
            
            // Check for defaultTeam and defaultLeague in season-specific data
            if (playerSeasonData.defaultTeam && playerSeasonData.defaultTeam.$ref) {
              const teamRefMatch = playerSeasonData.defaultTeam.$ref.match(/teams\/(\d+)/);
              if (teamRefMatch) {
                teamIdForYear = teamRefMatch[1];
              }
            }
            
            if (playerSeasonData.defaultLeague && playerSeasonData.defaultLeague.$ref) {
              const leagueRefMatch = playerSeasonData.defaultLeague.$ref.match(/leagues\/([^?]+)/);
              if (leagueRefMatch) {
                leagueForYear = leagueRefMatch[1];
              }
            }
            
            // Fallback to team $ref if defaultTeam not available
            if (!playerSeasonData.defaultTeam && playerSeasonData.team && playerSeasonData.team.$ref) {
              const teamRefMatch = playerSeasonData.team.$ref.match(/teams\/(\d+)/);
              if (teamRefMatch) {
                teamIdForYear = teamRefMatch[1];
              }
            }
          }
        } catch (error) {
          console.log('Error fetching season-specific data:', error);
        }
      }
      
      // Always try ESPN API first for consistency across initial loads and year changes
      // Try to fetch year-specific stats from ESPN API using the correct team/league
      let selectedPlayer = null;
      
      // Check if player has transfer history and get teams for this season
      let allStatsData = [];
      let playerBasicInfo = null;
      let teamsForSeason = [];
      
      // Use transaction data to determine teams for the season
      if (playerData?.transactions) {
        console.log('About to call getPlayerTeamsForSeason with year:', year);
        console.log('playerData.transactions:', playerData.transactions);
        teamsForSeason = getPlayerTeamsForSeason(playerData.transactions, year);
        console.log('teamsForSeason result:', teamsForSeason);
      } else {
        console.log('No transaction data available for getPlayerTeamsForSeason');
      }
      
      // If no transaction data or no transfers in this season, use current/default team approach
      if (teamsForSeason.length === 0) {
        try {
          const espnResponse = await fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueForYear}/seasons/${year}/athletes/${playerId}?lang=en&region=us`));
          if (espnResponse.ok) {
            const espnData = await espnResponse.json();
            playerBasicInfo = espnData;
            
            // Add current team/league
            if (espnData.team && espnData.team.$ref) {
              const teamMatch = espnData.team.$ref.match(/teams\/(\d+)/);
              const leagueMatch = espnData.team.$ref.match(/leagues\/([^\/]+)\/seasons/);
              if (teamMatch && leagueMatch) {
                teamsForSeason.push({ teamId: teamMatch[1], league: leagueMatch[1], period: 'current' });
              }
            }
            
            // Add default team if different
            if (espnData.defaultTeam && espnData.defaultTeam.$ref) {
              const defaultTeamMatch = espnData.defaultTeam.$ref.match(/teams\/(\d+)/);
              if (defaultTeamMatch) {
                const defaultTeamId = defaultTeamMatch[1];
                let defaultLeague = leagueForYear;
                
                if (espnData.defaultLeague && espnData.defaultLeague.$ref) {
                  const defaultLeagueMatch = espnData.defaultLeague.$ref.match(/leagues\/([^?]+)/);
                  if (defaultLeagueMatch) {
                    defaultLeague = defaultLeagueMatch[1];
                  }
                }
                
                // Only add if different
                const isDifferentTeam = !teamsForSeason.some(t => t.teamId === defaultTeamId && t.league === defaultLeague);
                if (isDifferentTeam) {
                  teamsForSeason.push({ teamId: defaultTeamId, league: defaultLeague, period: 'default' });
                }
              }
            }
          }
        } catch (e) {
          console.log('Error fetching ESPN data:', e);
        }
      }
      
      // If still no teams, use fallback
      if (teamsForSeason.length === 0) {
        teamsForSeason.push({ teamId: teamIdForYear, league: leagueForYear, period: 'fallback' });
      }
      
      // Check if this is a transfer year before fetching stats
      let isTransferYear = false;
      let transferInfo = null;
      
      console.log('Checking for transfer in year:', year);
      if (playerData && playerData.transactions) {
        console.log('Searching through transactions for year:', year);
        const transferInThisYear = playerData.transactions.items?.find(transaction => {
          const transactionDate = new Date(transaction.date);
          const transactionYear = transactionDate.getFullYear();
          const month = transactionDate.getMonth() + 1;
          
          let seasonYear;
          if (month >= 8) {
            // August to December belongs to current year's season
            seasonYear = transactionYear;
          } else {
            // January to July belongs to previous year's season
            seasonYear = transactionYear - 1;
          }
          
          console.log(`Transaction date: ${transaction.date}, calculated season year: ${seasonYear}, target year: ${year}, match: ${seasonYear === year}`);
          return seasonYear === year;
        });
        
        if (transferInThisYear) {
          isTransferYear = true;
          console.log('Transfer found for year:', year, transferInThisYear);
          
          // Extract team info from transfer
          const fromTeamMatch = transferInThisYear.from?.$ref?.match(/teams\/(\d+)/);
          const fromLeagueMatch = transferInThisYear.from?.$ref?.match(/leagues\/([^\/]+)\/seasons/);
          const toTeamMatch = transferInThisYear.to?.$ref?.match(/teams\/(\d+)/);
          const toLeagueMatch = transferInThisYear.to?.$ref?.match(/leagues\/([^\/]+)\/seasons/);
          
          if (fromTeamMatch && toTeamMatch && fromLeagueMatch && toLeagueMatch) {
            transferInfo = {
              fromTeamId: fromTeamMatch[1],
              fromLeague: fromLeagueMatch[1],
              toTeamId: toTeamMatch[1],
              toLeague: toLeagueMatch[1]
            };
            console.log(`Transfer year detected: From ${transferInfo.fromTeamId} (${transferInfo.fromLeague}) to ${transferInfo.toTeamId} (${transferInfo.toLeague})`);
          }
        }
      }
      
      // Fetch statistics from all teams for this season
      for (const teamInfo of teamsForSeason) {
        try {
          const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${teamInfo.league}/seasons/${year}/types/0/athletes/${playerId}/statistics?lang=en&region=us`;
          const statsResponse = await fetch(convertToHttps(statsUrl));
          
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            
            if (statsData.splits && statsData.splits.categories) {
              // Check if this is the TO team in a transfer year
              let shouldIncludeStats = true;
              let isToTeam = false;
              
              if (isTransferYear && transferInfo && teamInfo.teamId === transferInfo.toTeamId) {
                isToTeam = true;
                // Check appearances for TO team
                const appearancesCategory = statsData.splits.categories.find(cat => cat.name === 'general');
                if (appearancesCategory) {
                  const appearancesStat = appearancesCategory.stats.find(stat => stat.name === 'appearances');
                  if (appearancesStat && appearancesStat.value === 0) {
                    console.log(`TO team ${teamInfo.teamId} has 0 appearances, excluding stats but including competitions`);
                    shouldIncludeStats = false;
                  }
                }
              }
              
              allStatsData.push({
                teamId: teamInfo.teamId,
                league: teamInfo.league,
                period: teamInfo.period,
                stats: statsData,
                includeStats: shouldIncludeStats,
                isToTeam: isToTeam
              });
            }
          } else {
            console.log(`Failed to fetch stats for team ${teamInfo.teamId}: ${statsResponse.status}`);
          }
        } catch (e) {
          console.log(`Error fetching stats for team ${teamInfo.teamId}:`, e);
        }
      }
      
      // Combine all statistics if we have multiple sources
      if (allStatsData.length > 0) {
        console.log('DEBUG: allStatsData length:', allStatsData.length);
        const combinedStats = combinePlayerStatistics(allStatsData);
        selectedPlayer = {
          id: playerId,
          ...playerBasicInfo,
          statistics: combinedStats,
          allStatsData: allStatsData,
          transferInfo: transferInfo,
          teamsForSeason: teamsForSeason,
          transactions: playerData?.transactions
        };
      }
      
      return selectedPlayer;
      
    } catch (error) {
      console.error('Error in loadPlayerStatsForYear:', error);
      return null;
    }
  };

  const fetchCareerData = async () => {
    if (!playerData?.id) {
      console.log('No player ID available for career data. PlayerData:', playerData);
      return;
    }
    
    setLoadingCareer(true);
    try {
      console.log('Fetching career data for player ID:', playerId);
      console.log('Current playerData in fetchCareerData:', playerData);
      console.log('playerData.transactions available:', !!playerData?.transactions);
      console.log('playerData.transactions items count:', playerData?.transactions?.items?.length || 0);
      
      // We'll fetch career stats from multiple years (current and past 4 years)
      const currentYear = new Date().getFullYear();
      const yearsToFetch = [];
      for (let i = 0; i < 5; i++) {
        yearsToFetch.push(currentYear - i);
      }
      
      // Process all years in parallel, but handle transfers within each year
      const careerPromises = yearsToFetch.map(async (year) => {
        try {
          console.log(`Fetching career stats for year: ${year}`);
          
          // Check if player has transfer history and get teams for this season
          let teamsForSeason = [];
          
          // Use transaction data to determine teams for the season
          if (playerData?.transactions) {
            console.log('Using transaction data to find teams for year:', year);
            teamsForSeason = getPlayerTeamsForSeason(playerData.transactions, year);
            console.log('Teams found for season:', teamsForSeason);
          }
          
          // If no transaction data or no transfers in this season, use fallback approach
          if (teamsForSeason.length === 0) {
            console.log('No transaction data available, using fallback approach for year:', year);
            
            // Try multiple leagues to find where the player was in this year (in parallel)
            const leaguesToTry = ['eng.1', 'eng.fa', 'eng.league_cup', 'esp.1', 'fra.1', 'ger.1', 'ita.1', 'usa.1', 'ksa.1'];
            
            const playerSeasonPromises = leaguesToTry.map(async (league) => {
              try {
                const playerSeasonResponse = await fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${league}/seasons/${year}/athletes/${playerId}?lang=en&region=us`));
                if (playerSeasonResponse.ok) {
                  const playerSeasonData = await playerSeasonResponse.json();
                  
                  if (playerSeasonData.defaultTeam && playerSeasonData.defaultTeam.$ref) {
                    const teamRefMatch = playerSeasonData.defaultTeam.$ref.match(/teams\/(\d+)/);
                    if (teamRefMatch) {
                      let leagueForYear = league;
                      if (playerSeasonData.defaultLeague && playerSeasonData.defaultLeague.$ref) {
                        const leagueRefMatch = playerSeasonData.defaultLeague.$ref.match(/leagues\/([^?]+)/);
                        if (leagueRefMatch) {
                          leagueForYear = leagueRefMatch[1];
                        }
                      }
                      
                      return {
                        teamId: teamRefMatch[1],
                        league: leagueForYear,
                        found: true
                      };
                    }
                  }
                }
                return { found: false };
              } catch (error) {
                return { found: false };
              }
            });

            const playerSeasonResults = await Promise.all(playerSeasonPromises);
            const foundData = playerSeasonResults.find(result => result.found);
            
            if (foundData) {
              teamsForSeason.push({
                teamId: foundData.teamId,
                league: foundData.league,
                period: 'fallback'
              });
            } else {
              // Use current team as absolute fallback
              teamsForSeason.push({
                teamId: teamId,
                league: 'eng.1',
                period: 'current'
              });
            }
          }
          
          // Now fetch stats for each team the player was at during this season
          const teamStatsPromises = teamsForSeason.map(async (teamInfo, index) => {
            try {
              console.log(`Fetching stats for team ${teamInfo.teamId} in league ${teamInfo.league} for year ${year} (${teamInfo.period})`);
              
              // Fetch stats, team data, and competitions in parallel
              const [statsResponse, teamResponse, competitions] = await Promise.allSettled([
                fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${teamInfo.league}/seasons/${year}/types/0/athletes/${playerId}/statistics?lang=en&region=us`)),
                fetch(convertToHttps(`https://site.api.espn.com/apis/site/v2/sports/soccer/${teamInfo.league}/teams/${teamInfo.teamId}`)),
                fetchCompetitionsForYear(playerId, teamInfo.league, year)
              ]);
              
              // Process stats response
              if (statsResponse.status === 'fulfilled' && statsResponse.value.ok) {
                const statsData = await statsResponse.value.json();
                
                if (statsData.splits && statsData.splits.categories) {
                  // Process team data
                  let teamData = null;
                  if (teamResponse.status === 'fulfilled' && teamResponse.value.ok) {
                    try {
                      const teamInfo_response = await teamResponse.value.json();
                      teamData = teamInfo_response.team;
                    } catch (e) {
                      console.log(`Error parsing team data for ${teamInfo.teamId}:`, e);
                    }
                  }
                  
                  // Process competitions
                  const competitionsData = competitions.status === 'fulfilled' ? competitions.value : [];
                  
                  console.log(`Successfully fetched stats for team ${teamInfo.teamId} in year ${year}`);
                  
                  // Create unique identifier for transfer situations - use simple index for uniqueness
                  const seasonKey = teamsForSeason.length > 1 ? 
                    `${year}` : 
                    year.toString();
                  
                  return {
                    season: seasonKey,
                    displaySeason: year.toString(),
                    league: teamInfo.league,
                    team: teamData || { id: teamInfo.teamId, displayName: 'Unknown Team' },
                    statistics: statsData,
                    competitions: competitionsData,
                    transferPeriod: teamInfo.period,
                    transferDate: teamInfo.transactionDate || null,
                    isTransferYear: teamsForSeason.length > 1
                  };
                }
              } else {
                console.log(`No stats available for team ${teamInfo.teamId} in year ${year}`);
              }
              
              return null;
            } catch (error) {
              console.log(`Error fetching stats for team ${teamInfo.teamId} in year ${year}:`, error);
              return null;
            }
          });
          
          // Wait for all teams in this season to complete
          const seasonResults = await Promise.all(teamStatsPromises);
          return seasonResults.filter(result => result !== null);
          
        } catch (error) {
          console.log(`Error fetching stats for year ${year}:`, error);
          return [];
        }
      });
      
      // Wait for all years to complete processing
      const careerResults = await Promise.all(careerPromises);
      
      // Flatten results (since each year can have multiple teams) and sort
      const careerStats = careerResults
        .flat()
        .filter(result => result !== null)
        .sort((a, b) => {
          // Sort by display season first, then by transfer order
          const yearA = parseInt(a.displaySeason);
          const yearB = parseInt(b.displaySeason);
          if (yearA !== yearB) {
            return yearB - yearA; // Newest first
          }
          // Within same year, sort by transfer order (to team first, then from team)
          if (a.transferPeriod === 'to' && b.transferPeriod === 'from') return -1;
          if (a.transferPeriod === 'from' && b.transferPeriod === 'to') return 1;
          return 0;
        });
      
      console.log('Final career data with transfers:', careerStats);
      
      // Extract unique league codes and fetch their names
      const uniqueLeagues = [...new Set(careerStats.map(stat => stat.league).filter(Boolean))];
      console.log('Unique leagues found in career data:', uniqueLeagues);
      
      // Fetch league names for all unique leagues
      const leagueNamePromises = uniqueLeagues.map(leagueCode => fetchLeagueName(leagueCode));
      await Promise.all(leagueNamePromises);
      
      setCareerData({ seasons: careerStats });
      
    } catch (error) {
      console.error('Error fetching career data:', error);
    } finally {
      setLoadingCareer(false);
    }
  };

  // Helper function to fetch competitions for a specific year
  const fetchCompetitionsForYear = async (playerId, leagueCode, year) => {
    console.log(`Fetching competitions for player ${playerId} in league ${leagueCode} for year ${year}`);
    const competitions = [];
    
    // Define competitions based on league (matching team-page.js)
    const LEAGUE_COMPETITIONS = {
      "eng.1": [
    { code: "eng.fa", name: "FA Cup", logo: "40" },
    { code: "eng.league_cup", name: "EFL Cup", logo: "41" }
  ],
  "esp.1": [
    { code: "esp.copa_del_rey", name: "Copa del Rey", logo: "80" },
    { code: "esp.super_cup", name: "Spanish Supercopa", logo: "431" }
  ],
  "ger.1": [
    { code: "ger.dfb_pokal", name: "DFB Pokal", logo: "2061" },
    { code: "ger.super_cup", name: "German Super Cup", logo: "2315" }
  ],
  "ita.1": [
    { code: "ita.coppa_italia", name: "Coppa Italia", logo: "2192" },
    { code: "ita.super_cup", name: "Italian Supercoppa", logo: "2316" }
  ],
  "fra.1": [
    { code: "fra.coupe_de_france", name: "Coupe de France", logo: "182" },
    { code: "fra.super_cup", name: "Trophee des Champions", logo: "2345" }
  ],
  "usa.1": [
    { code: "usa.open", name: "US Open Cup", logo: "69" }
  ],
  "ksa.1": [
    { code: "ksa.kings.cup", name: "Saudi King's Cup", logo: "2490" }
  ]
    };
    
    const leagueCompetitions = LEAGUE_COMPETITIONS[leagueCode] || [];
    console.log(`Found ${leagueCompetitions.length} competitions for league ${leagueCode}:`, leagueCompetitions.map(c => c.name));
    
    for (const competition of leagueCompetitions) {
      try {
        const compUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition.code}/seasons/${year}/types/0/athletes/${playerId}/statistics?lang=en&region=us`;
        console.log(`Fetching ${competition.name} from: ${compUrl}`);
        const response = await fetch(convertToHttps(compUrl));
        
        if (response.ok) {
          const data = await response.json();
          if (data.splits && data.splits.categories) {
            console.log(`Successfully fetched ${competition.name} stats for ${year}`);
            competitions.push({
              ...competition,
              statistics: data
            });
          } else {
            console.log(`${competition.name} response OK but no stats data for ${year}`);
          }
        } else {
          console.log(`Failed to fetch ${competition.name} for ${year}: ${response.status}`);
        }
      } catch (error) {
        console.log(`Error fetching ${competition.name} stats for ${year}:`, error);
      }
    }
    
    console.log(`Final competitions found for ${year}:`, competitions.map(c => c.name));
    return competitions;
  };

  const renderPlayerHeader = () => {
    if (!playerData) return null;

    const teamColor = getTeamColor(playerData.team);

    return (
      <View style={[styles.playerHeader, { backgroundColor: theme.surface }]}>
        <View style={[styles.jerseyCircle, { backgroundColor: teamColor }]}>
          <Text style={[styles.jerseyNumber, { color: 'white' }]}>
            {playerData.jersey || '10'}
          </Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={[styles.playerName, { color: theme.text }]}>
            {playerData.displayName || playerName}
          </Text>
          <View style={styles.playerDetailsRow}>
            {playerData.team && playerData.team.id && (
              <View style={styles.teamContainer}>
                <Image 
                  source={getTeamLogoUrl(playerData.team.id, isDarkMode) ? 
                    { uri: getTeamLogoUrl(playerData.team.id, isDarkMode) } : 
                    require('../../../../assets/soccer.png')}
                  style={styles.teamLogo}
                  defaultSource={getTeamLogoFallbackUrl(playerData.team.id, isDarkMode)}
                  onError={() => handleLogoError(playerData.team.id, isDarkMode)}
                />
                <Text style={[styles.teamName, { color: theme.textSecondary, fontWeight: 'bold' }]}>
                  {playerData.team.displayName || playerData.team.name || ''}
                </Text>
              </View>
            )}
            <Text style={[styles.playerDetails, { color: theme.textSecondary }]}>
            • {playerData.position?.displayName || 'N/A'}
            </Text>
            
          </View>
        </View>
      </View>
    );
  };

  const renderTabButtons = () => {
    const tabs = ['Stats', 'Game Log', 'Career'];
    
    return (
      <>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabButton,
              activeTab === tab && styles.activeTabButton,
              { borderBottomColor: activeTab === tab ? colors.primary : 'transparent' }
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.tabText,
              activeTab === tab && styles.activeTabText,
              { color: activeTab === tab ? colors.primary : theme.textSecondary }
            ]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Stats':
        return renderStatsContent();
      case 'Game Log':
        return renderGameLogContent();
      case 'Career':
        return renderCareerContent();
      default:
        return renderStatsContent();
    }
  };

  const renderStatsContent = () => {
    if (loadingStats) {
      return (
        <View style={[styles.statsLoadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>Loading stats...</Text>
        </View>
      );
    }

    if (!playerStats || Object.keys(playerStats).length === 0) {
      return (
        <View style={[styles.statsContainer, { backgroundColor: theme.background }]}>
          <Text style={[styles.contentText, { color: theme.textSecondary }]}>
            No stats available
          </Text>
        </View>
      );
    }

    const renderStatBox = (label, value, key) => (
      <View key={key} style={[styles.statBox, { backgroundColor: theme.surface }]}>
        <Text style={[styles.statBoxValue, { color: theme.text }]}>
          {value || '0'}
        </Text>
        <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>
          {label}
        </Text>
      </View>
    );

    const renderStatsGrid = (stats, statDefinitions) => {
      const rows = [];
      for (let i = 0; i < statDefinitions.length; i += 3) {
        const rowStats = statDefinitions.slice(i, i + 3);
        rows.push(
          <View key={i} style={styles.statsRow}>
            {rowStats.map(({ key, label }) => renderStatBox(label, stats[key] || '0', key))}
          </View>
        );
      }
      return rows;
    };

    const renderCompetitionStats = (competitionName, stats) => {
      if (!stats || !stats.general) return null;

      return (
        <View key={competitionName} style={styles.statsSection}>
          <Text style={[styles.statsSectionTitle, { color: colors.primary }]}>
            {competitionName} Stats
          </Text>
          {renderStatsGrid(
            stats.general,
            [
              { key: 'appearances', label: 'Apps' },
              { key: 'totalGoals', label: 'Goals' },
              { key: 'goalAssists', label: 'Assists' },
              { key: 'minutes', label: 'Minutes' },
              { key: 'yellowCards', label: 'Yellow Cards' },
              { key: 'redCards', label: 'Red Cards' },
              { key: 'totalShots', label: 'Shots' },
              { key: 'shotsOnTarget', label: 'Shots on Target' },
              { key: 'totalPasses', label: 'Passes' },
              { key: 'accuratePasses', label: 'Passes Completed' },
              { key: 'totalTackles', label: 'Tackles' },
              { key: 'interceptions', label: 'Interceptions' },
              { key: 'totalClearance', label: 'Clearances' },
              { key: 'saves', label: 'Saves' },
              { key: 'cleanSheet', label: 'Clean Sheets' }
            ]
          )}
        </View>
      );
    };

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.statsContent}>
          {Object.entries(playerStats).map(([competitionName, stats]) => 
            renderCompetitionStats(competitionName, stats)
          )}
        </View>
      </ScrollView>
    );
  };

  const renderGameLogContent = () => {
    if (loadingGameLog) {
      return (
        <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading game log...</Text>
        </View>
      );
    }

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.statsContent}>
          {gameLog.length === 0 ? (
            <Text style={[styles.contentText, { color: theme.textSecondary }]}>
              No recent games available
            </Text>
          ) : (
            gameLog.map((game, index) => (
              <TouchableOpacity
                key={game.gameId || index}
                style={[styles.mlbGameCard, { backgroundColor: theme.surface }]}
                onPress={() => {
                  setSelectedGameStats(game);
                  setShowStatsModal(true);
                }}
              >
                {/* Date Header */}
                <View style={[styles.mlbGameHeader, {backgroundColor: theme.surfaceSecondary}]}>
                  <Text style={[styles.mlbGameDate, { color: theme.text }]}>
                    {new Date(game.date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </Text>
                </View>

                {/* Player Info Row */}
                <View style={styles.mlbPlayerRow}>
                  {/* Jersey Number Circle */}
                  <View style={[styles.jerseyCircle, { backgroundColor: getTeamColor(playerData?.team) }]}>
                    <Text style={[styles.jerseyNumber, { color: 'white' }]}>
                      {playerData?.jersey || '10'}
                    </Text>
                  </View>

                  {/* Player Name and Stats */}
                  <View style={styles.mlbPlayerInfo}>
                    <Text style={[styles.mlbPlayerName, { color: theme.text }]}>
                      {playerData?.displayName || playerData?.fullName || 'Player'}
                    </Text>
                    <Text style={[styles.mlbPlayerStats, { color: theme.textSecondary }]}>
                      G: {game.stats?.totalGoals || 0} | A: {game.stats?.goalAssists || 0} | MP: {game.stats?.minutesPlayed || game.stats?.minutes || 0}
                    </Text>
                  </View>

                  {/* Win Indicator */}
                  <View style={[styles.mlbWinIndicator, { 
                    backgroundColor: game.result?.color === 'success' ? theme.success : 
                                    game.result?.color === 'error' ? theme.error :
                                    game.result?.color === 'warning' ? theme.warning : colors.primary
                  }]}>
                    <Text style={[styles.mlbWinText, { color: 'white' }]}>
                      {game.result?.result || 'W'}
                    </Text>
                  </View>
                </View>

                {/* Match Info Row */}
                <View style={[styles.mlbMatchRow, { borderTopColor: theme.surfaceSecondary }]}>
                  <View style={styles.mlbTeamLogos}>
                    <Image 
                      source={getTeamLogoUrl(playerData?.team?.id || teamId, isDarkMode) ? 
                        { uri: getTeamLogoUrl(playerData?.team?.id || teamId, isDarkMode) } : 
                        require('../../../../assets/soccer.png')}
                      style={styles.mlbTeamLogo}
                      defaultSource={getTeamLogoFallbackUrl(playerData?.team?.id || teamId, isDarkMode)}
                      onError={() => handleLogoError(playerData?.team?.id || teamId, isDarkMode)}
                    />
                    <Text style={[styles.mlbVersus, { color: theme.textSecondary }]}>
                      {game.isHome ? 'vs' : '@'}
                    </Text>
                    <Image 
                      source={getTeamLogoUrl(game.opponent?.id || '86', isDarkMode) ? 
                        { uri: getTeamLogoUrl(game.opponent?.id || '86', isDarkMode) } : 
                        require('../../../../assets/soccer.png')}
                      style={styles.mlbTeamLogo}
                      defaultSource={getTeamLogoFallbackUrl(game.opponent?.id || '86', isDarkMode)}
                      onError={() => handleLogoError(game.opponent?.id || '86', isDarkMode)}
                    />
                  </View>
                  <Text style={[styles.mlbOpponentName, { color: theme.text }]}>
                    {getCompetitionName(game.leagueCode)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    );
  };

  const renderCareerContent = () => {
    if (loadingCareer) {
      return (
        <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading career statistics...</Text>
        </View>
      );
    }

    if (!careerData || !careerData.seasons || careerData.seasons.length === 0) {
      return (
        <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
          <Text style={[styles.contentText, { color: theme.textSecondary }]}>No career data available</Text>
        </View>
      );
    }

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.careerContainer}>
          <Text style={[styles.careerSectionTitle, { color: colors.primary }]}>Soccer Career</Text>
          {careerData.seasons.map((season, index) => renderCareerSeasonItem(season, index))}
        </View>
      </ScrollView>
    );
  };

  const renderCareerSeasonItem = (season, index) => {
    if (!season || !season.season) {
      return null;
    }

    // Check if player is a goalkeeper
    const playerPosition = playerData?.position?.displayName?.toLowerCase() || '';
    const isGoalkeeper = playerPosition.includes('goalkeeper') || playerPosition.includes('goalie') || playerPosition === 'gk';

    // Extract main stats from categories
    const getStatValue = (statName, categoryName = 'general') => {
      const category = season.statistics?.splits?.categories?.find(c => c.name === categoryName);
      const stat = category?.stats?.find(s => s.name === statName);
      return stat?.displayValue || stat?.value || '0';
    };

    const minutes = getStatValue('minutes');
    const appearances = getStatValue('appearances');
    
    // Define stats based on position
    let primaryStat1, primaryStat2, stat1Label, stat2Label;
    
    if (isGoalkeeper) {
      primaryStat1 = getStatValue('cleanSheet', 'goalKeeping');
      primaryStat2 = getStatValue('goalsAgainst', 'goalKeeping');
      stat1Label = 'CS';
      stat2Label = 'GA';
    } else {
      primaryStat1 = getStatValue('totalGoals', 'offensive');
      primaryStat2 = getStatValue('goalAssists', 'offensive');
      stat1Label = 'Goals';
      stat2Label = 'Assists';
    }

    const handleSeasonPress = () => {
      setSelectedSeasonStats(season);
      setShowSeasonModal(true);
    };

    return (
      <TouchableOpacity 
        key={`${season.season}-${index}`}
        style={[styles.careerSeasonCard, { backgroundColor: theme.surface }]}
        onPress={handleSeasonPress}
        activeOpacity={0.7}
      >
        <View style={styles.careerSeasonHeader}>
          <View style={styles.careerTeamInfo}>
            <Image 
              source={getTeamLogoUrl(season.team.id, isDarkMode) ? 
                { uri: getTeamLogoUrl(season.team.id, isDarkMode) } : 
                require('../../../../assets/soccer.png')}
              style={styles.careerTeamLogo}
              defaultSource={getTeamLogoFallbackUrl(season.team.id, isDarkMode)}
              onError={() => handleLogoError(season.team.id, isDarkMode)}
            />
            <Text style={[styles.careerTeamName, { color: theme.textSecondary }]}>
              {season.team.displayName || season.team.name || 'Unknown Team'}
            </Text>
          </View>
          <Text style={[styles.careerSeasonYear, { color: theme.text }]}>{season.season}</Text>
        </View>
        
        {/* Main League Stats */}
        <View style={styles.careerStatsRow}>
          <View style={styles.careerStatItem}>
            <Text style={[styles.careerStatValue, { color: theme.text }]}>{appearances}</Text>
            <Text style={[styles.careerStatLabel, { color: theme.textSecondary }]}>Apps</Text>
          </View>
          <View style={styles.careerStatItem}>
            <Text style={[styles.careerStatValue, { color: theme.text }]}>{minutes}</Text>
            <Text style={[styles.careerStatLabel, { color: theme.textSecondary }]}>Minutes</Text>
          </View>
          <View style={styles.careerStatItem}>
            <Text style={[styles.careerStatValue, { color: theme.text }]}>{primaryStat1}</Text>
            <Text style={[styles.careerStatLabel, { color: theme.textSecondary }]}>{stat1Label}</Text>
          </View>
          <View style={styles.careerStatItem}>
            <Text style={[styles.careerStatValue, { color: theme.text }]}>{primaryStat2}</Text>
            <Text style={[styles.careerStatLabel, { color: theme.textSecondary }]}>{stat2Label}</Text>
          </View>
        </View>

        {/* Competition Stats */}
        {season.competitions && season.competitions.length > 0 && (
          <View style={styles.competitionsContainer}>
            <Text style={[styles.competitionsTitle, { color: theme.textSecondary }]}>Competitions:</Text>
            {season.competitions.map((competition, compIndex) => {
              const compApps = competition.statistics?.splits?.categories?.find(c => c.name === 'general')?.stats?.find(s => s.name === 'appearances')?.displayValue || '0';
              
              let compStat1, compStat2, compStat1Label, compStat2Label;
              
              if (isGoalkeeper) {
                compStat1 = competition.statistics?.splits?.categories?.find(c => c.name === 'general')?.stats?.find(s => s.name === 'cleanSheet')?.displayValue || '0';
                compStat2 = competition.statistics?.splits?.categories?.find(c => c.name === 'general')?.stats?.find(s => s.name === 'goalsAgainst')?.displayValue || '0';
                compStat1Label = 'CS';
                compStat2Label = 'GA';
              } else {
                compStat1 = competition.statistics?.splits?.categories?.find(c => c.name === 'offensive')?.stats?.find(s => s.name === 'totalGoals')?.displayValue || '0';
                compStat2 = competition.statistics?.splits?.categories?.find(c => c.name === 'offensive')?.stats?.find(s => s.name === 'goalAssists')?.displayValue || '0';
                compStat1Label = 'Goal' + (compStat1 === '1' ? '' : 's');
                compStat2Label = 'Assist' + (compStat2 === '1' ? '' : 's');
              }
              
              return (
                <View key={compIndex} style={styles.competitionRow}>
                  <CompetitionLogo 
                    logoId={competition.logo}
                    style={styles.competitionLogo}
                    useDarkMode={isDarkMode}
                  />
                  <Text style={[styles.competitionName, { color: theme.textSecondary }]}>{competition.name}</Text>
                  <View style={styles.competitionStats}>
                    <Text style={[styles.competitionStatText, { color: theme.text }]}>{compApps} App{compApps === '1' ? '' : 's'}</Text>
                    <Text style={[styles.competitionStatText, { color: theme.text }]}>{compStat1} {compStat1Label}</Text>
                    <Text style={[styles.competitionStatText, { color: theme.text }]}>{compStat2} {compStat2Label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSeasonModal = () => {
    if (!selectedSeasonStats) return null;

    const season = selectedSeasonStats;
    
    return (
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={showSeasonModal}
        onRequestClose={() => setShowSeasonModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
            <TouchableOpacity 
              onPress={() => setShowSeasonModal(false)}
              style={styles.modalCloseButton}
            >
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {season.season} Season Statistics
            </Text>
            <View style={styles.modalPlaceholder} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.modalSeasonHeader, { backgroundColor: theme.surface }]}>
              <View style={styles.modalSeasonTopRow}>
                <View style={styles.modalSeasonInfo}>
                  <Text style={[styles.modalSeasonYear, { color: theme.text }]}>{season.season}</Text>
                  <Text style={[styles.modalLeagueName, { color: theme.textSecondary }]}>
                    {getLeagueDisplayName(season.league)}
                  </Text>
                </View>
                <View style={styles.modalTeamContainer}>
                  <Image 
                    source={getTeamLogoUrl(season.team.id, isDarkMode) ? 
                      { uri: getTeamLogoUrl(season.team.id, isDarkMode) } : 
                      require('../../../../assets/soccer.png')}
                    style={styles.modalSeasonTeamLogo}
                    defaultSource={getTeamLogoFallbackUrl(season.team.id, isDarkMode)}
                    onError={() => handleLogoError(season.team.id, isDarkMode)}
                  />
                  <Text style={[styles.modalTeamName, { color: theme.text }]}>
                    {season.team.displayName || season.team.name || 'Unknown Team'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Main League Statistics */}
            {season.statistics && renderSeasonStatistics('Main League', season.statistics)}
            
            {/* Competition Statistics */}
            {season.competitions && season.competitions.map((competition, index) => 
              renderSeasonStatistics(competition.name, competition.statistics, competition.logo)
            )}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  const renderSeasonStatistics = (title, statistics, logo = null) => {
    if (!statistics || !statistics.splits || !statistics.splits.categories) {
      return null;
    }

    const renderStatsGrid = (stats, categoryName) => {
      const statsRows = [];
      for (let i = 0; i < stats.length; i += 3) {
        const rowStats = stats.slice(i, i + 3);
        statsRows.push(
          <View key={i} style={styles.modalStatsGrid}>
            {rowStats.map((stat, index) => (
              <View key={index} style={[styles.modalStatCard, { backgroundColor: theme.surface }]}>
                <Text style={[styles.modalStatCardValue, { color: theme.text }]}>
                  {stat.displayValue || stat.value || '0'}
                </Text>
                <Text style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>
                  {stat.displayName || stat.name}
                </Text>
              </View>
            ))}
          </View>
        );
      }
      return statsRows;
    };

    return (
      <View key={title} style={styles.modalStatsSection}>
        <View style={styles.modalSectionTitleContainer}>
          {logo && (
            <CompetitionLogo 
              logoId={logo}
              style={styles.modalSectionLogo}
              useDarkMode={isDarkMode}
            />
          )}
          <Text style={[styles.modalSectionTitle, { color: colors.primary }]}>{title}</Text>
        </View>
        
        {statistics.splits.categories.map((category, categoryIndex) => (
          <View key={categoryIndex}>
            <Text style={[styles.modalCategoryTitle, { color: theme.text }]}>
              {category.displayName || category.name.charAt(0).toUpperCase() + category.name.slice(1)}
            </Text>
            {renderStatsGrid(category.stats || [], category.name)}
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading player...</Text>
      </View>
    );
  }

  const renderGameStatsDetails = (gameStats) => {
    if (!gameStats.stats) return null;

    return (
      <View style={styles.statsGrid}>
        {Object.entries(gameStats.stats).map(([key, value]) => (
          <View key={key} style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{key.toUpperCase()}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderGameStatistics = (gameData) => {
    if (!gameData || !gameData.stats) {
      return (
        <View style={styles.modalStatsSection}>
          <Text style={[styles.modalSectionTitle, { color: colors.primary }]}>Game Statistics</Text>
          <Text style={[styles.contentText, { color: theme.textSecondary, textAlign: 'center', marginTop: 20 }]}>
            No statistics available for this game
          </Text>
        </View>
      );
    }

    // Define stat categories and their display order
    const statDefinitions = [
      { key: 'totalGoals', label: 'Goals' },
      { key: 'goalAssists', label: 'Assists' },
      { key: 'minutesPlayed', label: 'Minutes' },
      { key: 'totalShots', label: 'Shots' },
      { key: 'shotsOnTarget', label: 'Shots on Target' },
      { key: 'passingAccuracy', label: 'Pass Accuracy' },
      { key: 'totalPasses', label: 'Total Passes' },
      { key: 'keyPasses', label: 'Key Passes' },
      { key: 'touches', label: 'Touches' },
      { key: 'tackles', label: 'Tackles' },
      { key: 'interceptions', label: 'Interceptions' },
      { key: 'foulsCommitted', label: 'Fouls' },
      { key: 'yellowCards', label: 'Yellow Cards' },
      { key: 'redCards', label: 'Red Cards' },
      { key: 'saves', label: 'Saves' },
      { key: 'savePercentage', label: 'Save %' }
    ];

    // Filter stat definitions to only show stats that exist in the data
    const availableStats = statDefinitions.filter(stat => 
      gameData.stats[stat.key] !== undefined && gameData.stats[stat.key] !== null
    );

    const renderStatBox = (label, value, key) => (
      <View key={key} style={[styles.statBox, { backgroundColor: theme.surface }]}>
        <Text style={[styles.statBoxValue, { color: theme.text }]}>
          {value || '0'}
        </Text>
        <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>
          {label}
        </Text>
      </View>
    );

    const renderStatsGrid = (stats, statDefinitions) => {
      const rows = [];
      for (let i = 0; i < statDefinitions.length; i += 3) {
        const rowStats = statDefinitions.slice(i, i + 3);
        rows.push(
          <View key={i} style={styles.statsRow}>
            {rowStats.map(({ key, label }) => {
              const value = stats[key];
              // Format percentage values
              const displayValue = key.includes('Percentage') || key.includes('Accuracy') ? 
                `${(parseFloat(value) || 0).toFixed(1)}%` : 
                (value || '0').toString();
              return renderStatBox(label, displayValue, key);
            })}
          </View>
        );
      }
      return rows;
    };

    return (
      <View style={styles.modalStatsSection}>
        <Text style={[styles.modalSectionTitle, { color: colors.primary, marginBottom: 20 }]}>Game Statistics</Text>
        {renderStatsGrid(gameData.stats, availableStats)}
      </View>
    );
  };

  const renderSeasonStatsDetails = (seasonData) => {
    if (!seasonData.stats || !seasonData.stats.splits) return null;

    const categories = seasonData.stats.splits.categories;
    
    return (
      <View>
        {categories.map((category, index) => (
          <View key={index} style={styles.categorySection}>
            <Text style={[styles.categoryTitle, { color: theme.text }]}>
              {category.displayName || category.name.charAt(0).toUpperCase() + category.name.slice(1)}
            </Text>
            <View style={styles.statsGrid}>
              {category.stats.map((stat, statIndex) => (
                <View key={statIndex} style={styles.statItem}>
                  <Text style={[styles.statValue, { color: theme.text }]}>{stat.displayValue}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{stat.displayName}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderPlayerHeader()}
      
      <View style={[styles.fixedTabContainer, { backgroundColor: theme.surface }]}>
        {renderTabButtons()}
      </View>
      
      <ScrollView 
        style={[styles.contentScrollView, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>

      {/* Game Stats Modal */}
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={showStatsModal}
        onRequestClose={() => setShowStatsModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
            <TouchableOpacity 
              onPress={() => setShowStatsModal(false)}
              style={styles.modalCloseButton}
            >
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Game Statistics
            </Text>
            <View style={styles.modalPlaceholder} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {selectedGameStats && (
              <>
                {/* Player Header */}
                <View style={[styles.playerHeaderLog, { backgroundColor: theme.surface, marginBottom: 15 }]}>
                  <View style={[styles.jerseyCircle, { backgroundColor: getTeamColor(playerData?.team) }]}>
                    <Text style={[styles.jerseyNumber, { color: 'white' }]}>
                      {playerData?.jersey || ''}
                    </Text>
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={[styles.playerName, { color: theme.text }]}>
                      {playerData?.displayName || playerName}
                    </Text>
                    <View style={styles.playerDetailsRow}>
                      {playerData?.team && playerData.team.id && (
                        <View style={styles.teamContainer}>
                          <Image 
                            source={getTeamLogoUrl(playerData.team.id, isDarkMode) ? 
                              { uri: getTeamLogoUrl(playerData.team.id, isDarkMode) } : 
                              require('../../../../assets/soccer.png')}
                            style={styles.teamLogo}
                            defaultSource={getTeamLogoFallbackUrl(playerData.team.id, isDarkMode)}
                            onError={() => handleLogoError(playerData.team.id, isDarkMode)}
                          />
                          <Text style={[styles.teamName, { color: theme.textSecondary, fontWeight: 'bold' }]}>
                            {playerData.team.displayName || playerData.team.name || ''}
                          </Text>
                        </View>
                      )}
                      <Text style={[styles.playerDetails, { color: theme.textSecondary }]}>
                      • {playerData?.position?.displayName || 'N/A'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Game Header - Date and Competition Only */}
                <View style={[styles.modalSeasonHeader, { backgroundColor: theme.surface }]}>
                  <View style={styles.modalSeasonTopRow}>
                    <View style={[styles.modalSeasonInfo, { alignItems: 'center', flex: 1 }]}>
                      <Text style={[styles.modalSeasonYear, { color: theme.text }]}>
                        {new Date(selectedGameStats.date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          month: 'long', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </Text>
                      <Text style={[styles.modalLeagueName, { color: theme.textSecondary }]}>
                        {getCompetitionName(selectedGameStats.leagueCode)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Game Statistics */}
                {renderGameStatistics(selectedGameStats)}

                {/* Team Matchup - Moved to bottom */}
                <TouchableOpacity 
                  style={[styles.modalSeasonHeader, { backgroundColor: theme.surface, marginTop: -5 }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (selectedGameStats.gameId) {
                      setShowStatsModal(false);
                      setTimeout(() => {
                        navigation.navigate('EnglandGameDetails', {
                          gameId: selectedGameStats.gameId,
                          sport: 'English',
                          competition: selectedGameStats.competition || 'eng.1',
                          homeTeam: selectedGameStats.isHome ? playerData?.team : selectedGameStats.opponent,
                          awayTeam: selectedGameStats.isHome ? selectedGameStats.opponent : playerData?.team
                        });
                      }, 300);
                    }
                  }}
                >
                  <View style={[styles.modalSeasonTopRow, { justifyContent: 'center' }]}>
                    <View style={styles.modalTeamContainer}>
                      <View style={styles.mlbTeamLogos}>
                        <Image 
                          source={getTeamLogoUrl(playerData?.team?.id || teamId, isDarkMode) ? 
                            { uri: getTeamLogoUrl(playerData?.team?.id || teamId, isDarkMode) } : 
                            require('../../../../assets/soccer.png')}
                          style={styles.modalSeasonTeamLogo}
                          defaultSource={getTeamLogoFallbackUrl(playerData?.team?.id || teamId, isDarkMode)}
                          onError={() => handleLogoError(playerData?.team?.id || teamId, isDarkMode)}
                        />
                        <Text style={[styles.mlbVersus, { color: theme.textSecondary, fontSize: 16, marginHorizontal: 12 }]}>
                          {selectedGameStats.isHome ? 'vs' : '@'}
                        </Text>
                        <Image 
                          source={getTeamLogoUrl(selectedGameStats.opponent?.id || '86', isDarkMode) ? 
                            { uri: getTeamLogoUrl(selectedGameStats.opponent?.id || '86', isDarkMode) } : 
                            require('../../../../assets/soccer.png')}
                          style={styles.modalSeasonTeamLogo}
                          defaultSource={getTeamLogoFallbackUrl(selectedGameStats.opponent?.id || '86', isDarkMode)}
                          onError={() => handleLogoError(selectedGameStats.opponent?.id || '86', isDarkMode)}
                        />
                      </View>
                      <Text style={[styles.modalTeamName, { color: theme.text, marginTop: 8 }]}>
                        {playerData?.team?.displayName || 'Team'} {selectedGameStats.isHome ? 'vs' : '@'} {selectedGameStats.opponent?.displayName || 'Opponent'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Season Stats Modal */}
      {renderSeasonModal()}
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
    marginTop: 10,
    fontSize: 16,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  playerHeaderLog: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
  },
  playerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  playerDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  playerName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 16,
    marginBottom: 0,
    marginLeft: 5,
  },
  teamContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -2,
  },
  teamLogo: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '500',
  },
  fixedTabContainer: {
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  contentScrollView: {
    flex: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomWidth: 3,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: 'bold',
  },
  statsContainer: {
    flex: 1,
  },
  statsContent: {
    padding: 15,
  },
  contentText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Stats styles
  statsLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  statsSection: {
    marginBottom: 25,
  },
  statsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  fantasyPointsCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  fantasyPointsValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  fantasyPointsLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    gap: 10,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 15,
    minHeight: 80,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statBoxValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statBoxLabel: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  // MLB-style Game Log Styles
  mlbGameCard: {
    marginBottom: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  mlbGameHeader: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 8,
    paddingHorizontal: 15,
    alignItems: 'center',
  },
  mlbGameDate: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  mlbPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  jerseyCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  jerseyNumber: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  mlbPlayerInfo: {
    flex: 1,
  },
  mlbPlayerName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  mlbPlayerStats: {
    fontSize: 12,
    fontWeight: '500',
  },
  mlbWinIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mlbWinText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  mlbMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  mlbTeamLogos: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mlbTeamLogo: {
    width: 24,
    height: 24,
  },
  mlbVersus: {
    fontSize: 12,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  mlbOpponentName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Career section styles
  // Career section styles (matching team-page.js)
  yearSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  yearPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 80,
  },
  yearPickerText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  yearPickerArrow: {
    fontSize: 10,
  },
  careerStatsContainer: {
    flex: 1,
  },
  seasonTeamInfo: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  seasonTeamTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  teamSeasonInfo: {
    fontSize: 14,
    marginBottom: 4,
  },
  statsCategories: {
    flex: 1,
  },
  transferInfo: {
    marginTop: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  transferTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  transferText: {
    fontSize: 14,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 16,
    textAlign: 'center',
  },
  seasonCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  seasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seasonInfo: {
    flex: 1,
  },
  seasonYear: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  teamName: {
    fontSize: 14,
  },
  seasonStats: {
    alignItems: 'flex-end',
  },
  quickStats: {
    flexDirection: 'row',
    gap: 12,
  },
  viewDetails: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalStatsContainer: {
    flex: 1,
  },
  modalSubtitle: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  seasonTeamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    padding: 16,
  },
  modalTeamLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  modalTeamName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  // Career section styles (matching MLB PlayerPageScreen)
  careerContainer: {
    padding: 15,
  },
  careerSection: {
    marginBottom: 25,
  },
  careerSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  careerSeasonCard: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  careerSeasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  careerSeasonYear: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  careerTeamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  careerTeamLogo: {
    width: 30,
    height: 30,
    marginRight: 8,
  },
  careerTeamName: {
    fontSize: 14,
    fontWeight: '500',
  },
  careerStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  careerStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  careerStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  careerStatLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Competition styles within career cards
  competitionsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  competitionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  competitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  competitionLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  competitionName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  competitionStats: {
    flexDirection: 'row',
    gap: 10,
  },
  competitionStatText: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Modal styles (matching MLB PlayerPageScreen)
  modalPlaceholder: {
    width: 60,
  },
  modalSeasonHeader: {
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
  },
  modalSeasonTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalSeasonInfo: {
    alignItems: 'flex-start',
  },
  modalSeasonYear: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  modalLeagueName: {
    fontSize: 14,
  },
  modalTeamContainer: {
    alignItems: 'center',
  },
  modalSeasonTeamLogo: {
    width: 50,
    height: 50,
    marginBottom: 8,
  },
  modalStatsSection: {
    marginBottom: 24,
  },
  modalSectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalSectionLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  modalCategoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  modalStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  modalStatCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 12,
    width: '30%',
    minHeight: 70,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalStatCardValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalStatCardLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default EnglandPlayerPageScreen;
