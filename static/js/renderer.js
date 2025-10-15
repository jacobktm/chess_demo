let intervalIds = {};
let timeoutIds = {};
let chessboardInstances = {}; // Track chessboard instances for proper cleanup
let resizeHandler = null;
let systemInfo = null; // Store system information

// Debounce function to limit resize event frequency
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

document.addEventListener('DOMContentLoaded', async () => {

  // Preload images
  await preloadImages();

  // Get system info and configure layout
  await configureLayout();

  // Start games when the application loads
  await fetch('/start_games', { method: 'POST' });

  await setInterval(fetchCpuUsage, 333);

  // Initialize boards
  await initializeBoards();

  // Add debounced resize event listener (store reference for cleanup)
  resizeHandler = debounce(updateLayout, 250);
  window.addEventListener('resize', resizeHandler);
  await new Promise(resolve => setTimeout(resolve, 500)); // Delay of 500ms
  updateLayout();  // Initial call to set the debug output and layout
});

// Clean up resources when page is unloaded
window.addEventListener('beforeunload', () => {
  cleanupBoardResources();
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
  }
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
  
  // Clean up existing intervals, timeouts, and chessboard instances
  cleanupBoardResources();
  
  boardsContainer.innerHTML = '';

  boards.forEach(board => {
    initializeBoard(board);
  });
}

// Intelligent grid layout calculation based on screen size and board count
function calculateOptimalGridLayout(numBoards) {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const cpuMonitorHeight = 200;
  const availableWidth = windowWidth - 20; // Account for padding
  const availableHeight = windowHeight - cpuMonitorHeight - 20;
  
  // Calculate aspect ratio
  const aspectRatio = availableWidth / availableHeight;
  
  // Find the best grid layout that minimizes wasted space
  let bestLayout = { cols: 1, rows: numBoards, score: Infinity };
  
  // Try different column configurations
  for (let cols = 1; cols <= numBoards; cols++) {
    const rows = Math.ceil(numBoards / cols);
    
    // Skip if too many rows (would cause scrolling)
    if (rows > 10) continue;
    
    // Calculate board size for this grid
    const boardWidth = availableWidth / cols;
    const boardHeight = availableHeight / rows;
    const boardSize = Math.min(boardWidth, boardHeight);
    
    // Calculate wasted space (unused grid cells)
    const totalGridCells = cols * rows;
    const wastedCells = totalGridCells - numBoards;
    
    // Calculate how well this layout fits the screen
    const widthUtilization = (cols * boardSize) / availableWidth;
    const heightUtilization = (rows * boardSize) / availableHeight;
    const utilizationScore = Math.min(widthUtilization, heightUtilization);
    
    // Penalty for extreme aspect ratios
    const aspectPenalty = Math.abs(cols / rows - aspectRatio) * 0.1;
    
    // Score: lower is better
    const score = wastedCells + aspectPenalty + (1 - utilizationScore) * 2;
    
    if (score < bestLayout.score) {
      bestLayout = { cols, rows, score };
    }
  }
  
  // Prefer layouts that are closer to square (better visual balance)
  const squareScore = Math.abs(bestLayout.cols - bestLayout.rows);
  if (squareScore <= 2) {
    bestLayout.score -= 0.5; // Bonus for square-ish layouts
  }
  
  console.log(`Calculated optimal layout: ${bestLayout.cols}x${bestLayout.rows} (score: ${bestLayout.score.toFixed(2)})`);
  return bestLayout;
}

// Function to configure layout based on system capabilities
async function configureLayout() {
  try {
    const response = await fetch('/get_system_info');
    systemInfo = await response.json();
    
    console.log(`System info: ${systemInfo.cpu_cores} cores, ${systemInfo.num_boards} boards, ${systemInfo.total_memory_gb}GB RAM`);
    
    // Apply CSS custom properties for dynamic sizing
    const root = document.documentElement;
    root.style.setProperty('--num-boards', systemInfo.num_boards);
    
    // Calculate optimal grid layout dynamically based on screen size and board count
    const optimalLayout = calculateOptimalGridLayout(systemInfo.num_boards);
    
    root.style.setProperty('--grid-cols', optimalLayout.cols);
    root.style.setProperty('--grid-rows', optimalLayout.rows);
    
    console.log(`Grid layout: ${optimalLayout.cols}x${optimalLayout.rows} (${systemInfo.num_boards} boards)`);
    
  } catch (error) {
    console.error('Error getting system info:', error);
    // Fallback to default values
    systemInfo = { cpu_cores: 4, num_boards: 8, total_memory_gb: 8 };
  }
}


