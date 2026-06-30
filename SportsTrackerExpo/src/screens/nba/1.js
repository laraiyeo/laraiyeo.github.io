                  {/* Timeouts / Bonus indicators */}
                  {!isGameFinal &&
                    !getGameStatus().isPre &&
                    (() => {
                      try {
                        const teamObj = away || {};
                        // Prefer explicit timeoutsRemaining fields but fall back to common locations
                        const timeoutsRemaining = Math.max(
                          0,
                          Number(
                            teamObj.timeoutsRemaining ??
                              teamObj?.team?.timeoutsRemaining ??
                              teamObj?.statistics?.find((s) =>
                                /timeoutsRemaining/i.test(
                                  s?.name || s?.label || "",
                                ),
                              )?.value ??
                              0,
                          ) || 0,
                        );

                        const foulsRaw =
                          teamObj.fouls ??
                          teamObj?.team?.fouls ??
                          teamObj?.statistics?.find((s) =>
                            /foul/i.test(s?.name || s?.label || ""),
                          )?.value ??
                          null;
                        const bonusState =
                          (foulsRaw && foulsRaw.bonusState) ||
                          (foulsRaw && foulsRaw.bonus) ||
                          null;

                        const count = Math.min(5, timeoutsRemaining);
                        const { homeColor, awayColor } = getSmartTeamColors(
                          home,
                          away,
                          colors,
                        );
                        const teamColor = awayColor || colors.primary;

                        if (count <= 0) return null;

                        return (
                          <View style={{ alignItems: "center", marginTop: 6 }}>
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "center",
                              }}
                            >
                              {Array.from({ length: count }).map((_, i) => (
                                <View
                                  key={`away-to-${i}`}
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: 4,
                                    marginHorizontal: 1.5,
                                    backgroundColor: teamColor,
                                    borderWidth: 1,
                                    borderColor: teamColor,
                                  }}
                                />
                              ))}
                            </View>
                            {bonusState &&
                            String(bonusState).toUpperCase() !== "NONE" ? (
                              <Text
                                style={{
                                  color: theme.error,
                                  marginTop: 4,
                                  fontSize: 11,
                                  fontWeight: "700",
                                }}
                              >
                                BONUS
                              </Text>
                            ) : null}
                          </View>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}