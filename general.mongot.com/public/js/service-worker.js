self.addEventListener('push', function(e) {
  const data = e.data.json();
  self.registration.showNotification(data.title, {
    icon: "https://general.mongot.com/img/game/phases/Battle.png"
  });
});