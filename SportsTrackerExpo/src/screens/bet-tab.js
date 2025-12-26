          <View
            style={[
              styles.section,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sectionTitle, { color: theme.text }]}
              >
                Bet Tab
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.sectionSubtitle, { color: theme.textSecondary }]}
              >
                Control visibility of the Bet tab
              </Text>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text
                  allowFontScaling={false}
                  style={[styles.settingLabel, { color: theme.text }]}
                >
                  Show Bet Tab
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.settingDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  {isPro
                    ? "Bet screen must always show for pro members."
                    : "Toggle to show or hide the Bet tab in the main navigation."}
                </Text>
              </View>

              <View style={{ justifyContent: "center" }}>
                <TouchableOpacity
                  onPress={() => {
                    if (isPro) return;
                    try {
                      setShowBetTab(!showBetTab);
                    } catch (e) {
                      console.warn("toggle showBetTab error", e);
                    }
                  }}
                  activeOpacity={0.8}
                  disabled={isPro}
                  style={[
                    styles.toggleButton,
                    {
                      backgroundColor: isPro
                        ? colors.primary
                        : showBetTab
                        ? colors.primary
                        : theme.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      {
                        backgroundColor: isPro
                          ? colors.accent
                          : showBetTab
                          ? colors.accent
                          : "#f4f3f4",
                        transform: [
                          { translateX: isPro || showBetTab ? 22 : 2 },
                        ],
                      },
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>