// Electron renderer.js
document.addEventListener('DOMContentLoaded', async () => {
  // Start games when the application loads
  await window.api.startGames();

  // Fetch the boards and render them
  const response = await window.api.getBoards();
  const boards = response.boards;
  const boardsContainer = document.getElementById('boards-container');

  boards.forEach(async (boardId) => {
    const col = document.createElement('div');
    col.classList.add('col-md-6');
    const boardElement = document.createElement('div');
    boardElement.id = `board-${boardId}`;
    col.appendChild(boardElement);
    boardsContainer.appendChild(col);

    const chessBoard = Chessboard(boardElement, {
      draggable: false,
      position: 'start'
    });

    // Update the board periodically
    setInterval(async () => {
      const boardData = await window.api.getBoard(boardId);
      // Update the board position using chessBoard.js
      updateChessBoard(chessBoard, boardData);
    }, 1000); // Update every second
  });
});

function updateChessBoard(chessBoard, boardData) {
  const chess = new Chess();
  chess.load_pgn(boardData.pgn);
  chessBoard.position(chess.fen());
}

