/**
 * Push notification 
 */
function togglePushNotification() {
  // Check for service worker
  if ("serviceWorker" in navigator) {
    subscribePushNotification();
  }
  else{
    alert("Sorry but your browser does not support push notification");
  } 
}

(function(){
    // Send Push Notification
    const username = (user === 'guest') ? 'guest' : user.username;

    fetch("/send-pw", {
      method: "POST",
      body: JSON.stringify({username}),
      headers: {
        "content-type": "application/json"
      }
    });
})();

// Register SW, Register Push, Send Push
function subscribePushNotification() {
  // Register Service Worker
  navigator.serviceWorker.register("/js/service-worker.js").then(function(reg) {
    reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array("BEjK-T4xq910AGfKQ09xIF_hCgBUTebFj2ZPaHilzouo8ca3kjJAmX4WjgQp8n8Yg02Bu5hwp97MLu0a14OP4RY")
    }).then(function(subscription) { 
      // Send Push Notification
      const username = (user === 'guest') ? 'guest' : user.username;

      fetch("/subscribe", {
        method: "POST",
        body: JSON.stringify({subscription, username}),
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
  let outputArray = new Uint8Array(rawData.length);

  for (const i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}