document.addEventListener('DOMContentLoaded', async () => {
  await fetch('/start_games', { method: 'POST' });

  const response = await fetch('/get_boards');
  const { boards } = await response.json();

  boards.forEach(async (board) => {
    const chessBoard = Chessboard(`board-${board.id}`, {
      draggable: false,
      position: 'start'
    });

    setInterval(async () => {
      const res = await fetch(`/get_board/${board.id}`);
      if (res.status === 200) {
        const boardData = await res.json();
        updateChessBoard(chessBoard, boardData);
      }
    }, 1000); // Update every second
  });
});

function updateChessBoard(chessBoard, boardData) {
  const chess = new Chess();
  chess.load_pgn(boardData.pgn);
  chessBoard.position(chess.fen());
}

