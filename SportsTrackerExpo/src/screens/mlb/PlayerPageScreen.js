import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const PlayerPageScreen = ({ route, navigation }) => {
  const { playerId, playerName, teamId, sport } = route.params;
  const { theme, colors, isDarkMode, getTeamLogoUrl: getThemeTeamLogoUrl } = useTheme();
  const [activeTab, setActiveTab] = useState('Stats');
  const [playerData, setPlayerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [leagueStats, setLeagueStats] = useState(null);
  const [statRankings, setStatRankings] = useState(null);
  const [gameLogData, setGameLogData] = useState(null);
  const [loadingGameLog, setLoadingGameLog] = useState(false);
  const [selectedGameStats, setSelectedGameStats] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [careerData, setCareerData] = useState(null);
  const [loadingCareer, setLoadingCareer] = useState(false);
  const [selectedSeasonStats, setSelectedSeasonStats] = useState(null);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [vsTeamStats, setVsTeamStats] = useState(null);
  const [loadingVsTeam, setLoadingVsTeam] = useState(false);

  useEffect(() => {
    console.log('PlayerPageScreen received - playerId:', playerId, 'playerName:', playerName, 'teamId:', teamId);
    fetchPlayerData();
  }, [playerId]);

  // Effect to load stats when Stats tab is selected or month changes
  useEffect(() => {
    if (activeTab === 'Stats' && playerData && !loadingStats) {
      fetchPlayerStats();
    }
  }, [activeTab, playerData, selectedMonth]);

  // Effect to load game log when Game Log tab is selected
  useEffect(() => {
    if (activeTab === 'Game Log' && playerData && !gameLogData && !loadingGameLog) {
      fetchGameLog();
    }
  }, [activeTab, playerData]);

  // Effect to load career data when Career tab is selected
  useEffect(() => {
    if (activeTab === 'Career' && playerData && !careerData && !loadingCareer) {
      fetchCareerData();
    }
  }, [activeTab, playerData]);

  // Effect to load VS Team data when VS Team tab is selected and team is chosen
  useEffect(() => {
    if (activeTab === 'VS Team' && selectedTeam && playerData && !loadingVsTeam) {
      fetchVsTeamStats();
    }
  }, [activeTab, selectedTeam, playerData]);

  const fetchPlayerData = async () => {
    try {
      // Fetch player basic info from MLB API
      const url = `https://statsapi.mlb.com/api/v1/people/${playerId}`;
      console.log('Fetching player data from:', url);
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('Player API response:', data);
      
      if (data.people && data.people.length > 0) {
        const player = data.people[0];
        
        // Fetch player stats to get current team
        await fetchPlayerTeamFromStats(player);
        
        setPlayerData(player);
      } else {
        console.log('No player data found in response');
      }
    } catch (error) {
      console.error('Error fetching player data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayerTeamFromStats = async (player) => {
    try {
      const position = player.primaryPosition?.name || '';
      const isPitcher = position.toLowerCase().includes('pitcher');
      const isTwoWay = position.toLowerCase().includes('two-way');
      
      console.log('Player position:', position, 'isPitcher:', isPitcher, 'isTwoWay:', isTwoWay);
      
      let statsUrl;
      if (isPitcher) {
        statsUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=pitching&season=2025`;
      } else if (isTwoWay) {
        // For two-way players, we'll fetch hitting stats first, then pitching if needed
        statsUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=2025`;
      } else {
        statsUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=2025`;
      }
      
      console.log('Fetching player stats from:', statsUrl);
      const statsResponse = await fetch(statsUrl);
      const statsData = await statsResponse.json();
      
      console.log('Player stats response:', statsData);
      
      // Extract team from stats
      if (statsData.stats && statsData.stats.length > 0) {
        const seasonStats = statsData.stats[0];
        if (seasonStats.splits && seasonStats.splits.length > 0) {
          const teamData = seasonStats.splits[0].team;
          if (teamData) {
            console.log('Found team from stats:', teamData);
            // Add the team data to the player object
            player.currentTeam = teamData;
          }
        }
      }
      
      // If no team found and it's a two-way player, try pitching stats
      if (!player.currentTeam && isTwoWay) {
        const pitchingStatsUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=pitching&season=2025`;
        console.log('Fetching two-way player pitching stats from:', pitchingStatsUrl);
        
        const pitchingResponse = await fetch(pitchingStatsUrl);
        const pitchingData = await pitchingResponse.json();
        
        if (pitchingData.stats && pitchingData.stats.length > 0) {
          const pitchingSeasonStats = pitchingData.stats[0];
          if (pitchingSeasonStats.splits && pitchingSeasonStats.splits.length > 0) {
            const teamData = pitchingSeasonStats.splits[0].team;
            if (teamData) {
              console.log('Found team from pitching stats:', teamData);
              player.currentTeam = teamData;
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Error fetching player team from stats:', error);
    }
  };

  const fetchGameLog = async () => {
    if (!playerData) return;
    
    setLoadingGameLog(true);
    try {
      const currentYear = new Date().getFullYear();
      const position = playerData.primaryPosition?.name || '';
      const isPitcher = position.toLowerCase().includes('pitcher');
      const isTwoWay = position.toLowerCase().includes('two-way');
      
      console.log('Fetching game log - Position:', position, 'isPitcher:', isPitcher, 'isTwoWay:', isTwoWay);
      
      let gameLogData = {};
      
      if (isPitcher) {
        // Fetch pitching game log
        const pitchingResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&group=pitching&season=${currentYear}&gameType=R&gameType=D&gameType=L&gameType=W&gameType=F`);
        const pitchingData = await pitchingResponse.json();
        gameLogData.pitching = pitchingData.stats?.[0]?.splits || [];
        
      } else if (isTwoWay) {
        // Fetch both hitting and pitching game logs for two-way players
        const hittingResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&group=hitting&season=${currentYear}&gameType=R&gameType=D&gameType=L&gameType=W&gameType=F`);
        const hittingData = await hittingResponse.json();
        
        const pitchingResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&group=pitching&season=${currentYear}&gameType=R&gameType=D&gameType=L&gameType=W&gameType=F`);
        const pitchingData = await pitchingResponse.json();
        
        gameLogData.hitting = hittingData.stats?.[0]?.splits || [];
        gameLogData.pitching = pitchingData.stats?.[0]?.splits || [];
        
      } else {
        // Fetch hitting game log
        const hittingResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&group=hitting&season=${currentYear}&gameType=R&gameType=D&gameType=L&gameType=W&gameType=F`);
        const hittingData = await hittingResponse.json();
        gameLogData.hitting = hittingData.stats?.[0]?.splits || [];
      }
      
      console.log('Game log data:', gameLogData);
      setGameLogData(gameLogData);
      
    } catch (error) {
      console.error('Error fetching game log:', error);
    } finally {
      setLoadingGameLog(false);
    }
  };

  const fetchCareerData = async () => {
    if (!playerData?.id) {
      console.log('No player ID available for career data. PlayerData:', playerData);
      return;
    }
    
    setLoadingCareer(true);
    try {
      const position = playerData.primaryPosition?.name || '';
      const isPitcher = position.toLowerCase().includes('pitcher');
      const isTwoWay = position.toLowerCase().includes('two-way');
      
      console.log('Fetching career data - Player ID:', playerId, 'Position:', position, 'isPitcher:', isPitcher, 'isTwoWay:', isTwoWay);
      
      let careerStats = {};
      
      if (isPitcher) {
        // Fetch pitching career stats
        const url = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=yearByYear&group=pitching`;
        console.log('Fetching pitching career from:', url);
        const pitchingResponse = await fetch(url);
        const pitchingData = await pitchingResponse.json();
        console.log('Pitching career response:', pitchingData);
        careerStats.pitching = pitchingData.stats?.[0]?.splits || [];
        
      } else if (isTwoWay) {
        // Fetch both hitting and pitching career stats for two-way players
        const hittingUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=yearByYear&group=hitting`;
        const pitchingUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=yearByYear&group=pitching`;
        
        console.log('Fetching hitting career from:', hittingUrl);
        const hittingResponse = await fetch(hittingUrl);
        const hittingData = await hittingResponse.json();
        console.log('Hitting career response:', hittingData);
        
        console.log('Fetching pitching career from:', pitchingUrl);
        const pitchingResponse = await fetch(pitchingUrl);
        const pitchingData = await pitchingResponse.json();
        console.log('Pitching career response:', pitchingData);
        
        careerStats.hitting = hittingData.stats?.[0]?.splits || [];
        careerStats.pitching = pitchingData.stats?.[0]?.splits || [];
        
      } else {
        // Fetch hitting career stats
        const url = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=yearByYear&group=hitting`;
        console.log('Fetching hitting career from:', url);
        const hittingResponse = await fetch(url);
        const hittingData = await hittingResponse.json();
        console.log('Hitting career response:', hittingData);
        careerStats.hitting = hittingData.stats?.[0]?.splits || [];
      }
      
      console.log('Final career data:', careerStats);
      console.log('Career data keys:', Object.keys(careerStats));
      console.log('Hitting data length:', careerStats.hitting?.length);
      console.log('Pitching data length:', careerStats.pitching?.length);
      setCareerData(careerStats);
      
    } catch (error) {
      console.error('Error fetching career data:', error);
    } finally {
      setLoadingCareer(false);
    }
  };

  const fetchVsTeamStats = async () => {
    if (!playerData?.id || !selectedTeam?.id) {
      console.log('No player ID or selected team available for VS Team data');
      return;
    }
    
    setLoadingVsTeam(true);
    try {
      const currentYear = new Date().getFullYear();
      const position = playerData.primaryPosition?.name || '';
      const isPitcher = position.toLowerCase().includes('pitcher');
      const isTwoWay = position.toLowerCase().includes('two-way');
      
      console.log('Fetching VS Team data - Player ID:', playerId, 'vs Team ID:', selectedTeam.id, 'Position:', position);
      
      let vsTeamStatsData = {};
      
      if (isPitcher) {
        // Fetch pitching VS team stats
        const pitchingUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=vsTeam&group=pitching&season=${currentYear}&opposingTeamId=${selectedTeam.id}`;
        console.log('Fetching pitching VS team from:', pitchingUrl);
        const pitchingResponse = await fetch(pitchingUrl);
        const pitchingData = await pitchingResponse.json();
        console.log('Pitching VS team response:', pitchingData);
        // Find the vsTeamTotal stats (not individual pitcher breakdowns)
        const pitchingTotalStats = pitchingData.stats?.find(stat => stat.type?.displayName === 'vsTeamTotal');
        
        vsTeamStatsData.pitching = pitchingTotalStats?.splits?.[0]?.stat || {};
        
      } else if (isTwoWay) {
        // Fetch both hitting and pitching VS team stats for two-way players
        const hittingUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=vsTeam&group=hitting&season=${currentYear}&opposingTeamId=${selectedTeam.id}`;
        const pitchingUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=vsTeam&group=pitching&season=${currentYear}&opposingTeamId=${selectedTeam.id}`;
        
        console.log('Fetching hitting VS team from:', hittingUrl);
        const hittingResponse = await fetch(hittingUrl);
        const hittingData = await hittingResponse.json();
        console.log('Hitting VS team response:', hittingData);
        
        console.log('Fetching pitching VS team from:', pitchingUrl);
        const pitchingResponse = await fetch(pitchingUrl);
        const pitchingData = await pitchingResponse.json();
        console.log('Pitching VS team response:', pitchingData);
        
        // Find the vsTeamTotal stats (not individual pitcher breakdowns)
        const hittingTotalStats = hittingData.stats?.find(stat => stat.type?.displayName === 'vsTeamTotal');
        const pitchingTotalStats = pitchingData.stats?.find(stat => stat.type?.displayName === 'vsTeamTotal');
        
        vsTeamStatsData.hitting = hittingTotalStats?.splits?.[0]?.stat || {};
        vsTeamStatsData.pitching = pitchingTotalStats?.splits?.[0]?.stat || {};
        
      } else {
        // Fetch hitting VS team stats
        const hittingUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=vsTeam&group=hitting&season=${currentYear}&opposingTeamId=${selectedTeam.id}`;
        console.log('Fetching hitting VS team from:', hittingUrl);
        const hittingResponse = await fetch(hittingUrl);
        const hittingData = await hittingResponse.json();
        console.log('Hitting VS team response:', hittingData);
        // Find the vsTeamTotal stats (not individual pitcher breakdowns)
        const hittingTotalStats = hittingData.stats?.find(stat => stat.type?.displayName === 'vsTeamTotal');
        
        vsTeamStatsData.hitting = hittingTotalStats?.splits?.[0]?.stat || {};
      }
      
      console.log('Final VS team data:', vsTeamStatsData);
      setVsTeamStats(vsTeamStatsData);
      
    } catch (error) {
      console.error('Error fetching VS team data:', error);
    } finally {
      setLoadingVsTeam(false);
    }
  };

  const fetchPlayerStats = async () => {
    if (!playerData) return;
    
    setLoadingStats(true);
    try {
      const currentYear = new Date().getFullYear();
      const position = playerData.primaryPosition?.name || '';
      const isPitcher = position.toLowerCase().includes('pitcher');
      const isTwoWay = position.toLowerCase().includes('two-way');
      
      console.log('Fetching player stats - Position:', position, 'isPitcher:', isPitcher, 'isTwoWay:', isTwoWay);
      
      let playerStatsData = {};
      let leagueStatsData = {};
      
      // Build API URLs with month filter if selected
      const buildStatsApiUrl = (group) => {
        const baseUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats`;
        if (selectedMonth) {
          const year = currentYear;
          const daysInMonth = new Date(year, parseInt(selectedMonth), 0).getDate();
          const startDate = `${year}-${selectedMonth.padStart(2, '0')}-01`;
          const endDate = `${year}-${selectedMonth.padStart(2, '0')}-${daysInMonth.toString().padStart(2, '0')}`;
          // Use playoff games (gameType=P) for October, regular season (gameType=R) for all other months
          const gameType = selectedMonth === '10' ? 'P' : 'R';
          return `${baseUrl}?stats=byDateRange&group=${group}&season=${year}&gameType=${gameType}&startDate=${startDate}&endDate=${endDate}`;
        } else {
          return `${baseUrl}?stats=season&group=${group}&season=${currentYear}`;
        }
      };
      
      const buildLeagueStatsUrl = (group) => {
        const baseUrl = `https://statsapi.mlb.com/api/v1/stats`;
        // Use playoff games (gameType=P) for October, regular season (gameType=R) for all other months
        const gameType = selectedMonth === '10' ? 'P' : 'R';
        if (selectedMonth) {
          const year = currentYear;
          const daysInMonth = new Date(year, parseInt(selectedMonth), 0).getDate();
          const startDate = `${year}-${selectedMonth.padStart(2, '0')}-01`;
          const endDate = `${year}-${selectedMonth.padStart(2, '0')}-${daysInMonth.toString().padStart(2, '0')}`;
          return `${baseUrl}?stats=byDateRange&group=${group}&season=${year}&gameType=${gameType}&sportId=1&limit=2000&playerPool=all&startDate=${startDate}&endDate=${endDate}`;
        } else {
          return `${baseUrl}?stats=season&group=${group}&season=${currentYear}&gameType=R&sportId=1&limit=2000&playerPool=all`;
        }
      };
      
      if (isPitcher) {
        // Fetch pitching stats
        const pitchingResponse = await fetch(buildStatsApiUrl('pitching'));
        const pitchingData = await pitchingResponse.json();
        
        const leaguePitchingResponse = await fetch(buildLeagueStatsUrl('pitching'));
        const leaguePitchingData = await leaguePitchingResponse.json();
        
        playerStatsData.pitching = pitchingData.stats?.[0]?.splits?.[0]?.stat || {};
        leagueStatsData.pitching = leaguePitchingData;
        
      } else if (isTwoWay) {
        // Fetch both hitting and pitching stats for two-way players
        const hittingResponse = await fetch(buildStatsApiUrl('hitting'));
        const hittingData = await hittingResponse.json();
        
        const pitchingResponse = await fetch(buildStatsApiUrl('pitching'));
        const pitchingData = await pitchingResponse.json();
        
        const leagueHittingResponse = await fetch(buildLeagueStatsUrl('hitting'));
        const leagueHittingData = await leagueHittingResponse.json();
        
        const leaguePitchingResponse = await fetch(buildLeagueStatsUrl('pitching'));
        const leaguePitchingData = await leaguePitchingResponse.json();
        
        playerStatsData.hitting = hittingData.stats?.[0]?.splits?.[0]?.stat || {};
        playerStatsData.pitching = pitchingData.stats?.[0]?.splits?.[0]?.stat || {};
        leagueStatsData.hitting = leagueHittingData;
        leagueStatsData.pitching = leaguePitchingData;
        
      } else {
        // Fetch hitting stats
        const hittingResponse = await fetch(buildStatsApiUrl('hitting'));
        const hittingData = await hittingResponse.json();
        
        const leagueHittingResponse = await fetch(buildLeagueStatsUrl('hitting'));
        const leagueHittingData = await leagueHittingResponse.json();
        
        playerStatsData.hitting = hittingData.stats?.[0]?.splits?.[0]?.stat || {};
        leagueStatsData.hitting = leagueHittingData;
      }
      
      console.log('Player stats data:', playerStatsData);
      console.log('League stats data:', leagueStatsData);
      
      setPlayerStats(playerStatsData);
      setLeagueStats(leagueStatsData);
      
      // Calculate rankings
      calculateStatRankings(playerStatsData, leagueStatsData);
      
    } catch (error) {
      console.error('Error fetching player stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const calculateStatRankings = (playerStatsData, leagueStatsData) => {
    if (!playerStatsData || !leagueStatsData) return;
    
    const rankings = {};
    
    // Calculate hitting rankings if available
    if (playerStatsData.hitting && leagueStatsData.hitting) {
      const leagueData = leagueStatsData.hitting;
      rankings.hitting = calculatePlayerStatRankings(leagueData, playerStatsData.hitting);
    }
    
    // Calculate pitching rankings if available
    if (playerStatsData.pitching && leagueStatsData.pitching) {
      const leagueData = leagueStatsData.pitching;
      rankings.pitching = calculatePitcherStatRankings(leagueData, playerStatsData.pitching);
    }
    
    setStatRankings(rankings);
  };

  const calculatePlayerStatRankings = (allPlayersData, playerStats) => {
    const rankings = {};
    
    // Extract all players' stats for comparison
    const allPlayers = allPlayersData.stats?.[0]?.splits || [];
    
    if (allPlayers.length === 0) {
      console.log('No league data available for hitting rankings');
      return rankings;
    }
    
    console.log(`Calculating hitting rankings from ${allPlayers.length} players`);
    
    // Helper function to calculate ranking for a stat
    const calculateRanking = (statName, isLowerBetter = false) => {
      const playerValue = parseFloat(playerStats[statName]) || 0;
      
      // For counting stats, don't show ranking if value is 0
      const countingStats = ['hitByPitch', 'triples', 'stolenBases', 'caughtStealing'];
      if (countingStats.includes(statName) && playerValue === 0) {
        return { rank: 0, total: 0 };
      }
      
      // Get all valid values for comparison (filter out players with very limited playing time)
      const validPlayers = allPlayers.filter(p => {
        const gamesPlayed = parseFloat(p.stat.gamesPlayed) || 0;
        const value = parseFloat(p.stat[statName]);
        return !isNaN(value) && gamesPlayed >= 10; // Only include players with at least 10 games
      });
      
      if (validPlayers.length === 0) return { rank: 0, total: 0 };
      
      // Get all values and sort them
      const allValues = validPlayers
        .map(p => parseFloat(p.stat[statName]) || 0)
        .sort((a, b) => isLowerBetter ? a - b : b - a);
      
      // Find player's position in the sorted array
      const position = allValues.findIndex(value => 
        isLowerBetter ? value >= playerValue : value <= playerValue
      ) + 1;
      
      // Return position if valid
      return position <= allValues.length ? { rank: position, total: allValues.length } : { rank: 0, total: 0 };
    };
    
    // Calculate rankings for hitting stats
    rankings.gamesPlayed = calculateRanking('gamesPlayed');
    rankings.plateAppearances = calculateRanking('plateAppearances');
    rankings.atBats = calculateRanking('atBats');
    rankings.avg = calculateRanking('avg');
    rankings.obp = calculateRanking('obp');
    rankings.slg = calculateRanking('slg');
    rankings.ops = calculateRanking('ops');
    rankings.hits = calculateRanking('hits');
    rankings.homeRuns = calculateRanking('homeRuns');
    rankings.doubles = calculateRanking('doubles');
    rankings.triples = calculateRanking('triples');
    rankings.runs = calculateRanking('runs');
    rankings.rbi = calculateRanking('rbi');
    rankings.strikeOuts = calculateRanking('strikeOuts', true); // Lower is better for strikeouts
    rankings.baseOnBalls = calculateRanking('baseOnBalls');
    rankings.stolenBases = calculateRanking('stolenBases');
    
    console.log('Calculated hitting rankings:', rankings);
    return rankings;
  };

  const calculatePitcherStatRankings = (allPlayersData, playerStats) => {
    const rankings = {};
    
    // Extract all players' stats for comparison
    const allPlayers = allPlayersData.stats?.[0]?.splits || [];
    
    if (allPlayers.length === 0) {
      console.log('No league data available for pitching rankings');
      return rankings;
    }
    
    console.log(`Calculating pitcher rankings from ${allPlayers.length} players`);
    
    // Helper function to calculate ranking for a pitching stat
    const calculateRanking = (statName, isLowerBetter = false) => {
      const playerValue = parseFloat(playerStats[statName]) || 0;
      
      // For counting stats, don't show ranking if value is 0
      const countingStats = ['saves', 'holds', 'completeGames', 'shutouts'];
      if (countingStats.includes(statName) && playerValue === 0) {
        return { rank: 0, total: 0 };
      }
      
      // Get all valid values for comparison (filter out players with very limited playing time)
      const validPitchers = allPlayers.filter(p => {
        const gamesPlayed = parseFloat(p.stat.gamesPlayed) || 0;
        const value = parseFloat(p.stat[statName]);
        return !isNaN(value) && gamesPlayed >= 5; // Pitchers need at least 5 games
      });
      
      if (validPitchers.length === 0) return { rank: 0, total: 0 };
      
      // Get all values and sort them
      const allValues = validPitchers
        .map(p => parseFloat(p.stat[statName]) || 0)
        .sort((a, b) => isLowerBetter ? a - b : b - a);
      
      // Find player's position in the sorted array
      const position = allValues.findIndex(value => 
        isLowerBetter ? value >= playerValue : value <= playerValue
      ) + 1;
      
      // Return position if valid
      return position <= allValues.length ? { rank: position, total: allValues.length } : { rank: 0, total: 0 };
    };
    
    // Calculate rankings for pitching stats
    rankings.gamesPlayed = calculateRanking('gamesPlayed');
    rankings.gamesStarted = calculateRanking('gamesStarted');
    rankings.inningsPitched = calculateRanking('inningsPitched');
    rankings.wins = calculateRanking('wins');
    rankings.losses = calculateRanking('losses', true); // Lower losses is better
    rankings.saves = calculateRanking('saves');
    rankings.era = calculateRanking('era', true); // Lower ERA is better
    rankings.whip = calculateRanking('whip', true); // Lower WHIP is better
    rankings.strikeOuts = calculateRanking('strikeOuts');
    rankings.baseOnBalls = calculateRanking('baseOnBalls', true); // Lower walks is better
    rankings.hits = calculateRanking('hits', true); // Lower hits allowed is better
    rankings.homeRuns = calculateRanking('homeRuns', true); // Lower home runs allowed is better
    rankings.strikeoutsPer9Inn = calculateRanking('strikeoutsPer9Inn');
    rankings.walksPer9Inn = calculateRanking('walksPer9Inn', true); // Lower BB/9 is better
    rankings.hitsPer9Inn = calculateRanking('hitsPer9Inn', true); // Lower H/9 is better
    rankings.strikeoutWalkRatio = calculateRanking('strikeoutWalkRatio');
    
    console.log('Calculated pitcher rankings:', rankings);
    return rankings;
  };

  const getMonthName = (monthNumber) => {
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return months[parseInt(monthNumber)] || '';
  };

  const handleMonthChange = (month) => {
    setSelectedMonth(month);
    setPlayerStats(null); // Reset stats to trigger refetch
    setStatRankings(null);
    setLeagueStats(null);
  };

  const renderPlayerHeader = () => {
    if (!playerData) return null;

    // Function to get MLB team abbreviation from team ID (similar to ScoreboardScreen)
    const getMLBTeamAbbreviation = (team) => {
      // MLB team ID to abbreviation mapping
      const teamMapping = {
        '108': 'LAA', '117': 'HOU', '133': 'OAK', '141': 'TOR', '144': 'ATL',
        '158': 'MIL', '138': 'STL', '112': 'CHC', '109': 'ARI', '119': 'LAD',
        '137': 'SF', '114': 'CLE', '136': 'SEA', '146': 'MIA', '121': 'NYM',
        '120': 'WSH', '110': 'BAL', '135': 'SD', '143': 'PHI', '134': 'PIT',
        '140': 'TEX', '139': 'TB', '111': 'BOS', '113': 'CIN', '115': 'COL',
        '118': 'KC', '116': 'DET', '142': 'MIN', '145': 'CWS', '147': 'NYY',
        // Alternative mappings
        '11': 'OAK',   // Sometimes Athletics use different ID
      };

      console.log('Team ID:', team?.id, 'Team abbreviation from API:', team?.abbreviation);
      
      // First try direct abbreviation if available
      if (team?.abbreviation) {
        return team.abbreviation;
      }
      
      // Then try ID mapping
      const abbr = teamMapping[team?.id?.toString()];
      if (abbr) {
        console.log('Using ID mapping for team ID:', team.id, '-> abbreviation:', abbr);
        return abbr;
      }
      
      console.warn('No abbreviation mapping found for team ID:', team?.id, 'Using fallback');
      return team?.name?.substring(0, 3)?.toUpperCase() || 'MLB';
    };

    // Get team logo URL using the theme function
    const getTeamLogoUrl = (teamAbbreviation) => {
      if (!teamAbbreviation) return 'https://via.placeholder.com/24x24?text=MLB';
      return getThemeTeamLogoUrl('mlb', teamAbbreviation);
    };

    return (
      <View style={[styles.playerHeader, { backgroundColor: theme.surface }]}>
        <Image 
          source={{ 
            uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerData.id}/headshot/67/current` 
          }}
          style={styles.playerHeadshot}
          defaultSource={{ uri: 'https://via.placeholder.com/80x80?text=MLB' }}
        />
        <View style={styles.playerInfo}>
          <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
            {playerData.fullName}
          </Text>
          <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
            #{playerData.primaryNumber || '--'} • {playerData.primaryPosition?.name || 'N/A'} • {playerData.batSide?.code || 'N/A'}/{playerData.pitchHand?.code || 'N/A'}
          </Text>
          {playerData.currentTeam && (
            <View style={styles.teamContainer}>
              <Image 
                source={{ uri: getTeamLogoUrl(getMLBTeamAbbreviation(playerData.currentTeam)) }}
                style={styles.teamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
              />
              <Text allowFontScaling={false} style={[styles.teamName, { color: theme.textSecondary }]}>
                {playerData.currentTeam.name}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderTabButtons = () => {
    const tabs = ['Stats', 'Game Log', 'Career', 'VS Team'];
    
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
            <Text allowFontScaling={false} style={[
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
      case 'VS Team':
        return renderVsTeamContent();
      case 'Splits':
        return (
          <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
            <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Split statistics will be implemented here</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const renderStatsContent = () => {
    if (loadingStats) {
      return (
        <View style={[styles.statsLoadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading player statistics...</Text>
        </View>
      );
    }

    if (!playerStats || (!playerStats.hitting && !playerStats.pitching)) {
      return (
        <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No statistics available</Text>
        </View>
      );
    }

    const renderStatBox = (label, value, key, ranking = null) => {
      let displayValue = value;
      if (value !== undefined && value !== null && !isNaN(value)) {
        if (typeof value === 'number') {
          displayValue = value % 1 === 0 ? value.toString() : value.toFixed(3);
        }
      } else {
        displayValue = '--';
      }

      return (
        <View key={key} style={[styles.statBox, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.statBoxValue, { color: colors.primary }]}>{displayValue}</Text>
          <Text allowFontScaling={false} style={[styles.statBoxLabel, { color: theme.textSecondary }]}>{label}</Text>
          {ranking && ranking.total > 0 && (
            <Text allowFontScaling={false} style={[styles.statBoxRanking, { color: theme.textTertiary }]}>
              #{ranking.rank} in MLB
            </Text>
          )}
        </View>
      );
    };

    const renderStatsGrid = (stats, title, statDefinitions, rankings) => {
      const statsRows = [];
      for (let i = 0; i < statDefinitions.length; i += 3) {
        const rowStats = statDefinitions.slice(i, i + 3);
        statsRows.push(
          <View key={i} style={styles.statsRow}>
            {rowStats.map(({ key, label }) => {
              const value = stats[key];
              const ranking = rankings ? rankings[key] : null;
              return renderStatBox(label, value, `${title}-${key}`, ranking);
            })}
          </View>
        );
      }
      return statsRows;
    };

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.statsContent}>
          {/* Month Selection */}
          <View style={[styles.monthSelector, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.monthSelectorLabel, { color: theme.text }]}>Filter by month:</Text>
            <View style={styles.monthOptions}>
              <TouchableOpacity
                style={[
                  styles.monthOption,
                  selectedMonth === '' && styles.selectedMonthOption,
                  { 
                    backgroundColor: selectedMonth === '' ? colors.primary : theme.surfaceSecondary,
                    borderColor: theme.border 
                  }
                ]}
                onPress={() => handleMonthChange('')}
              >
                <Text allowFontScaling={false} style={[
                  styles.monthOptionText,
                  { color: selectedMonth === '' ? '#fff' : theme.text }
                ]}>
                  Full Season
                </Text>
              </TouchableOpacity>
              {[3, 4, 5, 6, 7, 8, 9, 10].map(month => (
                <TouchableOpacity
                  key={month}
                  style={[
                    styles.monthOption,
                    selectedMonth === month.toString() && styles.selectedMonthOption,
                    { 
                      backgroundColor: selectedMonth === month.toString() ? colors.primary : theme.surfaceSecondary,
                      borderColor: theme.border 
                    }
                  ]}
                  onPress={() => handleMonthChange(month.toString())}
                >
                  <Text allowFontScaling={false} style={[
                    styles.monthOptionText,
                    { color: selectedMonth === month.toString() ? '#fff' : theme.text }
                  ]}>
                    {getMonthName(month.toString()).substring(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Hitting Stats */}
          {playerStats.hitting && (
            <View style={styles.statsSection}>
              <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: colors.primary }]}>
                {selectedMonth ? `${getMonthName(selectedMonth)} ` : ''}Hitting Statistics
              </Text>
              {renderStatsGrid(
                playerStats.hitting,
                'hitting',
                [
                  { key: 'avg', label: 'AVG' },
                  { key: 'obp', label: 'OBP' },
                  { key: 'slg', label: 'SLG' },
                  { key: 'ops', label: 'OPS' },
                  { key: 'homeRuns', label: 'HR' },
                  { key: 'rbi', label: 'RBI' },
                  { key: 'runs', label: 'Runs' },
                  { key: 'hits', label: 'Hits' },
                  { key: 'doubles', label: '2B' },
                  { key: 'triples', label: '3B' },
                  { key: 'baseOnBalls', label: 'BB' },
                  { key: 'strikeOuts', label: 'SO' },
                  { key: 'stolenBases', label: 'SB' },
                  { key: 'atBats', label: 'AB' },
                  { key: 'plateAppearances', label: 'PA' }
                ],
                statRankings?.hitting
              )}
            </View>
          )}

          {/* Pitching Stats */}
          {playerStats.pitching && (
            <View style={styles.statsSection}>
              <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: colors.primary }]}>
                {selectedMonth ? `${getMonthName(selectedMonth)} ` : ''}Pitching Statistics
              </Text>
              {renderStatsGrid(
                playerStats.pitching,
                'pitching',
                [
                  { key: 'era', label: 'ERA' },
                  { key: 'whip', label: 'WHIP' },
                  { key: 'wins', label: 'W' },
                  { key: 'losses', label: 'L' },
                  { key: 'saves', label: 'SV' },
                  { key: 'strikeOuts', label: 'SO' },
                  { key: 'inningsPitched', label: 'IP' },
                  { key: 'hits', label: 'H' },
                  { key: 'baseOnBalls', label: 'BB' },
                  { key: 'homeRuns', label: 'HR' },
                  { key: 'strikeoutsPer9Inn', label: 'K/9' },
                  { key: 'walksPer9Inn', label: 'BB/9' },
                  { key: 'hitsPer9Inn', label: 'H/9' },
                  { key: 'strikeoutWalkRatio', label: 'K/BB' },
                  { key: 'gamesPlayed', label: 'G' }
                ],
                statRankings?.pitching
              )}
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderGameLogContent = () => {
    if (loadingGameLog) {
      return (
        <View style={[styles.statsLoadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading game log...</Text>
        </View>
      );
    }

    if (!gameLogData || (!gameLogData.hitting && !gameLogData.pitching)) {
      return (
        <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No game log data available</Text>
        </View>
      );
    }

    // Combine and sort game log entries
    const allGames = [];
    
    // Add hitting games
    if (gameLogData.hitting && Array.isArray(gameLogData.hitting)) {
      gameLogData.hitting.forEach(game => {
        if (game && game.date) {
          // Parse date in a timezone-neutral way to avoid day shifting
          const [year, month, day] = game.date.split('-').map(Number);
          const gameDate = new Date(year, month - 1, day); // month is 0-indexed
          allGames.push({
            ...game,
            type: 'hitting',
            gameDate: gameDate
          });
        }
      });
    }
    
    // Add pitching games
    if (gameLogData.pitching && Array.isArray(gameLogData.pitching)) {
      gameLogData.pitching.forEach(game => {
        if (game && game.date) {
          // Parse date in a timezone-neutral way to avoid day shifting
          const [year, month, day] = game.date.split('-').map(Number);
          const gameDate = new Date(year, month - 1, day); // month is 0-indexed
          allGames.push({
            ...game,
            type: 'pitching',
            gameDate: gameDate
          });
        }
      });
    }
    
    // Sort by date (most recent first) and group by same date
    allGames.sort((a, b) => b.gameDate - a.gameDate);
    
    // Group games by date for two-way players
    const groupedGames = [];
    const processedDates = new Set();
    
    allGames.forEach(game => {
      const dateStr = game.date;
      if (!processedDates.has(dateStr)) {
        const sameDate = allGames.filter(g => g.date === dateStr);
        groupedGames.push(sameDate);
        processedDates.add(dateStr);
      }
    });

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.gameLogContainer}>
          {groupedGames.map((games, index) => renderGameLogItem(games, index))}
        </View>
      </ScrollView>
    );
  };

  const renderGameLogItem = (games, index) => {
    if (!games || !Array.isArray(games) || games.length === 0) {
      return null;
    }

    const firstGame = games[0];
    if (!firstGame || !firstGame.date) {
      return null;
    }

    // Parse date in a timezone-neutral way to avoid day shifting
    const dateStr = firstGame.date;
    const [year, month, day] = dateStr.split('-').map(Number);
    const gameDate = new Date(year, month - 1, day); // month is 0-indexed
    
    const formattedDate = gameDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    return (
      <View key={index} style={[styles.gameLogCard, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.gameLogDate, { color: theme.textSecondary }]}>{formattedDate}</Text>
        
        {games.map((game, gameIndex) => (
          <View key={gameIndex}>
            {gameIndex > 0 && <View style={[styles.gameLogDivider, { backgroundColor: theme.border }]} />}
            {renderSingleGameLog(game)}
          </View>
        ))}
      </View>
    );
  };

  const renderSingleGameLog = (game) => {
    // Safety checks for game object
    if (!game || !game.stat) {
      return null;
    }

    const opponent = game.opponent || {};
    const team = game.team || {};
    const isHome = game.isHome || false;
    const isWin = game.isWin || false;
    const gameId = game.game?.gamePk || null;
    
    // Get team logos
    const getTeamLogoUrl = (teamAbbreviation) => {
      if (!teamAbbreviation) return 'https://via.placeholder.com/24x24?text=MLB';
      return getThemeTeamLogoUrl('mlb', teamAbbreviation);
    };

    // Get team abbreviations (you might need to add a mapping function)
    const getTeamAbbreviation = (teamName) => {
      const nameToAbbr = {
        'Los Angeles Dodgers': 'LAD',
        'Chicago Cubs': 'CHC',
        'San Diego Padres': 'SD',
        'New York Yankees': 'NYY',
        'Boston Red Sox': 'BOS',
        'Arizona Diamondbacks': 'AZ',
        'Atlanta Braves': 'ATL',
        'Baltimore Orioles': 'BAL',
        'Chicago White Sox': 'CWS',
        'Cincinnati Reds': 'CIN',
        'Cleveland Guardians': 'CLE',
        'Colorado Rockies': 'COL',
        'Detroit Tigers': 'DET',
        'Houston Astros': 'HOU',
        'Kansas City Royals': 'KC',
        'Los Angeles Angels': 'LAA',
        'Miami Marlins': 'MIA',
        'Milwaukee Brewers': 'MIL',
        'Minnesota Twins': 'MIN',
        'New York Mets': 'NYM',
        'Oakland Athletics': 'OAK',
        'Philadelphia Phillies': 'PHI',
        'Pittsburgh Pirates': 'PIT',
        'San Francisco Giants': 'SF',
        'Seattle Mariners': 'SEA',
        'St. Louis Cardinals': 'STL',
        'Tampa Bay Rays': 'TB',
        'Texas Rangers': 'TEX',
        'Toronto Blue Jays': 'TOR',
        'Washington Nationals': 'WSH'
      };
      return nameToAbbr[teamName] || teamName?.substring(0, 3)?.toUpperCase() || 'MLB';
    };

    const teamAbbr = getTeamAbbreviation(team?.name);
    const oppAbbr = getTeamAbbreviation(opponent?.name);

    // Get position played
    const positionPlayed = game.positionsPlayed?.[0]?.abbreviation || (game.type === 'pitching' ? 'P' : 'DH');

    // Handle navigation to game details
    const handleGamePress = () => {
      if (gameId) {
        console.log('Navigating to game:', gameId);
        navigation.navigate('GameDetails', {
          gameId: gameId,
          sport: 'mlb'
        });
      } else {
        console.warn('Game ID not available for navigation');
      }
    };

    // Handle stat detail press for detailed stats view
    const handleStatPress = () => {
      if (game && game.stat) {
        setSelectedGameStats({
          game: game,
          playerName: playerData.fullName,
          date: game.date,
          opponent: opponent,
          team: team,
          isHome: isHome,
          isWin: isWin,
          gameId: gameId,
          type: game.type
        });
        setShowStatsModal(true);
      }
    };

    return (
      <View style={styles.singleGameLog}>
        <TouchableOpacity 
          style={styles.gameLogHeader}
          onPress={handleStatPress}
          activeOpacity={0.7}
        >
          <Image 
            source={{ 
              uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerData.id}/headshot/67/current` 
            }}
            style={styles.gameLogHeadshot}
            defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=MLB' }}
          />
          <View style={styles.gameLogInfo}>
            <Text allowFontScaling={false} style={[styles.gameLogPlayerName, { color: theme.text }]}>
              {playerData.fullName} • {positionPlayed}
            </Text>
            <Text allowFontScaling={false} style={[styles.gameLogStatSummary, { color: theme.textSecondary }]}>
              {game.stat?.summary || 'No stats available'}
            </Text>
          </View>
          <View style={[styles.gameLogResult, { 
            backgroundColor: isWin ? '#4CAF50' : '#f44336' 
          }]}>
            <Text allowFontScaling={false} style={styles.gameLogResultText}>{isWin ? 'W' : 'L'}</Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.gameLogTeams}
          onPress={handleGamePress}
          activeOpacity={0.7}
          disabled={!gameId}
        >
          <Image 
            source={{ uri: getTeamLogoUrl(teamAbbr) }}
            style={styles.gameLogTeamLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=MLB' }}
          />
          <Text allowFontScaling={false} style={[styles.gameLogTeamName, { color: theme.text }]}>{teamAbbr}</Text>
          <Text allowFontScaling={false} style={[styles.gameLogVs, { color: theme.textSecondary }]}>
            {isHome ? 'vs' : '@'}
          </Text>
          <Text allowFontScaling={false} style={[styles.gameLogTeamName, { color: theme.text }]}>{oppAbbr}</Text>
          <Image 
            source={{ uri: getTeamLogoUrl(oppAbbr) }}
            style={styles.gameLogTeamLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=MLB' }}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderDetailedStatsModal = () => {
    if (!selectedGameStats) return null;

    const { game, playerName, date, opponent, team, isHome, isWin, gameId, type } = selectedGameStats;
    const stats = game.stat;

    // Parse date for display
    const [year, month, day] = date.split('-').map(Number);
    const gameDate = new Date(year, month - 1, day);
    const formattedDate = gameDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const getTeamAbbreviation = (teamName) => {
      const nameToAbbr = {
        'Los Angeles Dodgers': 'LAD', 'Chicago Cubs': 'CHC', 'San Diego Padres': 'SD',
        'New York Yankees': 'NYY', 'Boston Red Sox': 'BOS', 'Arizona Diamondbacks': 'AZ',
        'Atlanta Braves': 'ATL', 'Baltimore Orioles': 'BAL', 'Chicago White Sox': 'CWS',
        'Cincinnati Reds': 'CIN', 'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL',
        'Detroit Tigers': 'DET', 'Houston Astros': 'HOU', 'Kansas City Royals': 'KC',
        'Los Angeles Angels': 'LAA', 'Miami Marlins': 'MIA', 'Milwaukee Brewers': 'MIL',
        'Minnesota Twins': 'MIN', 'New York Mets': 'NYM', 'Oakland Athletics': 'OAK',
        'Philadelphia Phillies': 'PHI', 'Pittsburgh Pirates': 'PIT', 'San Francisco Giants': 'SF',
        'Seattle Mariners': 'SEA', 'St. Louis Cardinals': 'STL', 'Tampa Bay Rays': 'TB',
        'Texas Rangers': 'TEX', 'Toronto Blue Jays': 'TOR', 'Washington Nationals': 'WSH'
      };
      return nameToAbbr[teamName] || teamName?.substring(0, 3)?.toUpperCase() || 'MLB';
    };

    const teamAbbr = getTeamAbbreviation(team?.name);
    const oppAbbr = getTeamAbbreviation(opponent?.name);

    const renderStatRow = (label, value) => (
      <View style={styles.modalStatRow}>
        <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>{label}</Text>
        <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{value || '--'}</Text>
      </View>
    );

    const renderHittingStats = () => (
      <View style={styles.modalStatsSection}>
        <Text allowFontScaling={false} style={[styles.modalSectionTitle, { color: colors.primary }]}>Hitting Statistics</Text>
        
        {/* Main stats grid - top row */}
        <View style={styles.modalStatsGrid}>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface, shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
              {stats.hits || 0}/{stats.atBats || 0}
            </Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>H/AB</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.runs || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>R</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.rbi || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>RBI</Text>
          </View>
        </View>

        {/* Second row */}
        <View style={styles.modalStatsGrid}>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.homeRuns || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>HR</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.baseOnBalls || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>BB</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.strikeOuts || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>SO</Text>
          </View>
        </View>

        {/* Third row */}
        <View style={styles.modalStatsGrid}>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.totalBases || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>TB</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.stolenBases || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>SB</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.leftOnBase || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>LOB</Text>
          </View>
        </View>

        {/* Averages row */}
        <View style={styles.modalStatsGrid}>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
              {stats.avg ? parseFloat(stats.avg).toFixed(3) : '.000'}
            </Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>AVG</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
              {stats.obp ? parseFloat(stats.obp).toFixed(3) : '.000'}
            </Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>OBP</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
              {stats.slg ? parseFloat(stats.slg).toFixed(3) : '.000'}
            </Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>SLG</Text>
          </View>
        </View>
      </View>
    );

    const renderPitchingStats = () => (
      <View style={styles.modalStatsSection}>
        <Text allowFontScaling={false} style={[styles.modalSectionTitle, { color: colors.primary }]}>Pitching Statistics</Text>
        
        {/* Main stats grid - top row */}
        <View style={styles.modalStatsGrid}>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
              {stats.inningsPitched || '0.0'}
            </Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>IP</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.hits || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>H</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.runs || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>R</Text>
          </View>
        </View>

        {/* Second row */}
        <View style={styles.modalStatsGrid}>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.earnedRuns || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>ER</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.baseOnBalls || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>BB</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.strikeOuts || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>SO</Text>
          </View>
        </View>

        {/* Third row */}
        <View style={styles.modalStatsGrid}>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.homeRuns || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>HR</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.numberOfPitches || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>P</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.strikes || 0}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>S</Text>
          </View>
        </View>

        {/* Performance stats row */}
        <View style={styles.modalStatsGrid}>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
              {stats.era ? parseFloat(stats.era).toFixed(2) : '0.00'}
            </Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>ERA</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
              {stats.whip ? parseFloat(stats.whip).toFixed(2) : '0.00'}
            </Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>WHIP</Text>
          </View>
          <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
            <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.decisions || '--'}</Text>
            <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>DEC</Text>
          </View>
        </View>
      </View>
    );

    return (
      <Modal
        visible={showStatsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStatsModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              onPress={() => setShowStatsModal(false)}
              style={styles.modalCloseButton}
            >
              <Text allowFontScaling={false} style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>Game Stats</Text>
            <TouchableOpacity
              onPress={() => {
                if (gameId) {
                  setShowStatsModal(false);
                  // Use requestAnimationFrame to ensure modal closes before navigation
                  requestAnimationFrame(() => {
                    navigation.navigate('GameDetails', {
                      gameId: gameId,
                      sport: 'mlb'
                    });
                  });
                }
              }}
              style={styles.modalGameButton}
            >
              <Text allowFontScaling={false} style={[styles.modalGameText, { color: colors.primary }]}>View Game</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.modalGameHeader, { backgroundColor: theme.surface }]}>
              <Text allowFontScaling={false} style={[styles.modalDate, { color: theme.textSecondary }]}>{formattedDate}</Text>
              <View style={styles.modalTeamMatchup}>
                <View style={styles.modalTeamContainer}>
                  <Image 
                    source={{ uri: getThemeTeamLogoUrl('mlb', teamAbbr) }}
                    style={styles.modalTeamLogo}
                    defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                  />
                  <Text allowFontScaling={false} style={[styles.modalTeamName, { color: theme.text }]}>{teamAbbr}</Text>
                </View>
                <Text allowFontScaling={false} style={[styles.modalVs, { color: theme.textSecondary }]}>
                  {isHome ? 'vs' : '@'}
                </Text>
                <View style={styles.modalTeamContainer}>
                  <Image 
                    source={{ uri: getThemeTeamLogoUrl('mlb', oppAbbr) }}
                    style={styles.modalTeamLogo}
                    defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                  />
                  <Text allowFontScaling={false} style={[styles.modalTeamName, { color: theme.text }]}>{oppAbbr}</Text>
                </View>
              </View>
              <View style={[styles.modalResultContainer, { 
                backgroundColor: isWin ? '#4CAF50' : '#f44336' 
              }]}>
                <Text allowFontScaling={false} style={styles.modalResultText}>{isWin ? 'WIN' : 'LOSS'}</Text>
              </View>
            </View>

            <View style={[styles.modalPlayerHeader, { backgroundColor: theme.surface }]}>
              <Image 
                source={{ 
                  uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerData.id}/headshot/67/current` 
                }}
                style={styles.modalPlayerImage}
                defaultSource={{ uri: 'https://via.placeholder.com/60x60?text=MLB' }}
              />
              <View style={styles.modalPlayerInfo}>
                <Text allowFontScaling={false} style={[styles.modalPlayerName, { color: theme.text }]}>{playerName}</Text>
                <Text allowFontScaling={false} style={[styles.modalPlayerPosition, { color: theme.textSecondary }]}>
                  {type === 'pitching' ? 'Pitcher' : 'Batter'}
                </Text>
              </View>
            </View>

            {type === 'hitting' ? renderHittingStats() : renderPitchingStats()}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  const renderCareerContent = () => {
    console.log('Rendering career content - loadingCareer:', loadingCareer);
    console.log('Career data:', careerData);
    console.log('Career data type:', typeof careerData);
    if (careerData) {
      console.log('Career data keys:', Object.keys(careerData));
      console.log('Has hitting:', !!careerData.hitting);
      console.log('Has pitching:', !!careerData.pitching);
      console.log('Hitting length:', careerData.hitting?.length);
      console.log('Pitching length:', careerData.pitching?.length);
    }
    
    if (loadingCareer) {
      return (
        <View style={[styles.statsLoadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading career statistics...</Text>
        </View>
      );
    }

    if (!careerData || (!careerData.hitting && !careerData.pitching)) {
      return (
        <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No career data available</Text>
        </View>
      );
    }

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.careerContainer}>
          {careerData.hitting && careerData.hitting.length > 0 && renderCareerSection('hitting', careerData.hitting)}
          {careerData.pitching && careerData.pitching.length > 0 && renderCareerSection('pitching', careerData.pitching)}
        </View>
      </ScrollView>
    );
  };

  const renderCareerSection = (type, seasons) => {
    const sectionTitle = type === 'hitting' ? 'Hitting Career' : 'Pitching Career';
    
    // Sort seasons in reverse order (most recent first)
    const sortedSeasons = [...seasons].sort((a, b) => {
      const yearA = parseInt(a.season) || 0;
      const yearB = parseInt(b.season) || 0;
      return yearB - yearA;
    });
    
    return (
      <View style={styles.careerSection}>
        <Text allowFontScaling={false} style={[styles.careerSectionTitle, { color: colors.primary }]}>{sectionTitle}</Text>
        {sortedSeasons.map((season, index) => renderCareerSeasonItem(season, type, index))}
      </View>
    );
  };

  const renderCareerSeasonItem = (season, type, index) => {
    if (!season || !season.season) {
      return null;
    }

    const stats = season.stat || {};
    const team = season.team || {};
    const league = season.league || {};
    
    // Get team logo URL - convert team ID to abbreviation
    const getTeamLogoUrl = (teamId) => {
      if (!teamId) return 'https://via.placeholder.com/40x40?text=MLB';
      
      // Team ID to abbreviation mapping
      const teamIdToAbbr = {
        108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET',
        117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'OAK', 134: 'PIT', 135: 'SD', 136: 'SEA',
        137: 'SF', 138: 'STL', 139: 'TB', 140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS',
        146: 'MIA', 147: 'NYY', 158: 'MIL'
      };
      
      const teamAbbr = teamIdToAbbr[teamId];
      if (!teamAbbr) {
        console.log('Unknown team ID for career:', teamId);
        return 'https://via.placeholder.com/40x40?text=MLB';
      }
      
      return getThemeTeamLogoUrl('mlb', teamAbbr);
    };

    const handleSeasonPress = () => {
      setSelectedSeasonStats({ season, type, stats, team, league });
      setShowSeasonModal(true);
    };

    return (
      <TouchableOpacity 
        key={`${type}-${season.season}-${index}`}
        style={[styles.careerSeasonCard, { backgroundColor: theme.surface }]}
        onPress={handleSeasonPress}
        activeOpacity={0.7}
      >
        <View style={styles.careerSeasonHeader}>
          <View style={styles.careerTeamInfo}>
            <Image 
              source={{ uri: getTeamLogoUrl(team.id) }}
              style={styles.careerTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
            />
            <Text allowFontScaling={false} style={[styles.careerTeamName, { color: theme.textSecondary }]}>{team.name || 'MLB'}</Text>
          </View>
          <Text allowFontScaling={false} style={[styles.careerSeasonYear, { color: theme.text }]}>{season.season}</Text>
        </View>
        
        <View style={styles.careerStatsRow}>
          {type === 'hitting' ? (
            <>
              <View style={styles.careerStatItem}>
                <Text allowFontScaling={false} style={[styles.careerStatValue, { color: theme.text }]}>{stats.gamesPlayed || 0}</Text>
                <Text allowFontScaling={false} style={[styles.careerStatLabel, { color: theme.textSecondary }]}>GP</Text>
              </View>
              <View style={styles.careerStatItem}>
                <Text allowFontScaling={false} style={[styles.careerStatValue, { color: theme.text }]}>
                  {stats.avg ? parseFloat(stats.avg).toFixed(3) : '.000'}
                </Text>
                <Text allowFontScaling={false} style={[styles.careerStatLabel, { color: theme.textSecondary }]}>AVG</Text>
              </View>
              <View style={styles.careerStatItem}>
                <Text allowFontScaling={false} style={[styles.careerStatValue, { color: theme.text }]}>{stats.homeRuns || 0}</Text>
                <Text allowFontScaling={false} style={[styles.careerStatLabel, { color: theme.textSecondary }]}>HR</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.careerStatItem}>
                <Text allowFontScaling={false} style={[styles.careerStatValue, { color: theme.text }]}>{stats.gamesPlayed || 0}</Text>
                <Text allowFontScaling={false} style={[styles.careerStatLabel, { color: theme.textSecondary }]}>GP</Text>
              </View>
              <View style={styles.careerStatItem}>
                <Text allowFontScaling={false} style={[styles.careerStatValue, { color: theme.text }]}>
                  {stats.era ? parseFloat(stats.era).toFixed(2) : '0.00'}
                </Text>
                <Text allowFontScaling={false} style={[styles.careerStatLabel, { color: theme.textSecondary }]}>ERA</Text>
              </View>
              <View style={styles.careerStatItem}>
                <Text allowFontScaling={false} style={[styles.careerStatValue, { color: theme.text }]}>{stats.wins || 0}</Text>
                <Text allowFontScaling={false} style={[styles.careerStatLabel, { color: theme.textSecondary }]}>W</Text>
              </View>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSeasonModal = () => {
    if (!selectedSeasonStats) return null;

    const { season, type, stats, team, league } = selectedSeasonStats;
    
    // Get team logo URL - convert team ID to abbreviation
    const getModalTeamLogoUrl = (teamId) => {
      if (!teamId) return 'https://via.placeholder.com/50x50?text=MLB';
      
      // Team ID to abbreviation mapping
      const teamIdToAbbr = {
        108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET',
        117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'OAK', 134: 'PIT', 135: 'SD', 136: 'SEA',
        137: 'SF', 138: 'STL', 139: 'TB', 140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS',
        146: 'MIA', 147: 'NYY', 158: 'MIL'
      };
      
      const teamAbbr = teamIdToAbbr[teamId];
      if (!teamAbbr) {
        console.log('Unknown team ID for modal:', teamId);
        return 'https://via.placeholder.com/50x50?text=MLB';
      }
      
      return getThemeTeamLogoUrl('mlb', teamAbbr);
    };
    
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
              <Text allowFontScaling={false} style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>
              {season.season} {type === 'hitting' ? 'Hitting' : 'Pitching'} Stats
            </Text>
            <View style={styles.modalPlaceholder} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.modalSeasonHeader, { backgroundColor: theme.surface }]}>
              <View style={styles.modalSeasonTopRow}>
                <View style={styles.modalSeasonInfo}>
                  <Text allowFontScaling={false} style={[styles.modalSeasonYear, { color: theme.text }]}>{season.season}</Text>
                  <Text allowFontScaling={false} style={[styles.modalLeagueName, { color: theme.textSecondary }]}>{league.name || 'MLB'}</Text>
                </View>
                <View style={styles.modalTeamContainer}>
                  <Image 
                    source={{ uri: getModalTeamLogoUrl(team.id) }}
                    style={styles.modalSeasonTeamLogo}
                    defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=MLB' }}
                  />
                  <Text allowFontScaling={false} style={[styles.modalTeamName, { color: theme.text }]}>{team.name || 'MLB'}</Text>
                </View>
              </View>
            </View>

            {type === 'hitting' ? renderSeasonHittingStats(stats) : renderSeasonPitchingStats(stats)}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  const renderSeasonHittingStats = (stats) => (
    <View style={styles.modalStatsSection}>
      <Text allowFontScaling={false} style={[styles.modalSectionTitle, { color: colors.primary }]}>Season Hitting Statistics</Text>
      
      {/* Main stats grid - top row */}
      <View style={styles.modalStatsGrid}>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface, shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
            {stats.hits || 0}/{stats.atBats || 0}
          </Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>H/AB</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.runs || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>R</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.rbi || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>RBI</Text>
        </View>
      </View>

      {/* Second row */}
      <View style={styles.modalStatsGrid}>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.homeRuns || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>HR</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.baseOnBalls || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>BB</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.strikeOuts || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>SO</Text>
        </View>
      </View>

      {/* Third row */}
      <View style={styles.modalStatsGrid}>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.totalBases || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>TB</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.stolenBases || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>SB</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.gamesPlayed || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>GP</Text>
        </View>
      </View>

      {/* Averages row */}
      <View style={styles.modalStatsGrid}>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
            {stats.avg ? parseFloat(stats.avg).toFixed(3) : '.000'}
          </Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>AVG</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
            {stats.obp ? parseFloat(stats.obp).toFixed(3) : '.000'}
          </Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>OBP</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
            {stats.slg ? parseFloat(stats.slg).toFixed(3) : '.000'}
          </Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>SLG</Text>
        </View>
      </View>
    </View>
  );

  const renderSeasonPitchingStats = (stats) => (
    <View style={styles.modalStatsSection}>
      <Text allowFontScaling={false} style={[styles.modalSectionTitle, { color: colors.primary }]}>Season Pitching Statistics</Text>
      
      {/* Main stats grid - top row */}
      <View style={styles.modalStatsGrid}>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
            {stats.inningsPitched || '0.0'}
          </Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>IP</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.hits || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>H</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.runs || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>R</Text>
        </View>
      </View>

      {/* Second row */}
      <View style={styles.modalStatsGrid}>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.earnedRuns || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>ER</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.baseOnBalls || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>BB</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.strikeOuts || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>SO</Text>
        </View>
      </View>

      {/* Third row */}
      <View style={styles.modalStatsGrid}>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.homeRuns || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>HR</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.hitBatsmen || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>HBP</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{stats.gamesPlayed || 0}</Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>GP</Text>
        </View>
      </View>

      {/* Record and averages row */}
      <View style={styles.modalStatsGrid}>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
            {stats.wins || 0}-{stats.losses || 0}
          </Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>W-L</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
            {stats.era ? parseFloat(stats.era).toFixed(2) : '0.00'}
          </Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>ERA</Text>
        </View>
        <View style={[styles.modalStatCard, { backgroundColor: theme.surface , shadowColor: isDarkMode ? '#fff' : '#000' }]}>
          <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
            {stats.whip ? parseFloat(stats.whip).toFixed(2) : '0.00'}
          </Text>
          <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>WHIP</Text>
        </View>
      </View>
    </View>
  );

  const renderVsTeamContent = () => {
    // Team list with logos for selection - ordered by city name
    const mlbTeams = [
      { id: 109, name: 'Arizona Diamondbacks', abbr: 'ARI' },
      { id: 144, name: 'Atlanta Braves', abbr: 'ATL' },
      { id: 110, name: 'Baltimore Orioles', abbr: 'BAL' },
      { id: 111, name: 'Boston Red Sox', abbr: 'BOS' },
      { id: 112, name: 'Chicago Cubs', abbr: 'CHC' },
      { id: 145, name: 'Chicago White Sox', abbr: 'CWS' },
      { id: 113, name: 'Cincinnati Reds', abbr: 'CIN' },
      { id: 114, name: 'Cleveland Guardians', abbr: 'CLE' },
      { id: 115, name: 'Colorado Rockies', abbr: 'COL' },
      { id: 116, name: 'Detroit Tigers', abbr: 'DET' },
      { id: 117, name: 'Houston Astros', abbr: 'HOU' },
      { id: 118, name: 'Kansas City Royals', abbr: 'KC' },
      { id: 108, name: 'Los Angeles Angels', abbr: 'LAA' },
      { id: 119, name: 'Los Angeles Dodgers', abbr: 'LAD' },
      { id: 146, name: 'Miami Marlins', abbr: 'MIA' },
      { id: 158, name: 'Milwaukee Brewers', abbr: 'MIL' },
      { id: 142, name: 'Minnesota Twins', abbr: 'MIN' },
      { id: 121, name: 'New York Mets', abbr: 'NYM' },
      { id: 147, name: 'New York Yankees', abbr: 'NYY' },
      { id: 133, name: 'Oakland Athletics', abbr: 'OAK' },
      { id: 143, name: 'Philadelphia Phillies', abbr: 'PHI' },
      { id: 134, name: 'Pittsburgh Pirates', abbr: 'PIT' },
      { id: 135, name: 'San Diego Padres', abbr: 'SD' },
      { id: 137, name: 'San Francisco Giants', abbr: 'SF' },
      { id: 136, name: 'Seattle Mariners', abbr: 'SEA' },
      { id: 138, name: 'St. Louis Cardinals', abbr: 'STL' },
      { id: 139, name: 'Tampa Bay Rays', abbr: 'TB' },
      { id: 140, name: 'Texas Rangers', abbr: 'TEX' },
      { id: 141, name: 'Toronto Blue Jays', abbr: 'TOR' },
      { id: 120, name: 'Washington Nationals', abbr: 'WSH' }
    ];

    if (!selectedTeam) {
      return (
        <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
          <Text allowFontScaling={false} style={[styles.vsTeamTitle, { color: theme.text }]}>Select Team to View Stats Against</Text>
          <ScrollView style={styles.teamSelector} showsVerticalScrollIndicator={false}>
            <View style={styles.teamGrid}>
              {mlbTeams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[styles.teamCard, { backgroundColor: theme.surface }]}
                  onPress={() => {
                    setSelectedTeam(team);
                    setVsTeamStats(null); // Reset stats to trigger refetch
                  }}
                  activeOpacity={0.7}
                >
                  <Image 
                    source={{ uri: getThemeTeamLogoUrl('mlb', team.abbr) }}
                    style={styles.teamCardLogo}
                    defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                  />
                  <Text allowFontScaling={false} style={[styles.teamCardName, { color: theme.text }]}>{team.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      );
    }

    if (loadingVsTeam) {
      return (
        <View style={[styles.statsLoadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading VS Team statistics...</Text>
        </View>
      );
    }

    // Helper function to check if stats object has meaningful data
    const hasStatsData = (stats) => {
      if (!stats || typeof stats !== 'object') return false;
      
      // Check if any key stats exist and have meaningful values
      const keyStats = ['gamesPlayed', 'plateAppearances', 'atBats', 'hits', 'inningsPitched'];
      return keyStats.some(stat => {
        const value = stats[stat];
        return value !== undefined && value !== null && value !== 0 && value !== '0';
      });
    };

    if (!vsTeamStats || 
        (!vsTeamStats.hitting && !vsTeamStats.pitching) ||
        (!hasStatsData(vsTeamStats.hitting) && !hasStatsData(vsTeamStats.pitching))) {
      return (
        <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
          <View style={styles.vsTeamHeader}>
            <TouchableOpacity 
              onPress={() => setSelectedTeam(null)}
              style={[styles.changeTeamButton, { backgroundColor: colors.primary }]}
            >
              <Text allowFontScaling={false} style={[styles.changeTeamText, { color: 'white' }]}>Change Team</Text>
            </TouchableOpacity>
            <View style={styles.selectedTeamInfo}>
              <Image 
                source={{ uri: getThemeTeamLogoUrl('mlb', selectedTeam.abbr) }}
                style={styles.selectedTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
              />
              <Text allowFontScaling={false} style={[styles.selectedTeamName, { color: theme.text }]}>{selectedTeam.name}</Text>
            </View>
          </View>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No data available against this team</Text>
        </View>
      );
    }

    // Use the exact same renderStatBox and renderStatsGrid functions as Stats section
    const renderStatBox = (label, value, key, ranking = null) => {
      let displayValue = value;
      if (value !== undefined && value !== null && !isNaN(value)) {
        if (typeof value === 'number') {
          displayValue = value % 1 === 0 ? value.toString() : value.toFixed(3);
        }
      } else {
        displayValue = '--';
      }

      return (
        <View key={key} style={[styles.statBox, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.statBoxValue, { color: colors.primary }]}>{displayValue}</Text>
          <Text allowFontScaling={false} style={[styles.statBoxLabel, { color: theme.textSecondary }]}>{label}</Text>
        </View>
      );
    };

    const renderStatsGrid = (stats, title, statDefinitions) => {
      const statsRows = [];
      for (let i = 0; i < statDefinitions.length; i += 3) {
        const rowStats = statDefinitions.slice(i, i + 3);
        statsRows.push(
          <View key={i} style={styles.statsRow}>
            {rowStats.map(({ key, label }) => {
              let value = stats[key];
              
              // Handle calculated stats
              if (key === 'xbhAllowed') {
                // XBH/A = Doubles + Triples allowed
                const doubles = stats.doubles || 0;
                const triples = stats.triples || 0;
                value = doubles + triples;
              }
              
              return renderStatBox(label, value, `${title}-${key}`);
            })}
          </View>
        );
      }
      return statsRows;
    };

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.statsContent}>
          {/* Team selection header */}
          <View style={[styles.vsTeamHeader, { backgroundColor: theme.background }]}>
            <TouchableOpacity 
              onPress={() => setSelectedTeam(null)}
              style={[styles.changeTeamButton, { backgroundColor: colors.primary }]}
            >
              <Text allowFontScaling={false} style={[styles.changeTeamText, { color: 'white' }]}>Change Team</Text>
            </TouchableOpacity>
            <View style={styles.selectedTeamInfo}>
              <Image 
                source={{ uri: getThemeTeamLogoUrl('mlb', selectedTeam.abbr) }}
                style={styles.selectedTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
              />
              <Text allowFontScaling={false} style={[styles.selectedTeamName, { color: theme.text }]}>{selectedTeam.name}</Text>
            </View>
          </View>

          {/* Hitting Stats */}
          {vsTeamStats.hitting && hasStatsData(vsTeamStats.hitting) && (
            <View style={styles.statsSection}>
              <View style={styles.vsTeamStatsHeader}>
                <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: colors.primary }]}>
                  Hitting Statistics vs{' '}
                </Text>
                <Image 
                  source={{ uri: getThemeTeamLogoUrl('mlb', selectedTeam.abbr) }}
                  style={styles.vsTeamStatLogo}
                  defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
                />
              </View>
              {renderStatsGrid(
                vsTeamStats.hitting,
                'hitting',
                [
                  { key: 'avg', label: 'AVG' },
                  { key: 'obp', label: 'OBP' },
                  { key: 'slg', label: 'SLG' },
                  { key: 'ops', label: 'OPS' },
                  { key: 'homeRuns', label: 'HR' },
                  { key: 'rbi', label: 'RBI' },
                  { key: 'runs', label: 'Runs' },
                  { key: 'hits', label: 'Hits' },
                  { key: 'doubles', label: '2B' },
                  { key: 'triples', label: '3B' },
                  { key: 'baseOnBalls', label: 'BB' },
                  { key: 'strikeOuts', label: 'SO' },
                  { key: 'stolenBases', label: 'SB' },
                  { key: 'atBats', label: 'AB' },
                  { key: 'plateAppearances', label: 'PA' }
                ]
              )}
            </View>
          )}

          {/* Pitching Stats */}
          {vsTeamStats.pitching && hasStatsData(vsTeamStats.pitching) && (
            <View style={styles.statsSection}>
              <View style={styles.vsTeamStatsHeader}>
                <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: colors.primary }]}>
                  Pitching Statistics vs{' '}
                </Text>
                <Image 
                  source={{ uri: getThemeTeamLogoUrl('mlb', selectedTeam.abbr) }}
                  style={styles.vsTeamStatLogo}
                  defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
                />
              </View>
              {renderStatsGrid(
                vsTeamStats.pitching,
                'pitching',
                [
                  { key: 'avg', label: 'B/AVG' },
                  { key: 'ops', label: 'B/OPS' },
                  { key: 'plateAppearances', label: 'PA' },
                  { key: 'strikeOuts', label: 'SO' },
                  { key: 'rbi', label: 'RBI/A' },
                  { key: 'xbhAllowed', label: 'XBH/A' },
                  { key: 'totalBases', label: 'TB/A' },
                  { key: 'hits', label: 'H/A' },
                  { key: 'baseOnBalls', label: 'BB/A' },
                  { key: 'homeRuns', label: 'HR/A' },
                  { key: 'atBatsPerHomeRun', label: 'AB/HR' },
                  { key: 'groundOutsToAirouts', label: 'GB/FB' },
                  { key: 'babip', label: 'BABIP' },
                  { key: 'groundIntoDoublePlay', label: 'GIDP' },
                  { key: 'gamesPlayed', label: 'G' }
                ]
              )}
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>Loading player information...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderPlayerHeader()}
      
      {/* Fixed Tab Container */}
      <View style={[styles.fixedTabContainer, { backgroundColor: theme.surface }]}>
        {renderTabButtons()}
      </View>
      
      <ScrollView 
        style={[styles.contentScrollView, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>

      {/* Detailed Stats Modal */}
      {renderDetailedStatsModal()}
      
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
  playerHeadshot: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 20,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 16,
    marginBottom: 8,
  },
  teamContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
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
  contentContainer: {
    flex: 1,
    padding: 15,
    paddingTop: 20,
  },
  contentText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Stats styles
  statsContainer: {
    flex: 1,
  },
  statsContent: {
    padding: 15,
  },
  statsLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  monthSelector: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  monthSelectorLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  monthOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 60,
    alignItems: 'center',
  },
  selectedMonthOption: {
    // Dynamic backgroundColor applied in render
  },
  monthOptionText: {
    fontSize: 12,
    fontWeight: '500',
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
  statBoxRanking: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '400',
  },
  // Game Log Styles
  gameLogContainer: {
    padding: 16,
  },
  gameLogCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  gameLogDate: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  gameLogDivider: {
    height: 1,
    marginVertical: 12,
  },
  singleGameLog: {
    paddingVertical: 8,
  },
  gameLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  gameLogHeadshot: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  gameLogInfo: {
    flex: 1,
  },
  gameLogPlayerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  gameLogStatSummary: {
    fontSize: 14,
  },
  gameLogResult: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameLogResultText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  gameLogTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  gameLogTeamLogo: {
    width: 20,
    height: 20,
    marginHorizontal: 4,
  },
  gameLogTeamName: {
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 4,
  },
  gameLogVs: {
    fontSize: 12,
    marginHorizontal: 8,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCloseButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalGameButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalGameText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalGameHeader: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  modalDate: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalTeamMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTeamContainer: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  modalTeamLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  modalTeamName: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalVs: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalResultContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modalResultText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalPlayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalPlayerImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  modalPlayerInfo: {
    flex: 1,
  },
  modalPlayerName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalPlayerPosition: {
    fontSize: 14,
  },
  modalStatsSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  modalStatCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
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
  },
  modalStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalStatLabel: {
    fontSize: 16,
    flex: 1,
  },
  modalStatValue: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  // Modal overlay and container styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  modalCloseButton: {
    padding: 5,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalGameButton: {
    padding: 5,
  },
  modalGameText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalPlaceholder: {
    width: 60, // Same width as close button for balance
  },
  modalContent: {
    flex: 1,
    padding: 15,
  },
  // Career styles
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
  // Season modal styles
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
  modalTeamName: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  // VS Team styles
  vsTeamTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  teamSelector: {
    flex: 1,
  },
  teamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  teamCard: {
    width: '48%',
    padding: 15,
    marginBottom: 10,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  teamCardLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  teamCardName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  vsTeamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 15,
  },
  changeTeamButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  changeTeamText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedTeamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedTeamLogo: {
    width: 30,
    height: 30,
    marginRight: 8,
  },
  selectedTeamName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  vsTeamHeaderLogo: {
    width: 24,
    height: 24,
    marginLeft: 5,
  },
  vsTeamStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  vsTeamStatLogo: {
    width: 24,
    height: 24,
    marginLeft: 5,
    transform: [{ translateY: -6 }],
  },
});

export default PlayerPageScreen;
