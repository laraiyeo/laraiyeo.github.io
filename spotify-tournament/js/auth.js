/* ─── Spotify auth (Authorization Code with PKCE) ───────────────────────────
 * Pure front-end, no client secret. The Client ID is not a secret; the PKCE
 * code verifier/challenge is what protects the exchange.
 *
 *   STAuth.login()          → redirects to Spotify
 *   STAuth.handleRedirect() → call on page load; resolves tokens or null
 *   STAuth.getAccessToken() → valid bearer token (auto-refreshes)
 *   STAuth.isLoggedIn() / logout() / clearTokens()
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var TOKEN_KEY = "st_tokens";
  var VERIFIER_KEY = "st_code_verifier";
  var STATE_KEY = "st_auth_state";
  var CLIENT_KEY = "st_client_id";

  /* ── PKCE helpers ───────────────────────────────────────────────────────── */
  function randomString(length) {
    var possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var values = new Uint32Array(length);
    global.crypto.getRandomValues(values);
    var out = "";
    for (var i = 0; i < length; i++) out += possible[values[i] % possible.length];
    return out;
  }

  function base64Url(bytes) {
    var arr = new Uint8Array(bytes);
    var str = "";
    for (var i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
    return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  function sha256(plain) {
    return global.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(plain),
    );
  }

  /* ── Client config ──────────────────────────────────────────────────────── */
  function getClientId() {
    var stored = "";
    try {
      stored = global.localStorage.getItem(CLIENT_KEY) || "";
    } catch (e) {
      /* private mode */
    }
    return (stored || (global.STConfig && global.STConfig.CLIENT_ID) || "").trim();
  }

  function setClientId(id) {
    try {
      global.localStorage.setItem(CLIENT_KEY, String(id || "").trim());
    } catch (e) {
      /* ignore */
    }
  }

  /* Must match a Redirect URI registered on the Spotify app *exactly*. */
  function getRedirectUri() {
    return global.location.origin + global.location.pathname;
  }

  /* ── Token storage ──────────────────────────────────────────────────────── */
  function loadTokens() {
    try {
      return JSON.parse(global.localStorage.getItem(TOKEN_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function saveTokens(t) {
    try {
      global.localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    } catch (e) {
      /* ignore */
    }
  }

  function clearTokens() {
    try {
      global.localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /* Merge a token endpoint response into what we already have. Spotify only
   * returns a refresh_token on the first exchange, so we must keep the old one. */
  function store(json) {
    var prev = loadTokens() || {};
    var expiresIn = Number(json.expires_in) || 3600;
    saveTokens({
      access_token: json.access_token || prev.access_token,
      refresh_token: json.refresh_token || prev.refresh_token,
      scope: json.scope || prev.scope,
      /* refresh 60s early so an in-flight request never uses a dead token */
      expires_at: Date.now() + expiresIn * 1000 - 60000,
    });
  }

  function isLoggedIn() {
    var t = loadTokens();
    if (!t) return false;
    if (t.refresh_token) return true;
    return !!(t.access_token && Date.now() < t.expires_at);
  }

  /* ── Login / redirect handling ──────────────────────────────────────────── */
  function stripQuery() {
    if (!global.history || !global.history.replaceState) return;
    global.history.replaceState(
      {},
      document.title,
      global.location.origin + global.location.pathname,
    );
  }

  function login() {
    var clientId = getClientId();
    if (!clientId) {
      return Promise.reject(
        new Error("Add your Spotify Client ID first, then try again."),
      );
    }
    var verifier = randomString(64);
    var state = randomString(16);
    try {
      global.localStorage.setItem(VERIFIER_KEY, verifier);
      global.localStorage.setItem(STATE_KEY, state);
    } catch (e) {
      /* ignore */
    }

    return sha256(verifier).then(function (hashed) {
      var params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        scope: global.STConfig ? global.STConfig.SCOPES : "",
        redirect_uri: getRedirectUri(),
        code_challenge_method: "S256",
        code_challenge: base64Url(hashed),
        state: state,
      });
      global.location.href =
        "https://accounts.spotify.com/authorize?" + params.toString();
    });
  }

  /* Returns a promise resolving to tokens (if we just came back from Spotify)
   * or null (normal page load). */
  function handleRedirect() {
    var params = new URLSearchParams(global.location.search);
    var code = params.get("code");
    var error = params.get("error");

    if (error) {
      stripQuery();
      return Promise.reject(
        new Error(
          error === "access_denied"
            ? "Spotify access was denied."
            : "Authorization failed: " + error,
        ),
      );
    }
    if (!code) return Promise.resolve(null);

    var expectedState = null;
    var verifier = null;
    try {
      expectedState = global.localStorage.getItem(STATE_KEY);
      verifier = global.localStorage.getItem(VERIFIER_KEY);
    } catch (e) {
      /* ignore */
    }

    if (expectedState && params.get("state") !== expectedState) {
      stripQuery();
      return Promise.reject(
        new Error("Login state mismatch — please start the login again."),
      );
    }

    var body = new URLSearchParams({
      client_id: getClientId(),
      grant_type: "authorization_code",
      code: code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier || "",
    });

    stripQuery();

    return fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          throw new Error(
            "Token exchange failed (" + res.status + "). " + txt.slice(0, 200),
          );
        });
      }
      return res.json().then(function (json) {
        store(json);
        return json;
      });
    });
  }

  function getAccessToken() {
    var t = loadTokens();
    if (!t) return Promise.resolve(null);
    if (t.access_token && Date.now() < t.expires_at) {
      return Promise.resolve(t.access_token);
    }
    if (!t.refresh_token) {
      clearTokens();
      return Promise.resolve(null);
    }

    var body = new URLSearchParams({
      client_id: getClientId(),
      grant_type: "refresh_token",
      refresh_token: t.refresh_token,
    });

    return fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    }).then(function (res) {
      if (!res.ok) {
        clearTokens();
        throw new Error("Your Spotify session expired — please log in again.");
      }
      return res.json().then(function (json) {
        store(json);
        var merged = loadTokens();
        return merged ? merged.access_token : null;
      });
    });
  }

  function logout() {
    clearTokens();
  }

  global.STAuth = {
    login: login,
    logout: logout,
    handleRedirect: handleRedirect,
    getAccessToken: getAccessToken,
    isLoggedIn: isLoggedIn,
    clearTokens: clearTokens,
    getClientId: getClientId,
    setClientId: setClientId,
    getRedirectUri: getRedirectUri,
  };
})(window);
