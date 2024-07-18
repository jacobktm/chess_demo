let intervalIds = [];

document.addEventListener('DOMContentLoaded', async () => {
  console.log("Document loaded, starting games...");

  // Start games when the application loads
  await fetch('/start_games', { method: 'POST' });
  console.log("Games started, fetching boards...");

  // Initialize boards
  await initializeBoards();
});

async function initializeBoards() {
  console.log("Fetching boards...");

  // Fetch the boards and render them
  const response = await fetch('/get_boards');
  const { boards } = await response.json();
  console.log("Boards fetched:", boards);

  // Clear existing boards and profiles
  const boardsContainer = document.getElementById('boards-container');
  boardsContainer.innerHTML = '';

  // Clear all existing interval timers
  intervalIds.forEach(id => clearInterval(id));
  intervalIds = [];

  boards.forEach(board => {
    const boardElementId = `board-${board.id}`;
    const boardContainer = document.createElement('div');
    boardContainer.className = 'board-container';

    boardContainer.innerHTML = `
      <div class="profiles-container">
        <div class="profile profile-player2">
          <img src="/img/profile_imgs/${board.games[0].player2.profile_image}" alt="${board.games[0].player2.name}" class="profile-image">
          <div class="profile-info">
            <p>ELO: ${board.games[0].player2.elo}</p>
          </div>
        </div>
        <div class="profile-gap"></div>
        <div class="profile profile-player1">
          <div class="profile-info">
            <p>ELO: ${board.games[0].player1.elo}</p>
          </div>
          <img src="/img/profile_imgs/${board.games[0].player1.profile_image}" alt="${board.games[0].player1.name}" class="profile-image">
        </div>
      </div>
      <div class="board-frame">
        <div class="profile-name-top">${board.games[0].player2.name}</div>
        <div id="${boardElementId}" class="chess-board"></div>
        <div class="profile-name-bottom">${board.games[0].player1.name}</div>
      </div>
    `;

    boardsContainer.appendChild(boardContainer);

    const boardElement = document.getElementById(boardElementId);

    if (boardElement) {
      const chessBoard = Chessboard(boardElementId, {
        draggable: false,
        position: board.fen
      });

      console.log(`Chessboard initialized for board ${board.id}`);

      let endGameCounter = 0;

      // Update the board periodically
      const intervalId = setInterval(async () => {
        const boardResponse = await fetch(`/get_board/${board.id}`);
        const boardData = await boardResponse.json();
        console.log(`Board ${board.id} state:`, boardData);
        chessBoard.position(boardData.fen);

        if (boardData.pgn.includes('[Result "1-0"]') || boardData.pgn.includes('[Result "0-1"]') || boardData.pgn.includes('[Result "1/2-1/2"]')) {
          endGameCounter++;
          if (endGameCounter >= 40) { // 20 iterations of 250ms each = 5 seconds
            console.log(`Starting a new game on board ${board.id}`);
            await fetch(`/start_game/${board.id}`, { method: 'POST' });
            initializeBoards(); // Reinitialize boards after starting a new game
          }
        } else {
          endGameCounter = 0; // Reset counter if game is still in progress
        }
      }, 125); // Update every quarter second

      intervalIds.push(intervalId);
    } else {
      console.error(`Board element not found for board ${board.id}`);
    }
  });
}

