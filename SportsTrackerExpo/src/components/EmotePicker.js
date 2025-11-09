import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useEmotes } from "../context/EmoteContext";
import EmoteService from "../services/EmoteService";

const { width: screenWidth } = Dimensions.get("window");
const EMOTE_SIZE = 32;
const EMOTE_MARGIN = 4;
const EMOTES_CONTAINER_PADDING = 30; // 15px on each side
const EMOTE_BUTTON_SIZE = EMOTE_SIZE + EMOTE_MARGIN * 2;

const EmotePicker = ({ visible, onClose, onEmoteSelect }) => {
  const { theme, colors } = useTheme();
  const { emotes, isLoading } = useEmotes();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [containerWidth, setContainerWidth] = useState(
    screenWidth - EMOTES_CONTAINER_PADDING
  );

  // Calculate emotes per row based on actual container width with safety margin
  const emotesPerRow = Math.max(
    1,
    Math.floor((containerWidth - 20) / EMOTE_BUTTON_SIZE)
  );

  // Debug logging
  console.log("🎨 EmotePicker Debug:", {
    containerWidth,
    EMOTE_BUTTON_SIZE,
    emotesPerRow,
    calculation: `Math.floor((${containerWidth} - 20) / ${EMOTE_BUTTON_SIZE}) = ${emotesPerRow}`,
  });

  const categories = [
    { key: "all", label: "All", icon: "grid-outline" },
    { key: "top", label: "Top", icon: "star-outline" },
    { key: "sports", label: "Sports", icon: "football-outline" },
    { key: "reactions", label: "Reactions", icon: "happy-outline" },
    { key: "trending", label: "Trending", icon: "trending-up-outline" },
    { key: "misc", label: "Misc", icon: "ellipsis-horizontal-outline" },
  ];

  // No need to load emotes here - they're already loaded globally
  // useEffect removed

  const getCurrentEmotes = useMemo(() => {
    const categoryEmotes = emotes[selectedCategory] || [];

    if (searchTerm) {
      return EmoteService.searchEmotes(categoryEmotes, searchTerm);
    }

    return categoryEmotes;
  }, [emotes, selectedCategory, searchTerm]);

  const renderEmote = useCallback(
    ({ item, index }) => (
      <TouchableOpacity
        style={[styles.emoteButton, { backgroundColor: theme.surface }]}
        onPress={() => {
          onEmoteSelect(item);
          onClose(); // Close immediately when emote is selected
        }}
        activeOpacity={0.7}
      >
        {item.type === "custom" &&
        typeof item.url === "string" &&
        item.url.length <= 4 ? (
          // Unicode emoji or short custom text
          <Text style={styles.emojiText}>{item.url}</Text>
        ) : (
          // Use static images for all emotes in picker for better performance
          <Image
            source={{
              uri: item.cachedUrl || item.url,
            }}
            style={styles.emoteImage}
            resizeMode="contain"
          />
        )}
      </TouchableOpacity>
    ),
    [theme.surface, onEmoteSelect, onClose]
  );

  const renderCategory = (category) => (
    <TouchableOpacity
      key={category.key}
      style={[
        styles.categoryButton,
        {
          backgroundColor:
            selectedCategory === category.key ? colors.primary : theme.surface,
          borderColor: theme.border,
        },
      ]}
      onPress={() => setSelectedCategory(category.key)}
    >
      <Ionicons
        name={category.icon}
        size={20}
        color={selectedCategory === category.key ? "#fff" : theme.text}
      />
      <Text
        style={[
          styles.categoryText,
          {
            color: selectedCategory === category.key ? "#fff" : theme.text,
          },
        ]}
      >
        {category.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[styles.modalContent, { backgroundColor: theme.background }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Select Emote
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View
            style={[styles.searchContainer, { backgroundColor: theme.surface }]}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={theme.textSecondary}
            />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search emotes..."
              placeholderTextColor={theme.textSecondary}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
          </View>

          {/* Categories */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesContainer}
            contentContainerStyle={styles.categoriesContent}
          >
            {categories.map(renderCategory)}
          </ScrollView>

          {/* Emotes Grid */}
          <View
            style={[styles.emotesContainer, { width: containerWidth + 20 }]}
          >
            {isLoading ? (
              <ActivityIndicator
                size="large"
                color={colors.primary}
                style={styles.loading}
              />
            ) : (
              <FlatList
                data={getCurrentEmotes}
                renderItem={renderEmote}
                keyExtractor={(item) => item.id}
                numColumns={emotesPerRow}
                key={`${emotesPerRow}-${containerWidth}`} // Force re-render when layout changes
                contentContainerStyle={styles.emotesGrid}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false} // Disable to prevent scroll position issues
                maxToRenderPerBatch={20} // Increase for smoother scrolling
                windowSize={10} // Increase window size
                initialNumToRender={20} // More initial items
                updateCellsBatchingPeriod={50} // Faster updates
                legacyImplementation={false}
                columnWrapperStyle={emotesPerRow > 1 ? styles.row : null}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text
                      style={[styles.emptyText, { color: theme.textSecondary }]}
                    >
                      {searchTerm ? "No emotes found" : "No emotes available"}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    height: "70%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 5,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 15,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },
  categoriesContainer: {
    maxHeight: 50,
  },
  categoriesContent: {
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  categoryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
  },
  categoryText: {
    marginLeft: 5,
    fontSize: 14,
    fontWeight: "500",
  },
  emotesContainer: {
    flex: 1,
    paddingHorizontal: 15,
    width: "100%",
    overflow: "hidden", // Prevent clipping
  },
  emotesGrid: {
    paddingVertical: 10,
    width: "100%",
  },
  row: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 5, // Add small padding to prevent edge clipping
  },
  emoteButton: {
    width: EMOTE_SIZE + EMOTE_MARGIN * 2,
    height: EMOTE_SIZE + EMOTE_MARGIN * 2,
    margin: EMOTE_MARGIN,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  emoteImage: {
    width: EMOTE_SIZE,
    height: EMOTE_SIZE,
  },
  emojiText: {
    fontSize: 24,
  },
  loading: {
    marginTop: 50,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
  },
});

export default EmotePicker;
