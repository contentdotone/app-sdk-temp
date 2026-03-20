# Zesty App SDK

Vanilla JS SDK for integrating apps within the Zesty Manager shell. Handles authentication, token management, SSO, and parent-child iframe communication via `postMessage`.

## Installation

### CDN (recommended)

Load the minified build via jsDelivr — no install or build step required:

```html
<!-- Pinned to a specific version (recommended) -->
<script src="https://cdn.jsdelivr.net/gh/contentdotone/app-sdk-temp@v1.0.0/app-sdk.min.js"></script>

<!-- Latest from main (use for development only) -->
<script src="https://cdn.jsdelivr.net/gh/contentdotone/app-sdk-temp@main/app-sdk.min.js"></script>
```

### Self-hosted

Copy `app-sdk.js` (or `app-sdk.min.js`) into your project and reference it directly:

```html
<script src="/js/app-sdk.js"></script>
```

### Building from source

```bash
npm install
npm run build   # produces app-sdk.min.js
```

## Quick Start

Include the script and initialize:

```html
<script src="https://cdn.jsdelivr.net/gh/contentdotone/app-sdk-temp@v1.0.0/app-sdk.min.js"></script>
<script>
  ZestySDK.init('https://auth.api.zesty.io')
    .then(function (result) {
      console.log('Authenticated', result);
    })
    .catch(function (err) {
      console.warn('Init failed', err.message);
    });
</script>
```

When running inside the Zesty Manager shell (iframe), `init()` polls for a session token from the parent window. You can also pass a token directly:

```js
ZestySDK.init('https://auth.api.zesty.io', existingToken)
```

## API

### `init(authUrl, [initialToken])`

Initializes the SDK. Sets up the `postMessage` listener and resolves with `{ token }` once authenticated. If `initialToken` is provided, it is verified immediately. Otherwise, the SDK polls for a token from the parent window for up to 10 seconds.

### `setMessageReceivedCallback(callback)`

Registers a callback invoked whenever a message is received from the parent window. The callback receives the full messages array.

```js
ZestySDK.setMessageReceivedCallback(function (messages) {
  var latest = messages[messages.length - 1];
  var data = latest ? latest.data : null;
  if (!data) return;

  // Extract instance ZUID from parent message
  var instanceZUID = (data.instance && data.instance.ZUID) || data.ZUID || '';

  // Store session token from manager shell
  var sessionToken = data.sessionToken;
  if (sessionToken) {
    fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken }),
    }).then(function () {
      console.log('Session token stored');
    });
  }
});
```

### `request(url, [options])`

Makes an authenticated fetch request, automatically injecting the `Authorization: Bearer` header.

```js
ZestySDK.request('https://accounts.api.zesty.io/v1/instances')
  .then(function (data) {
    console.log(data);
  });

// With custom options
ZestySDK.request('https://accounts.api.zesty.io/v1/instances', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'My Instance' }),
});
```

### `verifyToken(token)`

Verifies a token against the auth service. Returns a promise resolving to `true` or `false`.

```js
ZestySDK.verifyToken(someToken).then(function (isValid) {
  if (isValid) {
    console.log('Token is valid');
  }
});
```

### `startTokenKeepAlive([intervalMs])`

Starts periodic token verification (default: 30 seconds). Automatically stops if the token becomes invalid.

```js
ZestySDK.startTokenKeepAlive();       // every 30s
ZestySDK.startTokenKeepAlive(60000);  // every 60s
```

### `stopTokenKeepAlive()`

Stops the token keep-alive interval.

```js
ZestySDK.stopTokenKeepAlive();
```

### `initiateSSOAuthentication(service)`

Opens a popup window for SSO login. Supported services: `"google"`, `"github"`, `"azure"`.

```js
ZestySDK.initiateSSOAuthentication('google');
```

### `setSSOSuccessCallback(callback)`

Registers a callback invoked on successful SSO authentication.

```js
ZestySDK.setSSOSuccessCallback(function () {
  console.log('SSO login succeeded');
});
```

### `setSSOErrorCallback(callback)`

Registers a callback invoked on SSO authentication failure. Receives an error message string.

```js
ZestySDK.setSSOErrorCallback(function (errorMessage) {
  console.error('SSO login failed:', errorMessage);
});
```

### `setToken(newToken)`

Manually sets the session token.

### `logout()`

Logs out the current user and clears the token.

```js
ZestySDK.logout()
  .then(function () {
    console.log('Logged out');
  });
```

## Full Integration Example

Based on the Calendar app integration:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Zesty App</title>
</head>
<body>
  <div id="app"></div>

  <script src="/js/app-sdk.js"></script>
  <script>
    var tokenStored = false;

    // Only initialize SDK when running inside Zesty Manager (iframe)
    if (window.self !== window.top) {

      // Handle messages from the manager shell
      ZestySDK.setMessageReceivedCallback(function (messages) {
        var latest = messages[messages.length - 1];
        var data = latest ? latest.data : null;
        if (!data) return;

        var instanceZUID = (data.instance && data.instance.ZUID) || data.ZUID || '';

        // Store session token (once)
        var sessionToken = data.sessionToken;
        if (sessionToken && !tokenStored) {
          tokenStored = true;
          fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: sessionToken }),
          })
            .then(function () {
              console.log('Session token stored');
              // Reload your app state here
            })
            .catch(function (err) {
              console.warn('Failed to store session token', err);
            });
        }

        // React to instance selection
        if (instanceZUID) {
          loadInstance(instanceZUID);
        }
      });

      // Initialize SDK with auth service
      ZestySDK.init('https://auth.api.zesty.io')
        .then(function (result) {
          console.log('Authenticated with manager shell', result);
        })
        .catch(function (err) {
          console.warn('Manager shell init failed', err.message);
        });
    }

    function loadInstance(zuid) {
      // Your app logic for loading an instance
    }
  </script>
</body>
</html>
```

## Allowed Origins

The SDK accepts `postMessage` events from origins matching:

- `zesty.io`
- `localhost`
- `content.one`
