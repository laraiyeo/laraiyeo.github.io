import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList,
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';

const ResultsScreen = ({ route }) => {
  const { theme, colors } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigation = useNavigation();
  
  const [selectedType, setSelectedType] = useState('CURRENT');
  const [results, setResults] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [allEventsLoaded, setAllEventsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const resultTypes = [
    { key: 'LAST', name: 'Last' },
    { key: 'CURRENT', name: 'Current' },
    { key: 'UPCOMING', name: 'Upcoming' }
  ];

  useEffect(() => {
    fetchResults();
  }, [selectedType]);

  const fetchResults = async () => {
    // If we already loaded all events, compute filtered results from cache
    if (allEventsLoaded && allEvents && allEvents.length > 0) {
      const filtered = filterEventsByType(allEvents, selectedType, new Date());
      setResults(filtered);
      return;
    }

    try {
      setLoading(true);
      const now = new Date();
      const nowMs = Date.now();

      // Fetch calendar first (efficient approach)
      const calUrl = 'https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/calendar/ondays?lang=en&region=us';
      const calResp = await fetch(calUrl);
      const calJson = await calResp.json();

      if (!calJson || !Array.isArray(calJson.sections)) {
        throw new Error('Invalid calendar data');
      }

      // Process all calendar sections in parallel instead of one by one
      const sectionPromises = calJson.sections.map(async (section) => {
        try {
          const evName = section.label || section.title || 'Event';
          const startDate = section.startDate || section.event?.startDate || section.event?.date;
          const endDate = section.endDate || section.event?.endDate || section.event?.date;
          const eventRef = section.event?.$ref;

          if (!startDate || !endDate || !eventRef) {
            console.log(`Future: ${evName}`);
            return null;
          }

          const startMs = Date.parse(startDate);
          const endMs = Date.parse(endDate);
          const endPlusOneMs = endMs + 24 * 60 * 60 * 1000;

          // Fetch event data
          const eventData = await fetchRef(eventRef);
          if (!eventData) return null;

          // Fetch venue details for circuit name & country flag
          let venueName = '';
          let countryFlag = '';
          if (eventData.venues && eventData.venues.length > 0 && eventData.venues[0].$ref) {
            try {
              const venueData = await fetchRef(eventData.venues[0].$ref);
              venueName = venueData?.fullName || '';
              countryFlag = venueData?.countryFlag?.href || '';
            } catch (venueErr) {
              console.warn('Failed to fetch venue info for event', eventData.id, venueErr);
            }
          }

          // Determine event status based on timestamps
          const isCompleted = nowMs > endPlusOneMs;
          const isUpcoming = nowMs < startMs;
          const isInProgress = !isCompleted && !isUpcoming;

          const enriched = {
            ...eventData,
            eventDate: new Date(eventData.date),
            endDate: new Date(endDate),
            countryFlag,
            venueName,
            isCompleted,
            isUpcoming,
            competitionWinners: {},
            winnerName: '',
            winnerTeam: '',
            winnerTeamColor: '#333333'
          };

          // For completed races, find the race winner
          if (isCompleted) {
            try {
              const raceCompetition = (eventData.competitions || []).find(comp => {
                const type = comp.type || {};
                const name = (type.name || type.displayName || type.abbreviation || type.text || '').toString().toLowerCase();
                return name.includes('race') && !name.includes('sprint');
              });

              if (raceCompetition) {
                // Use competitors directly from the race competition data
                const competitors = raceCompetition?.competitors || [];

                const winnerComp = Array.isArray(competitors) ? 
                  (competitors.find(c => c.winner === true) || competitors.find(c => c.rank === 1 || c.order === 1)) : null;

                if (winnerComp) {
                  // Resolve athlete name
                  let winnerName = '';
                  try {
                    const athleteRef = winnerComp.athlete?.$ref || null;
                    if (athleteRef && typeof athleteRef === 'string') {
                      const athleteData = await fetchRef(athleteRef);
                      winnerName = athleteData?.displayName || athleteData?.shortName || athleteData?.fullName || athleteRef;
                    } else if (winnerComp.athlete && typeof winnerComp.athlete === 'object') {
                      winnerName = winnerComp.athlete.displayName || winnerComp.athlete.shortName || winnerComp.athlete.fullName || '';
                    }
                  } catch (aerr) {
                    winnerName = winnerComp.athlete?.shortName || winnerComp.athlete?.displayName || winnerComp.athlete || '';
                  }

                  const manufacturer = winnerComp.vehicle?.manufacturer || winnerComp.team?.displayName || '';
                  enriched.winnerName = winnerName;
                  enriched.winnerTeam = manufacturer;
                  enriched.winnerTeamColor = manufacturer ? `#${getTeamColor(manufacturer)}` : '#333333';

                  // Console log for finished race
                  const winnerTeamColor = manufacturer ? `#${getTeamColor(manufacturer)}` : '';
                  console.log(`Finished Race: ${evName}${venueName ? ` (${venueName})` : ''}${countryFlag ? ` [flag: ${countryFlag}]` : ''}: Winner: ${winnerName || 'UNKNOWN'} - ${manufacturer || 'UNKNOWN'}${winnerTeamColor ? ` • ${winnerTeamColor}` : ''}`);
                }
              }
            } catch (winnerErr) {
              console.warn('Failed to resolve winner for completed event', eventData.id, winnerErr);
            }
          }

          // For in-progress races, build competition winners map
          if (isInProgress) {
            const competitionWinners = {};
            let anyWinners = false;
            // Track next/current competition for display time and type
            let nextCompetition = null;
            let nextCompetitionMs = null;

            try {
              const competitions = eventData.competitions || [];
              for (const competition of competitions) {
                try {
                  // Use competition data directly - no need to fetch $ref
                  const compData = competition;
                  const compType = compData?.type || {};
                  const compAbbr = compType.abbreviation || compType.displayName || compType.text || compType.name || 'Competition';

                  // Normalize common abbreviations
                  const abbr = (compType.abbreviation || '').toString();
                  const typeMap = {
                    'FP1': 'Free Practice 1',
                    'FP2': 'Free Practice 2',
                    'FP3': 'Free Practice 3',
                    'SS': 'Sprint Shootout',
                    'SR': 'Sprint Race',
                    'Qual': 'Qualifying',
                    'Race': 'Race'
                  };
                  const compName = (abbr && typeMap[abbr]) ? typeMap[abbr] : 
                    (compType.displayName || compType.text || compType.name || compType.abbreviation || 'Competition');

                  // Check if this competition is scheduled (for display time/type)
                  try {
                    const statusRef = compData?.status?.$ref;
                    let statusData = null;
                    if (typeof statusRef === 'string') {
                      statusData = await fetchRef(statusRef);
                    } else if (compData?.status && typeof compData.status === 'object') {
                      statusData = compData.status;
                    }

                    const isScheduled = statusData && (
                      statusData.type?.name === 'STATUS_SCHEDULED' ||
                      statusData.type?.state === 'pre' ||
                      statusData.type === 'pre' ||
                      statusData.type?.name?.toString().toLowerCase().includes('scheduled')
                    );

                    const compStartMs = Date.parse(compData?.date || '');
                    if (isScheduled && compStartMs && (!nextCompetitionMs || compStartMs < nextCompetitionMs)) {
                      nextCompetition = {
                        compType,
                        compName,
                        compDate: compData?.date,
                        compTypeText: compType.text || compType.displayName || compType.abbreviation || compName
                      };
                      nextCompetitionMs = compStartMs;
                    }
                  } catch (statusInspectErr) {
                    // ignore status inspection errors
                  }

                  const competitors = compData?.competitors || [];
                  const winners = Array.isArray(competitors) ? competitors.filter(c => c.winner === true) : [];

                  if (winners.length > 0) {
                    anyWinners = true;
                    for (const w of winners) {
                      // Resolve athlete name for display
                      let athleteName = '';
                      try {
                        const athleteRef = w.athlete?.$ref || null;
                        if (athleteRef && typeof athleteRef === 'string') {
                          const athleteData = await fetchRef(athleteRef);
                          athleteName = athleteData?.displayName || athleteData?.shortName || athleteData?.fullName || athleteRef;
                        } else if (w.athlete && typeof w.athlete === 'object') {
                          athleteName = w.athlete.displayName || w.athlete.shortName || w.athlete.fullName || '';
                        }
                      } catch (aerr) {
                        athleteName = w.athlete?.shortName || w.athlete?.displayName || w.athlete || '';
                      }

                      const manufacturer = w.vehicle?.manufacturer || w.team?.displayName || '';
                      const teamColor = manufacturer ? `#${getTeamColor(manufacturer)}` : '';

                      // Store for UI
                      competitionWinners[compName] = {
                        winnerName: athleteName || 'TBD',
                        winnerTeam: manufacturer || '',
                        winnerTeamColor: teamColor
                      };

                      // Console log
                      console.log(`In Progress Race: ${evName}${venueName ? ` (${venueName})` : ''}${countryFlag ? ` [flag: ${countryFlag}]` : ''}: Competition: ${compAbbr} | Winner: ${athleteName || 'UNKNOWN'} - ${manufacturer || 'UNKNOWN'}${teamColor ? ` • ${teamColor}` : ''}`);
                    }
                  } else {
                    // No explicit winner flag; check competition status
                    try {
                      let statusRef = compData?.status?.$ref;
                      let statusData = null;
                      if (typeof statusRef === 'string') {
                        statusData = await fetchRef(statusRef);
                      } else if (compData?.status && typeof compData.status === 'object') {
                        statusData = compData.status;
                      }

                      const isCompletedStatus = statusData && (
                        statusData.type?.completed === true ||
                        statusData.type?.name === 'STATUS_FINAL' ||
                        statusData.type?.state === 'post' ||
                        statusData.completed === true ||
                        statusData.type === 'post'
                      );

                      if (isCompletedStatus) {
                        const firstPlace = Array.isArray(competitors) ? 
                          (competitors.find(c => c.order === 1 || c.rank === 1) || competitors[0]) : null;
                        if (firstPlace) {
                          anyWinners = true;
                          // Resolve athlete name and manufacturer
                          let athleteName = '';
                          try {
                            const athleteRef = firstPlace.athlete?.$ref || null;
                            if (athleteRef && typeof athleteRef === 'string') {
                              const athleteData = await fetchRef(athleteRef);
                              athleteName = athleteData?.displayName || athleteData?.shortName || athleteData?.fullName || athleteRef;
                            } else if (firstPlace.athlete && typeof firstPlace.athlete === 'object') {
                              athleteName = firstPlace.athlete.displayName || firstPlace.athlete.shortName || firstPlace.athlete.fullName || '';
                            }
                          } catch (aerr) {
                            athleteName = firstPlace.athlete?.shortName || firstPlace.athlete?.displayName || firstPlace.athlete || '';
                          }

                          const manufacturer = firstPlace.vehicle?.manufacturer || firstPlace.team?.displayName || '';
                          const teamColor = manufacturer ? `#${getTeamColor(manufacturer)}` : '';

                          // Store for UI
                          competitionWinners[compName] = {
                            winnerName: athleteName || 'TBD',
                            winnerTeam: manufacturer || '',
                            winnerTeamColor: teamColor
                          };

                          // Console log
                          console.log(`In Progress Race: ${evName}${venueName ? ` (${venueName})` : ''}${countryFlag ? ` [flag: ${countryFlag}]` : ''}: Competition: ${compAbbr} | Winner: ${athleteName || 'UNKNOWN'} - ${manufacturer || 'UNKNOWN'}${teamColor ? ` • ${teamColor}` : ''}`);
                        }
                      }
                    } catch (statusErr) {
                      // Fallback to order/rank heuristics
                      try {
                        const firstPlace = Array.isArray(competitors) ? 
                          (competitors.find(c => c.order === 1 || c.rank === 1) || null) : null;
                        if (firstPlace) {
                          anyWinners = true;
                          let athleteName = '';
                          try {
                            const athleteRef = firstPlace.athlete?.$ref || null;
                            if (athleteRef && typeof athleteRef === 'string') {
                              const athleteData = await fetchRef(athleteRef);
                              athleteName = athleteData?.displayName || athleteData?.shortName || athleteData?.fullName || athleteRef;
                            } else if (firstPlace.athlete && typeof firstPlace.athlete === 'object') {
                              athleteName = firstPlace.athlete.displayName || firstPlace.athlete.shortName || firstPlace.athlete.fullName || '';
                            }
                          } catch (aerr) {
                            athleteName = firstPlace.athlete?.shortName || firstPlace.athlete?.displayName || firstPlace.athlete || '';
                          }

                          const manufacturer = firstPlace.vehicle?.manufacturer || firstPlace.team?.displayName || '';
                          const teamColor = manufacturer ? `#${getTeamColor(manufacturer)}` : '';

                          // Store for UI
                          competitionWinners[compName] = {
                            winnerName: athleteName || 'TBD',
                            winnerTeam: manufacturer || '',
                            winnerTeamColor: teamColor
                          };

                          // Console log
                          console.log(`In Progress Race: ${evName}${venueName ? ` (${venueName})` : ''}${countryFlag ? ` [flag: ${countryFlag}]` : ''}: Competition: ${compAbbr} | Winner(heuristic): ${athleteName || 'UNKNOWN'} - ${manufacturer || 'UNKNOWN'}${teamColor ? ` • ${teamColor}` : ''}`);
                        }
                      } catch (fallbackErr) {
                        // ignore and continue
                      }
                    }
                  }
                } catch (ce) {
                  console.warn('Error processing competition in-progress', ce);
                }
              }

              if (!anyWinners) {
                console.log(`In Progress Race: ${evName}: No winners found yet`);
              }

              // If we found a scheduled competition, use its date/time and type for display
              if (nextCompetition && nextCompetition.compDate) {
                try {
                  enriched.eventDate = new Date(nextCompetition.compDate);
                  enriched.date = nextCompetition.compDate;
                  enriched.nextCompetitionType = nextCompetition.compTypeText;
                  // Don't update isUpcoming - keep the event classified as in-progress
                  // since it's based on the overall event timeframe, not individual competition time
                } catch (dateSetErr) {
                  // ignore date setting errors
                }
              }
            } catch (cwErr) {
              console.warn('Error building competition winners', cwErr);
            }

            enriched.competitionWinners = competitionWinners;
          }

          // For future races, just log
          if (isUpcoming) {
            console.log(`Future: ${evName}`);
          }

          return enriched;
        } catch (eventErr) {
          console.warn('Error processing event from calendar', eventErr);
          return null;
        }
      });

      // Wait for all events to be processed and filter out nulls
      const eventsWithDetails = (await Promise.all(sectionPromises)).filter(Boolean);

      // Cache all events for tab switching
      setAllEvents(eventsWithDetails);
      setAllEventsLoaded(true);

      const filtered = filterEventsByType(eventsWithDetails, selectedType, now);
      setResults(filtered);

    } catch (error) {
      console.error('Error fetching F1 results:', error);
      Alert.alert('Error', 'Failed to fetch F1 results');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterEventsByType = (events, type, now = new Date()) => {
    switch (type) {
      case 'LAST':
        return events
          .filter(e => e.isCompleted)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
      case 'CURRENT':
        return events
          .filter(e => !e.isCompleted && !e.isUpcoming)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      case 'UPCOMING':
        return events
          .filter(e => e.isUpcoming)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      default:
        return [];
    }
  };

  const convertToHttps = (url) => {
    if (!url) return url;
    // Handle protocol-relative URLs like //a.espncdn.com/...
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    // Handle root-relative paths like /i/teamlogos/... -- prefix with ESPN CDN host
    if (url.startsWith('/')) {
      return `https://a.espncdn.com${url}`;
    }
    if (url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  };

  // Simple in-memory cache to deduplicate $ref fetches for venue/athlete/competition
  const refCache = new Map();
  const fetchRef = async (refUrl) => {
    if (!refUrl) return null;
    const normalized = convertToHttps(refUrl);
    if (refCache.has(normalized)) return refCache.get(normalized);
    try {
      const resp = await fetch(normalized);
      const json = await resp.json();
      refCache.set(normalized, json);
      return json;
    } catch (err) {
      console.warn('Failed to fetch ref', normalized, err);
      refCache.set(normalized, null);
      return null;
    }
  };

  // Map constructor/team display names to hex colors (same idea as web results.js)
  const getTeamColor = (constructorName) => {
    if (!constructorName) return '333333';
    const colorMap = {
      'Mercedes': '27F4D2',
      'Red Bull': '3671C6',
      'Ferrari': 'E8002D',
      'McLaren': 'FF8000',
      'Alpine': 'FF87BC',
      'Racing Bulls': '6692FF',
      'Aston Martin': '229971',
      'Williams': '64C4FF',
      'Sauber': '52E252',
      'Haas': 'B6BABD'
    };
    return colorMap[constructorName] || '333333';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const options = { 
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    };
    return date.toLocaleTimeString('en-US', options);
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

  const onRefresh = React.useCallback(() => {
    // Clear cached events so we force a fresh fetch
    setRefreshing(true);
    setAllEvents([]);
    setAllEventsLoaded(false);
    fetchResults();
  }, [selectedType]);

  const renderResultItem = (event) => (
    <TouchableOpacity
      key={event.id}
      style={[
        styles.resultItem,
        { backgroundColor: theme.surface, borderColor: theme.border },
        event.isCompleted ? { borderLeftWidth: 6, borderLeftColor: event.winnerTeamColor || '#333' } : {}
      ]}
      onPress={() => {
        // Navigate to F1 race details
        navigation.navigate('F1RaceDetails', {
          raceId: event.id,
          eventId: event.id, // pass explicit eventId for clarity
          nextCompetitionType: event.nextCompetitionType || null,
          raceName: event.name,
          raceDate: event.date,
          sport: 'f1'
        });
      }}
    >
      <View style={styles.resultHeader}>
        <Text allowFontScaling={false} style={[styles.raceName, { color: theme.text }]} numberOfLines={1}>
          {event.name}
        </Text>
        <Text allowFontScaling={false} style={[styles.raceDate, { color: theme.textSecondary }]}>
          {formatDate(event.date)}
        </Text>
      </View>

      {/* Circuit info: country flag + circuit name */}
      <View style={styles.resultInfo}>
        <View style={styles.flagAndCircuit}>
          {event.countryFlag ? (
            <Image
              source={{ uri: convertToHttps(event.countryFlag) }}
              style={styles.countryFlag}
              onError={() => { /* fail silently */ }}
            />
          ) : null}
          <View style={styles.circuitInfo}>
            <Text allowFontScaling={false} style={[styles.circuitName, { color: theme.textSecondary }]} numberOfLines={1}>
              {event.venueName || event.venue || event.location || 'Circuit Information'}
            </Text>
            {selectedType === 'CURRENT' && event.nextCompetitionType ? (
              <Text allowFontScaling={false} style={[styles.competitionType, { color: theme.textSecondary }]} numberOfLines={1}>
                {event.nextCompetitionType}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.rightColumn}>
          <Text allowFontScaling={false} style={[styles.raceTime, { color: theme.textSecondary }]}>
            {formatTime(event.date)}
          </Text>
          {/* Status (keep top-right) */}
          {selectedType === 'LAST' && (
            <Text allowFontScaling={false} style={[styles.statusText, { color: theme.success, marginTop: 6 }]}>
              Completed
            </Text>
          )}
          {selectedType === 'CURRENT' && (
            <Text allowFontScaling={false} style={[styles.statusText, { color: theme.error, marginTop: 6 }]}>
              In Progress
            </Text>
          )}
          {selectedType === 'UPCOMING' && (
            <Text allowFontScaling={false} style={[styles.statusText, { color: theme.warning, marginTop: 6 }]}>
              Scheduled
            </Text>
          )}
        </View>
      </View>
      
      {selectedType === 'LAST' && event.winnerName ? (
        <View style={styles.winnerRow}>
          <View style={styles.winnerLeft}>
            <Text allowFontScaling={false} style={[styles.winnerLabel, { color: theme.textSecondary }]}>Winner:</Text>
            <Text allowFontScaling={false} style={[styles.winnerName, { color: theme.text }]}>{event.winnerName}</Text>
          </View>
          <View style={styles.winnerRight}>
            {event.winnerTeam ? (
              <View style={styles.winnerTeamContainer}>
                {isFavorite(getF1TeamId(event.winnerTeam)) && (
                  <TouchableOpacity 
                    onPress={() => handleTeamFavoriteToggle(event.winnerTeam, event.winnerTeamColor)}
                    activeOpacity={0.7}
                    style={styles.winnerTeamFavoriteButton}
                  >
                    <Text allowFontScaling={false} style={[styles.winnerTeamFavoriteIcon, { color: colors.primary }]}>
                      ★
                    </Text>
                  </TouchableOpacity>
                )}
                <Text allowFontScaling={false} style={[styles.winnerTeamRight, { color: isFavorite(getF1TeamId(event.winnerTeam)) ? colors.primary : theme.textSecondary }]} numberOfLines={1}>
                  {event.winnerTeam}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* For current/in-progress races show winners for each competition (FP1, FP2, Qualifying, Race, etc.) */}
      {selectedType === 'CURRENT' && event.competitionWinners && Object.keys(event.competitionWinners).length > 0 ? (
        <View style={styles.winnersContainer}>
          <Text allowFontScaling={false} style={[styles.winnerLabel, { color: theme.textSecondary, marginBottom: 6 }]}>Winners:</Text>

          {(() => {
            // Sort competitions in logical race weekend order (same as web results.js)
            const competitionOrder = [
              'Free Practice 1', 'FP1',
              'Free Practice 2', 'FP2', 
              'Free Practice 3', 'FP3',
              'Sprint Shootout',
              'Sprint Race',
              'Qualifying', 'Qual',
              'Race'
            ];
            
            const sortedEntries = Object.entries(event.competitionWinners)
              .sort(([a], [b]) => {
                const indexA = competitionOrder.indexOf(a);
                const indexB = competitionOrder.indexOf(b);
                // If both found in order, use order. If not found, put at end.
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.localeCompare(b);
              });

            return sortedEntries.map(([compName, winnerObj]) => {
              // winnerObj expected as { winnerName, winnerTeam } but handle strings for safety
              const winnerName = winnerObj?.winnerName || (typeof winnerObj === 'string' ? winnerObj : 'TBD');
              const winnerTeam = winnerObj?.winnerTeam || '';

              return (
                <View key={compName} style={styles.winnerRowInProgress}>
                  <View style={styles.winnerLeft}>
                    <Text allowFontScaling={false} style={[styles.winnerNameSmall, { color: theme.text }]} numberOfLines={1}>{winnerName}</Text>
                    {winnerTeam ? (
                      <View style={styles.winnerTeamSmallContainer}>
                        {isFavorite(getF1TeamId(winnerTeam)) && (
                          <TouchableOpacity 
                            onPress={() => handleTeamFavoriteToggle(winnerTeam, event.winnerTeamColor)}
                            activeOpacity={0.7}
                            style={styles.winnerTeamSmallFavoriteButton}
                          >
                            <Text allowFontScaling={false} style={[styles.winnerTeamSmallFavoriteIcon, { color: colors.primary }]}>
                              ★
                            </Text>
                          </TouchableOpacity>
                        )}
                        <Text allowFontScaling={false} style={[styles.winnerTeamSmall, { color: isFavorite(getF1TeamId(winnerTeam)) ? colors.primary : theme.textSecondary }]} numberOfLines={1}>
                          {winnerTeam}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.winnerRight}>
                    <Text allowFontScaling={false} style={[styles.compName, { color: theme.textSecondary }]} numberOfLines={1}>{compName}</Text>
                  </View>
                </View>
              );
            });
          })()}

        </View>
      ) : null}
      
      
    </TouchableOpacity>
  );

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
      paddingHorizontal: 20,
      paddingBottom: 48,
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
    resultItem: {
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
    resultHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    raceName: {
      fontSize: 16,
      fontWeight: 'bold',
      flex: 1,
      marginRight: 10,
    },
    raceDate: {
      fontSize: 12,
      fontWeight: '500',
    },
    resultInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    circuitName: {
      fontSize: 14,
      flex: 1,
      marginRight: 10,
    },
    circuitInfo: {
      flex: 1,
      marginRight: 10,
    },
    competitionType: {
      fontSize: 12,
      fontStyle: 'italic',
      marginTop: 2,
    },
    raceTime: {
      fontSize: 12,
    },
    resultStatus: {
      alignItems: 'flex-end',
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    winnerBlock: {
      marginTop: 8,
      alignItems: 'flex-end',
    },
    winnerLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    winnerName: {
      fontSize: 14,
      fontWeight: '700',
    },
    winnerTeam: {
      fontSize: 12,
    },
    winnerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 4,
    },
    winnerLeft: {
      flex: 1,
      alignItems: 'flex-start',
    },
    winnerRight: {
      flex: 1,
      alignItems: 'flex-end',
    },
    winnerTeamRight: {
      fontSize: 12,
    },
    winnerTeamContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    winnerTeamFavoriteButton: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginRight: 4,
    },
    winnerTeamFavoriteIcon: {
      fontSize: 12,
      fontWeight: 'bold',
    },
    winnerTeamSmallContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    winnerTeamSmallFavoriteButton: {
      paddingHorizontal: 2,
      paddingVertical: 1,
      marginRight: 3,
    },
    winnerTeamSmallFavoriteIcon: {
      fontSize: 10,
      fontWeight: 'bold',
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
    flagAndCircuit: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 10,
    },
    countryFlag: {
      width: 20,
      height: 14,
      resizeMode: 'cover',
      marginRight: 8,
      borderRadius: 2,
      backgroundColor: '#fff',
    },
    rightColumn: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      width: 110,
    },
    winnersContainer: {
      marginTop: 8,
      borderTopWidth: 0,
      paddingTop: 4,
    },
    winnerRowInProgress: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
      borderRadius: 6,
    },
    winnerNameSmall: {
      fontSize: 13,
      fontWeight: '700',
    },
    winnerTeamSmall: {
      fontSize: 11,
      marginTop: 2,
    },
    compName: {
      fontSize: 12,
      fontWeight: '600',
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.typeContainer}>
          {resultTypes.map((type) => (
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
          <Text allowFontScaling={false} style={styles.loadingText}>Loading F1 Results...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.typeContainer}>
        {resultTypes.map((type) => (
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
      
      <FlatList
        data={results}
        keyExtractor={(item) => item.id?.toString() || item.uid || Math.random().toString()}
        renderItem={({ item }) => renderResultItem(item)}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={onRefresh}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={11}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text allowFontScaling={false} style={styles.emptyText}>
              No {selectedType.toLowerCase()} races found
            </Text>
          </View>
        )}
      />
    </View>
  );
};

export default ResultsScreen;