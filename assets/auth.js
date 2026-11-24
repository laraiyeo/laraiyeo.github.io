/**
 * SportsHeart Web - Auth Module (Supabase)
 * Uses the same Supabase backend as the mobile app.
 * Flow: authenticate_user RPC → get phone → signInWithPassword
 */

// Supabase project credentials (same as mobile app)
var SUPABASE_URL = "https://skjiauemwcmafsskqdky.supabase.co";
var SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNramlhdWVtd2NtYWZzc2txZGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMTQ0NzMsImV4cCI6MjA4MTU5MDQ3M30.szp4pk3_88mZAndhBh3SdBc0G3usb4GN52wvnrNG5ew";

var AUTH_TOKEN_KEY = "sportsheart_auth_token";
var AUTH_USER_KEY = "sportsheart_auth_user";

// Wait for Supabase SDK to load, then init client
var supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (typeof supabase === "undefined") {
    console.error("Supabase SDK not loaded yet");
    return null;
  }
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return supabaseClient;
}

var Auth = {
  _token: null,
  _user: null,
  _listeners: [],

  init: function () {
    try {
      this._token = localStorage.getItem(AUTH_TOKEN_KEY);
      this._user = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
    } catch (e) {
      this._token = null;
      this._user = null;
    }
    this._notify();
    // Verify session on init
    this.verify();
  },

  get token() {
    return this._token;
  },
  get user() {
    return this._user;
  },
  get isLoggedIn() {
    return !!this._token && !!this._user;
  },

  onChange: function (fn) {
    this._listeners.push(fn);
    return function () {
      this._listeners = this._listeners.filter(function (l) {
        return l !== fn;
      });
    }.bind(this);
  },

  _notify: function () {
    var self = this;
    this._listeners.forEach(function (fn) {
      fn({ user: self._user, isLoggedIn: self.isLoggedIn });
    });
  },

  _save: function () {
    if (this._token) localStorage.setItem(AUTH_TOKEN_KEY, this._token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
    if (this._user)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(this._user));
    else localStorage.removeItem(AUTH_USER_KEY);
    this._notify();
  },

  // Login flow matching BetLoginScreen.handleLogin:
  // 1. Call authenticate_user RPC to get phone from username+password
  // 2. Sign in with phone+password via Supabase auth
  login: async function (username, password) {
    var sb = getSupabase();
    if (!sb) throw new Error("Auth service not available");

    // Step 1: Call authenticate_user RPC (same as app)
    var rpcResult = await sb.rpc("authenticate_user", {
      uname: username,
      pass: password,
    });

    if (rpcResult.error) {
      throw new Error("Unable to verify username. Please try again.");
    }

    var phone = rpcResult.data;
    if (!phone) {
      // Check if user exists at all
      var profileCheck = await sb
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (profileCheck.error || !profileCheck.data) {
        throw new Error(
          'No account exists for "' +
            username +
            '". Would you like to create a new account?',
        );
      }
      throw new Error("Invalid username or password. Please try again.");
    }

    // Step 2: Sign in with phone + password
    var authResult = await sb.auth.signInWithPassword({
      phone: phone,
      password: password,
    });

    if (authResult.error) {
      throw new Error(authResult.error.message || "Login failed");
    }

    // Success
    var session = authResult.data.session;
    this._token = session.access_token;
    this._user = {
      id: authResult.data.user.id,
      username: username,
      phone: phone,
    };
    this._save();
    return { user: this._user, token: this._token };
  },

  // Signup flow matching BetLoginScreen.handleSignup:
  // 1. Check username uniqueness in profiles
  // 2. Sign up with phone+password via Supabase auth
  // 3. Insert profile row
  signup: async function (username, password, phone) {
    var sb = getSupabase();
    if (!sb) throw new Error("Auth service not available");

    if (!phone) throw new Error("Phone number is required to sign up.");

    // Step 1: Check username uniqueness
    var existingCheck = await sb
      .from("profiles")
      .select("id, phone")
      .eq("username", username)
      .maybeSingle();

    if (existingCheck.error) throw existingCheck.error;

    if (existingCheck.data) {
      // Username exists — if same phone, try signing in
      if (existingCheck.data.phone === phone) {
        return this.login(username, password);
      }
      throw new Error(
        "Username is already taken. Please use Login to sign in.",
      );
    }

    // Step 2: Sign up with phone
    var authResult = await sb.auth.signUp({
      phone: phone,
      password: password,
    });

    if (authResult.error) {
      throw new Error(authResult.error.message || "Signup failed");
    }

    // Step 3: Insert profile
    var profileResult = await sb.from("profiles").insert({
      id: authResult.data.user.id,
      username: username,
      phone: phone,
      password: password,
      credits: 2500,
    });

    if (profileResult.error) {
      if (
        profileResult.error.message &&
        profileResult.error.message.toLowerCase().indexOf("duplicate") !== -1
      ) {
        throw new Error("Username is already taken.");
      }
      throw profileResult.error;
    }

    // Success
    var session = authResult.data.session;
    this._token = session ? session.access_token : null;
    this._user = {
      id: authResult.data.user.id,
      username: username,
      phone: phone,
    };
    this._save();
    return { user: this._user, token: this._token };
  },

  verify: async function () {
    var sb = getSupabase();
    if (!sb) return false;
    try {
      var result = await sb.auth.getSession();
      if (result.data && result.data.session) {
        this._token = result.data.session.access_token;
        // Try to get profile for username
        try {
          var profileResult = await sb
            .from("profiles")
            .select("username, phone")
            .eq("id", result.data.session.user.id)
            .maybeSingle();
          if (profileResult.data) {
            this._user = {
              id: result.data.session.user.id,
              username: profileResult.data.username,
              phone: profileResult.data.phone,
            };
          }
        } catch (e) {
          // ignore profile fetch errors
        }
        this._save();
        return true;
      }
    } catch (e) {
      // session expired or invalid
    }
    this.logout();
    return false;
  },

  logout: function () {
    var sb = getSupabase();
    if (sb) sb.auth.signOut().catch(function () {});
    this._token = null;
    this._user = null;
    this._save();
  },

  getAuthHeaders: function () {
    return this._token ? { Authorization: "Bearer " + this._token } : {};
  },
};

