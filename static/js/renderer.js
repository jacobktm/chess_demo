let intervalIds = {};
let timeoutIds = {};

document.addEventListener('DOMContentLoaded', async () => {
  updateDebugOutput("Document loaded, preloading images...");

  // Preload images
  await preloadImages();
  updateDebugOutput("Images preloaded, starting games...");

  // Start games when the application loads
  await fetch('/start_games', { method: 'POST' });
  updateDebugOutput("Games started, fetching boards...");

  // Initialize boards
  await initializeBoards();

  // Add resize event listener
  window.addEventListener('resize', updateLayoutAndDebugOutput);
  updateLayoutAndDebugOutput();  // Initial call to set the debug output and layout

  // Regularly update debug output
  setInterval(updateLayoutAndDebugOutput, 1000);  // Update every second
});

async function preloadImages() {
  const response = await fetch('/get_images');
  const images = await response.json();

  const promises = images.map((image) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = `/${image}`;  // Use the path relative to the root
      img.onload = resolve;
      img.onerror = reject;
    });
  });

  try {
    await Promise.all(promises);
    updateDebugOutput("All images preloaded successfully.");
  } catch (error) {
    console.error("Error preloading images:", error);
  }
}

async function initializeBoards() {
  updateDebugOutput("Fetching boards...");

  // Fetch the boards and render them
  const response = await fetch('/get_boards');
  const { boards } = await response.json();
  updateDebugOutput("Boards fetched:", boards);

  // Clear existing boards and profiles
  const boardsContainer = document.getElementById('boards-wrapper');
  boardsContainer.innerHTML = '';

  boards.forEach(board => {
    initializeBoard(board);
  });
}

async function initializeBoard(board) {
  const boardElementId = `board-${board.id}`;
  const boardsContainer = document.getElementById('boards-wrapper');
  let boardContainer = document.getElementById(`container-${board.id}`);

  console.log(`Initializing board ${board.id}...`);

  if (!boardContainer) {
    boardContainer = document.createElement('div');
    boardContainer.id = `container-${board.id}`;
    boardContainer.className = 'board-container';
    boardsContainer.appendChild(boardContainer);
    console.log(`Created new container for board ${board.id}`);
  }

  updateBoardContainer(board, boardContainer, boardElementId);
  console.log(`Updated board container for board ${board.id}`);

  const boardElement = document.getElementById(boardElementId);

  if (boardElement) {
    let chessBoard;
    try {
      chessBoard = Chessboard(boardElementId, {
        draggable: false,
        showNotation: false,
        moveSpeed: 'fast',
        position: board.fen
      });
      console.log(`Chessboard initialized for board ${board.id}`);
    } catch (error) {
      console.error(`Error initializing Chessboard for board ${board.id}: ${error}`);
      return;
    }

    if (intervalIds[board.id]) {
      clearInterval(intervalIds[board.id]);
      console.log(`Cleared existing interval for board ${board.id}`);
    }

    // Update the board periodically
    intervalIds[board.id] = setInterval(async () => {
      console.log(`Fetching board data for board ${board.id}`);
      let boardData;
      try {
        const boardResponse = await fetch(`/get_board/${board.id}`);
        boardData = await boardResponse.json();
        if (!boardData || !boardData.fen) {
          console.error(`Invalid board data for board ${board.id}: ${boardData}`);
          return;
        }
        chessBoard.position(boardData.fen);
        console.log(`Board ${board.id} FEN: ${boardData.fen}`);
      } catch (error) {
        console.error(`Error fetching or updating board ${board.id}: ${error}`);
        return;
      }

      if (boardData && (boardData.pgn.includes('[Result "1-0"]') || boardData.pgn.includes('[Result "0-1"]') || boardData.pgn.includes('[Result "1/2-1/2"]'))) {
        if (!timeoutIds[board.id]) {
          console.log(`Setting timeout for board ${board.id}`);
          timeoutIds[board.id] = setTimeout(async () => {
            console.log(`Timeout triggered for board ${board.id}`);
            try {
              console.log(`Attempting to start new game on board ${board.id}`);
              const response = await fetch(`/start_game/${board.id}`, { method: 'POST' });
              if (response.ok) {
                console.log(`New game started on board ${board.id}`);
                const newBoardResponse = await fetch(`/get_board/${board.id}`);
                const newBoardData = await newBoardResponse.json();
                if (!newBoardData || !newBoardData.fen) {
                  console.error(`Invalid new board data for board ${board.id}: ${newBoardData}`);
                  return;
                }
                updateBoardContainer(newBoardData, boardContainer, boardElementId); // Update player profiles
                chessBoard.position(newBoardData.fen);  // Update the board position immediately
                await initializeBoard(newBoardData); // Reinitialize the board
              } else {
                console.log(`Failed to start new game on board ${board.id}: ${response.status}`);
              }
            } catch (error) {
              console.log(`Error in starting new game on board ${board.id}: ${error}`);
            }
            console.log(`Clearing timeout for board ${board.id}`);
            delete timeoutIds[board.id];  // Clear the timeout id
          }, 5000); // 5 seconds delay
        }
      } else {
        if (timeoutIds[board.id]) {
          clearTimeout(timeoutIds[board.id]);
          console.log(`Clearing timeout for board ${board.id}`);
          delete timeoutIds[board.id];
        }
      }
    }, 100); // Update every 100ms
  } else {
    console.error(`Board element not found for board ${board.id}`);
  }
}

function updateBoardContainer(board, boardContainer, boardElementId) {
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

  const boardElement = document.getElementById(boardElementId);
  if (boardElement) {
    try {
      Chessboard(boardElementId, {
        draggable: false,
        showNotation: false,
        moveSpeed: 'fast',
        position: board.fen
      });
      console.log(`Chessboard updated for board ${board.id}`);
    } catch (error) {
      console.error(`Error updating Chessboard for board ${board.id}: ${error}`);
    }
  }
}

function updateLayoutAndDebugOutput() {
  const debugOutput = document.getElementById('debug');
  const boardsContainer = document.getElementById('boards-wrapper');

  // Set the width of the boards-wrapper container based on the window size
  const windowWidth = window.innerWidth;
  boardsContainer.style.width = `${windowWidth}px`;

  // Get dimensions of relevant elements
  const boardContainers = document.querySelectorAll('.board-container');
  let boardContainerDims = '';

  boardContainers.forEach((container, index) => {
    const rect = container.getBoundingClientRect();
    boardContainerDims += `<p>Board ${index + 1} - Width: ${rect.width}, Height: ${rect.height}</p>`;
  });

  let timeoutInfo = '';
  for (const [boardId, timeoutId] of Object.entries(timeoutIds)) {
    timeoutInfo += `<p>Board ${boardId} - Timeout ID: ${timeoutId}</p>`;
  }

  debugOutput.innerHTML = `
    <p>Window width: ${window.innerWidth}</p>
    <p>Window height: ${window.innerHeight}</p>
    <p>Boards container width: ${boardsContainer.offsetWidth}</p>
    <p>Boards container height: ${boardsContainer.offsetHeight}</p>
    ${boardContainerDims}
    <p>Active timeouts:</p>
    ${timeoutInfo}
  `;
}

function updateDebugOutput(message) {
  const debugOutput = document.getElementById('debug');
  debugOutput.innerHTML += `<p>${message}</p>`;
}
