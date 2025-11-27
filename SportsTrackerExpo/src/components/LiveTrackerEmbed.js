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
  // New: allow caller to set an initial height (px) and an inline top offset (px)
  initialHeight = 420,
  inlineTopOffset = 0,
}) => {
  // Compute height using the provided formula based on device width
  const computeHeightForWidth = (w) => Math.round((404 / 800) * w) + 50;
  const initialComputedHeight = computeHeightForWidth(DEVICE_WIDTH);
  const [height, setHeight] = useState(initialComputedHeight);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState(null);
  const [lastHttpStatus, setLastHttpStatus] = useState(null);
  const webRef = useRef(null);
  const firstMessageRef = useRef(false);

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
    const sub = Dimensions.addEventListener ? Dimensions.addEventListener('change', handler) : null;
    return () => {
      try {
        if (sub && sub.remove) sub.remove();
        else if (Dimensions.removeEventListener) Dimensions.removeEventListener('change', handler);
      } catch (e) {}
    };
  }, []);

  if (!urlToLoad) return null;

  const content = (
    <View style={styles.innerContainer}>
      <View style={styles.headerRow}>
        <Text allowFontScaling={false} style={styles.headerTitle}>
          Live Tracker
        </Text>
      </View>

      <View style={[styles.webWrapper, { width: DEVICE_WIDTH }]}>
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
            setLastError(nativeEvent.description || 'WebView error');
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
          mixedContentMode={'always'}
        />
        {(lastError || lastHttpStatus) && (
          <View style={styles.errorBox}>
            <Text allowFontScaling={false} style={styles.errorText}>
              {lastError ? `Error: ${lastError}` : `HTTP: ${lastHttpStatus}`}
            </Text>
            <Text allowFontScaling={false} style={styles.smallText}>
              URL: {urlToLoad}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  if (inline) {
    // Render inline (no modal) - caller should place this where needed.
    // Apply `inlineTopOffset` only to the web wrapper so the native header
    // row remains unaffected and only the WebView content is shifted down.
    const wrapperExtraStyle =
      typeof inlineTopOffset === "number" && inlineTopOffset > 0
        ? { marginTop: inlineTopOffset }
        : {};

    return (
      <View style={styles.containerInline}>
        <View style={styles.innerContainer}>
          <View style={styles.headerRow}>
            <Text allowFontScaling={false} style={styles.headerTitle}>
              Live Tracker
            </Text>
          </View>

          <View style={[styles.webWrapper, { width: DEVICE_WIDTH }, wrapperExtraStyle]}>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            <WebView
              ref={webRef}
              source={
                customHeaders ? { uri: urlToLoad, headers: customHeaders } : { uri: urlToLoad }
              }
              style={{ width: DEVICE_WIDTH, height }}
              originWhitelist={["*"]}
              injectedJavaScript={injectedHeightScript}
              onMessage={(e) => {
                const msg = e.nativeEvent.data;
                const val = parseInt(msg, 10);
                if (!isNaN(val) && val > 0) {
                  firstMessageRef.current = true;
                  if (loading) setLoading(false);
                  const newH = Math.min(val + 20, 1600);
                  if (newH !== height) setHeight(newH);
                } else {
                  console.log('LiveTrackerEmbed onMessage:', msg);
                  firstMessageRef.current = true;
                  if (loading) setLoading(false);
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
                setLastError(nativeEvent.description || 'WebView error');
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
              mixedContentMode={'always'}
            />
            {(lastError || lastHttpStatus) && (
              <View style={styles.errorBox}>
                <Text allowFontScaling={false} style={styles.errorText}>
                  {lastError ? `Error: ${lastError}` : `HTTP: ${lastHttpStatus}`}
                </Text>
                <Text allowFontScaling={false} style={styles.smallText}>
                  URL: {urlToLoad}
                </Text>
              </View>
            )}
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
    paddingHorizontal: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontWeight: "700",
    marginLeft: 8,
  },
  smallText: {
    color: '#ddd',
    fontSize: 12,
    marginTop: 6,
  },
  errorBox: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderColor: '#800',
    borderWidth: 1,
    padding: 8,
    borderRadius: 6,
    alignItems: 'flex-start'
  },
  errorText: {
    color: '#ffb3b3',
    fontSize: 13,
    fontWeight: '600'
  },
  webWrapper: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#000",
  },
  containerInline: {
    // Ensure inline placement doesn't introduce spacing and allows the web wrapper
    // to size itself based on the calculated height.
    backgroundColor: '#000',
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
