const { contextBridge, ipcRenderer } = require('electron');
const axios = require('axios');

contextBridge.exposeInMainWorld('api', {
  startGames: async () => {
    const response = await axios.post('http://127.0.0.1:5000/start_games');
    return response.data;
  },
  getBoards: async () => {
    const response = await axios.get('http://127.0.0.1:5000/get_boards');
    return response.data;
  },
  getBoard: async (boardId) => {
    const response = await axios.get(`http://127.0.0.1:5000/get_board?board_id=${boardId}`);
    return response.data;
  }
});

