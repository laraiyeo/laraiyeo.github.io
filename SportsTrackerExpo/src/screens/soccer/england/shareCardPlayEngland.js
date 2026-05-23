  const renderMiniField = (
    coordinate,
    coordinate2,
    eventType = "gen",
    teamSide = "home",
    teamColor = "#007bff",
  ) => {
    if (
      !coordinate ||
      coordinate.x === undefined ||
      coordinate.y === undefined
    ) {
      return (
        <View style={styles.miniField}>
          <View style={[styles.fieldContainer, { backgroundColor: "#2d5a2d" }]}>
            <View style={styles.fieldOutline} />
            <View style={styles.centerLine} />
            <View style={styles.centerCircleMini} />
            <View style={styles.penaltyAreaLeft} />
            <View style={styles.penaltyAreaRight} />
            <View style={styles.goalAreaLeft} />
            <View style={styles.goalAreaRight} />
            <View style={styles.goalLeft} />
            <View style={styles.goalRight} />
          </View>
        </View>
      );
    }

    // Exact coordinate system from web version:
    // Field split into 2 halves - right half = home, left half = away
    // X: 0 = far end, 1 = half line (center)
    // Position relative to field outline (white lines), not container
    const espnX = coordinate.x;
    const espnY = coordinate.y;

    // Convert ESPN coordinates with exact web logic
    let leftPercent, topPercent;

    if (teamSide === "home") {
      // Home team on right half of field
      // X=0 (far right) → 96% left position (near right goal)
      // X=1 (center line) → 50% left position
      leftPercent = 50 + (1 - espnX) * 46; // X=0→96%, X=1→50%
      topPercent = 4 + espnY * 92; // Y=0→4%, Y=1→96% (within field outline)
    } else {
      // Away team on left half of field
      // X=0 (far left) → 4% left position (near left goal)
      // X=1 (center line) → 50% left position
      leftPercent = 4 + espnX * 46; // X=0→4%, X=1→50%
      topPercent = 4 + (1 - espnY) * 92; // Y=0→96%, Y=1→4% (inverted, within field outline)
    }

    // Constrain to field outline bounds (white lines area)
    const finalLeftPercent = Math.max(4, Math.min(96, leftPercent));
    const finalTopPercent = Math.max(4, Math.min(96, topPercent));

    // Handle second coordinate (ball end position) - always render when available
    let ballEndPosition = null;
    let secondLeftPercent = null;
    let secondTopPercent = null;

    // Don't render the second marker/trajectory if coordinate2 is missing or is exactly (0,0)
    if (
      coordinate2 &&
      coordinate2.x !== undefined &&
      coordinate2.y !== undefined &&
      !(coordinate2.x === 0 && coordinate2.y === 0)
    ) {
      const espnX2 = coordinate2.x;
      const espnY2 = coordinate2.y;

      let leftPercent2, topPercent2;

      if (teamSide === "home") {
        // Home team on right half
        leftPercent2 = 50 + (1 - espnX2) * 46; // X=0→96%, X=1→50%
        topPercent2 = 4 + espnY2 * 92; // Y=0→4%, Y=1→96%
      } else {
        // Away team on left half
        leftPercent2 = 4 + espnX2 * 46; // X=0→4%, X=1→50%
        topPercent2 = 4 + (1 - espnY2) * 92; // Y=0→96%, Y=1→4% (inverted)
      }

      secondLeftPercent = Math.max(4, Math.min(96, leftPercent2));
      secondTopPercent = Math.max(4, Math.min(96, topPercent2));

      ballEndPosition = (
        <View
          style={[
            styles.eventMarker,
            styles.ballEndMarker,
            {
              left: `${secondLeftPercent}%`,
              top: `${secondTopPercent}%`,
              backgroundColor: teamColor.startsWith("#")
                ? teamColor
                : `#${teamColor}`,
            },
          ]}
        />
      );
    }

    // Event class determination - exact web logic
    const eventClass =
      eventType === "goal"
        ? "goal"
        : eventType === "shot"
          ? "attempt"
          : eventType === "card"
            ? "card"
            : eventType === "red-card"
              ? "red-card"
              : eventType === "offside"
                ? "offside"
                : eventType === "substitution"
                  ? "substitution"
                  : "goal";

    // Ensure team color has # prefix
    const finalTeamColor = teamColor.startsWith("#")
      ? teamColor
      : `#${teamColor}`;

    // Determine marker style based on event type
    const getMarkerStyle = () => {
      const baseStyle = [styles.eventMarker];

      switch (eventClass) {
        case "goal":
          return [
            ...baseStyle,
            styles.goalMarker,
            { backgroundColor: finalTeamColor },
          ];
        case "attempt":
          return [
            ...baseStyle,
            styles.shotMarker,
            { backgroundColor: finalTeamColor },
          ];
        case "card":
          return [...baseStyle, styles.cardMarker];
        case "red-card":
          return [...baseStyle, styles.redCardMarker];
        case "substitution":
          return [...baseStyle, styles.substitutionMarker];
        case "offside":
          return [...baseStyle, styles.offsideMarker];
        default:
          return [...baseStyle, { backgroundColor: finalTeamColor }];
      }
    };

    // Trajectory line component using native React Native (no SVG dependency)
    const TrajectoryLine = () => {
      if (
        !ballEndPosition ||
        secondLeftPercent === null ||
        secondTopPercent === null
      ) {
        return null;
      }

      // Field pixel dimensions
      const FIELD_WIDTH = 180;
      const FIELD_HEIGHT = 120;

      // Convert start/end percents into pixel coordinates inside the field
      const x1 = (finalLeftPercent / 100) * FIELD_WIDTH;
      const y1 = (finalTopPercent / 100) * FIELD_HEIGHT;
      const x2 = (secondLeftPercent / 100) * FIELD_WIDTH;
      const y2 = (secondTopPercent / 100) * FIELD_HEIGHT;

      return (
        // Render SVG covering the whole mini field so coordinates map directly
        <Svg
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 8 }}
          pointerEvents="none"
        >
          <Line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={finalTeamColor}
            strokeWidth={2}
            strokeOpacity={0.85}
          />
        </Svg>
      );
    };

    return (
      <View style={styles.miniField}>
        <View style={[styles.fieldContainer, { backgroundColor: "#2d5a2d" }]}>
          <View style={styles.fieldOutline} />
          <View style={styles.centerLine} />
          <View style={styles.centerCircleMini} />
          <View style={styles.penaltyAreaLeft} />
          <View style={styles.penaltyAreaRight} />
          <View style={styles.goalAreaLeft} />
          <View style={styles.goalAreaRight} />
          <View style={styles.goalLeft} />
          <View style={styles.goalRight} />

          {/* Trajectory line */}
          <TrajectoryLine />

          {/* Player position marker */}
          <View
            style={[
              ...getMarkerStyle(),
              {
                left: `${finalLeftPercent}%`,
                top: `${finalTopPercent}%`,
              },
            ]}
          />

          {/* Ball end position marker */}
          {ballEndPosition}
        </View>
      </View>
    );
  };
 
 {shareCardPlay && (
        <Modal
          visible={!!shareCardPlay}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShareCardPlay(null)}
        >
          <View
            style={[
              styles.goalShareCardOverlay,
              {
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <TouchableOpacity
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              activeOpacity={1}
              onPress={() => {
                console.log("Modal overlay tapped - closing goal card");
                setShareCardPlay(null);
              }}
            />

            <View style={{ alignItems: "center" }}>
              {/* Goal card content - what gets captured */}
              <ViewShot
                ref={goalShareCardRef}
                options={{
                  format: "png",
                  quality: 1,
                }}
                style={{ overflow: "hidden" }}
              >
                <View
                  style={[
                    styles.goalShareCard,
                    {
                      backgroundColor: theme.surface,
                      width: Math.min(width - 48, 540),
                    },
                  ]}
                >
                  {shareCardPlay &&
                    (() => {
                      console.log(
                        "Rendering goal share card modal with play data:",
                        shareCardPlay,
                      );
                      const play = shareCardPlay;

                      // Get team info from the context passed by long press handler
                      let homeTeamData = play._contextTeams?.homeTeam;
                      let awayTeamData = play._contextTeams?.awayTeam;
                      let contextTeamColor = play._contextTeams?.teamColor;
                      let contextPlayTeamId = play._contextTeams?.playTeamId;

                      // Fallbacks if context data is not available
                      if (!homeTeamData || !awayTeamData) {
                        // Try route params as fallback
                        homeTeamData = homeTeamData || homeTeam;
                        awayTeamData = awayTeamData || awayTeam;

                        // Try gameData as additional fallback
                        if (
                          !homeTeamData &&
                          gameData?.competitions?.[0]?.competitors
                        ) {
                          const competitors =
                            gameData.competitions[0].competitors;
                          homeTeamData = competitors.find(
                            (c) => c.homeAway === "home",
                          )?.team;
                          awayTeamData = competitors.find(
                            (c) => c.homeAway === "away",
                          )?.team;
                        }

                        // Try direct gameData structure
                        if (!homeTeamData && gameData?.homeCompetitor) {
                          homeTeamData = gameData.homeCompetitor;
                          awayTeamData = gameData.awayCompetitor;
                        }
                      }

                      console.log("Team data from context:", {
                        homeTeamData,
                        awayTeamData,
                        contextTeamColor,
                        contextPlayTeamId,
                        playContextTeams: play._contextTeams,
                      });

                      // Determine which team scored - more robust detection
                      const homeId = homeTeamData?.id || homeTeamData?.team?.id;
                      const awayId = awayTeamData?.id || awayTeamData?.team?.id;

                      // Use context team ID first, then try multiple fallback methods
                      let playTeamId = contextPlayTeamId;

                      if (!playTeamId) {
                        if (play.team?.id) {
                          playTeamId = play.team.id;
                        } else if (play.team?.$ref) {
                          // Extract team ID from $ref and remove URL parameters
                          const refParts = play.team.$ref.split("/");
                          const teamIdWithParams =
                            refParts[refParts.length - 1];
                          playTeamId = teamIdWithParams.split("?")[0]; // Remove ?lang=en&region=us
                        } else if (play.participants?.length > 0) {
                          // Try to get team from scorer's team
                          const scorer = play.participants.find(
                            (p) => p.type === "scorer",
                          );
                          if (scorer?.athlete?.team?.id) {
                            playTeamId = scorer.athlete.team.id;
                          } else if (scorer?.athlete?.team?.$ref) {
                            const refParts =
                              scorer.athlete.team.$ref.split("/");
                            const teamIdWithParams =
                              refParts[refParts.length - 1];
                            playTeamId = teamIdWithParams.split("?")[0]; // Remove URL parameters
                          }
                        }
                      }

                      let scoringTeam = null;
                      let scoringTeamSide = "";
                      let teamAbbr = "";

                      const isOwnGoal =
                        play.ownGoal ||
                        play.text?.toLowerCase().includes("own goal") ||
                        play.shortText?.toLowerCase().includes("own goal") ||
                        play.type?.name?.toLowerCase().includes("own goal") ||
                        play.type?.id === "97" ||
                        play.type?.id === 97;

                      console.log("Trying to match team IDs:", {
                        playTeamId,
                        homeId,
                        awayId,
                        fromContext: !!contextPlayTeamId,
                      });

                      if (String(playTeamId) === String(homeId)) {
                        scoringTeam = homeTeamData;
                        scoringTeamSide = "home";
                        teamAbbr =
                          `${isOwnGoal ? awayTeamData?.team?.abbreviation : homeTeamData?.team?.abbreviation}` ||
                          "HOME";
                      } else if (String(playTeamId) === String(awayId)) {
                        scoringTeam = awayTeamData;
                        scoringTeamSide = "away";
                        teamAbbr =
                          `${isOwnGoal ? homeTeamData?.team?.abbreviation : awayTeamData?.team?.abbreviation}` ||
                          "AWAY";
                      }

                      // Fallback: use text analysis to determine team
                      if (!scoringTeam && play.text) {
                        const homeTeamName =
                          homeTeamData?.name || homeTeamData?.displayName || "";
                        const awayTeamName =
                          awayTeamData?.name || awayTeamData?.displayName || "";

                        console.log("Fallback text analysis:", {
                          homeTeamName,
                          awayTeamName,
                          playText: play.text,
                        });

                        if (homeTeamName && play.text.includes(homeTeamName)) {
                          scoringTeam = homeTeamData;
                          scoringTeamSide = "home";
                          teamAbbr = homeTeamData?.abbreviation || "HOME";
                        } else if (
                          awayTeamName &&
                          play.text.includes(awayTeamName)
                        ) {
                          scoringTeam = awayTeamData;
                          scoringTeamSide = "away";
                          teamAbbr = awayTeamData?.abbreviation || "AWAY";
                        } else {
                          // Advanced fallback - parse team names from play text
                          // Format: "Goal! Manchester City 5, Burnley 1. Player..."
                          const textMatch = play.text.match(
                            /Goal!\s+(.+?)\s+\d+,\s+(.+?)\s+\d+\./,
                          );
                          if (textMatch) {
                            const [, team1Name, team2Name] = textMatch;
                            console.log("Parsed team names from text:", {
                              team1Name,
                              team2Name,
                            });

                            // Create mock team objects from text
                            const team1 = {
                              name: team1Name.trim(),
                              abbreviation: team1Name
                                .split(" ")[0]
                                .substring(0, 3)
                                .toUpperCase(),
                            };
                            const team2 = {
                              name: team2Name.trim(),
                              abbreviation: team2Name
                                .split(" ")[0]
                                .substring(0, 3)
                                .toUpperCase(),
                            };

                            // Determine which team scored based on player mention
                            if (play.text.includes(`(${team1Name})`)) {
                              scoringTeam = team1;
                              scoringTeamSide = "home"; // Assume first team is home
                              teamAbbr = team1.abbreviation;
                              // Set team data for later use
                              if (!homeTeamData) homeTeamData = team1;
                              if (!awayTeamData) awayTeamData = team2;
                            } else if (play.text.includes(`(${team2Name})`)) {
                              scoringTeam = team2;
                              scoringTeamSide = "away"; // Assume second team is away
                              teamAbbr = team2.abbreviation;
                              // Set team data for later use
                              if (!homeTeamData) homeTeamData = team1;
                              if (!awayTeamData) awayTeamData = team2;
                            }
                          }

                          // Final fallback - use available team data
                          if (!scoringTeam) {
                            scoringTeam = homeTeamData ||
                              awayTeamData || {
                                name: "Unknown Team",
                                abbreviation: "UNK",
                              };
                            scoringTeamSide = "home";
                            teamAbbr = scoringTeam?.abbreviation || "UNK";
                          }
                        }
                      }

                      console.log("Final scoring team:", {
                        scoringTeam,
                        scoringTeamSide,
                        teamAbbr,
                      });

                      // Get team color - use context color first
                      let teamColor = contextTeamColor || "#007bff"; // Use context color or default blue

                      if (!contextTeamColor && scoringTeam) {
                        // Try the existing service if context color not available
                        teamColor =
                          EnglandServiceEnhanced.getTeamColorWithAlternateLogic(
                            scoringTeam,
                          ) || teamColor;

                        // Fallback to direct color properties
                        if (teamColor === "#007bff") {
                          teamColor =
                            scoringTeam.color ||
                            scoringTeam.alternateColor ||
                            scoringTeam.team?.color ||
                            scoringTeam.team?.alternateColor ||
                            "#007bff";
                        }
                      }

                      const finalTeamColor = teamColor.startsWith("#")
                        ? teamColor
                        : `#${teamColor}`;
                      const textColor = getContrastColor(finalTeamColor);

                      // For own goals the circle + team row shows the OWN GOALER's team
                      // (the team that conceded), not the team that received the goal.
                      const ownGoalerTeamData = isOwnGoal
                        ? scoringTeamSide === "home"
                          ? awayTeamData
                          : homeTeamData
                        : null;
                      let playerCircleColor = finalTeamColor;
                      if (isOwnGoal && ownGoalerTeamData) {
                        const ogRaw =
                          EnglandServiceEnhanced.getTeamColorWithAlternateLogic(
                            ownGoalerTeamData?.team || ownGoalerTeamData,
                          ) ||
                          ownGoalerTeamData.color ||
                          ownGoalerTeamData.alternateColor ||
                          ownGoalerTeamData.team?.color ||
                          ownGoalerTeamData.team?.alternateColor ||
                          "#888888";
                        playerCircleColor = ogRaw.startsWith("#")
                          ? ogRaw
                          : `#${ogRaw}`;
                      }
                      const playerCircleTextColor =
                        getContrastColor(playerCircleColor);
                      const playerCircleTeam = isOwnGoal
                        ? ownGoalerTeamData
                        : scoringTeam;

                      // Get scorer and assister info from state (fetched via useEffect)
                      const scorerName =
                        shareCardPlayerNames.scorer || "Loading...";
                      const assisterName = shareCardPlayerNames.assister;

                      console.log("Using player names from state:", {
                        scorerName,
                        assisterName,
                      });

                      // Get time info
                      const period = play.period ? play.period.number || 1 : 1;
                      const clock = play.clock?.displayValue || "";
                      const periodText =
                        period === 1
                          ? "1st Half"
                          : period === 2
                            ? "2nd Half"
                            : `Extra Time`;

                      // Get current scores
                      const homeScore = play.homeScore || 0;
                      const awayScore = play.awayScore || 0;

                      // Determine goal type and situation
                      const playText = play.text || play.shortText || "";
                      const isPenalty = playText
                        .toLowerCase()
                        .includes("penalty");

                      let goalType = "Goal";
                      if (isOwnGoal) {
                        goalType = "Own Goal";
                      } else if (isPenalty) {
                        goalType = "Penalty Goal";
                      }

                      // Determine goal situation (opening, equalizer, go-ahead, etc.)
                      let goalSituation = "";
                      if (scoringTeamSide === "home") {
                        if (homeScore > awayScore) {
                          if (homeScore - awayScore === 1) {
                            goalSituation =
                              awayScore === 0
                                ? "Opening Goal"
                                : "Go-ahead Goal";
                          } else {
                            goalSituation = "Extends Lead";
                          }
                        } else if (homeScore === awayScore) {
                          goalSituation = "Equalizer";
                        }
                      } else {
                        if (awayScore > homeScore) {
                          if (awayScore - homeScore === 1) {
                            goalSituation =
                              homeScore === 0
                                ? "Opening Goal"
                                : "Go-ahead Goal";
                          } else {
                            goalSituation = "Extends Lead";
                          }
                        } else if (awayScore === homeScore) {
                          goalSituation = "Equalizer";
                        }
                      }

                      // Use real player stats from API (fetched via useEffect)
                      const playerStats = shareCardPlayerStats;
                      console.log("Using player stats from API:", playerStats);

                      // Helper: get first + last initials from a player name
                      const getInitials = (name) => {
                        if (!name || name === "Loading...") return "?";
                        const parts = name.split(" ").filter(Boolean);
                        if (parts.length === 0) return "?";
                        if (parts.length === 1)
                          return parts[0][0].toUpperCase();
                        return (
                          parts[0][0] + parts[parts.length - 1][0]
                        ).toUpperCase();
                      };

                      const sgcStatItems = [
                        {
                          label: isOwnGoal ? "OG" : "G",
                          value: isOwnGoal
                            ? playerStats.ownGoals
                            : playerStats.goals,
                        },
                        { label: "A", value: playerStats.assists },
                        { label: "SH", value: playerStats.shots },
                        { label: "SOT", value: playerStats.shotsOnTarget },
                        { label: "YC", value: playerStats.yellowCards },
                        { label: "RC", value: playerStats.redCards },
                      ];

                      const CARD_SIZE = Math.min(width - 48, 540);

                      // ── Field scaling ───────────────────────────────────────
                      // 0.41 matches the old hardcoded 130/320 = 40.6% ratio.
                      // -12 leaves ~6px padding each side of the portrait field.
                      const FIELD_LEFT_PANEL_W = Math.round(CARD_SIZE * 0.41);
                      const FIELD_SCALE = (FIELD_LEFT_PANEL_W - 12) / 120;
                      const FIELD_MARG_H = (120 * FIELD_SCALE - 180) / 2;
                      const FIELD_MARG_V = (180 * FIELD_SCALE - 120) / 2;

                      console.log(
                        "[ShareCard] width:",
                        width,
                        "| CARD_SIZE:",
                        CARD_SIZE,
                        "| FIELD_LEFT_PANEL_W:",
                        FIELD_LEFT_PANEL_W,
                        "| FIELD_SCALE:",
                        FIELD_SCALE.toFixed(3),
                        "| FIELD_MARG_H:",
                        FIELD_MARG_H.toFixed(1),
                        "| FIELD_MARG_V:",
                        FIELD_MARG_V.toFixed(1),
                      );

                      return (
                        <View
                          style={[
                            styles.goalShareCard,
                            {
                              backgroundColor: theme.surface,
                              width: CARD_SIZE,
                            },
                          ]}
                        >
                          {/* ── Header: time + score + goal event + description ── */}
                          <View
                            style={{
                              backgroundColor: finalTeamColor + "33",
                              borderBottomWidth: 2,
                              borderBottomColor: finalTeamColor,
                              paddingHorizontal: 14,
                              paddingTop: 12,
                              paddingBottom: 10,
                            }}
                          >
                            {/* Row 1: time/half on left, score on right */}
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 4,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "800",
                                  textTransform: "uppercase",
                                  letterSpacing: 0.6,
                                  color: theme.text,
                                }}
                              >
                                {clock ? `${clock} • ` : ""}
                                {periodText}
                              </Text>
                              {/* Score with team logos */}
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 5,
                                }}
                              >
                                <TeamLogoImage
                                  teamId={
                                    homeTeamData?.id || homeTeamData?.team?.id
                                  }
                                  style={{ width: 18, height: 18 }}
                                  isDarkMode={isDarkMode}
                                />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: "700",
                                    color: theme.text,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontWeight:
                                        awayScore < homeScore ? "800" : "400",
                                    }}
                                  >
                                    {homeScore}
                                  </Text>{" "}
                                  <Text>-</Text>{" "}
                                  <Text
                                    style={{
                                      fontWeight:
                                        homeScore < awayScore ? "800" : "400",
                                    }}
                                  >
                                    {awayScore}
                                  </Text>
                                </Text>
                                <TeamLogoImage
                                  teamId={
                                    awayTeamData?.id || awayTeamData?.team?.id
                                  }
                                  style={{ width: 18, height: 18 }}
                                  isDarkMode={isDarkMode}
                                />
                              </View>
                            </View>
                            {/* Goal situation */}
                            <Text
                              style={{
                                fontSize: 17,
                                fontWeight: "800",
                                color: theme.text,
                                marginBottom: 3,
                              }}
                            >
                              ⚽ {goalType}
                              {goalSituation ? ` • ${goalSituation}` : ""}
                            </Text>
                            {/* Description */}
                            {!!playText && (
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: theme.textSecondary,
                                  lineHeight: 16,
                                }}
                                numberOfLines={2}
                              >
                                {playText}
                              </Text>
                            )}
                          </View>

                          {/* ── Body: left = vertical field, right = player info ── */}
                          <View style={{ flexDirection: "row" }}>
                            {/* Left – vertical soccer field (width scales with card) */}
                            <View
                              style={{
                                width: 150 * FIELD_SCALE,
                                height: 200 * FIELD_SCALE,
                                justifyContent: "center",
                                alignItems: "center",
                                borderRightWidth: StyleSheet.hairlineWidth,
                                borderRightColor: theme.border,
                                paddingVertical: 12,
                              }}
                              onLayout={(e) =>
                                console.log(
                                  "[ShareCard] left panel actual width:",
                                  e.nativeEvent.layout.width,
                                  "expected:",
                                  FIELD_LEFT_PANEL_W,
                                )
                              }
                            >
                              {/*
                                The field (180×120 landscape) is rotated 90 ° + scaled.
                                Margins are computed from the scaled visual size so
                                the layout box matches the visual portrait dimensions.
                              */}
                              <View
                                style={{
                                  width: 180,
                                  height: 120,
                                  transform: [
                                    { rotate: "90deg" },
                                    { scale: FIELD_SCALE },
                                  ],
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                {play.fieldPositionX !== undefined &&
                                play.fieldPositionY !== undefined
                                  ? renderMiniField(
                                      {
                                        x: play.fieldPositionX,
                                        y: play.fieldPositionY,
                                      },
                                      play.fieldPosition2X !== undefined &&
                                        play.fieldPosition2Y !== undefined
                                        ? {
                                            x: play.fieldPosition2X,
                                            y: play.fieldPosition2Y,
                                          }
                                        : null,
                                      "goal",
                                      scoringTeamSide,
                                      playerCircleColor,
                                    )
                                  : renderMiniField(
                                      null,
                                      null,
                                      "goal",
                                      scoringTeamSide,
                                      playerCircleColor,
                                    )}
                              </View>
                            </View>

                            {/* Right – player avatar + info + stats */}
                            <View
                              style={{
                                flex: 1,
                                paddingHorizontal: 12,
                                paddingVertical: 12,
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              {/* Initial circle — for own goals uses the OWN GOALER's team color */}
                              <View
                                style={{
                                  width: 54,
                                  height: 54,
                                  borderRadius: 27,
                                  backgroundColor: playerCircleColor,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  borderWidth: 2,
                                  borderColor: theme.border,
                                  marginBottom: 5,
                                }}
                              >
                                <Text
                                  style={{
                                    color: playerCircleTextColor,
                                    fontSize: 22.5,
                                    fontWeight: "800",
                                  }}
                                >
                                  {getInitials(scorerName)}
                                </Text>
                              </View>

                              {/* Player name */}
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: "700",
                                  color: theme.text,
                                  textAlign: "center",
                                  marginBottom: 3,
                                }}
                                numberOfLines={1}
                              >
                                {scorerName}
                              </Text>

                              {/* Team name with logo — for own goals shows the OWN GOALER's team */}
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  marginBottom: assisterName ? 6 : 8,
                                }}
                              >
                                <TeamLogoImage
                                  teamId={
                                    playerCircleTeam?.id ||
                                    playerCircleTeam?.team?.id
                                  }
                                  style={{ width: 14, height: 14 }}
                                  isDarkMode={isDarkMode}
                                />
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: "600",
                                    color: theme.textSecondary,
                                    textAlign: "center",
                                  }}
                                  numberOfLines={2}
                                >
                                  {playerCircleTeam?.name ||
                                    playerCircleTeam?.team?.name ||
                                    teamAbbr}
                                </Text>
                              </View>

                              {/* Assister (if present) */}
                              {!!assisterName && (
                                <View
                                  style={{
                                    alignItems: "center",
                                    marginBottom: 8,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "700",
                                      color: theme.text,
                                      textAlign: "center",
                                    }}
                                    numberOfLines={1}
                                  >
                                    {assisterName}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 9,
                                      fontWeight: "700",
                                      textTransform: "uppercase",
                                      letterSpacing: 0.4,
                                      color: theme.textSecondary,
                                    }}
                                  >
                                    Assist
                                  </Text>
                                </View>
                              )}

                              {/* 6-stat grid (3 columns × 2 rows) */}
                              <View
                                style={{
                                  flexDirection: "row",
                                  flexWrap: "wrap",
                                  justifyContent: "center",
                                  width: "100%",
                                  marginTop: 2,
                                }}
                              >
                                {sgcStatItems.map(({ label, value }) => (
                                  <View
                                    key={label}
                                    style={{
                                      width: "33.333%",
                                      alignItems: "center",
                                      paddingVertical: 6,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 15,
                                        fontWeight: "800",
                                        color: theme.text,
                                      }}
                                    >
                                      {value ?? "—"}
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 9,
                                        fontWeight: "600",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.4,
                                        color: theme.textSecondary,
                                        marginTop: 2,
                                      }}
                                    >
                                      {label}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>

                          {/* ── Branding footer ── */}
                          <View
                            style={{
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: theme.border,
                              paddingVertical: 6,
                              paddingHorizontal: 12,
                              alignItems: "flex-end",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "800",
                                letterSpacing: 0.5,
                                color: theme.text,
                              }}
                            >
                              SportsHeart{" "}
                              <Ionicons
                                name="heart"
                                size={10}
                                color={colors.primary}
                              />
                            </Text>
                          </View>
                        </View>
                      );
                    })()}
                </View>
              </ViewShot>

              {/* Action Buttons - Outside ViewShot like MLB */}
              <View style={styles.goalShareCardActions}>
                <TouchableOpacity
                  style={[
                    styles.goalShareCardButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={async () => {
                    try {
                      const uri = await captureRef(goalShareCardRef, {
                        format: "png",
                        quality: 2,
                      });
                      await Sharing.shareAsync(uri, {
                        mimeType: "image/png",
                        dialogTitle: "Share Goal",
                      });
                    } catch (error) {
                      console.error("Error sharing goal:", error);
                    }
                  }}
                >
                  <Ionicons name="share-outline" size={24} color="#fff" />
                  <Text style={styles.goalShareCardButtonText}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.goalShareCardButton,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                  onPress={() => setShareCardPlay(null)}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                  <Text
                    style={[
                      styles.goalShareCardButtonText,
                      { color: theme.text },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

const styles = StyleSheet.create({
      goalShareCardOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: 20,
  },
  goalShareCard: {
    overflow: "hidden",
  },
  goalCardContent: {
    padding: 20,
    borderRadius: 0,
    minHeight: 400,
  },
  goalShareCardActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 16,
  },
  goalShareCardButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 120,
    justifyContent: "center",
  },
  goalShareCardButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    color: "#fff",
  },
  goalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  goalCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  goalCardTeamLogo: {
    width: 48,
    height: 48,
    marginRight: 16,
  },
  goalCardHeaderText: {
    flex: 1,
  },
  goalCardGoalText: {
    fontSize: 18,
    fontWeight: "bold",
    lineHeight: 22,
  },
  goalCardTime: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 2,
    opacity: 0.9,
  },
  goalCardCloseButton: {
    padding: 8,
  },
  goalCardFieldContainer: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: -15,
  },
  goalCardMiniField: {
    width: 240,
    height: 120,
  },
  miniFieldBackground: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    position: "relative",
  },
  miniFieldLines: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  miniFieldBorder: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderWidth: 2,
    borderColor: "#ffffff",
    borderRadius: 4,
  },
  miniFieldCenterLine: {
    position: "absolute",
    left: "50%",
    top: 2,
    bottom: 2,
    width: 2,
    backgroundColor: "#ffffff",
    marginLeft: -1,
  },
  miniFieldCenterCircle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: "#ffffff",
    borderRadius: 20,
    marginTop: -20,
    marginLeft: -20,
  },
  miniFieldGoalBox: {
    position: "absolute",
    top: "25%",
    bottom: "25%",
    width: 30,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  miniFieldGoalBoxLeft: {
    left: 2,
    borderRightWidth: 2,
    borderLeftWidth: 0,
  },
  miniFieldGoalBoxRight: {
    right: 2,
    borderLeftWidth: 2,
    borderRightWidth: 0,
  },
  miniFieldGoal: {
    position: "absolute",
    top: "40%",
    bottom: "40%",
    width: 8,
    backgroundColor: "#ffffff",
  },
  miniFieldGoalLeft: {
    left: 2,
  },
  miniFieldGoalRight: {
    right: 2,
  },
  goalMarker: {
    position: "absolute",
    width: 12,
    height: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  goalMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  goalCardScorer: {
    marginTop: -15,
    marginBottom: 22.5,
    alignItems: "center",
  },
  goalCardScorerName: {
    fontSize: 20,
    fontWeight: "bold",
    lineHeight: 28,
    textAlign: "center",
  },
  goalCardAssist: {
    fontSize: 16,
    opacity: 0.9,
    marginTop: 4,
    textAlign: "center",
  },
  goalCardScoreLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  goalCardScoreTeams: {
    flexDirection: "row",
    alignItems: "center",
  },
  goalCardScoreLogoSmall: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  goalCardScoreText: {
    fontSize: 24,
    fontWeight: "bold",
  },
  goalCardBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  goalCardBadgeText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  goalCardStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  goalCardStatItem: {
    width: "31%",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderRadius: 12,
    minHeight: 70,
  },
  goalCardStatValue: {
    fontSize: 20,
    fontWeight: "bold",
    lineHeight: 24,
  },
  goalCardStatLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    opacity: 0.8,
  },
  goalShareCardActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
    gap: 15,
  },
  goalShareCardButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 120,
    justifyContent: "center",
  },
  goalShareCardButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    color: "#fff",
  },
});