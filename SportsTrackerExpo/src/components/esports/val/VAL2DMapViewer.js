import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Text,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import {
  getMapPosition,
  getMapConfiguration,
  getMapConfigurationByName,
  getLocationsForRound,
} from '../../../utils/coordinateUtils';
import {
  getAgentDisplayName,
  getAgentImageUrl,
} from '../../../services/valorantSeriesService';

const { width: screenWidth } = Dimensions.get('window');
const MAP_SIZE = screenWidth; // Full screen width

// Helper function to get player's death time in a round
const getPlayerDeathTime = (events, playerId, roundNumber) => {
  if (!events || !Array.isArray(events)) {
    return null;
  }

  const killEvent = events.find(event => 
    event.roundNumber === roundNumber &&
    event.eventType === 'kill' &&
    event.referencePlayerId === playerId // referencePlayerId is the victim
  );

  return killEvent ? killEvent.roundTimeMillis : null;
};

// PlayerMarker component with proper fallback handling and close icon logic
const PlayerMarker = ({ position, playerInfo, theme, matchData, selectedRound, selectedTime }) => {
  const [imageError, setImageError] = useState(false);

  // Get the player's death time
  const deathTime = getPlayerDeathTime(matchData?.events, position.playerId, selectedRound);
  
  // Determine if we should show close icon or player avatar
  const shouldShowCloseIcon = deathTime !== null && selectedTime > deathTime;
  const diedAtSelectedTime = deathTime !== null && selectedTime === deathTime;

  return (
    <View
      style={[
        styles.playerDot,
        {
          left: position.x - 12, // Center the dot
          top: position.y - 12,
          backgroundColor: shouldShowCloseIcon ? 'rgba(0, 0, 0, 0)' : playerInfo.teamColor,
          borderColor: shouldShowCloseIcon ? 'rgba(0, 0, 0, 0)' : playerInfo.teamColor,
          opacity: position.isAlive ? 1.0 : 0.65, // Dead players have reduced opacity
          borderWidth: shouldShowCloseIcon ? 0 : 2,
        },
      ]}
    >
      {/* Show close icon for dead players after their death time */}
      {shouldShowCloseIcon ? (
        <Ionicons
          name="close"
          size={20}
          color={playerInfo.teamColor}
          style={{ opacity: 1, zIndex: 0 }}
        />
      ) : (
        /* Show agent icon or initial for alive players or at moment of death */
        <>
          {playerInfo.agentIcon && !imageError ? (
            <Image
              source={{ uri: playerInfo.agentIcon }}
              style={[styles.agentIcon, { opacity: position.isAlive ? 1.0 : 0.65 }]}
              onError={() => {
                setImageError(true);
              }}
            />
          ) : (
            <Text style={[styles.playerInitial, { color: 'white', opacity: position.isAlive ? 1.0 : 0.65 }]}>
              {playerInfo.playerName.charAt(0).toUpperCase()}
            </Text>
          )}
        </>
      )}
    </View>
  );
};

