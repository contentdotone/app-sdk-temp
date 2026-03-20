// zesty-sdk-vanilla.js

const ZestySDK = (function () {
  const allowedOrigins = ["zesty.io", "//localhost", "content.one"];

  let authServiceUrl = "";
  let token = "";
  let messages = [];
  let tabWindow = null;
  let tokenKeepAliveInterval = null;

  let onMessageReceived = null;
  let onSSOSuccess = null;
  let onSSOError = null;

  function init(authUrl, initialToken) {
    authServiceUrl = authUrl;
    window.addEventListener("message", receiveMessage);

    return new Promise(function (resolve, reject) {
      if (initialToken) {
        return verifyToken(initialToken)
          .then(function (isValid) {
            if (isValid) {
              token = initialToken;
              resolve({ token: token });
            } else {
              reject(new Error("SDK: Invalid session token"));
            }
          })
          .catch(reject);
      }

      // Poll for token coming from parent (iframe case)
      var tick = 0;
      var check = setInterval(function () {
        console.log("SDK: polling parent session", tick);
        tick++;

        if (token) {
          clearInterval(check);
          resolve({ token: token });
        }

        if (tick >= 10) {
          clearInterval(check);
          reject(
            new Error(
              "SDK: Unable to receive session token from parent window within 10 seconds"
            )
          );
        }
      }, 1000);
    });
  }

  function setToken(newToken) {
    token = newToken;
  }

  function receiveMessage(event) {
    console.log("SDK: receiveMessage", event.data);

    // Very basic origin check (you might want to make it stricter)
    try {
      var originHostname = new URL(event.origin).hostname;
      var apex = originHostname.split(".").slice(-2).join(".");
      if (!allowedOrigins.some(function (o) { return originHostname.includes(o) || apex === o; })) {
        return;
      }
    } catch (e) {
      console.warn("Invalid origin format", event.origin);
      return;
    }

    var data = event.data;

    if (data && data.source === "zesty") {
      if (data.sessionToken) {
        verifyToken(data.sessionToken).then(function (isValid) {
          if (isValid) {
            token = data.sessionToken;
          }
        });
      }

      // SSO callback handling
      if (event.origin === authServiceUrl) {
        if (data.status === "200") {
          if (onSSOSuccess) onSSOSuccess();
        } else {
          if (onSSOError) onSSOError(data.error_message || "Unknown SSO error");
        }

        if (tabWindow) {
          tabWindow.close();
          tabWindow = null;
        }
      }

      messages.push(event);
      if (onMessageReceived) {
        onMessageReceived(messages);
      }
    }
  }

  function setMessageReceivedCallback(callback) {
    onMessageReceived = callback;
  }

  function setSSOSuccessCallback(callback) {
    onSSOSuccess = callback;
  }

  function setSSOErrorCallback(callback) {
    onSSOError = callback;
  }

  function request(url, options = {}) {
    if (!token) {
      throw new Error("SDK: Session token is missing. Cannot make request.");
    }

    var defaultOptions = {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
      },
    };

    var finalOptions = Object.assign({}, defaultOptions, options);

    // Merge headers properly
    finalOptions.headers = Object.assign(
      {},
      defaultOptions.headers,
      options.headers || {}
    );

    return fetch(url, finalOptions)
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed: " + res.status);
        return res.json();
      })
      .catch(function (err) {
        console.error("SDK: request error", err);
        throw err;
      });
  }

  function verifyToken(checkToken) {
    if (!authServiceUrl) {
      return Promise.reject(new Error("SDK: authServiceUrl not set"));
    }

    var verifyUrl = authServiceUrl.replace(/\/$/, "") + "/verify";

    return fetch(verifyUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + checkToken,
      },
    })
      .then(function (res) {
        if (!res.ok) return false;
        return res.json();
      })
      .then(function (data) {
        return data && data.status === "OK";
      })
      .catch(function (err) {
        console.error("SDK: Token verification error:", err);
        return false;
      });
  }

  function logout() {
    if (!token) {
      return Promise.reject(
        new Error("SDK: No session token found. User may already be logged out.")
      );
    }

    var logoutUrl = authServiceUrl.replace(/\/$/, "") + "/logout";

    return fetch(logoutUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("SDK: Logout failed");
        }
        token = "";
      })
      .catch(function (err) {
        console.error("SDK: Logout error:", err);
        throw err;
      });
  }

  function startTokenKeepAlive(intervalMs) {
    intervalMs = intervalMs || 30000;

    if (!token) {
      console.warn("SDK: No token available for verification.");
      return;
    }

    if (tokenKeepAliveInterval) {
      console.log("SDK: Token keep-alive is already running");
      return;
    }

    tokenKeepAliveInterval = setInterval(function () {
      verifyToken(token)
        .then(function (isValid) {
          if (!isValid) {
            console.error("SDK: Token is invalid or expired");
            stopTokenKeepAlive();
          }
        })
        .catch(function (err) {
          console.error("SDK: Error verifying token:", err);
          stopTokenKeepAlive();
        });
    }, intervalMs);
  }

  function stopTokenKeepAlive() {
    if (tokenKeepAliveInterval !== null) {
      clearInterval(tokenKeepAliveInterval);
      tokenKeepAliveInterval = null;
    }
  }

  function initiateSSOAuthentication(service) {
    if (!["google", "github", "azure"].includes(service)) {
      console.error("SDK: Unsupported SSO service:", service);
      return;
    }

    if (tabWindow && !tabWindow.closed) {
      tabWindow.close();
    }

    tabWindow = window.open(authServiceUrl.replace(/\/$/, "") + "/" + service + "/login");
  }

  // Public API
  return {
    init: init,
    setToken: setToken,
    request: request,
    verifyToken: verifyToken,
    logout: logout,
    startTokenKeepAlive: startTokenKeepAlive,
    stopTokenKeepAlive: stopTokenKeepAlive,
    setMessageReceivedCallback: setMessageReceivedCallback,
    initiateSSOAuthentication: initiateSSOAuthentication,
    setSSOSuccessCallback: setSSOSuccessCallback,
    setSSOErrorCallback: setSSOErrorCallback,

    // mostly for debugging
    getToken: function () { return token; },
    getMessages: function () { return messages; },
  };
})();

// Expose globally
window.ZestySDK = ZestySDK;