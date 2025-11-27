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

const injectedHeightScript = `
  (function(){
    function sendHeight(){
      var h = document.body.scrollHeight || document.documentElement.scrollHeight || 600;
      window.ReactNativeWebView.postMessage(String(h));
    }
    sendHeight();
    try{
      var obs = new MutationObserver(sendHeight);
      obs.observe(document.body, { childList:true, subtree:true, attributes:true });
    }catch(e){}
    true;
  })();
`;

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
}) => {
  const [height, setHeight] = useState(420);
  const [loading, setLoading] = useState(true);
  const webRef = useRef(null);

  const widgetUrl = buildLiveTrackerUrl(uuid, profile);
  const urlToLoad = wrapperUrl || widgetUrl;

  useEffect(() => {
    if (!visible) {
      setLoading(true);
    }
  }, [visible]);

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
          injectedJavaScript={injectedHeightScript}
          onMessage={(e) => {
            const val = parseInt(e.nativeEvent.data, 10);
            if (!isNaN(val) && val > 0 && val !== height) {
              // Add a small maximum to avoid enormous heights
              const newH = Math.min(val + 20, 1600);
              setHeight(newH);
            }
          }}
          onLoadEnd={() => setLoading(false)}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
    </View>
  );

  if (inline) {
    // Render inline (no modal) - caller should place this where needed
    return <View style={[styles.containerInline]}>{content}</View>;
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
  webWrapper: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#000",
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
