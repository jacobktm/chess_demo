from flask import Flask, jsonify, render_template, send_from_directory, request
import json
import chess.engine
import threading
from datetime import datetime
import math
import time
import logging
import random
import chess.pgn

app = Flask(__name__, static_url_path='/static')

logging.basicConfig(level=logging.DEBUG)

class PlayerProfile:
    def __init__(self, name, profile_data, stockfish_path):
        self.name = name
        self.elo = profile_data["elo"]
        self.profile_image = profile_data["profile_image"]
        self.depth = profile_data["depth"]
        self.uci_elo = profile_data["uci_elo"]
        self.stockfish_path = stockfish_path
        self.engine = self._spawn_engine()
        self.games = []

    def _spawn_engine(self):
        engine = chess.engine.SimpleEngine.popen_uci(self.stockfish_path)
        engine.configure({
            "UCI_LimitStrength": True,
            "UCI_Elo": self.uci_elo
        })
        return engine

    def add_game(self, game):
        self.games.append(game)

    def remove_game(self, game):
        if game in self.games:
            self.games.remove(game)

    def play_move(self, board):
        try:
            result = self.engine.play(board, chess.engine.Limit(depth=self.depth))
            return result.move
        except Exception as e:
            logging.error(f"Error playing move for {self.name}: {e}")
            return None

    def quit(self):
        self.engine.quit()

    def to_dict(self):
        return {
            "name": self.name,
            "elo": self.elo,
            "profile_image": self.profile_image
        }

def load_player_profiles(stockfish_path):
    with open("player_profiles.json", "r") as file:
        profiles = json.load(file)
    return {name: PlayerProfile(name, data, stockfish_path) for name, data in profiles.items()}

# Load player profiles once during initialization
player_profiles = load_player_profiles('./.venv/bin/stockfish')
player_keys = list(player_profiles.keys())
NUM_BOARDS = math.ceil(len(player_keys) / 2)
games = []
boards = {i: {"board": chess.Board(), "games": []} for i in range(1, NUM_BOARDS + 1)}

game_lock = threading.Lock()

def create_game(player1, player2, board_id):
    game = {
        "board_id": board_id,
        "player1": player_profiles[player1],
        "player2": player_profiles[player2],
        "last_move_time": datetime.now().isoformat()
    }
    games.append(game)
    boards[board_id]["games"].append(game)
    board = boards[board_id]["board"]

    player_profiles[player1].add_game(game)
    player_profiles[player2].add_game(game)

    def play_game():
        try:
            while not board.is_game_over():
                current_player = player_profiles[player1] if board.turn == chess.WHITE else player_profiles[player2]
                move = current_player.play_move(board)
                if move and board.is_legal(move):
                    board.push(move)
                game["last_move_time"] = datetime.now().isoformat()
                time.sleep(1)
        except Exception as e:
            logging.error(f"Error in game on board {board_id}: {e}")
        finally:
            # Remove game from player profiles once it is over or an error occurs
            player_profiles[player1].remove_game(game)
            player_profiles[player2].remove_game(game)
            boards[board_id]["games"].remove(game)
            time.sleep(5)  # Wait for 5 seconds before starting a new game
            with game_lock:
                boards[board_id]["board"].reset()
                create_game(player1.name, player2.name, board_id)  # Start a new game on the same board

    threading.Thread(target=play_game, daemon=True).start()

@app.route('/start_games', methods=['POST'])
def start_games():
    player_keys = list(player_profiles.keys())
    created_games = []

    with game_lock:
        for board_id in range(1, NUM_BOARDS + 1):
            if len(player_keys) < 2:
                break
            player1, player2 = random.sample(player_keys, 2)
            create_game(player1, player2, board_id)
            created_games.append({"board_id": board_id, "fen": boards[board_id]["board"].fen()})

    return jsonify(created_games), 201

@app.route('/start_game/<int:board_id>', methods=['POST'])
def start_game(board_id):
    if board_id not in boards:
        return jsonify({"error": "Invalid board ID"}), 404

    player_keys = list(player_profiles.keys())
    if len(player_keys) < 2:
        return jsonify({"error": "Not enough players to start a game"}), 400

    player1, player2 = random.sample(player_keys, 2)

    with game_lock:
        boards[board_id]["board"].reset()
        boards[board_id]["games"].clear()
        create_game(player1, player2, board_id)

    return jsonify({
        "board_id": board_id,
        "fen": boards[board_id]["board"].fen(),
        "players": {
            "player1": player_profiles[player1].to_dict(),
            "player2": player_profiles[player2].to_dict()
        }
    }), 201

@app.route('/get_boards', methods=['GET'])
def get_boards():
    response = [{
        "id": board_id,
        "fen": board_data["board"].fen(),
        "games": [{"player1": game["player1"].to_dict(), "player2": game["player2"].to_dict()} for game in board_data["games"]]
    } for board_id, board_data in boards.items()]
    logging.debug("Boards requested: %s", response)
    return jsonify(boards=response)

@app.route('/get_board/<int:board_id>', methods=['GET'])
def get_board(board_id):
    board_data = boards.get(board_id)
    if board_data:
        game = chess.pgn.Game.from_board(board_data["board"])
        exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=True)
        pgn = game.accept(exporter)
        return jsonify({
            "id": board_id,
            "fen": board_data["board"].fen(),
            "pgn": pgn,
            "games": [{"player1": game["player1"].to_dict(), "player2": game["player2"].to_dict()} for game in board_data["games"]]
        })
    else:
        return jsonify({"error": "Board not found"}), 404

@app.route('/stop_games', methods=['POST'])
def stop_games():
    for board_data in boards.values():
        for game in board_data["games"]:
            game["player1"].quit()
            game["player2"].quit()
    boards.clear()
    games.clear()
    return jsonify({"status": "All games stopped"}), 200

@app.route('/get_profiles', methods=['GET'])
def get_profiles():
    profiles = {name: profile.to_dict() for name, profile in player_profiles.items()}
    return jsonify(profiles)

@app.route('/img/profile_imgs/<filename>')
def profile_image(filename):
    return send_from_directory('static/img/profile_imgs', filename)

@app.route('/img/chesspieces/wikipedia/<filename>')
def piece_image(filename):
    return send_from_directory('static/img/chesspieces/wikipedia', filename)

@app.route('/')
def index():
    boards_info = [{"board_id": board_id, "games": board_data["games"]} for board_id, board_data in boards.items()]
    logging.debug("Rendering index.html with boards: %s", boards_info)
    return render_template('index.html', boards=boards_info)

if __name__ == '__main__':
    app.run(port=5000)

