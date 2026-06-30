const NHLGoalShareCardModal = ({
  visible,
  onClose,
  payload,
  theme,
  colors,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!visible) setSharing(false);
  }, [visible]);

  if (!payload) return null;

  const handleShare = async () => {
    if (sharing || !cardRef.current) return;
    try {
      setSharing(true);
      await new Promise((res) => setTimeout(res, 260));
      const uri = await cardRef.current.capture();
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Goal",
      });
    } catch (e) {
      console.warn("Goal share failed", e);
    } finally {
      setSharing(false);
    }
  };

  const cardWidth = Math.min(width - 48, 540);
  const teamColor = payload?.teamColor || colors.primary;
  const textOnTeam = getTextOnColor(teamColor);
  const homeScore = payload?.scoreAfter?.home ?? "-";
  const awayScore = payload?.scoreAfter?.away ?? "-";
  const homeBold = Number(homeScore) > Number(awayScore);
  const awayBold = Number(awayScore) > Number(homeScore);
  const goalType = payload?.isOwnGoal
    ? "Own Goal"
    : payload?.isPenalty
      ? "Penalty Goal"
      : "Goal";
  const goalSituation = String(payload?.goalSituation || "").trim();
  const assistNames = String(payload?.assistName || "")
    .trim()
    .split(/\s*(?:,|;|\/|&| and )\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={nhlShareCommonStyles.overlay}>
        <ViewShot
          ref={cardRef}
          options={{ format: "png", quality: 1 }}
          style={{ overflow: "hidden" }}
        >
          <View
            style={[
              nhlShareCommonStyles.card,
              { width: cardWidth, backgroundColor: theme.surface },
            ]}
          >
            <View
              style={[
                nhlGoalShareStyles.header,
                {
                  backgroundColor: `${teamColor}33`,
                  borderBottomColor: teamColor,
                },
              ]}
            >
              <View style={nhlGoalShareStyles.headerTopRow}>
                <Text
                  style={[nhlGoalShareStyles.timeText, { color: theme.text }]}
                >
                  {payload?.minuteLabel || ""}
                  {payload?.periodLabel ? ` • ${payload.periodLabel}` : ""}
                </Text>

                <View style={nhlGoalShareStyles.scoreWrap}>
                  {!!payload?.awayLogo && (
                    <Image
                      source={{ uri: payload.awayLogo }}
                      style={nhlGoalShareStyles.scoreLogo}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  )}
                  <Text
                    style={[
                      nhlGoalShareStyles.scoreText,
                      { color: theme.text },
                    ]}
                  >
                    <Text style={{ fontWeight: awayBold ? "800" : "400" }}>
                      {awayScore}
                    </Text>
                    {" - "}
                    <Text style={{ fontWeight: homeBold ? "800" : "400" }}>
                      {homeScore}
                    </Text>
                  </Text>
                  {!!payload?.homeLogo && (
                    <Image
                      source={{ uri: payload.homeLogo }}
                      style={nhlGoalShareStyles.scoreLogo}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  )}
                </View>
              </View>

              <Text
                style={[nhlGoalShareStyles.goalTypeText, { color: theme.text }]}
              >
                <FontAwesome6 name="hockey-puck" size={14} color={theme.text} />{" "}
                {goalType}
                {goalSituation ? ` • ${goalSituation}` : ""}
              </Text>

              {!!payload?.comment && (
                <Text
                  style={[
                    nhlGoalShareStyles.commentText,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {payload.comment}
                </Text>
              )}
            </View>

            <View style={nhlGoalShareStyles.body}>
              <View style={nhlGoalShareStyles.contentRow}>
                <View
                  style={[
                    nhlGoalShareStyles.rinkCol,
                    { backgroundColor: theme.surface },
                  ]}
                >
                  <View
                    style={[
                      nhlGoalShareStyles.rinkWrap,
                      { transform: [{ scaleX: -1 }] },
                    ]}
                  >
                    <NHLRinkGraphic
                      xCoord={payload?.xCoord}
                      yCoord={payload?.yCoord}
                      teamColor={teamColor}
                      teamSide={payload?.teamSide}
                      homeTeamDefendingSide={payload?.homeTeamDefendingSide}
                      isScoring={payload?.isScoring}
                      showTargetPath
                    />
                  </View>
                </View>

                <View
                  pointerEvents="none"
                  style={[
                    nhlGoalShareStyles.rinkDivider,
                    { backgroundColor: theme.border },
                  ]}
                />

                <View style={nhlGoalShareStyles.playerCol}>
                  {!!payload?.playerImageUri ? (
                    <Image
                      source={{ uri: payload.playerImageUri }}
                      style={[
                        nhlGoalShareStyles.avatar,
                        {
                          borderColor: teamColor,
                          backgroundColor: `${teamColor}66`,
                        },
                      ]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View
                      style={[
                        nhlGoalShareStyles.avatar,
                        nhlGoalShareStyles.avatarFallback,
                        {
                          borderColor: teamColor,
                          backgroundColor: `${teamColor}66`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          nhlGoalShareStyles.avatarInitial,
                          { color: textOnTeam },
                        ]}
                      >
                        {payload?.scorerInitials || "P"}
                      </Text>
                    </View>
                  )}

                  <Text
                    style={[
                      nhlGoalShareStyles.playerName,
                      { color: theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {payload?.scorerName || "Unknown Player"}
                  </Text>

                  <View style={nhlGoalShareStyles.teamRow}>
                    {!!payload?.teamLogoUri && (
                      <Image
                        source={{ uri: payload.teamLogoUri }}
                        style={nhlGoalShareStyles.teamLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    )}
                    <Text
                      style={[
                        nhlGoalShareStyles.teamName,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {payload?.teamName || payload?.teamAbbr || "Team"}
                    </Text>
                  </View>

                  {!!assistNames.length && (
                    <View style={nhlGoalShareStyles.assistWrap}>
                      <Text
                        style={[
                          nhlGoalShareStyles.assistLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        ASSISTED BY
                      </Text>
                      {assistNames.map((name, index) => (
                        <Text
                          key={`assist-${index}-${name}`}
                          style={[
                            nhlGoalShareStyles.assistName,
                            { color: theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                      ))}
                    </View>
                  )}

                  <View style={nhlGoalShareStyles.statsRow}>
                    {(payload?.statsItems || []).slice(0, 6).map((item) => (
                      <View
                        key={`goal-share-${item.label}`}
                        style={nhlGoalShareStyles.statCell}
                      >
                        <Text
                          style={[
                            nhlGoalShareStyles.statVal,
                            {
                              color:
                                item?.label === "+/-"
                                  ? Number(item?.value) < 0
                                    ? theme.error
                                    : Number(item?.value) > 0
                                      ? theme.success
                                      : theme.text
                                  : theme.text,
                            },
                          ]}
                        >
                          {item.value}
                        </Text>
                        <Text
                          style={[
                            nhlGoalShareStyles.statLbl,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            <View
              style={[
                nhlShareCommonStyles.cardFooter,
                { borderTopColor: theme.border },
              ]}
            >
              <Text
                style={[nhlShareCommonStyles.cardBrand, { color: theme.text }]}
              >
                SportsHeart{" "}
                <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        <View style={nhlShareCommonStyles.actions}>
          <TouchableOpacity
            style={[
              nhlShareCommonStyles.actionBtn,
              { backgroundColor: colors.secondary },
            ]}
            onPress={handleShare}
            disabled={sharing}
          >
            <View style={nhlShareCommonStyles.actionBtnRow}>
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={nhlShareCommonStyles.actionBtnTxt}>
                {sharing ? "Sharing..." : "Share"}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              nhlShareCommonStyles.actionBtn,
              {
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              },
            ]}
            onPress={onClose}
          >
            <View style={nhlShareCommonStyles.actionBtnRow}>
              <Ionicons name="close" size={16} color={theme.text} />
              <Text
                style={[
                  nhlShareCommonStyles.actionBtnTxt,
                  { color: theme.text },
                ]}
              >
                Close
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const nhlGoalShareStyles = StyleSheet.create({
  header: {
    padding: 14,
    borderBottomWidth: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreLogo: {
    width: 26,
    height: 18,
    marginHorizontal: -4,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: "700",
  },
  goalTypeText: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  commentText: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
  },
  body: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  contentRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    position: "relative",
  },
  rinkCol: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  rinkWrap: {
    width: "88%",
    maxWidth: 180,
    aspectRatio: 188 / 320,
    marginLeft: -4,
  },
  rinkDivider: {
    position: "absolute",
    left: "50%",
    marginLeft: -0.5,
    top: 8,
    width: 1,
    bottom: 8,
  },
  playerCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: "800",
  },
  playerName: {
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  teamLogo: {
    width: 24,
    height: 16,
  },
  teamName: {
    fontSize: 12,
    fontWeight: "600",
  },
  assistWrap: {
    marginTop: 4,
    alignItems: "center",
    width: "100%",
  },
  assistLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  assistName: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  statsRow: {
    marginTop: 6,
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCell: {
    alignItems: "center",
    width: "33.333%",
    paddingVertical: 8,
  },
  statVal: {
    fontSize: 15,
    fontWeight: "800",
  },
  statLbl: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});

const nhlShareCommonStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    padding: 24,
  },
  card: {
    overflow: "hidden",
  },
  cardScore: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  cardBrand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 28,
    minWidth: 120,
    alignItems: "center",
  },
  actionBtnTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  actionBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});