const VAL2DMapViewer = ({ matchData, playersWithInfo, locations, selectedRound = 1, selectedTime = null, mapName = null }) => {
  const { colors, theme } = useTheme();
  const [mapLoaded, setMapLoaded] = useState(false);

  // Get map configuration
  const mapConfig = useMemo(() => {
    // Try mapUrl first (if available)
    if (matchData?.mapUrl) {
      return getMapConfiguration(matchData.mapUrl);
    }
    
    // Fall back to mapName if provided
    if (mapName) {
      return getMapConfigurationByName(mapName);
    }
    
    // Try to get map name from matchData
    if (matchData?.map?.name) {
      return getMapConfigurationByName(matchData.map.name);
    }
    
    return null;
  }, [matchData?.mapUrl, matchData?.map?.name, mapName]);

  // Set mapLoaded to true if there's no map image (so players still show)
  useEffect(() => {
    if (!mapConfig?.displayIcon) {
      setMapLoaded(true);
    } else {
      setMapLoaded(false);
    }
  }, [mapConfig]);

  // Calculate coordinate bounds from all locations for normalization
  const coordinateBounds = useMemo(() => {
    if (!locations || locations.length === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    locations.forEach(location => {
      if (typeof location.locationX === 'number' && typeof location.locationY === 'number') {
        minX = Math.min(0, (location.locationX));
        maxX = Math.max(1025, (location.locationX));
        minY = Math.min(0, (location.locationY));
        maxY = Math.max(1025, (location.locationY));
      }
    });

    return { minX, maxX, minY, maxY };
  }, [locations]);

  // Note: selectedTime is now passed as a prop from the parent component

  // Get player positions for selected round and time
  const playerPositions = useMemo(() => {
    
    // If no specific time selected, get all positions for the round
    if (selectedTime === null || selectedTime === undefined) {
      const positions = getLocationsForRound(locations, selectedRound, null, matchData?.events);
      return positions;
    }
    
    // selectedTime is now in milliseconds, no conversion needed
    const timeMillis = selectedTime;
    
    const positions = getLocationsForRound(locations, selectedRound, timeMillis, matchData?.events);
    
    return positions;
  }, [locations, selectedRound, selectedTime]);

  // Convert positions to screen coordinates
  const screenPositions = useMemo(() => {
    if (!playerPositions.length || !coordinateBounds) {
      return [];
    }

    const positions = playerPositions.map(location => {
      const screenPos = getMapPosition(
        { x: location.locationX, y: location.locationY },
        mapConfig, // Still pass mapConfig for compatibility
        MAP_SIZE,
        coordinateBounds // Use coordinate bounds for normalization
      );

      return {
        playerId: location.playerId,
        x: screenPos.x,
        y: screenPos.y,
        originalLocation: location,
        isAlive: location.isAlive !== undefined ? location.isAlive : true, // Default to alive if not specified
      };
    });
    
    return positions;
  }, [mapConfig, playerPositions, MAP_SIZE, coordinateBounds, selectedTime, playersWithInfo]);

  // Helper function to get agent image URL (same as VALMatchScreen)
  const getAgentImage = (agentId) => {
    // Use the same method as VALMatchScreen - get agent display name first, then image URL
    const agentName = getAgentDisplayName(agentId);
    return getAgentImageUrl(agentName);
  };

  // Get kill events at the selected time and create kill lines
  const killLines = useMemo(() => {
    if (!matchData?.events || selectedTime === null || selectedTime === undefined || !screenPositions.length) {
      return [];
    }

    // selectedTime is now in milliseconds, no conversion needed
    const timeMillis = selectedTime;
    
    // Find kill events that happened EXACTLY at the selected time (exact match)
    const killEvents = matchData.events.filter(event => 
      event.eventType === 'kill' && 
      event.roundNumber === selectedRound &&
      event.roundTimeMillis === timeMillis // Exact time match
    );
    // Create lines from killer to victim
    return killEvents.map(killEvent => {
      const killerPosition = screenPositions.find(pos => pos.playerId === killEvent.playerId);
      const victimPosition = screenPositions.find(pos => pos.playerId === killEvent.referencePlayerId);
      
      if (killerPosition && victimPosition) {
        const killer = playersWithInfo?.find(p => p.playerId === killEvent.playerId);
        const victim = playersWithInfo?.find(p => p.playerId === killEvent.referencePlayerId);
        
        return {
          id: `kill-${killEvent.playerId}-${killEvent.referencePlayerId}-${killEvent.roundTimeMillis}`,
          x1: killerPosition.x,
          y1: killerPosition.y,
          x2: victimPosition.x,
          y2: victimPosition.y,
          killerTeam: killer?.teamNumber || 1,
          killerId: killEvent.playerId,
          victimId: killEvent.referencePlayerId
        };
      }
      return null;
    }).filter(Boolean);
  }, [matchData?.events, selectedRound, selectedTime, screenPositions, playersWithInfo]);

  // Get bomb and defuse locations - only show one at a time
  const { bombLocations, defuseLocations } = useMemo(() => {
    if (!matchData?.events || selectedTime === null || selectedTime === undefined || !coordinateBounds) {
      return { bombLocations: [], defuseLocations: [] };
    }

    const timeMillis = selectedTime;
    
    // Check if there are any defuse events at or before the selected time
    const defuseEvents = matchData.events.filter(event => 
      event.eventType === 'defuse' && 
      event.roundNumber === selectedRound &&
      event.roundTimeMillis <= timeMillis
    );

    // If bomb was defused, only show defuse locations (no bomb icon)
    if (defuseEvents.length > 0) {
      const defuseLocationsArray = defuseEvents.map(defuseEvent => {
        const defuser = playersWithInfo?.find(p => p.playerId === defuseEvent.playerId);
        
        // Get defuser's location at the time of defusing (or closest available)
        const defuserLocation = locations.find(loc => 
          loc.playerId === defuseEvent.playerId &&
          loc.roundNumber === selectedRound &&
          Math.abs(loc.roundTimeMillis - defuseEvent.roundTimeMillis) <= 2000 // Within 2 seconds
        );

        if (defuserLocation) {
          const screenPos = getMapPosition(
            { x: defuserLocation.locationX, y: defuserLocation.locationY },
            mapConfig,
            MAP_SIZE,
            coordinateBounds
          );

          return {
            id: `defuse-${defuseEvent.playerId}-${defuseEvent.roundTimeMillis}`,
            x: screenPos.x,
            y: screenPos.y,
            defuserTeam: defuser?.teamNumber || 1,
            defuseTime: defuseEvent.roundTimeMillis
          };
        }
        return null;
      }).filter(Boolean);

      return { bombLocations: [], defuseLocations: defuseLocationsArray };
    }

    // If no defuse events, show bomb locations (if any)
    const bombPlantEvents = matchData.events.filter(event => 
      event.eventType === 'plant' && 
      event.roundNumber === selectedRound &&
      event.roundTimeMillis <= timeMillis
    );

    const bombLocationsArray = bombPlantEvents.map(plantEvent => {
      const planter = playersWithInfo?.find(p => p.playerId === plantEvent.playerId);
      
      // Get planter's location at the time of planting (or closest available)
      const planterLocation = locations.find(loc => 
        loc.playerId === plantEvent.playerId &&
        loc.roundNumber === selectedRound &&
        Math.abs(loc.roundTimeMillis - plantEvent.roundTimeMillis) <= 2000 // Within 2 seconds
      );

      if (planterLocation) {
        const screenPos = getMapPosition(
          { x: planterLocation.locationX, y: planterLocation.locationY },
          mapConfig,
          MAP_SIZE,
          coordinateBounds
        );

        return {
          id: `bomb-${plantEvent.playerId}-${plantEvent.roundTimeMillis}`,
          x: screenPos.x,
          y: screenPos.y,
          planterTeam: planter?.teamNumber || 1,
          plantTime: plantEvent.roundTimeMillis
        };
      }
      return null;
    }).filter(Boolean);

    return { bombLocations: bombLocationsArray, defuseLocations: [] };
  }, [matchData?.events, selectedRound, selectedTime, locations, coordinateBounds, mapConfig, playersWithInfo]);

  // Determine attacking team for this round - memoized for use in both player colors and kill lines
  const attackingTeamNumber = useMemo(() => {
    let attacking = 1; // Default
    if (matchData?.events) {
      const roundEvents = matchData.events.filter(e => e.roundNumber === selectedRound);
      if (roundEvents.length > 0) {
        attacking = roundEvents[0].attackingTeamNumber;
      }
    } else if (matchData?.attackingFirstTeamNumber) {
      // Use match data attacking first team number as fallback
      attacking = matchData.attackingFirstTeamNumber;
    }
    return attacking;
  }, [matchData?.events, matchData?.attackingFirstTeamNumber, selectedRound]);

  // Get player info for rendering with attacking/defending team colors
  const getPlayerInfo = (playerId) => {
    // Find player in playersWithInfo using the same structure as VALMatchScreen kill feed
    const player = playersWithInfo?.find(p => p.playerId === playerId);
    
    // Determine team colors based on attacking/defending sides
    let teamColor;
    if (player && matchData) {
      // Get player's team number from the player object
      const playerTeamNumber = player.teamNumber;
      
      // Attacking team = red/error color, Defending team = blue/success color
      if (playerTeamNumber === attackingTeamNumber) {
        teamColor = theme.error || '#FF6B6B'; // Red for attacking team
      } else {
        teamColor = theme.success || '#4ECDC4'; // Blue for defending team
      }
    } else {
      // Final fallback: assign teams based on playerId (simple heuristic)
      const uniquePlayerIds = [...new Set(locations.map(l => l.playerId))].sort((a, b) => a - b);
      const playerIndex = uniquePlayerIds.indexOf(playerId);
      const playerTeamNumber = playerIndex < uniquePlayerIds.length / 2 ? 1 : 2;
      teamColor = playerTeamNumber === 1 ? (colors.primary || '#007AFF') : (colors.secondary || '#FF9500');
    }

    // Get agent image URL using the same method as VALMatchScreen kill feed
    const agentId = player?.characterId || player?.agentId;
    const agentImageUrl = agentId ? getAgentImage(agentId) : null;

    return {
      player,
      teamColor,
      agentName: getAgentDisplayName(agentId) || 'Unknown',
      agentIcon: agentImageUrl,
      playerName: player?.displayName || `Player ${playerId}`,
    };
  };

  if (!coordinateBounds) {
    return (
      <View style={[styles.mapViewerContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          No coordinate data available for positioning
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.mapViewerContainer, { backgroundColor: theme.background }]}>
      {/* Map container */}
      <View style={styles.mapSection}>
        <View
          style={[
            styles.mapContainer,
            {
              width: MAP_SIZE,
              height: MAP_SIZE,
              backgroundColor: theme.background,
              // Removed rotation transform - coordinates should not rotate with map config
            },
          ]}
        >
          {/* Map image */}
          {mapConfig?.displayIcon ? (
            <Image
              source={{ uri: mapConfig.displayIcon }}
              style={[
                styles.mapImage,
                {
                  transform: [{ rotate: `${mapConfig?.rotate || 0}deg` }],
                },
              ]}
              onLoad={() => setMapLoaded(true)}
              onError={() => setMapLoaded(false)}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Text style={[styles.loadingText, { color: theme.text }]}>
                Map image not available
              </Text>
            </View>
          )}

          {/* Loading indicator */}
          {mapConfig?.displayIcon && !mapLoaded && (
            <View style={styles.mapPlaceholder}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: theme.text }]}>
                Loading map...
              </Text>
            </View>
          )}

          {/* Render bomb locations first (lowest z-index, below everything except map) */}
          {bombLocations.map((bomb) => (
            <View
              key={bomb.id}
              style={[
                styles.bombMarker,
                {
                  left: bomb.x - 12,
                  top: bomb.y - 12,
                }
              ]}
            >
              <FontAwesome6
                name="bomb"
                size={20}
                color={bomb.planterTeam === attackingTeamNumber ? theme.error : theme.success}
              />
            </View>
          ))}

          {/* Render defuse locations (above bomb, below players) */}
          {defuseLocations.map((defuse) => (
            <View
              key={defuse.id}
              style={[
                styles.defuseMarker,
                {
                  left: defuse.x - 12,
                  top: defuse.y - 12,
                }
              ]}
            >
              <FontAwesome6
                name="wrench"
                size={20}
                color={defuse.defuserTeam === attackingTeamNumber ? theme.error : theme.success}
              />
            </View>
          ))}

          {/* Render victims first (lowest z-index) */}
          {screenPositions
            .filter(position => {
              // Show victims (dead players) and players not involved in kills
              const isKiller = killLines.some(line => line.killerId === position.playerId);
              return !isKiller;
            })
            .map((position) => {
              const playerInfo = getPlayerInfo(position.playerId);
              
              return (
                <PlayerMarker
                  key={position.playerId}
                  position={position}
                  playerInfo={playerInfo}
                  theme={theme}
                  matchData={matchData}
                  selectedRound={selectedRound}
                  selectedTime={selectedTime}
                />
              );
            })}

          {/* Kill Lines - SVG overlay (above victims, below killers) */}
          {killLines.length > 0 && (
            <Svg
              style={StyleSheet.absoluteFillObject}
              width={MAP_SIZE}
              height={MAP_SIZE}
              pointerEvents="none"
            >
              {killLines.map((line) => (
                <Line
                  key={line.id}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={line.killerTeam === attackingTeamNumber ? theme.error : theme.success} // Attacking team = red, Defending team = blue
                  strokeWidth="3"
                  strokeOpacity="0.9"
                />
              ))}
            </Svg>
          )}

          {/* Render killers last (highest z-index) */}
          {screenPositions
            .filter(position => {
              // Show only killers
              return killLines.some(line => line.killerId === position.playerId);
            })
            .map((position) => {
              const playerInfo = getPlayerInfo(position.playerId);
              
              return (
                <PlayerMarker
                  key={`killer-${position.playerId}`}
                  position={position}
                  playerInfo={playerInfo}
                  theme={theme}
                  matchData={matchData}
                  selectedRound={selectedRound}
                  selectedTime={selectedTime}
                />
              );
            })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mapViewerContainer: {
    flex: 1,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 50,
  },
  mapSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  mapContainer: {
    position: 'relative',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mapImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  mapPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  playerDot: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  agentIcon: {
    width: 20,
    height: 20,
    borderRadius: 9,
  },
  playerInitial: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventsInfo: {
    alignItems: 'center',
    marginTop: 12,
  },
  eventsText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bombMarker: {
    position: 'absolute',
    zIndex: 0, // Lowest z-index (below everything except map)
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
  },
  defuseMarker: {
    position: 'absolute',
    zIndex: 0, // Above bomb, but still below players and kill lines
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
  },
});

export default VAL2DMapViewer;