// Function to clean up board resources
function cleanupBoardResources() {
  // Clear all intervals
  Object.values(intervalIds).forEach(intervalId => clearInterval(intervalId));
  intervalIds = {};
  
  // Clear all timeouts
  Object.values(timeoutIds).forEach(timeoutId => clearTimeout(timeoutId));
  timeoutIds = {};
  
  // Destroy all chessboard instances
  Object.values(chessboardInstances).forEach(instance => {
    if (instance && typeof instance.destroy === 'function') {
      instance.destroy();
    }
  });
  chessboardInstances = {};
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
    // Clean up existing chessboard instance for this board
    if (chessboardInstances[board.id]) {
      chessboardInstances[board.id].destroy();
      delete chessboardInstances[board.id];
    }

    const chessBoard = Chessboard(boardElementId, {
      draggable: false,
      showNotation: false,
      moveSpeed: 'fast',
      position: board.fen,
      pieceTheme: '/img/chesspieces/wikipedia/{piece}.png'
    });
    
    // Force consistent sizing by setting CSS directly
    setTimeout(() => {
      const boardElement = document.getElementById(boardElementId);
      if (boardElement) {
        const boardSize = getComputedStyle(document.documentElement).getPropertyValue('--board-size');
        const boardContainer = boardElement.closest('.board-container');
        const containerRect = boardContainer ? boardContainer.getBoundingClientRect() : null;
        
        // Calculate maximum allowed size based on container
        let maxSize = boardSize;
        if (containerRect) {
          const availableWidth = containerRect.width - 30; // Account for padding (increased)
          const availableHeight = containerRect.height - 120; // Account for profiles (increased significantly)
          maxSize = Math.min(maxSize, availableWidth, availableHeight);
          // Apply a very conservative safety margin to prevent overflow
          maxSize = maxSize * 0.75; // 75% of calculated size (reduced from 80%)
        }
        
        boardElement.style.width = `${maxSize}px`;
        boardElement.style.height = `${maxSize}px`;
        boardElement.style.maxWidth = `${maxSize}px`;
        boardElement.style.maxHeight = `${maxSize}px`;
        boardElement.style.minWidth = '0px';
        boardElement.style.minHeight = '0px';
      }
    }, 100);
    
    // Store the chessboard instance for cleanup
    chessboardInstances[board.id] = chessBoard;

    // Clear existing interval for this board
    if (intervalIds[board.id]) {
      clearInterval(intervalIds[board.id]);
      delete intervalIds[board.id];
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
    }, 333); // Update every 333ms
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
    <div class="profile profile-player2">
      <img src="/img/profile_imgs/${board.games[0].player2.profile_image}" alt="${board.games[0].player2.name}" class="profile-image">
      <div class="profile-text">
        <div class="profile-info">ELO: ${board.games[0].player2.elo}</div>
        <div class="profile-name">${board.games[0].player2.name}</div>
      </div>
    </div>
    <div class="board-frame">
      <div id="${boardElementId}" class="chess-board"></div>
    </div>
    <div class="profile profile-player1">
      <img src="/img/profile_imgs/${board.games[0].player1.profile_image}" alt="${board.games[0].player1.name}" class="profile-image">
      <div class="profile-text">
        <div class="profile-info">ELO: ${board.games[0].player1.elo}</div>
        <div class="profile-name">${board.games[0].player1.name}</div>
      </div>
    </div>
  `;

  const boardElement = document.getElementById(boardElementId);
  if (boardElement) {
    // Clean up existing chessboard instance for this board
    if (chessboardInstances[board.id]) {
      chessboardInstances[board.id].destroy();
      delete chessboardInstances[board.id];
    }

    const chessBoard = Chessboard(boardElementId, {
      draggable: false,
      showNotation: false,
      moveSpeed: 'fast',
      position: board.fen,
      pieceTheme: '/img/chesspieces/wikipedia/{piece}.png'
    });
    
    // Force consistent sizing by setting CSS directly
    setTimeout(() => {
      const boardElement = document.getElementById(boardElementId);
      if (boardElement) {
        const boardSize = getComputedStyle(document.documentElement).getPropertyValue('--board-size');
        const boardContainer = boardElement.closest('.board-container');
        const containerRect = boardContainer ? boardContainer.getBoundingClientRect() : null;
        
        // Calculate maximum allowed size based on container
        let maxSize = boardSize;
        if (containerRect) {
          const availableWidth = containerRect.width - 30; // Account for padding (increased)
          const availableHeight = containerRect.height - 120; // Account for profiles (increased significantly)
          maxSize = Math.min(maxSize, availableWidth, availableHeight);
          // Apply a very conservative safety margin to prevent overflow
          maxSize = maxSize * 0.75; // 75% of calculated size (reduced from 80%)
        }
        
        boardElement.style.width = `${maxSize}px`;
        boardElement.style.height = `${maxSize}px`;
        boardElement.style.maxWidth = `${maxSize}px`;
        boardElement.style.maxHeight = `${maxSize}px`;
        boardElement.style.minWidth = '0px';
        boardElement.style.minHeight = '0px';
      }
    }, 100);
    
    // Store the chessboard instance for cleanup
    chessboardInstances[board.id] = chessBoard;
  } else {
    console.error(`updateBoardContainer: Board element not found for board ${board.id}`);
  }
}

function updateLayout() {
  const boardsContainer = document.getElementById('boards-wrapper');

  if (!systemInfo) return;

  // Recalculate optimal grid layout based on current window size
  const optimalLayout = calculateOptimalGridLayout(systemInfo.num_boards);
  
  // Update CSS custom properties with new layout
  const root = document.documentElement;
  root.style.setProperty('--grid-cols', optimalLayout.cols);
  root.style.setProperty('--grid-rows', optimalLayout.rows);
  
  // Calculate available space
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const cpuMonitorHeight = 200;
  const availableWidth = windowWidth - 20;
  const availableHeight = windowHeight - cpuMonitorHeight - 20;
  
  // Calculate optimal board size for the new grid
  const boardWidth = availableWidth / optimalLayout.cols;
  const boardHeight = availableHeight / optimalLayout.rows;
  const boardSize = Math.min(boardWidth, boardHeight) - 16; // Account for gaps and padding
  
  // Apply dynamic sizing
  boardsContainer.style.width = `${windowWidth}px`;
  boardsContainer.style.height = `${availableHeight}px`;
  
  // Update CSS custom properties
  root.style.setProperty('--board-size', `${boardSize}px`);
  root.style.setProperty('--available-width', `${windowWidth}px`);
  root.style.setProperty('--available-height', `${availableHeight}px`);
  
  console.log(`Layout updated: ${optimalLayout.cols}x${optimalLayout.rows} grid, board size: ${boardSize}px`);
  
  // Refresh all board sizes to ensure consistency
  refreshAllBoardSizes();
}

// Function to refresh all board sizes
function refreshAllBoardSizes() {
  Object.keys(chessboardInstances).forEach(boardId => {
    const boardElementId = `board-${boardId}`;
    const boardElement = document.getElementById(boardElementId);
    if (boardElement) {
      const boardSize = getComputedStyle(document.documentElement).getPropertyValue('--board-size');
      const boardContainer = boardElement.closest('.board-container');
      const containerRect = boardContainer ? boardContainer.getBoundingClientRect() : null;
      
      // Calculate maximum allowed size based on container
      let maxSize = boardSize;
      if (containerRect) {
        const availableWidth = containerRect.width - 16; // Account for padding
        const availableHeight = containerRect.height - 100; // Account for profiles
        maxSize = Math.min(maxSize, availableWidth, availableHeight);
      }
      
      boardElement.style.width = `${maxSize}px`;
      boardElement.style.height = `${maxSize}px`;
      boardElement.style.maxWidth = `${maxSize}px`;
      boardElement.style.maxHeight = `${maxSize}px`;
      boardElement.style.minWidth = '0px';
      boardElement.style.minHeight = '0px';
    }
  });
}

let previousHeights = [];

function getColor(value) {
  if (value <= 25) return 'linear-gradient(to bottom, #00FF00, #00FF00)';
  if (value <= 50) return 'linear-gradient(to bottom, #FFFF00, #00FF00)';
  if (value <= 75) return 'linear-gradient(to bottom, #FFA500, #FFFF00, #00FF00)';
  return 'linear-gradient(to bottom, #FF0000, #FFA500, #FFFF00, #00FF00)';
}

async function fetchCpuUsage() {
  try {
    const cpuResponse = await fetch('/cpu');
    const cpuData = await cpuResponse.json();
    const chartBody = document.getElementById('chart-body');
    chartBody.innerHTML = '';

    cpuData.cpu.forEach((usage, index) => {
      const row = document.createElement('tr');
      const cpuLabel = document.createElement('th');
      cpuLabel.scope = 'row';
      cpuLabel.textContent = `CPU ${index}`;
      const cpuBar = document.createElement('td');
      cpuBar.className = 'cpu-bar';
      cpuBar.style.setProperty('--color', getColor(usage));
      cpuBar.innerHTML = `<span class="data">${usage}%</span>`;
      const previousHeight = previousHeights[index] || 0;
      const newHeight = usage;
      previousHeights[index] = newHeight;
      cpuBar.animate([{ height: previousHeight + '%' }, { height: newHeight + '%' }], {
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