// Initialize on load
document.addEventListener("DOMContentLoaded", function () {
  Auth.init();
});

// ============================================
// Login Modal UI
// ============================================
function createLoginModal() {
  var existing = document.getElementById("auth-modal");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.id = "auth-modal";
  overlay.className = "modal-overlay";
  overlay.style.display = "none";
  overlay.innerHTML =
    '\n    <div class="modal-content">\n      <div class="modal-header">\n        <h2 class="modal-title" id="auth-modal-title">Sign In</h2>\n        <button class="modal-close" onclick="closeAuthModal()">&times;</button>\n      </div>\n      <div id="auth-error" class="form-error" style="display:none;margin-bottom:12px;"></div>\n      <form id="auth-form" onsubmit="handleAuthSubmit(event)">\n        <div class="form-group">\n          <label class="form-label" for="auth-username">Username</label>\n          <input class="form-input" type="text" id="auth-username" placeholder="Enter username" required minlength="3" autocomplete="username">\n        </div>\n        <div class="form-group">\n          <label class="form-label" for="auth-password">Password</label>\n          <input class="form-input" type="password" id="auth-password" placeholder="Enter password" required minlength="6" autocomplete="current-password">\n        </div>\n        <div class="form-group" id="auth-phone-group" style="display:none;">\n          <label class="form-label" for="auth-phone">Phone (no dashes)</label>\n          <input class="form-input" type="tel" id="auth-phone" placeholder="+19051234567" autocomplete="tel">\n        </div>\n        <button type="submit" class="btn btn-primary w-full" id="auth-submit-btn">Sign In</button>\n      </form>\n      <div style="text-align:center;margin-top:16px;">\n        <span style="color:var(--text-tertiary);font-size:0.85rem;" id="auth-toggle-text">Don\'t have an account?</span>\n        <button class="btn btn-ghost btn-sm" onclick="toggleAuthMode()" id="auth-toggle-btn">Sign Up</button>\n      </div>\n    </div>\n  ';
  document.body.appendChild(overlay);
}

