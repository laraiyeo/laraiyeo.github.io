import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";

{
  shareCardPlay && (
    <View
      style={[
        styles.modalOverlay,
        {
          backgroundColor: "rgba(0,0,0,0.85)",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
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
          console.log("Modal overlay tapped - closing share card");
          setShareCardPlay(null);
        }}
      />
      <View
        ref={nflPlayShareCardRef}
        collapsable={false}
        style={[styles.nflPlayShareCard, { backgroundColor: theme.surface }]}
      >
        {shareCardPlay &&
          (() => {
            console.log(
              "Rendering share card modal with play data:",
              shareCardPlay,
            );
            const play = shareCardPlay;

            let teamColor = play.teamColor || "#000000";

            let teamLogo = NFLService.convertToHttps(play.driveTeam || "");

            let teamName = play.teamName || "";

            let teamAbbr = play.teamAbbr || "";

            let winProbability = play.winProbability || 50;

            // For interceptions (26) and fumbles (29), use the other team's color instead of the drive team's color
            const playTypeId = play.type?.id;
            if (
              playTypeId === "26" ||
              playTypeId === "29" ||
              playTypeId === "36" ||
              playTypeId === "80" ||
              playTypeId === "34"
            ) {
              // Determine which team is the drive team
              const driveTeamId = play.driveTeam?.id;
              const homeTeamId = play.homeTeam?.team?.id;
              const awayTeamId = play.awayTeam?.team?.id;
              winProbability = 100 - winProbability;

              // Use the other team's color
              if (driveTeamId === homeTeamId) {
                // Drive team is home, use away team's color
                teamColor = play.awayTeam?.team?.color
                  ? `#${play.awayTeam.team.color}`
                  : "#000000";
                teamLogo = play.awayTeam?.team;
                teamName = play.awayTeam?.team?.displayName || teamName;
                teamAbbr = play.awayTeam?.team?.abbreviation || teamAbbr;
              } else if (driveTeamId === awayTeamId) {
                // Drive team is away, use home team's color
                teamColor = play.homeTeam?.team?.color
                  ? `#${play.homeTeam.team.color}`
                  : "#000000";
                teamLogo = play.homeTeam?.team;
                teamName = play.homeTeam?.team?.displayName || teamName;
                teamAbbr = play.homeTeam?.team?.abbreviation || teamAbbr;
              }
            }
            const clock = play.clock?.displayValue || "";
            const period = play.period?.number || "";
            const playText = play.text || "";
            const downDistanceText =
              play.start?.downDistanceText || play.end?.downDistanceText || "";
            const yardLine = play.end?.yardLine || play.end?.yardLine || 0;
            const possession =
              play.start?.possessionText || play.start?.yardLine || "";

            // Get scores
            const homeScore = parseInt(play.homeScore) || 0;
            const awayScore = parseInt(play.awayScore) || 0;

            // Get team logos
            const homeTeamLogo = NFLService.convertToHttps(
              play.homeTeam?.team?.logos?.[0]?.href || "",
            );
            const awayTeamLogo = NFLService.convertToHttps(
              play.awayTeam?.team?.logos?.[0]?.href || "",
            );

            console.log("Win probability in modal:", winProbability);

            const headerTint = teamColor.startsWith("#")
              ? `${teamColor}33`
              : teamColor;
            const driveSummary = selectedDrive
              ? `${selectedDrive.plays?.length || 0} plays • ${
                  selectedDrive.yards || 0
                } yards • ${selectedDrive.timeElapsed?.displayValue || "0:00"}`
              : "—";
            const fieldWidth = 350;
            const fieldHeight = 240;
            const fieldWrapAspectRatio = fieldHeight / fieldWidth;
            const rotatedFieldWidthPct = `${(fieldWidth / fieldHeight) * 100}%`;
            const rotatedFieldHeightPct = `${(fieldHeight / fieldWidth) * 100}%`;
            const driveStartYard = selectedDrive?.start?.yardLine;
            const driveEndYard = yardLine;
            const hasDriveVisualization =
              selectedDrive &&
              selectedDrive.start?.yardLine != null &&
              selectedDrive.end?.yardLine != null;

            // Extract players from play (similar to scoreboard.js)
            const players = play.participants || [];

            const renderYardMarkers = () => {
              const markers = [];
              const yardNumbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];

              for (let i = 0; i < yardNumbers.length; i++) {
                const leftPosition = 10 + i * 10;

                markers.push(
                  <View
                    key={`yard-${i}`}
                    style={{
                      position: "absolute",
                      left: `${leftPosition}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      backgroundColor: "white",
                      opacity: 0.45,
                    }}
                  />,
                );

                markers.push(
                  <View
                    key={`hash-top-${i}`}
                    style={{
                      position: "absolute",
                      left: `${leftPosition}%`,
                      top: "15%",
                      width: 4,
                      height: 1.5,
                      backgroundColor: "white",
                      marginLeft: -1.5,
                    }}
                  />,
                );

                markers.push(
                  <View
                    key={`hash-bottom-${i}`}
                    style={{
                      position: "absolute",
                      left: `${leftPosition}%`,
                      bottom: "15%",
                      width: 4,
                      height: 1.5,
                      backgroundColor: "white",
                      marginLeft: -1.5,
                    }}
                  />,
                );

                markers.push(
                  <Text
                    key={`label-top-${i}`}
                    style={{
                      position: "absolute",
                      left: `${leftPosition}%`,
                      top: "3.5%",
                      fontSize: 8,
                      fontWeight: "800",
                      color: "white",
                      marginLeft: -3,
                    }}
                  >
                    {yardNumbers[i]}
                  </Text>,
                );

                markers.push(
                  <Text
                    key={`label-bottom-${i}`}
                    style={{
                      position: "absolute",
                      left: `${leftPosition}%`,
                      bottom: "3.5%",
                      fontSize: 8,
                      fontWeight: "800",
                      color: "white",
                      marginLeft: -3,
                      transform: [{ rotate: "180deg" }],
                    }}
                  >
                    {yardNumbers[i]}
                  </Text>,
                );
              }

              return markers;
            };

            const renderHashMarks = () => {
              const marks = [];
              for (let i = 1; i < 100; i++) {
                marks.push(
                  <View
                    key={`hash-top-${i}`}
                    style={{
                      position: "absolute",
                      left: `${i}%`,
                      top: 0,
                      width: 1,
                      height: 3,
                      backgroundColor: "white",
                      opacity: 0.35,
                    }}
                  />,
                );
                marks.push(
                  <View
                    key={`hash-bottom-${i}`}
                    style={{
                      position: "absolute",
                      left: `${i}%`,
                      bottom: 0,
                      width: 1,
                      height: 3,
                      backgroundColor: "white",
                      opacity: 0.35,
                    }}
                  />,
                );
              }
              return marks;
            };

            return (
              <>
                {/* Header */}
                <View
                  style={{
                    backgroundColor: headerTint,
                    borderBottomWidth: 2,
                    borderBottomColor: teamColor,
                    paddingHorizontal: 14,
                    paddingTop: 12,
                    paddingBottom: 10,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "800",
                          color: theme.text,
                        }}
                      >
                        {period > 4 ? `OT${period - 4}` : `Q${period}`} {clock}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: theme.textSecondary,
                        }}
                      >
                        {downDistanceText || possession}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {homeTeamLogo ? (
                        <TeamLogoImage
                          team={play.homeTeam?.team}
                          style={{ width: 18, height: 18 }}
                        />
                      ) : null}
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: homeScore > awayScore ? "800" : "500",
                          color: theme.text,
                        }}
                      >
                        {homeScore}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: theme.textSecondary,
                        }}
                      >
                        -
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: awayScore > homeScore ? "800" : "500",
                          color: theme.text,
                        }}
                      >
                        {awayScore}
                      </Text>
                      {awayTeamLogo ? (
                        <TeamLogoImage
                          team={play.awayTeam?.team}
                          style={{ width: 18, height: 18 }}
                        />
                      ) : null}
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    {teamLogo ? (
                      <TeamLogoImage
                        team={teamLogo}
                        style={{ width: 28, height: 28 }}
                      />
                    ) : null}
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "800",
                        color: theme.text,
                      }}
                    >
                      {teamAbbr} - {play.type.text || "Play"}
                    </Text>
                  </View>
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
                </View>

                {/* Body */}
                <View style={{ flexDirection: "row" }}>
                  <View
                    style={{
                      width: "48%",
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderRightColor: theme.border,
                      paddingHorizontal: 8,
                      paddingVertical: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: theme.textSecondary,
                        marginBottom: 8,
                        textAlign: "center",
                      }}
                    >
                      {driveSummary}
                    </Text>
                    <View
                      style={{
                        width: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: "100%",
                          aspectRatio: fieldWrapAspectRatio,
                          position: "relative",
                          overflow: "hidden",
                          alignSelf: "stretch",
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <View
                          style={{
                            width: rotatedFieldWidthPct,
                            height: rotatedFieldHeightPct,
                            position: "relative",
                            backgroundColor: "#2d5016",
                            borderWidth: 2,
                            borderColor: "#1a3009",
                            borderRadius: 4,
                            overflow: "hidden",
                            transform: [{ rotate: "90deg" }],
                          }}
                        >
                        <View
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: "10%",
                            backgroundColor: teamColor,
                            opacity: 0.55,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 8,
                              fontWeight: "800",
                              color: "white",
                              transform: [{ rotate: "-90deg" }],
                            }}
                          >
                            NFL
                          </Text>
                        </View>

                        <View
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: "10%",
                            backgroundColor: teamColor,
                            opacity: 0.55,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 8,
                              fontWeight: "800",
                              color: "white",
                              transform: [{ rotate: "90deg" }],
                            }}
                          >
                            NFL
                          </Text>
                        </View>

                        <View
                          style={{
                            position: "absolute",
                            left: "10%",
                            right: "10%",
                            top: 0,
                            bottom: 0,
                          }}
                        >
                          {renderYardMarkers()}
                          {renderHashMarks()}

                          <View
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: 0,
                              bottom: 0,
                              width: 2,
                              backgroundColor: "white",
                              opacity: 1,
                              marginLeft: -1,
                            }}
                          />

                          {hasDriveVisualization && (
                            (() => {
                              const startPosForStart = 100 - driveStartYard;
                              const startPosForEnd = 100 - driveEndYard;
                              const start = Math.min(startPosForStart, startPosForEnd);
                              const width = Math.abs(startPosForEnd - startPosForStart);
                              const gradientId = `drive-gradient-${driveStartYard}-${driveEndYard}`;
                              const lighter = teamColor && teamColor.startsWith("#")
                                ? `${teamColor}33`
                                : teamColor;
                              const darker = teamColor && teamColor.startsWith("#")
                                ? `${teamColor}FF`
                                : teamColor;
                              const startIsLeft = startPosForStart <= startPosForEnd;

                              const stops = startIsLeft
                                ? [
                                    <Stop key="s1" offset="0%" stopColor={lighter} stopOpacity={0.35} />,
                                    <Stop key="s2" offset="100%" stopColor={darker} stopOpacity={0.95} />,
                                  ]
                                : [
                                    <Stop key="s3" offset="0%" stopColor={darker} stopOpacity={0.95} />,
                                    <Stop key="s4" offset="100%" stopColor={lighter} stopOpacity={0.35} />,
                                  ];

                              return (
                                <>
                                  <Svg
                                    width="100%"
                                    height="100%"
                                    style={{ position: "absolute", left: `${start}%` }}
                                  >
                                    <Defs>
                                      <LinearGradient
                                        id={gradientId}
                                        x1="0%"
                                        y1="0%"
                                        x2="100%"
                                        y2="0%"
                                      >
                                        {stops}
                                      </LinearGradient>
                                    </Defs>
                                    <Rect
                                      x="0"
                                      y="0"
                                      width={`${width}%`}
                                      height="100%"
                                      fill={`url(#${gradientId})`}
                                      opacity={1}
                                    />
                                  </Svg>

                                  {/* Start and end indicator lines */}
                                  <View
                                    style={{
                                      position: "absolute",
                                      left: `${start}%`,
                                      top: 0,
                                      bottom: 0,
                                      width: 1,
                                      backgroundColor: teamColor,
                                      opacity: 1,
                                      marginLeft: -1,
                                    }}
                                  />
                                  <View
                                    style={{
                                      position: "absolute",
                                      left: `${start + width}%`,
                                      top: 0,
                                      bottom: 0,
                                      width: 1,
                                      backgroundColor: teamColor,
                                      opacity: 1,
                                      marginLeft: -1,
                                    }}
                                  />
                                </>
                              );
                            })()
                          )}
                        </View>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      justifyContent: "center",
                    }}
                  >
                    {/* Players Section */}
                    {players.length > 0 &&
                      (() => {
                        // Remove duplicates based on athlete ID
                        const uniquePlayers = [];
                        const seenIds = new Set();

                        players.forEach((player) => {
                          const athleteId = player?.athlete?.id;
                          if (athleteId && !seenIds.has(athleteId)) {
                            seenIds.add(athleteId);
                            uniquePlayers.push(player);
                          }
                        });

                        // If no unique players found, return null
                        if (uniquePlayers.length === 0) return null;

                        // Sort participants by order first
                        let participantsList = [...uniquePlayers].sort(
                          (a, b) => (a.order || 0) - (b.order || 0),
                        );

                        // Check for special cases using play type ID (like scoreboard.js)
                        const playTypeId = play.type?.id;
                        const isSpecialPlayType = [
                          "53",
                          "26",
                          "36",
                          "52",
                          "29",
                          "80",
                          "7",
                          "32",
                          "34",
                        ].includes(playTypeId); // Kickoff, Interception, Punt, Fumble, Sack
                        const isRushingPlay = playTypeId === "5"; // Rush
                        const isPassingPlay = playTypeId === "24"; // Pass Reception
                        const isScoringPlay =
                          play.scoringPlay ||
                          play.text?.toLowerCase().includes("touchdown");

                        console.log(
                          "Play type ID:",
                          playTypeId,
                          "Is special:",
                          isSpecialPlayType,
                          "Is scoring:",
                          isScoringPlay,
                        );
                        console.log(
                          "Available participant types:",
                          participantsList.map(
                            (p) => `${p.athlete?.displayName}: ${p.type}`,
                          ),
                        );

                        // Get main participant using same logic as scoreboard.js
                        let mainPlayer;

                        // First check if it's a scoring play and prioritize the scorer
                        if (isScoringPlay) {
                          const scorer = participantsList.find(
                            (p) =>
                              p.type === "scorer" ||
                              p.type === "rusher" ||
                              p.type === "receiver",
                          );
                          if (scorer) {
                            console.log(
                              "Found scoring participant:",
                              scorer?.athlete?.displayName,
                              "Type:",
                              scorer?.type,
                            );
                            mainPlayer = scorer;
                          }
                        }

                        // If no scorer found or not a scoring play, use regular logic
                        if (!mainPlayer) {
                          if (
                            isSpecialPlayType &&
                            participantsList.length > 1
                          ) {
                            // For special play types, look for recoverer, returner, or sackedBy participant type
                            const specialParticipant = participantsList.find(
                              (p) =>
                                p.type === "recoverer" ||
                                p.type === "returner" ||
                                p.type === "sackedBy" ||
                                p.type === "passDefender",
                            );
                            console.log(
                              "Found special participant:",
                              specialParticipant?.athlete?.displayName,
                              "Type:",
                              specialParticipant?.type,
                            );
                            mainPlayer =
                              specialParticipant || participantsList[0];
                          } else if (isRushingPlay) {
                            // For rushing plays, prioritize the rusher
                            const rusher = participantsList.find(
                              (p) => p.type === "rusher",
                            );
                            mainPlayer = rusher || participantsList[0];
                          } else if (isPassingPlay) {
                            // For passing plays, prioritize the receiver
                            const receiver = participantsList.find(
                              (p) => p.type === "receiver",
                            );
                            mainPlayer = receiver || participantsList[0];
                          } else {
                            mainPlayer = participantsList[0]; // Use first participant normally
                          }
                        }

                        console.log(
                          "Selected main participant:",
                          mainPlayer?.athlete?.displayName,
                          "Type:",
                          mainPlayer?.type,
                        );

                        // Reorder participants array to put main participant first
                        if (
                          mainPlayer &&
                          (isSpecialPlayType ||
                            isRushingPlay ||
                            isPassingPlay ||
                            isScoringPlay)
                        ) {
                          const otherParticipants = participantsList.filter(
                            (p) =>
                              p.athlete?.displayName !==
                              mainPlayer.athlete?.displayName,
                          );
                          participantsList = [mainPlayer, ...otherParticipants];
                        }

                        // Safety check - ensure mainPlayer exists
                        if (!mainPlayer || !mainPlayer.athlete) return null;

                        // Helper function to get player stats from cached boxscore data
                        const getPlayerStats = (
                          player,
                          playTypeId,
                          participantType,
                        ) => {
                          if (
                            !gameDetails?.boxscore?.players ||
                            !player?.athlete?.id
                          )
                            return [];

                          // Find player in boxscore
                          let playerBoxscoreData = null;
                          for (const teamData of gameDetails.boxscore.players) {
                            if (teamData.statistics) {
                              for (const statCategory of teamData.statistics) {
                                if (statCategory.athletes) {
                                  for (const athleteData of statCategory.athletes) {
                                    const athlete = athleteData.athlete;
                                    if (
                                      athlete &&
                                      (athlete.id === player.athlete.id ||
                                        athlete.id ===
                                          player.athlete.id.toString())
                                    ) {
                                      if (!playerBoxscoreData)
                                        playerBoxscoreData = {};
                                      playerBoxscoreData[statCategory.name] =
                                        athleteData.stats || [];
                                    }
                                  }
                                }
                              }
                            }
                          }

                          if (!playerBoxscoreData) return [];

                          // Define stat display logic based on play type and participant type
                          const stats = [];

                          // Special case: Interception (type 26)
                          if (playTypeId === "26" || playTypeId === "36") {
                            if (participantType === "passer") {
                              // Show yards and interceptions
                              const passing = playerBoxscoreData.passing || [];
                              if (passing[1]) stats.push(`${passing[1]} yds`);
                              if (passing[4]) stats.push(`${passing[4]} INT`);
                            } else if (participantType === "passDefender") {
                              // Show interceptions and interception yards
                              const defensive =
                                playerBoxscoreData.interceptions || [];
                              if (defensive[0])
                                stats.push(`${defensive[0]} INT`);
                              if (defensive[1])
                                stats.push(`${defensive[1]} INT yds`);
                            } else if (participantType === "returner") {
                              // Show targets and yards
                              const receiving =
                                playerBoxscoreData.receiving || [];
                              if (receiving[5])
                                stats.push(`${receiving[5]} tgt`);
                              if (receiving[1])
                                stats.push(`${receiving[1]} yds`);
                            } else if (
                              participantType === "tackler" ||
                              participantType === "assistedBy"
                            ) {
                              // Show total tackles
                              const defensive =
                                playerBoxscoreData.defensive || [];
                              if (defensive[0])
                                stats.push(`${defensive[0]} tkl`);
                            }
                          }
                          // Special case: Kickoff (type 53)
                          else if (playTypeId === "53") {
                            if (participantType === "returner") {
                              // Show kick returns and yards
                              const returning =
                                playerBoxscoreData.kickReturns || [];
                              if (returning[0])
                                stats.push(`${returning[0]} ret`);
                              if (returning[1])
                                stats.push(`${returning[1]} yds`);
                            } else if (
                              participantType === "tackler" ||
                              participantType === "assistedBy"
                            ) {
                              // Show total tackles
                              const defensive =
                                playerBoxscoreData.defensive || [];
                              if (defensive[0])
                                stats.push(`${defensive[0]} tkl`);
                            }
                          } else if (playTypeId === "32") {
                            if (
                              participantType === "returner" ||
                              participantType === "scorer"
                            ) {
                              const returning =
                                playerBoxscoreData.kickReturns || [];
                              if (returning[0])
                                stats.push(`${returning[0]} ret`);
                              if (returning[1])
                                stats.push(`${returning[1]} yds`);
                              if (returning[4])
                                stats.push(`${returning[4]} TD`);
                            } else if (
                              participantType === "patScorer" ||
                              participantType === "kicker"
                            ) {
                              const kicking = playerBoxscoreData.kicking || [];
                              if (kicking[3]) stats.push(`${kicking[3]} XP`);
                            }
                          }
                          // Special case: Punt (type 52)
                          else if (playTypeId === "52" || playTypeId === "34") {
                            if (participantType === "returner") {
                              // Show punt returns and yards
                              const returning =
                                playerBoxscoreData.puntReturns || [];
                              if (returning[0])
                                stats.push(`${returning[0]} ret`);
                              if (returning[1])
                                stats.push(`${returning[1]} yds`);
                            } else if (
                              participantType === "tackler" ||
                              participantType === "assistedBy"
                            ) {
                              // Show total tackles
                              const defensive =
                                playerBoxscoreData.defensive || [];
                              if (defensive[0])
                                stats.push(`${defensive[0]} tkl`);
                            } else if (participantType === "punter") {
                              // Show punts and yards
                              const punting = playerBoxscoreData.punting || [];
                              if (punting[0]) stats.push(`${punting[0]} punts`);
                              if (punting[1]) stats.push(`${punting[1]} yds`);
                            } else if (
                              participantType === "patScorer" ||
                              participantType === "kicker"
                            ) {
                              const kicking = playerBoxscoreData.kicking || [];
                              if (kicking[3]) stats.push(`${kicking[3]} XP`);
                            }
                            // Don't show stats for kicker
                          } else if (
                            playTypeId === "29" ||
                            playTypeId === "80"
                          ) {
                            if (
                              participantType === "fumbler" ||
                              participantType === "rusher" ||
                              participantType === "passer"
                            ) {
                              // Show fumbles
                              const fumbles = playerBoxscoreData.fumbles || [];
                              if (fumbles[0]) stats.push(`${fumbles[0]} fum`);
                            } else if (participantType === "recoverer") {
                              // Show fumbles recovered
                              const defensive =
                                playerBoxscoreData.fumbles || [];
                              if (defensive[2])
                                stats.push(`${defensive[2]} rec`);
                            } else if (
                              participantType === "tackler" ||
                              participantType === "assistedBy" ||
                              participantType === "forcedBy"
                            ) {
                              // Show total tackles
                              const defensive =
                                playerBoxscoreData.defensive || [];
                              if (defensive[0])
                                stats.push(`${defensive[0]} tkl`);
                            }
                          }
                          // Special case: Sack (type 7)
                          else if (playTypeId === "7") {
                            if (participantType === "passer") {
                              // Show sacks and yards
                              const passing = playerBoxscoreData.passing || [];
                              if (passing[5]) stats.push(`${passing[5]} sck`);
                              if (passing[1]) stats.push(`${passing[1]} yds`);
                            } else if (
                              participantType === "sackedBy" ||
                              participantType === "tackler" ||
                              participantType === "assistedBy"
                            ) {
                              // Show sacks and total tackles
                              const defensive =
                                playerBoxscoreData.defensive || [];
                              if (defensive[2])
                                stats.push(`${defensive[2]} sck`);
                              if (defensive[0])
                                stats.push(`${defensive[0]} tkl`);
                            }
                          }
                          // Special case: Field Goal (type 59)
                          else if (playTypeId === "59") {
                            if (participantType === "kicker") {
                              // Show field goals made and percentage
                              const kicking = playerBoxscoreData.kicking || [];
                              if (kicking[0]) stats.push(`${kicking[0]} FG`);
                              if (kicking[1]) stats.push(`${kicking[1]}%`);
                            }
                          }
                          // Regular cases
                          else {
                            if (participantType === "rusher") {
                              // Show attempts, yards, touchdowns
                              const rushing = playerBoxscoreData.rushing || [];
                              if (rushing[0]) stats.push(`${rushing[0]} att`);
                              if (rushing[1]) stats.push(`${rushing[1]} yds`);
                              if (rushing[3]) stats.push(`${rushing[3]} TD`);
                            } else if (participantType === "passer") {
                              // Show completions/attempts, yards, touchdowns
                              const passing = playerBoxscoreData.passing || [];
                              if (passing[0]) stats.push(`${passing[0]} c/att`);
                              if (passing[1]) stats.push(`${passing[1]} yds`);
                              if (passing[3]) stats.push(`${passing[3]} TD`);
                            } else if (participantType === "receiver") {
                              // Show receptions, yards, touchdowns
                              const receiving =
                                playerBoxscoreData.receiving || [];
                              if (receiving[0])
                                stats.push(`${receiving[0]} rec`);
                              if (receiving[1])
                                stats.push(`${receiving[1]} yds`);
                              if (receiving[3])
                                stats.push(`${receiving[3]} TD`);
                            } else if (
                              participantType === "assistedBy" ||
                              participantType === "tackler"
                            ) {
                              // Show total tackles
                              const defensive =
                                playerBoxscoreData.defensive || [];
                              if (defensive[0])
                                stats.push(`${defensive[0]} tkl`);
                            } else if (participantType === "passDefender") {
                              // Show passes defended
                              const defensive =
                                playerBoxscoreData.defensive || [];
                              if (defensive[4])
                                stats.push(`${defensive[4]} PD`);
                            } else if (participantType === "kicker") {
                              // Show field goals and extra points
                              const kicking = playerBoxscoreData.kicking || [];
                              if (kicking[0]) stats.push(`${kicking[3]} XP`);
                            } else if (participantType === "punter") {
                              // Show punts and yards
                              const punting = playerBoxscoreData.punting || [];
                              if (punting[0]) stats.push(`${punting[0]} punts`);
                              if (punting[1]) stats.push(`${punting[1]} yds`);
                            }
                          }

                          return stats;
                        };

                        const formatPlayerName = (player) => {
                          const fullName =
                            player.athlete?.displayName ||
                            player.athlete?.fullName;
                          if (!fullName) return "Unknown";

                          const nameParts = fullName.split(" ");
                          const formattedName =
                            nameParts.length === 1
                              ? fullName
                              : `${nameParts[0][0]}. ${nameParts
                                  .slice(1)
                                  .join(" ")}`;

                          return formattedName;
                        };

                        const mainPlayerDisplay = formatPlayerName(mainPlayer);
                        const mainPlayerId = mainPlayer.athlete?.id;
                        const mainPlayerHeadshot =
                          mainPlayer.athlete?.headshot?.href ||
                          `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${mainPlayerId}.png`;
                        const otherPlayers = participantsList.slice(1);
                        const mainPlayerStats = getPlayerStats(
                          mainPlayer,
                          playTypeId,
                          mainPlayer.type,
                        );
                        const parseStatItem = (stat) => {
                          if (!stat) return { value: "—", label: "" };
                          const parts = stat.split(" ");
                          if (parts.length === 1) {
                            return { value: stat, label: "" };
                          }
                          const value = parts.shift();
                          return { value, label: parts.join(" ") };
                        };

                        return (
                          <View>
                            <View
                              style={{
                                alignItems: "center",
                                marginBottom: 10,
                              }}
                            >
                              <Image
                                source={{ uri: mainPlayerHeadshot }}
                                style={{
                                  width: 60,
                                  height: 60,
                                  borderRadius: 30,
                                  marginBottom: 8,
                                  backgroundColor: teamColor + "88",
                                  borderWidth: 2,
                                  borderColor: teamColor,
                                }}
                              />
                              <Text
                                style={{
                                  fontSize: 16,
                                  fontWeight: "800",
                                  color: theme.text,
                                  textAlign: "center",
                                }}
                                numberOfLines={2}
                              >
                                {mainPlayerDisplay}
                              </Text>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  marginTop: 4,
                                }}
                              >
                                <TeamLogoImage
                                  team={teamLogo}
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
                                  {teamName || teamAbbr}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                justifyContent: "space-between",
                                marginBottom: 10,
                              }}
                            >
                              {(mainPlayerStats.length
                                ? mainPlayerStats
                                : ["—"]
                              ).map((stat, idx) => {
                                const parsed = parseStatItem(stat);
                                return (
                                  <View
                                    key={`${stat}-${idx}`}
                                    style={{
                                      width: "31%",
                                      paddingVertical: 6,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 16,
                                        fontWeight: "800",
                                        color: theme.text,
                                      }}
                                    >
                                      {parsed.value}
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        fontWeight: "700",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.4,
                                        color: theme.textSecondary,
                                        textAlign: "center",
                                      }}
                                    >
                                      {parsed.label || "STAT"}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>

                            {otherPlayers.map((player, idx) => {
                              const otherName = formatPlayerName(player);
                              const otherStats = getPlayerStats(
                                player,
                                playTypeId,
                                player.type,
                              );
                              if (!otherStats.length) return null;
                              return (
                                <View
                                  key={`${player.athlete?.id || idx}`}
                                  style={{ marginBottom: 10 }}
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
                                    {otherName}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: theme.textSecondary,
                                      textAlign: "center",
                                    }}
                                    numberOfLines={1}
                                  >
                                    {otherStats.join(", ")}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        );
                      })()}
                  </View>
                </View>

                {/* Footer inside the card */}
                <View
                  style={[
                    styles.shareCardFooterPlay,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "800",
                      color: theme.text,
                    }}
                  >
                    W {winProbability.toFixed(1)}%
                  </Text>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "800",
                      letterSpacing: 0.4,
                      color: theme.text,
                    }}
                  >
                    SportsHeart{" "}
                    <Ionicons name="heart" size={10} color={colors.primary} />
                  </Text>
                </View>
              </>
            );
          })()}
      </View>

      {/* Action Buttons */}
      <View style={styles.nflPlayShareCardActions}>
        <View style={styles.nflPlayShareCardTopButtons}>
          <TouchableOpacity
            style={[
              styles.nflPlayShareCardButton,
              { backgroundColor: colors.secondary },
            ]}
            onPress={async () => {
              try {
                const uri = await captureRef(nflPlayShareCardRef, {
                  format: "png",
                  quality: 2,
                });
                await Sharing.shareAsync(uri, {
                  mimeType: "image/png",
                  dialogTitle: "Share Play",
                });
              } catch (error) {
                console.error("Error sharing play:", error);
              }
            }}
          >
            <Ionicons name="share-outline" size={24} color="#fff" />
            <Text
              style={[styles.nflPlayShareCardButtonText, { color: "#fff" }]}
            >
              Share
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.nflPlayShareCardButton,
              styles.nflPlayShareCardCancelButton,
              { backgroundColor: theme.surfaceSecondary },
            ]}
            onPress={() => setShareCardPlay(null)}
          >
            <Ionicons name="close" size={24} color={theme.text} />
            <Text
              style={[styles.nflPlayShareCardButtonText, { color: theme.text }]}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  nflPlayShareCard: {
    width: 360,
    backgroundColor: "#fff",
    borderRadius: 0,
  },
  nflPlayShareCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  nflPlayShareCardTeamLogo: {
    width: 32,
    height: 32,
  },
  nflPlayShareCardTeamName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  nflPlayShareCardInfoBar: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  nflPlayShareCardQuarter: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  nflPlayShareCardScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  nflPlayShareCardScoreBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nflPlayShareCardScoreTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nflPlayShareCardScoreLogo: {
    width: 24,
    height: 24,
  },
  nflPlayShareCardScore: {
    fontSize: 20,
    fontWeight: "bold",
  },
  nflPlayShareCardScoreSeparator: {
    fontSize: 18,
    fontWeight: "600",
  },
  nflPlayShareCardWinProbability: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  nflPlayShareCardWinProbText: {
    fontSize: 13,
    fontWeight: "bold",
  },
  nflPlayShareCardDriveIndicator: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  nflPlayShareCardDriveField: {
    height: 12,
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
    position: "relative",
    marginBottom: 8,
  },
  nflPlayShareCardFieldLine: {
    position: "absolute",
    width: 2,
    height: "100%",
    backgroundColor: "#fff",
    top: 0,
  },
  nflPlayShareCardDriveProgress: {
    position: "absolute",
    height: "100%",
    borderRadius: 6,
    top: 0,
  },
  nflPlayShareCardDriveText: {
    fontSize: 11,
    textAlign: "center",
  },
  nflPlayShareCardPlayDescription: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  nflPlayShareCardPlayText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  nflPlayShareCardPlayersSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  nflPlayShareCardPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  nflPlayShareCardPlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginTop: -17.5,
  },
  nflPlayShareCardPlayerImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: "#f0f0f0",
  },
  nflPlayShareCardPlayerDetails: {
    flex: 1,
  },
  nflPlayShareCardPlayerName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  nflPlayShareCardOtherPlayerName: {
    fontSize: 13,
    marginTop: 2,
  },
  nflPlayShareCardPlayerTeam: {
    fontSize: 12,
  },
  nflPlayShareCardPlayerStats: {
    alignItems: "flex-end",
  },
  nflPlayShareCardStatValue: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  nflPlayShareCardStatLabel: {
    fontSize: 11,
    textTransform: "uppercase",
  },
  nflPlayShareCardActions: {
    marginTop: 24,
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  nflPlayShareCardTopButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  shareCardFooterPlay: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareCardFooterText: {
    fontSize: 15,
    fontWeight: "800",
  },
  nflPlayShareCardButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  nflPlayShareCardCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  nflPlayShareCardButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
});
