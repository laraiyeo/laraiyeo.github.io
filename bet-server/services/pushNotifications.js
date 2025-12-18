// Deprecated stub. Logic consolidated into server.js; keep harmless exports for compatibility.
module.exports = {
  sendPushNotification: async () => {
    console.warn("Deprecated sendPushNotification called — moved to server.js");
  },
  sendBetResultNotification: async () => {
    console.warn(
      "Deprecated sendBetResultNotification called — moved to server.js"
    );
  },
  sendPushToToken: async () => {
    console.warn("Deprecated sendPushToToken called — moved to server.js");
  },
  broadcastToAll: async () => {
    console.warn("Deprecated broadcastToAll called — moved to server.js");
  },
};
