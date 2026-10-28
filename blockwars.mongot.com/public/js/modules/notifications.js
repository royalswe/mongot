var NOTIFICATION = (function () {
  const toggle = document.getElementById("toggle_notification");
  const help = document.getElementById("notification-details");
  const state = document.getElementById("notification-state");
  const status = document.getElementById("notification-status");
  const PlayerArrivedSound = new Howl({ src: ["/sounds/join-lobby.mp3"] });
  let enabled = false;
  let busy = false;
  let arrivedTimestamp = 0;

  function supported() {
    return window.isSecureContext && "Notification" in window &&
      "serviceWorker" in navigator && "PushManager" in window;
  }

  function showState(active) {
    enabled = active;
    toggle.checked = active;
    state.textContent = active ? "On" : "Off";
    status.textContent = active
      ? "Notifications enabled for this browser, even with no Lobby tab open."
      : "Notifications disabled for this browser.";
  }

  async function request(url, method, subscription) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: subscription ? JSON.stringify({ subscription }) : undefined
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Notification settings could not be saved. Please try again.");
    }
    return result;
  }

  function urlBase64ToUint8Array(value) {
    const raw = window.atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  const restored = restore();
  async function restore() {
    if (!supported() || Notification.permission !== "granted") { return; }
    toggle.disabled = true;
    state.textContent = "Checking...";
    status.textContent = "Checking your saved notification setting...";
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) { return; }
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { return; }
      const result = await request("/notifications/subscription/status", "POST", subscription);
      showState(result.active);
      // Upgrade older workers, including the version without notification click handling.
      await navigator.serviceWorker.register("/service-worker.js");
    } catch (error) {
      state.textContent = "Unknown";
      status.textContent = "Could not check notification settings: " + error.message;
    } finally {
      if (state.textContent === "Checking...") { showState(false); }
      toggle.disabled = false;
    }
  }

  async function toggleNotificationPermissions(element) {
    if (busy) { return; }
    const checked = element.checked;
    if (!supported()) {
      showState(false);
      status.textContent = "Off-site notifications need HTTPS and a supported browser. On iPhone or iPad, add Blockwars to your Home Screen and open it there first.";
      return;
    }
    // Permission must be requested directly from the click, before awaiting network work.
    const permission = checked && Notification.permission === "default"
      ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    busy = true;
    toggle.disabled = true;
    state.textContent = "Saving...";
    status.textContent = checked ? "Enabling notifications..." : "Disabling notifications...";
    try {
      const choice = await permission;
      await restored;
      toggle.disabled = true;
      if (checked && choice !== "granted") {
        throw new Error("Notifications are blocked or were not allowed. Enable them in your browser's site settings, then try again.");
      }
      if (checked) {
        const config = await request("/notifications/config", "GET");
        if (!config.enabled) {
          throw new Error("Off-site notifications are not configured on the server yet.");
        }
        await navigator.serviceWorker.register("/service-worker.js");
        const registration = await navigator.serviceWorker.ready;
        const applicationServerKey = urlBase64ToUint8Array(config.publicKey);
        let subscription = await registration.pushManager.getSubscription();
        if (subscription && subscription.options && subscription.options.applicationServerKey) {
          const previousKey = new Uint8Array(subscription.options.applicationServerKey);
          if (previousKey.length !== applicationServerKey.length ||
              previousKey.some((byte, index) => byte !== applicationServerKey[index])) {
            await request("/notifications/subscription", "DELETE", subscription);
            showState(false);
            if (!await subscription.unsubscribe()) {
              throw new Error("Could not replace the old push subscription. Please try again.");
            }
            subscription = null;
          }
        }
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        }
        await request("/notifications/subscription", "PUT", subscription);
        showState(true);
        status.textContent = "Notifications enabled for this browser, even with no Lobby tab open.";
      } else {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = registration && await registration.pushManager.getSubscription();
        if (subscription) {
          await request("/notifications/subscription", "DELETE", subscription);
        }
        showState(false);
        status.textContent = "Notifications disabled for this browser.";
      }
    } catch (error) {
      toggle.checked = enabled;
      state.textContent = enabled ? "On" : "Off";
      status.textContent = error.message;
    } finally {
      busy = false;
      toggle.disabled = false;
    }
  }

  return {
    toggleNotificationPermissions,
    closeHelp: function () {
      help.open = false;
      document.getElementById("notification-help-toggle").focus();
    },
    userNotification: function () {
      if (enabled && Notification.permission === "granted" && Date.now() >= arrivedTimestamp) {
        arrivedTimestamp = Date.now() + 60000;
        PlayerArrivedSound.play();
      }
    }
  };
}());
