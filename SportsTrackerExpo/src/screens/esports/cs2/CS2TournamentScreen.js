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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { 
  getTournamentDetails, 
  getTournamentTeams, 
  getTournamentMatches,
  formatEventDateRange,
  formatPrizePool 
} from '../../../services/cs2Service';

const { width } = Dimensions.get('window');

// Tournament Stage Component  
const TournamentStage = ({ stage, matches, teams, theme, colors, navigation }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [activeRound, setActiveRound] = React.useState(null);
  const [showStageMatches, setShowStageMatches] = React.useState({});

  // Get stage status
  const getStageStatus = (stage) => {
    const now = new Date();
    const start = new Date(stage.start_date);
    const end = new Date(stage.end_date);
    
    if (stage.status === 'finished') return 'Completed';
    if (now < start) return 'Upcoming';
    if (now > end) return 'Completed';
    return 'In Progress';
  };

  // Calculate standings for Swiss format
  const calculateSwissStandings = (stageMatches, allTeams) => {
    const standings = {};
    
    // Initialize all teams
    allTeams.forEach(team => {
      standings[team.id] = {
        team: team,
        wins: 0,
        losses: 0,
        mapWins: 0,
        mapLosses: 0,
        roundDiff: 0
      };
    });

    // Process matches
    stageMatches.forEach(match => {
      if (match.status === 'finished' && match.winner_team_id) {
        const winner = standings[match.winner_team_id];
        const loser = standings[match.winner_team_id === match.team1_id ? match.team2_id : match.team1_id];
        
        if (winner) winner.wins++;
        if (loser) loser.losses++;
        
        if (winner) {
          winner.mapWins += match.team1_id === match.winner_team_id ? match.team1_score : match.team2_score;
          winner.mapLosses += match.team1_id === match.winner_team_id ? match.team2_score : match.team1_score;
        }
        if (loser) {
          loser.mapWins += match.team1_id !== match.winner_team_id ? match.team1_score : match.team2_score;
          loser.mapLosses += match.team1_id !== match.winner_team_id ? match.team2_score : match.team1_score;
        }
      }
    });

    // Calculate round difference and sort
    return Object.values(standings)
      .map(team => ({
        ...team,
        roundDiff: team.mapWins - team.mapLosses
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.roundDiff !== a.roundDiff) return b.roundDiff - a.roundDiff;
        return b.mapWins - a.mapWins;
      });
  };

  // Group matches by rounds for Swiss format
  const getSwissRounds = (stageMatches) => {
    const rounds = {};
    stageMatches.forEach(match => {
      if (match.round?.sequence_number) {
        const roundNum = match.round.sequence_number;
        if (!rounds[roundNum]) {
          rounds[roundNum] = {
            name: `Round ${roundNum}`,
            number: roundNum,
            matches: []
          };
        }
        rounds[roundNum].matches.push(match);
      }
    });
    return Object.values(rounds).sort((a, b) => a.number - b.number);
  };

  // Convert CS2 playoff rounds to bracket structure (like VAL's bracketJson)
  const processPlayoffBracket = (stageMatches) => {
    if (!stageMatches.length) return { type: 'single', winners: [], losers: [], grandFinal: [] };

    // Group matches by bracket type
    const upperMatches = [];
    const lowerMatches = [];
    const grandFinalMatches = [];
    const defaultMatches = [];

    stageMatches.forEach(match => {
      const bracketType = match.round?.bracket_type;
      if (bracketType === 'upper') {
        upperMatches.push(match);
      } else if (bracketType === 'lower') {
        lowerMatches.push(match);
      } else if (bracketType === 'grand final' || match.round?.name?.toLowerCase().includes('grand final')) {
        grandFinalMatches.push(match);
      } else {
        // 'default' bracket type
        defaultMatches.push(match);
      }
    });

    // Determine if it's double elimination or single elimination
    const isDoubleElimination = upperMatches.length > 0 || lowerMatches.length > 0;

    if (isDoubleElimination) {
      // Double elimination bracket
      const upperRounds = groupMatchesByRound(upperMatches);
      const lowerRounds = groupMatchesByRound(lowerMatches);
      const grandFinalRounds = groupMatchesByRound(grandFinalMatches);
      
      // Add grand final to upper bracket for display
      const winnersWithGrandFinal = [...convertToRoundsFormat(upperRounds)];
      if (grandFinalRounds.length > 0) {
        winnersWithGrandFinal.push(...convertToRoundsFormat(grandFinalRounds));
      }
      
      return {
        type: 'double',
        winners: winnersWithGrandFinal,
        losers: convertToRoundsFormat(lowerRounds),
        grandFinal: convertToRoundsFormat(grandFinalRounds)
      };
    } else {
      // Single elimination bracket
      const singleRounds = groupMatchesByRound([...defaultMatches, ...grandFinalMatches]);
      
      return {
        type: 'single',
        winners: convertToRoundsFormat(singleRounds),
        losers: [],
        grandFinal: []
      };
    }
  };

  // Group matches by round name/index
  const groupMatchesByRound = (matches) => {
    const rounds = {};
    
    matches.forEach(match => {
      const roundKey = match.round?.name || `Round ${match.round?.round_index || 1}`;
      if (!rounds[roundKey]) {
        rounds[roundKey] = {
          title: roundKey,
          roundIndex: match.round?.round_index || 1,
          matches: []
        };
      }
      rounds[roundKey].matches.push(match);
    });

    // Sort rounds by round_index
    return Object.values(rounds).sort((a, b) => a.roundIndex - b.roundIndex);
  };

  // Convert CS2 matches to VAL-style seeds format
  const convertToRoundsFormat = (rounds) => {
    return rounds.map(round => ({
      title: round.title,
      seeds: round.matches.map(match => ({
        id: match.id,
        seriesId: match.id,
        startDate: match.start_date,
        completed: match.status === 'finished',
        // Include all original match data for API calls
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        team1: match.team1,
        team2: match.team2,
        slug: match.slug,
        teams: [
          {
            id: match.team1_id,
            name: match.team1?.name || 'TBD',
            shortName: match.team1?.name || 'TBD',
            logoUrl: match.team1?.image_url,
            score: match.team1_score || 0,
            slug: match.team1?.slug
          },
          {
            id: match.team2_id,
            name: match.team2?.name || 'TBD', 
            shortName: match.team2?.name || 'TBD',
            logoUrl: match.team2?.image_url,
            score: match.team2_score || 0,
            slug: match.team2?.slug
          }
        ]
      }))
    }));
  };

  const stageMatches = matches.filter(match => match.stage?.id === stage.id);
  const stageStatus = getStageStatus(stage);
  const standings = stage.format_type === 'swiss' || stage.format_type === 'group' ? calculateSwissStandings(stageMatches, teams) : [];
  const rounds = stage.format_type === 'swiss' || stage.format_type === 'group' ? getSwissRounds(stageMatches) : [];
  const bracketData = stage.format_type === 'playoff' ? processPlayoffBracket(stageMatches) : null;

  return (
    <View style={[styles.eventCard, { backgroundColor: theme.surfaceSecondary }]}>
      <TouchableOpacity 
        style={styles.eventHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.eventHeaderLeft}>
          <Text style={[styles.eventName, { color: theme.text }]}>
            {stage.title}
          </Text>
          <View style={styles.eventMeta}>
            <View style={[
              styles.statusBadge,
              { backgroundColor: stageStatus === 'Completed' ? theme.success : stageStatus === 'In Progress' ? theme.error : theme.warning }
            ]}>
              <Text style={styles.statusText}>{stageStatus}</Text>
            </View>
            <Text style={[styles.eventDates, { color: theme.textSecondary }]}>
              {new Date(stage.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(stage.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </View>
        <Ionicons 
          name={expanded ? "chevron-up" : "chevron-down"} 
          size={24} 
          color={theme.textSecondary} 
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedContent}>
          {(stage.format_type === 'swiss' || stage.format_type === 'group') && (
            <>
              {/* Round Buttons */}
              {rounds.length > 0 && (
                <View style={styles.groupButtonsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.groupButton,
                      { borderColor: theme.border },
                      !activeRound && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => setActiveRound(null)}
                  >
                    <Text style={[
                      styles.groupButtonText,
                      { color: !activeRound ? 'white' : theme.textSecondary }
                    ]}>
                      Standings
                    </Text>
                  </TouchableOpacity>
                  {rounds.map((round) => (
                    <TouchableOpacity
                      key={round.number}
                      style={[
                        styles.groupButton,
                        { borderColor: theme.border },
                        activeRound === round.number && { backgroundColor: colors.primary, borderColor: colors.primary }
                      ]}
                      onPress={() => setActiveRound(activeRound === round.number ? null : round.number)}
                    >
                      <Text style={[
                        styles.groupButtonText,
                        { color: activeRound === round.number ? 'white' : theme.textSecondary }
                      ]}>
                        R{round.number}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Standings Table */}
              {!activeRound && standings.length > 0 && (
                <View style={styles.standingsContainer}>
                  <View style={[styles.standingsTable, { backgroundColor: theme.surface }]}>
                    <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
                      <Text style={[styles.headerText, { color: theme.textSecondary }]}>#</Text>
                      <Text style={[styles.headerTextTeam, { color: theme.textSecondary }]}>Team</Text>
                      <Text style={[styles.headerText, { color: theme.textSecondary }]}>W</Text>
                      <Text style={[styles.headerText, { color: theme.textSecondary }]}>L</Text>
                    </View>
                    {standings.map((teamData, index) => (
                      <View key={teamData.team.id} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
                        <Text style={[styles.cellText, { color: theme.text }]}>{index + 1}</Text>
                        <View style={styles.teamCell}>
                          <Image
                            source={{ uri: teamData.team.logoUrl || 'https://via.placeholder.com/20' }}
                            style={styles.teamLogoSmall}
                            resizeMode="contain"
                          />
                          <Text style={[styles.teamNameText, { color: theme.text }]} numberOfLines={1}>
                            {teamData.team.name}
                          </Text>
                        </View>
                        <Text style={[styles.cellText, { color: theme.text }]}>{teamData.wins}</Text>
                        <Text style={[styles.cellText, { color: theme.text }]}>{teamData.losses}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.showMatchesButton, { backgroundColor: theme.surface }]}
                    onPress={() => setShowStageMatches({ ...showStageMatches, [stage.id]: !showStageMatches[stage.id] })}
                  >
                    <Text style={[styles.showMatchesText, { color: colors.primary }]}>
                      {showStageMatches[stage.id] ? `Hide Matches (${stageMatches.length})` : `Show Matches (${stageMatches.length})`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Round Matches */}
              {activeRound && (
                <View style={styles.roundMatchesContainer}>
                  <Text style={[styles.roundTitle, { color: theme.text }]}>
                    Round {activeRound} Matches
                  </Text>
                  {rounds.find(r => r.number === activeRound)?.matches.map((match) => (
                    <TouchableOpacity 
                      key={match.id} 
                      style={[styles.matchCard, { backgroundColor: theme.surface }]}
                      onPress={() => {
                        navigation.navigate('CS2Results', {
                          matchId: match.id,
                          matchData: match
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.matchHeader}>
                        <Text style={[styles.matchDate, { color: theme.textSecondary }]}>
                          {match.start_date ? new Date(match.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                        </Text>
                        <Text style={[styles.matchTime, { color: theme.textSecondary }]}>
                          {match.start_date ? new Date(match.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'TBD'}
                        </Text>
                      </View>
                      <View style={styles.matchTeams}>
                        <View style={styles.matchTeam}>
                          <Image
                            source={{ uri: match.team1?.image_url || 'https://via.placeholder.com/24' }}
                            style={styles.matchTeamLogo}
                            resizeMode="contain"
                          />
                          <Text style={[
                            styles.matchTeamName, 
                            { color: theme.text },
                            match.winner_team_id !== match.team1_id && match.status === 'finished' && { opacity: 0.5 }
                          ]}>
                            {match.team1?.name || 'Team 1'}
                          </Text>
                          <Text style={[
                            styles.matchScore, 
                            { color: theme.text },
                            match.winner_team_id !== match.team1_id && match.status === 'finished' && { opacity: 0.5 }
                          ]}>
                            {match.team1_score || 0}
                          </Text>
                        </View>
                        <Text style={[styles.matchVs, { color: theme.textSecondary }]}>vs</Text>
                        <View style={styles.matchTeam}>
                          <Text style={[
                            styles.matchScore, 
                            { color: theme.text },
                            match.winner_team_id !== match.team2_id && match.status === 'finished' && { opacity: 0.5 }
                          ]}>
                            {match.team2_score || 0}
                          </Text>
                          <Text style={[
                            styles.matchTeamName, 
                            { color: theme.text },
                            match.winner_team_id !== match.team2_id && match.status === 'finished' && { opacity: 0.5 }
                          ]}>
                            {match.team2?.name || 'Team 2'}
                          </Text>
                          <Image
                            source={{ uri: match.team2?.image_url || 'https://via.placeholder.com/24' }}
                            style={styles.matchTeamLogo}
                            resizeMode="contain"
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* All Stage Matches */}
              {showStageMatches[stage.id] && !activeRound && (
                <View style={styles.matchesList}>
                  {stageMatches.map((match) => (
                    <TouchableOpacity 
                      key={match.id} 
                      style={[styles.matchCard, { backgroundColor: theme.surface }]}
                      onPress={() => {
                        navigation.navigate('CS2Results', {
                          matchId: match.id,
                          matchData: match
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.matchHeader}>
                        <Text style={[styles.matchDate, { color: theme.textSecondary }]}>
                          {match.start_date ? new Date(match.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                        </Text>
                        <Text style={[styles.matchTime, { color: theme.textSecondary }]}>
                          {match.start_date ? new Date(match.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'TBD'}
                        </Text>
                      </View>
                      <View style={styles.matchTeams}>
                        <View style={styles.matchTeam}>
                          <Image
                            source={{ uri: match.team1?.image_url || 'https://via.placeholder.com/24' }}
                            style={styles.matchTeamLogo}
                            resizeMode="contain"
                          />
                          <Text style={[
                            styles.matchTeamName, 
                            { color: theme.text },
                            match.winner_team_id !== match.team1_id && match.status === 'finished' && { opacity: 0.5 }
                          ]}>
                            {match.team1?.name || 'Team 1'}
                          </Text>
                          <Text style={[
                            styles.matchScore, 
                            { color: theme.text },
                            match.winner_team_id !== match.team1_id && match.status === 'finished' && { opacity: 0.5 }
                          ]}>
                            {match.team1_score || 0}
                          </Text>
                        </View>
                        <Text style={[styles.matchVs, { color: theme.textSecondary }]}>vs</Text>
                        <View style={styles.matchTeam}>
                          <Text style={[
                            styles.matchScore, 
                            { color: theme.text },
                            match.winner_team_id !== match.team2_id && match.status === 'finished' && { opacity: 0.5 }
                          ]}>
                            {match.team2_score || 0}
                          </Text>
                          <Text style={[
                            styles.matchTeamName, 
                            { color: theme.text },
                            match.winner_team_id !== match.team2_id && match.status === 'finished' && { opacity: 0.5 }
                          ]}>
                            {match.team2?.name || 'Team 2'}
                          </Text>
                          <Image
                            source={{ uri: match.team2?.image_url || 'https://via.placeholder.com/24' }}
                            style={styles.matchTeamLogo}
                            resizeMode="contain"
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {stage.format_type === 'playoff' && bracketData && (
            <View style={styles.playoffContainer}>
                {(() => {
                  const BOX_HEIGHT = 100;
                  const BOX_MARGIN = 20;

                  function computeBracketPositions(rounds) {
                    if (!rounds?.length) return { positions: [], maxHeight: 200 };

                    const positions = [];
                    let maxHeight = 0;

                    rounds.forEach((round, roundIndex) => {
                      const currentMatchCount = round.seeds?.length || 0;
                      
                      if (currentMatchCount === 0) {
                        positions.push([]);
                        return;
                      }

                      let spacing, yOffset;

                      // Use the same logic for both upper and lower brackets for consistency
                      const prevMatchCount = roundIndex > 0 ? rounds[roundIndex - 1]?.seeds?.length || 0 : 0;
                      const sameAsPrevious = prevMatchCount === currentMatchCount && roundIndex > 0;

                      if (sameAsPrevious) {
                        // Same number of matches as previous round - align horizontally
                        spacing = positions[roundIndex - 1].length >= 2 ? 
                          positions[roundIndex - 1][1].top - positions[roundIndex - 1][0].top : 
                          (BOX_HEIGHT + BOX_MARGIN) * Math.pow(2, roundIndex - 1);
                        yOffset = positions[roundIndex - 1][0]?.top || spacing / 2;
                      } else if (roundIndex > 0 && prevMatchCount > currentMatchCount && positions[roundIndex - 1].length > 0) {
                        // Fewer matches than previous round - center between previous matches
                        const prevPositions = positions[roundIndex - 1];
                        if (prevPositions.length >= 2) {
                          // Calculate spacing to center current matches between previous ones
                          const prevSpacing = prevPositions[1].top - prevPositions[0].top;
                          const matchesPerGroup = prevMatchCount / currentMatchCount;
                          spacing = prevSpacing * matchesPerGroup;
                          // Center the first match between appropriate previous matches
                          yOffset = prevPositions[0].top + (prevSpacing * (matchesPerGroup - 1)) / 2;
                        } else {
                          // Single previous match case
                          spacing = (BOX_HEIGHT + BOX_MARGIN) * Math.pow(2, roundIndex);
                          yOffset = prevPositions[0].top;
                        }
                      } else {
                        // First round or more matches than previous - use standard spacing
                        spacing = (BOX_HEIGHT + BOX_MARGIN) * Math.pow(2, roundIndex);
                        yOffset = spacing / 2;
                      }

                      const roundPositions = round.seeds.map((_, matchIndex) => ({
                        top: yOffset + matchIndex * spacing,
                        left: 15,
                      }));

                      positions.push(roundPositions);

                      // Calculate the maximum height needed for this round
                      if (roundPositions.length > 0) {
                        const lastMatchTop = roundPositions[roundPositions.length - 1].top;
                        const roundMaxHeight = lastMatchTop + BOX_HEIGHT + BOX_MARGIN;
                        maxHeight = Math.max(maxHeight, roundMaxHeight);
                      }
                    });

                    return { positions, maxHeight };
                  }

                  const winnerBracket = computeBracketPositions(bracketData.winners || []);
                  const loserBracket = computeBracketPositions(bracketData.losers || []);
                  
                  const winnerPositions = winnerBracket.positions;
                  const loserPositions = loserBracket.positions;

                  return (
                    <>
                      {/* Upper Bracket */}
                      {bracketData.winners && bracketData.winners.length > 0 && (
                        <View style={styles.bracketSection}>
                          <Text style={[styles.bracketSectionTitle, { color: theme.text }]}>
                            {bracketData.type === 'double' ? 'Upper Bracket' : 'Playoff Bracket'}
                          </Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.bracketScrollView}
                            contentContainerStyle={styles.bracketContainer}
                          >
                            <View style={[styles.bracketRounds, { position: 'relative', height: winnerBracket.maxHeight }]}>
                              {bracketData.winners.map((round, roundIndex) => (
                                <View key={roundIndex} style={styles.bracketRound}>
                                  <Text
                                    style={[
                                      styles.roundTitle,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {round.title}
                                  </Text>

                                  {round.seeds &&
                                    round.seeds.map((match, matchIndex) => {
                                      const pos =
                                        winnerPositions[roundIndex]?.[matchIndex] || {
                                          top: 0,
                                          left: 0,
                                        };

                                      return (
                                        <TouchableOpacity
                                          key={matchIndex}
                                          style={[
                                            styles.bracketMatch,
                                            {
                                              position: 'absolute',
                                              top: pos.top,
                                              left: pos.left,
                                              backgroundColor: theme.surface,
                                            },
                                          ]}
                                          onPress={() => {
                                            if (match.teams && match.teams.length >= 2) {
                                              navigation.navigate('CS2Results', {
                                                matchId: match.seriesId || match.id,
                                                matchData: match
                                              });
                                            }
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <Text
                                            style={[
                                              styles.matchDate,
                                              { color: theme.textSecondary },
                                            ]}
                                          >
                                            {match.startDate
                                              ? new Date(match.startDate).toLocaleDateString(
                                                  'en-US',
                                                  {
                                                    month: 'short',
                                                    day: 'numeric',
                                                  }
                                                )
                                              : 'TBD'}
                                          </Text>

                                          {match.teams &&
                                            match.teams.map((team, teamIndex) => {
                                              const isWinner =
                                                match.completed &&
                                                team.score >
                                                  (match.teams[1 - teamIndex]?.score || 0);
                                              const isLoser =
                                                match.completed &&
                                                team.score <
                                                  (match.teams[1 - teamIndex]?.score || 0);

                                              return (
                                                <View
                                                  key={teamIndex}
                                                  style={[
                                                    styles.bracketTeam,
                                                    isWinner && styles.winnerTeam,
                                                    isLoser && styles.loserTeam,
                                                  ]}
                                                >
                                                  <Image
                                                    source={{
                                                      uri:
                                                        team.logoUrl ||
                                                        'https://via.placeholder.com/18',
                                                    }}
                                                    style={[
                                                      styles.bracketTeamLogo,
                                                      { opacity: isLoser ? 0.5 : 1 },
                                                    ]}
                                                    resizeMode="contain"
                                                  />
                                                  <Text
                                                    style={[
                                                      styles.bracketTeamName,
                                                      {
                                                        color: theme.text,
                                                        opacity: isLoser ? 0.6 : 1,
                                                      },
                                                    ]}
                                                    numberOfLines={1}
                                                  >
                                                    {team.shortName || team.name || 'TBD'}
                                                  </Text>
                                                  <Text
                                                    style={[
                                                      styles.bracketTeamScore,
                                                      {
                                                        color: theme.text,
                                                        opacity: isLoser ? 0.6 : 1,
                                                      },
                                                    ]}
                                                  >
                                                    {team.score || 0}
                                                  </Text>
                                                </View>
                                              );
                                            })}
                                        </TouchableOpacity>
                                      );
                                    })}
                                </View>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      )}

                      {/* Lower Bracket */}
                      {bracketData.type === 'double' && bracketData.losers && bracketData.losers.length > 0 && (
                        <View style={styles.bracketSection}>
                          <Text style={[styles.bracketSectionTitle, { color: theme.text }]}>
                            Lower Bracket
                          </Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.bracketScrollView}
                            contentContainerStyle={styles.bracketContainer}
                          >
                            <View style={[styles.bracketRounds, { position: 'relative', height: loserBracket.maxHeight }]}>
                              {bracketData.losers.map((round, roundIndex) => (
                                <View key={roundIndex} style={styles.bracketRound}>
                                  <Text
                                    style={[
                                      styles.roundTitle,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {round.title}
                                  </Text>

                                  {round.seeds &&
                                    round.seeds.map((match, matchIndex) => {
                                      const pos =
                                        loserPositions[roundIndex]?.[matchIndex] || {
                                          top: 0,
                                          left: 0,
                                        };

                                      return (
                                        <TouchableOpacity
                                          key={matchIndex}
                                          style={[
                                            styles.bracketMatch,
                                            {
                                              position: 'absolute',
                                              top: pos.top,
                                              left: pos.left,
                                              backgroundColor: theme.surface,
                                            },
                                          ]}
                                          onPress={() => {
                                            if (match.teams && match.teams.length >= 2) {
                                              navigation.navigate('CS2Results', {
                                                matchId: match.seriesId || match.id,
                                                matchData: match
                                              });
                                            }
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <Text
                                            style={[
                                              styles.matchDate,
                                              { color: theme.textSecondary },
                                            ]}
                                          >
                                            {match.startDate
                                              ? new Date(match.startDate).toLocaleDateString(
                                                  'en-US',
                                                  {
                                                    month: 'short',
                                                    day: 'numeric',
                                                  }
                                                )
                                              : 'TBD'}
                                          </Text>

                                          {match.teams &&
                                            match.teams.map((team, teamIndex) => {
                                              const isWinner =
                                                match.completed &&
                                                team.score >
                                                  (match.teams[1 - teamIndex]?.score || 0);
                                              const isLoser =
                                                match.completed &&
                                                team.score <
                                                  (match.teams[1 - teamIndex]?.score || 0);

                                              return (
                                                <View
                                                  key={teamIndex}
                                                  style={[
                                                    styles.bracketTeam,
                                                    isWinner && styles.winnerTeam,
                                                    isLoser && styles.loserTeam,
                                                  ]}
                                                >
                                                  <Image
                                                    source={{
                                                      uri:
                                                        team.logoUrl ||
                                                        'https://via.placeholder.com/18',
                                                    }}
                                                    style={[
                                                      styles.bracketTeamLogo,
                                                      { opacity: isLoser ? 0.5 : 1 },
                                                    ]}
                                                    resizeMode="contain"
                                                  />
                                                  <Text
                                                    style={[
                                                      styles.bracketTeamName,
                                                      {
                                                        color: theme.text,
                                                        opacity: isLoser ? 0.5 : 1,
                                                      },
                                                    ]}
                                                    numberOfLines={1}
                                                    ellipsizeMode="tail"
                                                  >
                                                    {team.shortName ||
                                                      team.name ||
                                                      'TBD'}
                                                  </Text>
                                                  <Text
                                                    style={[
                                                      styles.bracketTeamScore,
                                                      {
                                                        color: theme.text,
                                                        opacity: isLoser ? 0.5 : 1,
                                                      },
                                                    ]}
                                                  >
                                                    {team.score || 0}
                                                  </Text>
                                                </View>
                                              );
                                            })}
                                        </TouchableOpacity>
                                      );
                                    })}
                                </View>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      )}
                    </>
                  );
                })()}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const CS2TournamentScreen = ({ navigation, route }) => {
  const { tournamentId, tournamentSlug } = route.params;
  const { colors, theme } = useTheme();
  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedStages, setExpandedStages] = useState({});
  const [activeRounds, setActiveRounds] = useState({});
  const [showMatches, setShowMatches] = useState({});

  useEffect(() => {
    loadData();
  }, [tournamentId, tournamentSlug]);

  // Calculate tournament status based on dates
  const getTournamentStatus = (startDate, endDate) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (now < start) return 'Upcoming';
    if (now > end) return 'Completed';
    return 'In Progress';
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [tournamentData, teamsData] = await Promise.all([
        getTournamentDetails(tournamentSlug, tournamentId),
        getTournamentTeams(tournamentSlug, tournamentId)
      ]);
      
      // Extract all matches from tournament stages with complete team data
      const allMatches = [];
      if (tournamentData?.stages) {
        tournamentData.stages.forEach(stage => {
          if (stage.rounds) {
            stage.rounds.forEach(round => {
              if (round.matches) {
                round.matches.forEach(match => {
                  allMatches.push({
                    ...match,
                    stage: { id: stage.id, title: stage.title, format_type: stage.format_type },
                    round: { id: round.id, name: round.name, bracket_type: round.bracket_type, round_index: round.round_index }
                  });
                });
              }
            });
          }
        });
      }
      
      console.log('=== TOURNAMENT DEBUG DATA ===');
      console.log('Tournament Data:', JSON.stringify(tournamentData, null, 2));
      console.log('Teams Data:', teamsData);
      console.log('Extracted Matches:', allMatches);
      console.log('Tournament Stages:', tournamentData?.stages);
      console.log('Stages length:', tournamentData?.stages?.length);
      console.log('===========================');
      
      setTournament(tournamentData);
      setTeams(teamsData);
      setMatches(allMatches);
    } catch (error) {
      console.error('Error loading tournament data:', error);
      setTournament(null);
      setTeams([]);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading tournament details...
        </Text>
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle" size={64} color={theme.textTertiary} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>
          Tournament Not Found
        </Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          Unable to load tournament details. Please try again.
        </Text>
        <TouchableOpacity 
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadData}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {/* Header */}
        <View style={[styles.heroSection, { backgroundColor: theme.surfaceSecondary }]}>
          {tournament.imageUrl || tournament.bannerImageUrl ? (
            <Image
              source={{ uri: tournament.imageUrl || tournament.bannerImageUrl }}
              style={styles.heroImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.heroImagePlaceholder, { backgroundColor: colors.primary }]}>
              <Ionicons name="trophy" size={48} color="white" />
            </View>
          )}
          
          <View style={styles.heroContent}>
            <Text style={[styles.eventTitle, { color: theme.text }]}>
              {tournament.name}
            </Text>
            
            <Text style={[styles.eventDescription, { color: theme.textSecondary }]}>
              {tournament.description || 'Counter-Strike 2 tournament'}
            </Text>
            
            {/* Event Info */}
            <View style={styles.eventInfoContainer}>
              <Text style={[styles.eventInfo, { color: theme.textSecondary }]}>
                {tournament.startDate && tournament.endDate 
                  ? formatEventDateRange(tournament.startDate, tournament.endDate)
                  : tournament.startDate 
                    ? new Date(tournament.startDate).toLocaleDateString()
                    : 'TBD'}
                {tournament.prize && (
                  <Text> • {formatPrizePool(tournament.prize)}</Text>
                )}
                <Text> • {tournament.country?.name || tournament.region?.name || 'Global'}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'overview' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
            ]}
            onPress={() => setActiveTab('overview')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'overview' ? colors.primary : theme.textSecondary }
            ]}>
              Overview
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'results' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
            ]}
            onPress={() => setActiveTab('results')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'results' ? colors.primary : theme.textSecondary }
            ]}>
              Results
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>

            {/* Tournament Stages - like VAL events */}
            {tournament.stages && tournament.stages.length > 0 && (
              <View style={styles.detailsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Results
                </Text>
                
                {tournament.stages.map((stage, stageIndex) => (
                  <TournamentStage 
                    key={stage.id} 
                    stage={stage} 
                    matches={matches.filter(match => match.stage?.id === stage.id)}
                    teams={teams}
                    theme={theme}
                    colors={colors}
                    navigation={navigation}
                  />
                ))}
              </View>
            )}
            
            {/* Participating Teams */}
            {teams.length > 0 && (
              <View style={styles.detailsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Participating Teams ({teams.length})
                </Text>
                <View style={styles.teamsGrid}>
                  {teams.map((team, index) => (
                    <View key={team.id || index} style={[styles.teamCard, { backgroundColor: theme.surfaceSecondary }]}>
                      <Image
                        source={{ uri: team.logoUrl || 'https://via.placeholder.com/40' }}
                        style={styles.teamLogo}
                        resizeMode="contain"
                      />
                      <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={2}>
                        {team.name}
                      </Text>
                      <Text style={[styles.teamCountry, { color: theme.textSecondary }]} numberOfLines={1}>
                        {team.country?.name || 'Unknown'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {activeTab === 'results' && (
          <View style={styles.detailsSection}>
            
            {(() => {
              const finishedMatches = matches.filter(match => match.status === 'finished');
              
              if (finishedMatches.length === 0) {
                return (
                  <View style={styles.comingSoonContainer}>
                    <Ionicons name="time" size={48} color={theme.textTertiary} />
                    <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
                      No finished matches available yet
                    </Text>
                  </View>
                );
              }

              // Group matches by date for headers (like VAL)
              const matchesByDate = {};
              const dateKeyToDisplay = {};
              
              finishedMatches.forEach(match => {
                if (match.start_date) {
                  const matchDate = new Date(match.start_date);
                  // Use ISO date string as key for reliable sorting
                  const dateKey = matchDate.toISOString().split('T')[0]; // YYYY-MM-DD format
                  const displayKey = matchDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  });
                  
                  if (!matchesByDate[dateKey]) {
                    matchesByDate[dateKey] = [];
                    dateKeyToDisplay[dateKey] = displayKey;
                  }
                  matchesByDate[dateKey].push(match);
                } else {
                  // Handle matches without dates
                  const tbdKey = 'tbd';
                  if (!matchesByDate[tbdKey]) {
                    matchesByDate[tbdKey] = [];
                    dateKeyToDisplay[tbdKey] = 'To Be Determined';
                  }
                  matchesByDate[tbdKey].push(match);
                }
              });

              // Sort matches within each date (most recent first)
              Object.keys(matchesByDate).forEach(dateKey => {
                matchesByDate[dateKey].sort((a, b) => {
                  const dateA = new Date(a.end_date || a.start_date || 0).getTime();
                  const dateB = new Date(b.end_date || b.start_date || 0).getTime();
                  
                  // Handle invalid dates
                  if (isNaN(dateA) && isNaN(dateB)) return 0;
                  if (isNaN(dateA)) return 1;
                  if (isNaN(dateB)) return -1;
                  
                  return dateB - dateA;
                });
              });

              return (
                <View>
                  {Object.entries(matchesByDate)
                    .sort(([dateKeyA], [dateKeyB]) => {
                      // Sort date keys in descending order (most recent first)
                      if (dateKeyA === 'tbd') return 1;
                      if (dateKeyB === 'tbd') return -1;
                      
                      // Use direct string comparison for ISO dates (YYYY-MM-DD)
                      return dateKeyB.localeCompare(dateKeyA); // Descending order
                    })
                    .map(([dateKey, dateMatches]) => (
                    <View key={dateKey} style={styles.resultsDateSection}>
                      {/* Date Header */}
                      <Text style={[styles.resultsDateHeader, { color: theme.text }]}>
                        {dateKeyToDisplay[dateKey]}
                      </Text>
                      
                      {/* Matches for this date */}
                      {dateMatches.map((match) => (
                  <TouchableOpacity 
                    key={match.id} 
                    style={[styles.resultMatchCard, { backgroundColor: theme.surfaceSecondary }]}
                    onPress={() => {
                      // Navigate to CS2 series screen with match data
                      navigation.navigate('CS2Results', {
                        matchId: match.id,
                        matchData: match
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.resultStageHeader, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.resultStageText, { color: theme.textSecondary }]}>
                        {match.round?.name || 'Main Event'}
                      </Text>
                    </View>
                    
                    <View style={styles.resultMatchContent}>
                      {/* Team 1 */}
                      <View style={[styles.resultTeam, match.winner_team_id === match.team1_id && styles.resultWinnerTeam]}>
                        <Image
                          source={{ uri: match.team1?.image_url || 'https://via.placeholder.com/48' }}
                          style={[styles.resultTeamLogo, { opacity: match.winner_team_id !== match.team1_id && match.status === 'finished' ? 0.5 : 1 }]}
                          resizeMode="contain"
                        />
                        <Text style={[
                          styles.resultTeamName, 
                          { color: theme.text },
                          match.winner_team_id !== match.team1_id && match.status === 'finished' && { opacity: 0.5 }
                        ]}>
                          {match.team1?.name || 'Team 1'}
                        </Text>
                      </View>
                      
                      {/* Score */}
                      <View style={styles.resultScoreSection}>
                        <View style={styles.resultScore}>
                          <Text style={[styles.resultScoreText, { color: ((match.winner_team_id === match.team1_id && match.status === 'finished') ? theme.text : theme.textSecondary) }]}>
                            {match.team1_score || 0}
                          </Text>
                          <Text style={[styles.resultScoreSeparator, { color: theme.textSecondary }]}>
                            -
                          </Text>
                          <Text style={[styles.resultScoreText, { color: ((match.winner_team_id === match.team2_id && match.status === 'finished') ? theme.text : theme.textSecondary) }]}>
                            {match.team2_score || 0}
                          </Text>
                        </View>
                        
                        <View style={[
                          styles.resultStatus,
                          { backgroundColor: match.status === 'finished' ? theme.success : match.status === 'current' ? theme.error : theme.warning }
                        ]}>
                          <Text style={styles.resultStatusText}>
                            {match.status === 'finished' ? 'FINISHED' : match.status === 'current' ? 'LIVE' : match.status.toUpperCase()}
                          </Text>
                        </View>
                        
                        {match.start_date && (
                          <Text style={[styles.resultTime, { color: theme.textSecondary }]}>
                            {new Date(match.start_date).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'America/New_York'
                            })}
                          </Text>
                        )}
                      </View>
                      
                      {/* Team 2 */}
                      <View style={[styles.resultTeam, styles.resultTeam2, match.winner_team_id === match.team2_id && styles.resultWinnerTeam]}>
                        <Image
                          source={{ uri: match.team2?.image_url || 'https://via.placeholder.com/48' }}
                          style={[styles.resultTeamLogo, { opacity: match.winner_team_id !== match.team2_id && match.status === 'finished' ? 0.5 : 1 }]}
                          resizeMode="contain"
                        />
                        <Text style={[
                          styles.resultTeamName, 
                          styles.resultTeamName2,
                          { color: theme.text },
                          match.winner_team_id !== match.team2_id && match.status === 'finished' && { opacity: 0.5 }
                        ]}>
                          {match.team2?.name || 'Team 2'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
                    </View>
                  ))}
                </View>
              );
            })()}
          </View>
        )}

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
  scrollView: {
    flex: 1,
  },
  heroSection: {
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  heroImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 16,
  },
  heroImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroContent: {
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
    marginRight: 6,
  },
  liveText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  eventDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  eventInfoContainer: {
    marginTop: 5,
  },
  eventInfo: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  detailsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  detailCard: {
    padding: 16,
    borderRadius: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailContent: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  teamsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  teamCard: {
    width: '31%',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 100,
    marginBottom: 12,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  teamCountry: {
    fontSize: 12,
    textAlign: 'center',
  },
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  bottomPadding: {
    height: 32,
  },
  
  // Results Tab Styles
  resultMatchCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  resultStageHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  resultStageText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  resultMatchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  resultTeam: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
  },
  resultTeam2: {
    justifyContent: 'flex-end',
  },
  resultWinnerTeam: {
    // Winner team styling will be handled by opacity in the component
  },
  resultTeamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  resultTeamName: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 80,
  },
  resultTeamName2: {
    textAlign: 'center',
  },
  resultScoreSection: {
    alignItems: 'center',
    minWidth: 100,
    paddingHorizontal: 16,
  },
  resultScore: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultScoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
  },
  resultScoreSeparator: {
    fontSize: 16,
    marginHorizontal: 8,
  },
  resultStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  resultStatusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  resultTime: {
    fontSize: 12,
  },
  
  // Results Date Section Styles (like VAL)
  resultsDateSection: {
    marginBottom: 24,
  },
  resultsDateHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  
  // Stage Card Styles
  stageCard: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    justifyContent: 'space-between',
  },
  stageHeaderLeft: {
    flex: 1,
  },
  stageName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  stageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  stageDates: {
    fontSize: 14,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  
  // Event Card Styles (matching VAL)
  eventCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    justifyContent: 'space-between',
  },
  eventHeaderLeft: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventDates: {
    fontSize: 14,
  },
  
  // Group Buttons Styles (matching VAL)
  groupButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  groupButton: {
    flexBasis: '23%', // ~25% minus gap for 4 buttons per row
    flexGrow: 1,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  groupButtonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  
  // Round Buttons Styles
  roundButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  roundButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 60,
  },
  roundButtonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  
  // Standings Styles
  standingsContainer: {
    marginBottom: 16,
  },
  standingsTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    width: 40,
    textAlign: 'center',
  },
  headerTextTeam: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
    paddingLeft: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  cellText: {
    fontSize: 14,
    width: 40,
    textAlign: 'center',
  },
  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  teamNameText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  showMatchesButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  showMatchesText: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Round Matches Styles
  roundMatchesContainer: {
    marginTop: 16,
  },
  roundTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  matchesList: {
    marginTop: 12,
  },
  matchCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  matchDate: {
    fontSize: 12,
  },
  matchTime: {
    fontSize: 12,
  },
  matchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchTeam: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchTeamName: {
    fontSize: 14,
    fontWeight: '500',
  },
  matchTeamLogo: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  matchScore: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  matchVs: {
    fontSize: 12,
    marginHorizontal: 16,
  },
  
  // Bracket Styles
  playoffContainer: {
    marginTop: 0,
    marginHorizontal: -5,
  },
  bracketScrollView: {
    marginTop: 16,
  },
  bracketContainer: {
    paddingLeft: 0,
    paddingRight: 0,
    flexDirection: 'column',
  },
  bracketSection: {
    marginBottom: 5,
  },
  bracketSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  bracketRounds: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bracketRound: {
    marginRight: 24,
    minWidth: 160,
  },
  roundTitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  bracketMatch: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    minHeight: 80,
    minWidth: 140,
  },
  bracketTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginVertical: 2,
    minWidth: 0,
    flex: 1,
  },
  winnerTeam: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  loserTeam: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  bracketTeamLogo: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  bracketTeamName: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  bracketTeamScore: {
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 20,
    textAlign: 'center',
  },
  matchDate: {
    fontSize: 12,
  },
  noMatchesText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 16,
  },
  fullBracketContainer: {
    flexDirection: 'column',
  },
  lowerBracketSection: {
    marginTop: 60,
    paddingTop: 30,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
});

export default CS2TournamentScreen;