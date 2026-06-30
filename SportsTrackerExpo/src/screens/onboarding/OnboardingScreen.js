import React, { useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Image,
  Platform,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Linking } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { supabase } from "../../config/supabase";

const { width } = Dimensions.get("window");

const OnboardingScreen = () => {
  const { theme, colors, isDarkMode } = useTheme();
  const { completeOnboarding, loginDontShow, dismissLoginForSession } =
    useOnboarding();
  const navigation = useNavigation();
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewSource, setPreviewSource] = useState(null);

  const slides = useMemo(
    () => [
      {
        key: "scores",
        icon: "stats-chart-outline",
        title: "Welcome to SportsHeart",
        body: "Track live sports across leagues, explore team and player pages, compare standings and stats, and customize the app with themes and color palettes. Everything updates fast, with clean views built for game day.",
      },
      {
        key: "favorites",
        icon: "star-outline",
        title: "Shareable Cards",
        body: "Long-press players, games, or key moments to generate a shareable card. Save it, send it, or post it anywhere.",
        preview: true,
      },
      {
        key: "alerts",
        icon: "notifications-outline",
        title: "Built by One Developer",
        body: "This app is built and improved by a single developer. New features ship often. If you have feedback or ideas, please reach out.",
        contact: true,
      },
    ],
    [],
  );

  const finalizeOnboarding = async () => {
    completeOnboarding();

    if (loginDontShow) return;

    let userId = null;
    try {
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id || null;
    } catch (e) {
      userId = null;
    }

    if (!userId) {
      navigation.replace("OnboardingLogin");
      return;
    }

    let hasPro = false;
    try {
      const stored = await AsyncStorage.getItem("@is_pro");
      hasPro = stored === "1";
    } catch (e) {
      hasPro = false;
    }

    if (!hasPro) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_pro")
          .eq("id", userId)
          .maybeSingle();
        hasPro = !!profile?.is_pro;
      } catch (e) {
        hasPro = false;
      }
    }

    if (!hasPro) {
      try {
        await AsyncStorage.setItem("@show_pro_splash_next", "1");
      } catch (e) {}
    }

    dismissLoginForSession();
  };

  const handleNext = () => {
    if (index >= slides.length - 1) {
      finalizeOnboarding();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const handleSkip = () => {
    finalizeOnboarding();
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems[0]) {
      setIndex(viewableItems[0].index || 0);
    }
  });

  const openPreview = (source) => {
    setPreviewSource(source);
    setPreviewVisible(true);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={[styles.skipText, { color: theme.textSecondary }]}>
            Skip
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View
              style={[styles.iconWrap, { backgroundColor: colors.primary }]}
            >
              <Ionicons name={item.icon} size={36} color="#fff" />
            </View>
            {item.key === "scores" ? (
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: theme.text }]}>
                  Welcome to
                </Text>
                <Text style={[styles.title, { color: theme.text }]}>
                  SportsHeart
                </Text>
                <Ionicons
                  name="heart"
                  size={22}
                  color={colors.primary}
                  style={styles.titleIcon}
                />
              </View>
            ) : (
              <Text style={[styles.title, { color: theme.text }]}>
                {item.title}
              </Text>
            )}
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              {item.body}
            </Text>

            {item.preview && (
              <View style={styles.previewSection}>
                <View style={styles.previewRow}>
                  <TouchableOpacity
                    style={[
                      styles.previewTile,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() =>
                      openPreview(require("../../../assets/IMG_5570.png"))
                    }
                    activeOpacity={0.8}
                  >
                    <Image
                      source={require("../../../assets/IMG_5570.png")}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.previewTile,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() =>
                      openPreview(require("../../../assets/IMG_5571.png"))
                    }
                    activeOpacity={0.8}
                  >
                    <Image
                      source={require("../../../assets/IMG_5571.png")}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Shareable Card Previews
                </Text>
              </View>
            )}

            {item.contact && (
              <View style={styles.contactSection}>
                <View style={styles.contactRow}>
                  <TouchableOpacity
                    style={[
                      styles.contactButton,
                      {
                        backgroundColor: theme.surface,
                        borderColor: "#7289da",
                      },
                    ]}
                    onPress={() =>
                      Linking.openURL("https://discord.gg/fGt3sMfwge")
                    }
                    activeOpacity={0.7}
                  >
                    <Image
                      source={require("../../../assets/discord.png")}
                      style={styles.contactIcon}
                      resizeMode="contain"
                    />
                    <Text style={[styles.contactLabel, { color: theme.text }]}>
                      Discord
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.contactButton,
                      {
                        backgroundColor: theme.surface,
                        borderColor: isDarkMode ? "#fff" : "#000",
                      },
                    ]}
                    onPress={() =>
                      Linking.openURL("https://x.com/sportsheart_")
                    }
                    activeOpacity={0.7}
                  >
                    <Image
                      source={require("../../../assets/x.png")}
                      style={styles.contactIcon}
                      resizeMode="contain"
                      tintColor={theme.text}
                    />
                    <Text style={[styles.contactLabel, { color: theme.text }]}>
                      X (Twitter)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.contactButton,
                      {
                        backgroundColor: theme.surface,
                        borderColor: "#ff5700",
                      },
                    ]}
                    onPress={() =>
                      Linking.openURL("https://www.reddit.com/r/SportsHeart/")
                    }
                    activeOpacity={0.7}
                  >
                    <Image
                      source={require("../../../assets/reddit.png")}
                      style={styles.contactIcon}
                      resizeMode="contain"
                    />
                    <Text style={[styles.contactLabel, { color: theme.text }]}>
                      Reddit
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      />

      <Modal
        visible={previewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={styles.previewModalOverlay}>
          <View style={styles.previewModalContent}>
            <TouchableOpacity
              style={styles.previewClose}
              onPress={() => setPreviewVisible(false)}
            >
              <Text style={styles.previewCloseText}>Close</Text>
            </TouchableOpacity>
            {previewSource && (
              <Image
                source={previewSource}
                style={styles.previewModalImage}
                resizeMode="contain"
              />
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === index ? colors.primary : theme.borderSecondary,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: colors.primary }]}
          onPress={handleNext}
        >
          <Text style={styles.nextText}>
            {index === slides.length - 1 ? "Get Started" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 24,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 20 : 60,
    alignItems: "flex-end",
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  slide: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  body: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  previewSection: {
    width: "100%",
    marginTop: 30,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  previewTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    aspectRatio: 1,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  previewModalContent: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#111",
    borderRadius: 12,
    overflow: "hidden",
  },
  previewModalImage: {
    width: "100%",
    height: 420,
  },
  previewClose: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "flex-end",
  },
  previewCloseText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  contactSection: {
    width: "100%",
    marginTop: 16,
  },
  contactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  contactButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  contactIcon: {
    width: 28,
    height: 28,
    marginBottom: 8,
  },
  contactLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 6,
  },
  nextButton: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  nextText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default OnboardingScreen;
