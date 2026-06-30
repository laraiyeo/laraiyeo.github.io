        <Modal
          visible={!!sharePlayCard}
          animationType="fade"
          transparent
          onRequestClose={() => setSharePlayCard(null)}
        >
          <View
            style={[
              styles.modalOverlay,
              { backgroundColor: "rgba(0,0,0,0.85)" },
            ]}
          >
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
              }}
            >
              <View
                ref={sharePlayCardRef}
                collapsable={false}
                style={[
                  styles.shareCard,
                  { backgroundColor: theme.surface, width: "90%", padding: 12 },
                ]}
              >
                {sharePlayCard &&
                  (() => {
                    const p = sharePlayCard;

                    // Prefer scorerId if available (participants[0] is scorer)
                    const scorerId = p.scorerId || null;
                    const playersBox = details?.boxscore?.players || [];
                    let foundPlayer = null;
                    if (scorerId) {
                      for (const teamBox of playersBox) {
                        for (const group of teamBox.statistics || []) {
                          for (const athlete of group.athletes || []) {
                            const aid = String(
                              athlete?.athlete?.id ||
                                athlete?.athlete?.athleteId ||
                                athlete?.athlete?.athleteid ||
                                "",
                            );
                            if (aid === String(scorerId)) {
                              foundPlayer = {
                                athlete: athlete.athlete,
                                stats: athlete.stats || [],
                                team: teamBox.team,
                              };
                              break;
                            }
                          }
                          if (foundPlayer) break;
                        }
                        if (foundPlayer) break;
                      }
                    }

                    const displayName =
                      (foundPlayer &&
                        (foundPlayer.athlete?.displayName ||
                          foundPlayer.athlete?.fullName)) ||
                      "Unknown Player";
                    const initials = displayName
                      .split(" ")
                      .map((n) => n.charAt(0))
                      .join("")
                      .toUpperCase()
                      .slice(0, 2);

                    // Define stat labels we want and resolve indices from boxscore metadata
                    const statLabels = [
                      "PTS",
                      "REB",
                      "AST",
                      "FG",
                      "STL",
                      "MIN",
                    ];
                    let statValues = statLabels.map(() => "-");
                    if (foundPlayer) {
                      const meta = findPlayerStatsMeta(foundPlayer) || {};
                      const labels = meta.labels || [];
                      const keys = meta.keys || [];

                      const normalize = (s) =>
                        (s || "")
                          .toString()
                          .replace(/[^a-z0-9]/gi, "")
                          .toLowerCase();
                      const findIndexFor = (target) => {
                        const nTarget = normalize(target);
                        for (let i = 0; i < labels.length; i++) {
                          if (normalize(labels[i]) === nTarget) return i;
                        }
                        for (let i = 0; i < labels.length; i++) {
                          if (
                            normalize(labels[i]).includes(nTarget) ||
                            nTarget.includes(normalize(labels[i]))
                          )
                            return i;
                        }
                        // try keys matching (like 'points', 'rebounds')
                        for (let i = 0; i < (keys || []).length; i++) {
                          if (
                            normalize(keys[i]).includes(nTarget) ||
                            nTarget.includes(normalize(keys[i]))
                          )
                            return i;
                        }
                        return -1;
                      };

                      statValues = statLabels.map((lbl) => {
                        const idx = findIndexFor(lbl);
                        if (
                          idx >= 0 &&
                          foundPlayer.stats &&
                          foundPlayer.stats[idx] != null
                        )
                          return String(foundPlayer.stats[idx]);
                        return "-";
                      });
                    }

                    // Determine headshot, team logo and color
                    let headshot = null;
                    let teamLogo = null;
                    let teamColor = null;
                    if (foundPlayer && foundPlayer.athlete) {
                      headshot =
                        foundPlayer.athlete.headshot?.href ||
                        foundPlayer.athlete.headshot ||
                        null;
                    }
                    if (foundPlayer && foundPlayer.team) {
                      teamLogo =
                        foundPlayer.team.logo ||
                        (foundPlayer.team.abbreviation
                          ? getTeamLogoUrl("nba", foundPlayer.team.abbreviation)
                          : null);
                      teamColor = foundPlayer.team.color || null;
                    } else if (p.playTeamId) {
                      // fallback: check home/away
                      const comp = details?.header?.competitions?.[0];
                      const competitors = comp?.competitors || [];
                      const awayC = competitors.find(
                        (c) => c.homeAway === "away",
                      );
                      const homeC = competitors.find(
                        (c) => c.homeAway === "home",
                      );
                      if (awayC?.team?.id === p.playTeamId) {
                        teamLogo = awayC?.team?.logo;
                        teamColor = awayC?.team?.color || null;
                      } else if (homeC?.team?.id === p.playTeamId) {
                        teamLogo = homeC?.team?.logo;
                        teamColor = homeC?.team?.color || null;
                      }
                    }

                    return (
                      <View style={{ flexDirection: "column", width: "100%" }}>
                        {/* Top: score/time above the rotated court */}
                        <View
                          style={{
                            width: "100%",
                            alignItems: "stretch",
                            marginBottom: 8,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              paddingHorizontal: 6,
                              marginBottom: 6,
                              width: "100%",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                              }}
                            >
                              {p.awayLogoUri ? (
                                <TeamLogoWithTheme
                                  colors={colors}
                                  getTeamLogoUrl={getTeamLogoUrl}
                                  logoUri={p.awayLogoUri}
                                  size={30}
                                  style={{
                                    width: 30,
                                    height: 30,
                                    marginRight: 8,
                                  }}
                                />
                              ) : null}
                              <Text
                                style={{
                                  color:
                                    parseInt(p.awayScore) >
                                    parseInt(p.homeScore)
                                      ? colors.primary
                                      : theme.text,
                                  fontWeight: "700",
                                  fontSize: 18,
                                }}
                              >
                                {p.awayScore ?? "0"}
                              </Text>
                              <Text
                                style={{
                                  color: theme.text,
                                  fontWeight: "700",
                                  fontSize: 18,
                                  marginHorizontal: 8,
                                }}
                              >
                                -
                              </Text>
                              <Text
                                style={{
                                  color:
                                    parseInt(p.homeScore) >
                                    parseInt(p.awayScore)
                                      ? colors.primary
                                      : theme.text,
                                  fontWeight: "700",
                                  fontSize: 18,
                                }}
                              >
                                {p.homeScore ?? "0"}
                              </Text>
                              {p.homeLogoUri ? (
                                <TeamLogoWithTheme
                                  colors={colors}
                                  getTeamLogoUrl={getTeamLogoUrl}
                                  logoUri={p.homeLogoUri}
                                  size={30}
                                  style={{
                                    width: 30,
                                    height: 30,
                                    marginLeft: 8,
                                  }}
                                />
                              ) : null}
                            </View>

                            <View style={{ alignItems: "flex-end" }}>
                              <Text
                                style={{ color: theme.text, fontWeight: "700" }}
                              >
                                {p.clock || ""}
                              </Text>
                              <Text
                                style={{
                                  color: theme.textSecondary,
                                  fontSize: 12,
                                }}
                              >
                                {p.period || ""}
                              </Text>
                            </View>
                          </View>

                          <View
                            style={[
                              styles.miniField,
                              { alignSelf: "center", marginTop: 25 },
                            ]}
                          >
                            {/* Rotate the court 90deg clockwise inside a container so dimensions are preserved */}
                            <View
                              style={{
                                flex: 1,
                                transform: [{ rotate: "90deg" }],
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <BasketballCourt
                                key={`share-court-${p.id}`}
                                coordinate={(() => {
                                  // Check for valid coordinates
                                  if (
                                    p.coordX != null &&
                                    p.coordY != null &&
                                    p.coordX > -1000000 &&
                                    p.coordY > -1000000 &&
                                    p.coordX < 1000000 &&
                                    p.coordY < 1000000
                                  ) {
                                    return { x: p.coordX, y: p.coordY };
                                  }
                                  // Fallback coordinates for invalid data
                                  return {
                                    x:
                                      p.isScoring || p.pointsAttempted === 1
                                        ? 25
                                        : 0,
                                    y:
                                      p.isScoring || p.pointsAttempted === 1
                                        ? 17
                                        : 0,
                                  };
                                })()}
                                isScoring={p.isScoring}
                                teamSide={
                                  away?.team?.id === p.playTeamId
                                    ? "away"
                                    : "home"
                                }
                                teamColor={
                                  ensureHexColor(p.playTeamColor) || "552583"
                                }
                                styles={styles}
                              />
                            </View>
                          </View>
                        </View>

                        {/* Bottom: Play text, player, and stats */}
                        <View style={{ marginTop: 8 }}>
                          <Text
                            style={{
                              color: theme.text,
                              fontSize: 16,
                              fontWeight: "700",
                              marginBottom: 10,
                              textAlign: "center",
                            }}
                          >
                            {p.playText}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginBottom: 8,
                            }}
                          >
                            {/* Headshot / initials (prefer athlete headshot, fallback to team logo) */}
                            {headshot ? (
                              <Image
                                source={{ uri: headshot }}
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 28,
                                  backgroundColor: teamColor
                                    ? `#${teamColor}`
                                    : theme.surfaceSecondary,
                                  marginRight: 8,
                                }}
                              />
                            ) : teamLogo ? (
                              <Image
                                source={{ uri: teamLogo }}
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 28,
                                  backgroundColor: teamColor
                                    ? `#${teamColor}33`
                                    : theme.surfaceSecondary,
                                  marginRight: 8,
                                }}
                              />
                            ) : (
                              <View
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 28,
                                  backgroundColor: theme.surfaceSecondary,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  marginRight: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    color: theme.textSecondary,
                                    fontWeight: "700",
                                  }}
                                >
                                  {initials}
                                </Text>
                              </View>
                            )}

                            <View style={{ flex: 1 }}>
                              <Text
                                style={{ color: theme.text, fontWeight: "700" }}
                                numberOfLines={1}
                              >
                                {displayName}
                              </Text>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  marginTop: 4,
                                }}
                              >
                                {teamLogo && (
                                  <TeamLogoWithTheme
                                    colors={colors}
                                    getTeamLogoUrl={getTeamLogoUrl}
                                    teamAbbreviation={
                                      foundPlayer?.team?.abbreviation || ""
                                    }
                                    style={{
                                      width: 20,
                                      height: 20,
                                      marginRight: 6,
                                    }}
                                  />
                                )}
                                <Text style={{ color: theme.textSecondary }}>
                                  {foundPlayer?.team?.displayName || ""}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Stats boxes */}
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              marginTop: 10,
                            }}
                          >
                            {statLabels.map((lbl, i) => (
                              <View
                                key={i}
                                style={{ flexBasis: "33.33%", padding: 4 }}
                              >
                                <View
                                  style={{
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    paddingHorizontal: 6,
                                    backgroundColor:
                                      theme.surfaceSecondary || theme.surface,
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: theme.text,
                                      fontWeight: "700",
                                    }}
                                  >
                                    {statValues[i]}
                                  </Text>
                                  <Text
                                    style={{
                                      color: theme.textSecondary,
                                      fontSize: 12,
                                    }}
                                  >
                                    {lbl}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                    );
                  })()}
                {/* Footer inside the card */}
                <View style={styles.shareCardFooter}>
                  <Text
                    style={[
                      styles.shareCardFooterText,
                      {
                        color: theme.text,
                        textShadowColor: "rgba(0, 0, 0, 0.8)",
                        textShadowOffset: { width: 1, height: 1 },
                        textShadowRadius: 5,
                      },
                    ]}
                  >
                    SportsHeart{" "}
                    <Ionicons name="heart" size={18} color={colors.primary} />
                  </Text>
                </View>
              </View>

              {/* Share actions */}
              <View style={[styles.shareCardActions, { marginTop: 12 }]}>
                <View style={styles.shareCardTopButtons}>
                  <TouchableOpacity
                    style={[
                      styles.shareCardButton,
                      { backgroundColor: colors.secondary },
                    ]}
                    onPress={async () => {
                      try {
                        const uri = await captureRef(sharePlayCardRef, {
                          format: "png",
                          quality: 2,
                        });
                        if (Platform.OS === "ios") {
                          await Sharing.shareAsync(uri, {
                            mimeType: "image/png",
                            UTI: "public.png",
                            dialogTitle: "Share Play",
                          });
                        } else {
                          await Share.share({ url: uri, title: "Play" });
                        }
                      } catch (e) {
                        console.error("Error sharing play copy card", e);
                        Alert.alert("Error", "Failed to share play copy card");
                      }
                    }}
                  >
                    <Ionicons name="share-outline" size={20} color="white" />
                    <Text style={styles.shareCardButtonText}>Share</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.shareCardCancelButton,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                    onPress={() => setSharePlayCard(null)}
                  >
                    <Ionicons name="close" size={20} color={theme.text} />
                    <Text
                      style={[
                        styles.shareCardButtonText,
                        { color: theme.text },
                      ]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>