var authMode = "login";

function openAuthModal() {
  var modal = document.getElementById("auth-modal");
  if (!modal) {
    createLoginModal();
    return openAuthModal();
  }
  authMode = "login";
  updateAuthModalMode();
  document.getElementById("auth-error").style.display = "none";
  document.getElementById("auth-form").reset();
  modal.style.display = "flex";
}

function closeAuthModal() {
  var modal = document.getElementById("auth-modal");
  if (modal) modal.style.display = "none";
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "signup" : "login";
  updateAuthModalMode();
  document.getElementById("auth-error").style.display = "none";
}

function updateAuthModalMode() {
  document.getElementById("auth-modal-title").textContent =
    authMode === "login" ? "Sign In" : "Create Account";
  document.getElementById("auth-submit-btn").textContent =
    authMode === "login" ? "Sign In" : "Create Account";
  document.getElementById("auth-toggle-text").textContent =
    authMode === "login"
      ? "Don't have an account?"
      : "Already have an account?";
  document.getElementById("auth-toggle-btn").textContent =
    authMode === "login" ? "Sign Up" : "Sign In";
  // Show phone field only for signup
  var phoneGroup = document.getElementById("auth-phone-group");
  if (phoneGroup) {
    phoneGroup.style.display = authMode === "signup" ? "block" : "none";
    var phoneInput = document.getElementById("auth-phone");
    if (phoneInput && authMode === "signup") {
      phoneInput.required = true;
    } else if (phoneInput) {
      phoneInput.required = false;
    }
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  var errorEl = document.getElementById("auth-error");
  var submitBtn = document.getElementById("auth-submit-btn");
  var username = document.getElementById("auth-username").value.trim();
  var password = document.getElementById("auth-password").value;
  var phone = document.getElementById("auth-phone")
    ? document.getElementById("auth-phone").value.trim()
    : "";

  errorEl.style.display = "none";
  submitBtn.disabled = true;
  submitBtn.textContent = "Loading...";

  try {
    if (authMode === "login") {
      await Auth.login(username, password);
    } else {
      await Auth.signup(username, password, phone);
    }
    closeAuthModal();
    updateAuthUI();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = authMode === "login" ? "Sign In" : "Create Account";
  }
}

// ============================================
// Auth UI Button
// ============================================
function createAuthButton() {
  var container = document.createElement("div");
  container.id = "auth-button-container";
  container.className = "flex items-center gap-sm";
  updateAuthButtonContent(container);
  Auth.onChange(function () {
    updateAuthButtonContent(container);
  });
  return container;
}

function updateAuthButtonContent(container) {
  if (Auth.isLoggedIn) {
    container.innerHTML =
      '\n      <span style="font-size:0.85rem;color:var(--text-secondary);">' +
      Auth.user.username +
      '</span>\n      <button class="btn btn-ghost btn-sm" onclick="Auth.logout();updateAuthUI();" title="Sign Out">\n        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>\n      </button>\n    ';
  } else {
    container.innerHTML =
      '\n      <button class="btn btn-ghost btn-sm" onclick="openAuthModal()">\n        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>\n        Sign In\n      </button>\n    ';
  }
}

function updateAuthUI() {
  var container = document.getElementById("auth-button-container");
  if (container) updateAuthButtonContent(container);
}

// Initialize modal on load
document.addEventListener("DOMContentLoaded", function () {
  createLoginModal();
});
