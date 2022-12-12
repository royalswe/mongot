self.addEventListener('push', function(e) {
  const data = e.data.json();
  self.registration.showNotification(data.title, {
    icon: "https://blockwars.mongot.com/img/pn-tetris-block.png"
  });
});