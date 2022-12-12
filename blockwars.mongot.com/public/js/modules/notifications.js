var NOTIFICATION = (function () {
  /**
   * Push notification 
   */
  const username = (user === 'guest') ? 'guest' : user.username;
  let arrivedTimestamp = Date.now();

  // Send Push Notification
  fetch("/send-pw", {
    method: "POST",
    body: JSON.stringify({ username }),
    headers: {
      "content-type": "application/json"
    }
  });

  // Register SW, Register Push, Send Push
  function subscribePushNotification() {
    // Register Service Worker
    navigator.serviceWorker.register("/js/service-worker.js").then(function (reg) {
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array("BEjK-T4xq910AGfKQ09xIF_hCgBUTebFj2ZPaHilzouo8ca3kjJAmX4WjgQp8n8Yg02Bu5hwp97MLu0a14OP4RY")
      }).then(function (subscription) {
        // Send Push Notification
        //const username = (user === 'guest') ? 'guest' : user.username;

        fetch("/subscribe", {
          method: "POST",
          body: JSON.stringify({ subscription, username }),
          headers: {
            "content-type": "application/json"
          }
        });
      });
    });
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  if ("Notification" in window && getNotificationPermissions() === "granted") {
    // check checkbox if notification is granted
    document.getElementById("toggle_notification").checked = true;
  }

  function getNotificationPermissions() {
    if (Notification.permission === "granted") {
      return localStorage.getItem("notification-permissions");
    } else {
      return Notification.permission;
    }
  }

  const PlayerArrivedSound = new Howl({ src: ["sounds/join-lobby.mp3"] });
  function spawnNotification(theIcon, theTitle) {
    let options = {
      icon: theIcon
    };
    let n = new Notification(theTitle, options);
    PlayerArrivedSound.play();
    setTimeout(n.close.bind(n), 3000);
  }

  return {
    togglePushNotification: function () {
      // Check for service worker
      if ("serviceWorker" in navigator) {
        subscribePushNotification();
      }
      else {
        alert("Sorry but your browser does not support push notification");
      }
    },

    /**
     * Notification when in lobby
     */
    toggleNotificationPermissions: function (e) {
      let checked = e.checked;
      if (!("Notification" in window)) {
        return alert(
          "Sorry but your browser does not support desktop notification"
        );
      } else if (Notification.permission === "granted") {
        localStorage.setItem(
          "notification-permissions",
          checked ? "granted" : "denied"
        );
      } else if (Notification.permission === "denied") {
        localStorage.setItem("notification-permissions", "denied");
        checked = false;
      } else if (Notification.permission === "default") {
        Notification.requestPermission(function (choice) {
          if (choice === "granted") {
            localStorage.setItem(
              "notification-permissions",
              checked ? "granted" : "denied"
            );
          } else {
            localStorage.setItem("notification-permissions", "denied");
            checked = false;
          }
        });
      }
    },

    userNotification: function (data) {
      console.log(Notification.permission);
      if (
        getNotificationPermissions() === "granted" &&
        arrivedTimestamp < Date.now()
      ) {
        arrivedTimestamp = Date.now() + 60000;
        spawnNotification("img/pacghost-meta.png", data.msg);
      }
    }
  };

}());