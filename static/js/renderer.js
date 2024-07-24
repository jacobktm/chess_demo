let intervalIds = {};
let timeoutIds = {};

document.addEventListener('DOMContentLoaded', async () => {

  // Preload images
  await preloadImages();

  // Start games when the application loads
  await fetch('/start_games', { method: 'POST' });

  await setInterval(fetchCpuUsage, 200);

  // Initialize boards
  await initializeBoards();

  // Add resize event listener
  window.addEventListener('resize', updateLayout);
  await new Promise(resolve => setTimeout(resolve, 500)); // Delay of 500ms
  updateLayout();  // Initial call to set the debug output and layout
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
  } catch (error) {
    console.error("Error preloading images:", error);
  }
}

async function initializeBoards() {

  // Fetch the boards and render them
  const response = await fetch('/get_boards');
  const { boards } = await response.json();

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

  console.log(`initializeBoard: initializing board ${board.id}`)

  if (!boardContainer) {
    boardContainer = document.createElement('div');
    boardContainer.id = `container-${board.id}`;
    boardContainer.className = 'board-container';

    boardsContainer.appendChild(boardContainer);
  }

  updateBoardContainer(board, boardContainer, boardElementId);

  const boardElement = document.getElementById(boardElementId);

  if (boardElement) {
    const chessBoard = Chessboard(boardElementId, {
      draggable: false,
      showNotation: false,
      moveSpeed: 'fast',
      position: board.fen
    });

    if (intervalIds[board.id]) {
      clearInterval(intervalIds[board.id]);
    }

    // Update the board periodically
    intervalIds[board.id] = setInterval(async () => {
      try {
        const boardResponse = await fetch(`/get_board/${board.id}`);
        const boardData = await boardResponse.json();
        chessBoard.position(boardData.fen);

        if (boardData.pgn.includes('[Result "1-0"]') || boardData.pgn.includes('[Result "0-1"]') || boardData.pgn.includes('[Result "1/2-1/2"]')) {
          if (!timeoutIds[board.id]) {
            timeoutIds[board.id] = setTimeout(() => handleTimeout(board, boardElementId), 5000); // 5 seconds delay
          }
        } else {
          if (timeoutIds[board.id]) {
            clearTimeout(timeoutIds[board.id]);
            delete timeoutIds[board.id];
          }
        }
      } catch (error) {
        console.error(`Error fetching or updating board ${board.id}: ${error}`);
      }
    }, 200); // Update every 200ms
  } else {
    console.error(`initializeBoard: Board element not found for board ${board.id}`);
  }
}

async function handleTimeout(board, boardElementId) {
  console.log(`handleTimeout: Timeout triggered for board ${board.id}`);
  try {
    console.log(`handleTimeout: Attempting to start new game on board ${board.id}`);
    const response = await fetch(`/start_game/${board.id}`, { method: 'POST' });
    console.log(`handleTimeout: response: ${response.status}`);
    if (response.ok) {
      console.log(`handleTimeout: New game started on board ${board.id}`);
      
      // Introduce a small delay to ensure the new game is properly set up
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay of 500ms

      const newBoardResponse = await fetch(`/get_board/${board.id}`);
      const newBoardData = await newBoardResponse.json();
      if (!newBoardData || !newBoardData.fen) {
        console.error(`handleTimeout: Invalid new board data for board ${board.id}: ${newBoardData}`);
        return;
      }
      updateBoardContainer(newBoardData, document.getElementById(`container-${board.id}`), boardElementId); // Update player profiles
      initializeBoard(newBoardData); // Reinitialize the board to set up new intervals
    } else {
      console.log(`handleTimeout: Failed to start new game on board ${board.id}: ${response.status}`);
    }
  } catch (error) {
    console.log(`handleTimeout: Error in starting new game on board ${board.id}: ${error}`);
  }
  console.log(`handleTimeout: Clearing timeout for board ${board.id}`);
  delete timeoutIds[board.id];  // Clear the timeout id
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
    const chessBoard = Chessboard(boardElementId, {
      draggable: false,
      showNotation: false,
      moveSpeed: 'fast',
      position: board.fen
    });
  } else {
    console.error(`updateBoardContainer: Board element not found for board ${board.id}`);
  }
}

function updateLayout() {
  const boardsContainer = document.getElementById('boards-wrapper');

  // Set the width of the boards-wrapper container based on the window size
  const windowWidth = window.innerWidth;
  boardsContainer.style.width = `${windowWidth}px`;
}

let previousHeights = [];

function getColor(value) {
  if (value <= 25) {
      return 'linear-gradient(to bottom, #00FF00, #00FF00)'; // green
  } else if (value <= 50) {
      return 'linear-gradient(to bottom, #FFFF00, #00FF00)'; // yellow to green
  } else if (value <= 75) {
      return 'linear-gradient(to bottom, #FFA500, #FFFF00, #00FF00)'; // orange to yellow
  } else {
      return 'linear-gradient(to bottom, #FF0000, #FFA500, #FFFF00, #00FF00)'; // red to orange
  }
}

async function fetchCpuUsage() {
  try {
      const cpuResponse = await fetch('/cpu');
      const cpuData = await cpuResponse.json();
      const chartBody = document.getElementById('chart-body');
      chartBody.innerHTML = ''; // Clear the previous bars
      
      cpuData.cpu.forEach((usage, index) => {
          const row = document.createElement('tr');
          const cpuLabel = document.createElement('th');
          cpuLabel.scope = 'row';
          cpuLabel.textContent = `CPU ${index}`;
          
          const cpuBar = document.createElement('td');
          cpuBar.className = 'cpu-bar';
          cpuBar.style.setProperty('--color', getColor(usage));
          cpuBar.innerHTML = `<span class="data">${usage}%</span>`;
          
          // Retrieve previous height or default to 0
          const previousHeight = previousHeights[index] || 0;
          const newHeight = usage;
          
          // Update the previous height array
          previousHeights[index] = newHeight;
          
          // Animate the height change
          cpuBar.animate([
              { height: previousHeight + '%' },
              { height: newHeight + '%' }
          ], {
              duration: 200,
              easing: 'ease-in-out',
              fill: 'forwards'
          });
          
          row.appendChild(cpuLabel);
          row.appendChild(cpuBar);
          chartBody.appendChild(row);
      });
  } catch (error) {
      console.error('Error fetching CPU usage:', error);
  }
}