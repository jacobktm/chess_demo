const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startGames: async () => {
    await fetch('/start_games', { method: 'POST' });
  }
});

