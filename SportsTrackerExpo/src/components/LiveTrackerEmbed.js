import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { buildLiveTrackerUrl } from "../utils/liveTracker";
import { useTheme } from "../context/ThemeContext";

const { width: DEVICE_WIDTH } = Dimensions.get("window");

// Resize formula: (404/800 * screenWidth) + 50
// We'll compute the WebView height from the device width and ignore any
// postMessage-based resizing from the page — this keeps sizing deterministic.

// Props:
// - uuid, profile: used to build widget url when no wrapperUrl provided
// - wrapperUrl: optional URL to a page that embeds the widget (useful when widget only works when hosted on allowed domain)
// - customHeaders: optional headers object passed to WebView (eg. { Referer: 'https://sportsheart.ca/' })
// - visible, onClose, inline
const LiveTrackerEmbed = ({
  uuid,
  profile,
  visible,
  onClose,
  inline = false,
  wrapperUrl = null,
  customHeaders = null,
  // When false, the component will not render its own header row. Useful
  // when the caller wants to render a native header (so touches aren't
  // intercepted by the WebView).
  showHeader = true,
  // New: allow caller to set an initial height (px) and an inline top offset (px)
  initialHeight = 420,
  inlineTopOffset = 0,
  // allow overriding bottom offset used in formula (default 50)
  formulaO = 50,
}) => {
  // Compute height using the provided formula based on device width
  const computeHeightForWidth = (w) => Math.round((404 / 800) * w) + (Number.isFinite(formulaO) ? formulaO : 50);
  const initialComputedHeight =
    typeof initialHeight === "number" && initialHeight > 0
      ? initialHeight
      : computeHeightForWidth(DEVICE_WIDTH);
  const [height, setHeight] = useState(initialComputedHeight);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState(null);
  const [lastHttpStatus, setLastHttpStatus] = useState(null);
  const { theme, colors, isDarkMode } = useTheme();
  const webRef = useRef(null);

  useEffect(() => {
    console.log("LiveTrackerEmbed mounted", { uuid, wrapperUrl, inline });
  }, []);

  const widgetUrl = buildLiveTrackerUrl(uuid, profile);
  const urlToLoad = wrapperUrl || widgetUrl;

  useEffect(() => {
    if (!visible) {
      setLoading(true);
    }
  }, [visible]);

  // Update height on device rotation / dimension change
  useEffect(() => {
    const handler = ({ window }) => {
      try {
        const newW = window.width || DEVICE_WIDTH;
        setHeight(computeHeightForWidth(newW));
      } catch (e) {}
    };
    const sub = Dimensions.addEventListener
      ? Dimensions.addEventListener("change", handler)
      : null;
    return () => {
      try {
        if (sub && sub.remove) sub.remove();
        else if (Dimensions.removeEventListener)
          Dimensions.removeEventListener("change", handler);
      } catch (e) {}
    };
  }, []);

  if (!urlToLoad) return null;

  const content = (
    <View style={styles.innerContainer}>
      <View
        style={[
          styles.webWrapper,
          { width: DEVICE_WIDTH },
          showHeader ? { paddingTop: 56 } : {},
        ]}
      >
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        <WebView
          ref={webRef}
          source={
            customHeaders
              ? { uri: urlToLoad, headers: customHeaders }
              : { uri: urlToLoad }
          }
          style={{ width: DEVICE_WIDTH, height }}
          originWhitelist={["*"]}
          onMessage={(e) => {
            const msg = e.nativeEvent.data;
            const val = parseInt(msg, 10);
            if (!isNaN(val) && val > 0) {
              if (loading) setLoading(false);
              const clamped = Math.min(Math.max(val, 100), 2000);
              if (clamped !== height) setHeight(clamped);
            } else {
              console.log("LiveTrackerEmbed onMessage:", msg);
            }
          }}
          // We use a deterministic resize formula based on device width, so
          // we do not inject resize scripts or react to postMessage events.
          onLoadStart={() => {
            setLastError(null);
            setLastHttpStatus(null);
            setLoading(true);
          }}
          onLoadEnd={() => setLoading(false)}
          onLoadProgress={(e) => {
            // e.nativeEvent.progress is a 0-1 float
            // keep for debugging
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            setLastError(nativeEvent.description || "WebView error");
            setLoading(false);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            setLastHttpStatus(nativeEvent.statusCode);
            setLastError(`HTTP ${nativeEvent.statusCode}`);
            setLoading(false);
          }}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          mixedContentMode={"always"}
        />
      </View>
    </View>
  );

  if (inline) {
    const wrapperExtraStyle =
      typeof inlineTopOffset === "number" && inlineTopOffset > 0
        ? { marginTop: inlineTopOffset }
        : {};

    return (
      <View style={styles.containerInline}>
        <View style={styles.innerContainer}>
          <View
            style={[
              styles.webWrapper,
              { width: DEVICE_WIDTH },
              wrapperExtraStyle,
            ]}
          >
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            <WebView
              ref={webRef}
              source={
                customHeaders
                  ? { uri: urlToLoad, headers: customHeaders }
                  : { uri: urlToLoad }
              }
              style={{ width: DEVICE_WIDTH, height }}
              originWhitelist={["*"]}
              onMessage={(e) => {
                const msg = e.nativeEvent.data;
                const val = parseInt(msg, 10);
                if (!isNaN(val) && val > 0) {
                  if (loading) setLoading(false);
                  const clamped = Math.min(Math.max(val, 100), 2000);
                  if (clamped !== height) setHeight(clamped);
                } else {
                  console.log("LiveTrackerEmbed onMessage:", msg);
                }
              }}
              onLoadStart={() => {
                setLastError(null);
                setLastHttpStatus(null);
                setLoading(true);
              }}
              onLoadEnd={() => setLoading(false)}
              onLoadProgress={(e) => {}}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                setLastError(nativeEvent.description || "WebView error");
                setLoading(false);
              }}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                setLastHttpStatus(nativeEvent.statusCode);
                setLastError(`HTTP ${nativeEvent.statusCode}`);
                setLoading(false);
              }}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled={true}
              sharedCookiesEnabled={true}
              mixedContentMode={"always"}
            />
          </View>

          {/* Render header below the web wrapper so it does not get covered by
              any sticky/native header layers above the WebView surface. */}
          <View
            style={[styles.headerRowInline, { backgroundColor: theme.surface }]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.headerTitle, { color: theme.text }]}
            >
              Live Tracker
            </Text>
            <TouchableOpacity
              onPress={() => {
                console.log("LiveTrackerEmbed: close pressed (inline)");
                if (onClose) onClose();
              }}
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
              accessible={true}
              accessibilityRole="button"
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color={theme.text || "#fff"} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      transparent={false}
    >
      <View style={styles.container}>{content}</View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  headerRow: {
    height: 56,
    backgroundColor: "#111",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 50,
    elevation: 50,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  headerRowInline: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    position: "relative",
    zIndex: 5,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    elevation: 10,
  },
  headerTitle: {
    color: "#fff",
    fontWeight: "700",
    marginLeft: 8,
  },
  smallText: {
    color: "#ddd",
    fontSize: 12,
    marginTop: 6,
  },
  errorBox: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderColor: "#800",
    borderWidth: 1,
    padding: 8,
    borderRadius: 6,
    alignItems: "flex-start",
  },
  errorText: {
    color: "#ffb3b3",
    fontSize: 13,
    fontWeight: "600",
  },
  webWrapper: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#000",
  },
  containerInline: {
    // Ensure inline placement doesn't introduce spacing and allows the web wrapper
    // to size itself based on the calculated height.
    backgroundColor: "#000",
    width: DEVICE_WIDTH,
  },
  loadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
});

export default LiveTrackerEmbed;
