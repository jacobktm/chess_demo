import os
import logging
from flask import Flask, jsonify, render_template, send_from_directory, request
import json
import chess.engine
import threading
from datetime import datetime
import math
import time
import random
import chess.pgn

app = Flask(__name__, static_url_path='/static')

# Determine if logging should be enabled
logging_enabled = os.getenv('LOGGING_ENABLED', 'false').lower() in ('true', '1', 't')

if logging_enabled:
    logging.basicConfig(
        level=logging.DEBUG,
        format='chess_demo: %(message)s'
    )

PGN_FILE = "games.pgn"
EVENT_NAME = "The Whimsical Chess Tournament"
SITE = "SIGGRAPH 2024"
SYZYGY_PATH = "./syzygy"  # Path to Syzygy tablebases directory

class PlayerProfile:
    def __init__(self, name, profile_data, stockfish_path):
        self.name = name
        self.elo = profile_data["elo"]
        self.profile_image = profile_data["profile_image"]
        self.depth = profile_data.get("depth", 15)  # Provide a default value if depth is not in profile_data
        self.time = profile_data.get("time", 0.1)
        self.uci_elo = profile_data.get("uci_elo", 1320)  # Provide a default value if uci_elo is not in profile_data
        self.stockfish_path = stockfish_path
        self.engine = self._spawn_engine()
        self.games = []
        self.lock = threading.Lock()

        # Initialize dynamic profile data
        self.profile_data = profile_data
        self.opponents = profile_data.get("opponents", {})

    def _spawn_engine(self):
        engine = chess.engine.SimpleEngine.popen_uci(self.stockfish_path)
        engine.configure({
            "UCI_LimitStrength": True,
            "UCI_Elo": self.uci_elo,
            "SyzygyPath": SYZYGY_PATH  # Configure the engine to use Syzygy tablebases
        })
        if logging_enabled:
            logging.debug(f"Engine spawned for {self.name} with ELO {self.uci_elo}")
        return engine

    def add_game(self, game, color):
        self.games.append({"game": game, "color": color, "initial_elo": self.elo})
        if logging_enabled:
            logging.debug(f"Game added for {self.name}, color: {color}, total games: {len(self.games)}")

    def remove_game(self, game):
        self.games = [g for g in self.games if g["game"] != game]
        if logging_enabled:
            logging.debug(f"Game removed for {self.name}, total games: {len(self.games)}")

    def calculate_dynamic_depth(self, board):
        # Increase depth as the number of pieces decreases
        piece_count = len(board.piece_map())
        if piece_count > 24:  # Opening and early midgame
            return self.depth
        elif piece_count > 16:  # Midgame
            return self.depth + 2
        else:  # Endgame
            return self.depth + 5

    def play_move(self, board, board_id):
        try:
            dynamic_depth = self.calculate_dynamic_depth(board)
            result = self.engine.play(board, chess.engine.Limit(depth=dynamic_depth, time=self.time))  # Added time limit of 0.1 seconds per move
            if logging_enabled:
                logging.debug(f"Move played by {self.name} on board {board_id}: {result.move}")
            return result.move
        except Exception as e:
            if logging_enabled:
                logging.error(f"Error playing move by {self.name} on board {board_id}: {e}")
            return None

    def play_game(self, game_info):
        game = game_info["game"]
        board = boards[game["board_id"]]["board"]
        current_turn = game["turn"]

        if game_info["color"] != current_turn:
            return

        with self.lock:
            if not board.is_game_over():
                move = self.play_move(board, game['board_id'])
                if move and board.is_legal(move):
                    board.push(move)
                    game["last_move_time"] = datetime.now().isoformat()
                    game["turn"] = chess.BLACK if current_turn == chess.WHITE else chess.WHITE
                    if logging_enabled:
                        logging.debug(f"Move made on board {game['board_id']}, turn: {game['turn']}")
            else:
                self.remove_game(game)

                # Update ELO based on game result
                result = board.result()
                if result == '1-0':
                    winner, loser = game["player1"], game["player2"]
                    winner_result, loser_result = 1, 0
                elif result == '0-1':
                    winner, loser = game["player2"], game["player1"]
                    winner_result, loser_result = 1, 0
                else:
                    winner, loser = game["player1"], game["player2"]
                    winner_result, loser_result = 0.5, 0.5

                winner.elo = calculate_elo(winner.elo, loser.elo, winner_result)
                loser.elo = calculate_elo(loser.elo, winner.elo, loser_result)

                # Save updated profiles to file
                save_profiles()
                if logging_enabled:
                    logging.debug(f"Profiles saved after game on board {game['board_id']}")

                # Save the game to PGN file
                save_game_to_pgn(game, board, result)
                if logging_enabled:
                    logging.debug(f"Game on board {game['board_id']} saved to PGN with result {result}")

    def play_games(self):
        while True:
            ongoing_games = [game_info for game_info in self.games if not boards[game_info["game"]["board_id"]]["board"].is_game_over()]
            for game_info in ongoing_games:
                self.play_game(game_info)
            time.sleep(.1)  # Sleep to allow the UI to update and avoid too rapid moves

    def quit(self):
        self.engine.quit()
        if logging_enabled:
            logging.debug(f"Engine for {self.name} has quit")

    def to_dict(self):
        profile_dict = {
            "name": self.name,
            "elo": self.elo,
            "profile_image": self.profile_image,
            "uci_elo": self.uci_elo,
            "time": self.time,
            "opponents": self.opponents
        }
        return profile_dict

def load_player_profiles(stockfish_path):
    with open("player_profiles.json", "r") as file:
        profiles = json.load(file)
    if logging_enabled:
        logging.debug("Player profiles loaded")
    return {name: PlayerProfile(name, data, stockfish_path) for name, data in profiles.items()}

def save_profiles():
    profiles = {name: profile.to_dict() for name, profile in player_profiles.items()}
    with open("player_profiles.json", "w") as file:
        json.dump(profiles, file, indent=4)
    if logging_enabled:
        logging.debug("Player profiles saved")

def calculate_elo(player_elo, opponent_elo, result):
    K = 30
    expected_score = 1.0 / (1 + 10 ** ((opponent_elo - player_elo) / 400))
    elo = round(player_elo + K * (result - expected_score))
    if elo < 100:
        elo = 100
    if logging_enabled:
        logging.debug(f"ELO calculated: player_elo={player_elo}, opponent_elo={opponent_elo}, result={result}, new_elo={elo}")
    return elo

def save_game_to_pgn(game, board, result):
    player1, player2 = game["player1"], game["player2"]
    opponent = player1.opponents.get(player2.name, None)
    if opponent is None:
        round_number = 1
        player1.opponents[player2.name] = {"games_played": round_number}
        player2.opponents[player1.name] = {"games_played": round_number}
    else:
        round_number = player1.opponents[player2.name]["games_played"] + 1
        player1.opponents[player2.name]["games_played"] = round_number
        player2.opponents[player1.name]["games_played"] = round_number

    game_pgn = chess.pgn.Game()
    game_pgn.headers["Event"] = EVENT_NAME
    game_pgn.headers["Site"] = SITE
    game_pgn.headers["Date"] = datetime.now().strftime("%Y.%m.%d")
    game_pgn.headers["White"] = game["player1"].name
    game_pgn.headers["Black"] = game["player2"].name
    game_pgn.headers["WhiteElo"] = str(game["player1"].elo)
    game_pgn.headers["BlackElo"] = str(game["player2"].elo)
    game_pgn.headers["Round"] = str(round_number)
    game_pgn.headers["Result"] = result

    game_node = game_pgn

    for move in board.move_stack:
        game_node = game_node.add_main_variation(move)

    with open(PGN_FILE, "a") as pgn_file:
        print(game_pgn, file=pgn_file)
    if logging_enabled:
        logging.debug(f"Game between {player1.name} and {player2.name} saved to PGN")

# Load player profiles once during initialization
player_profiles = load_player_profiles('./.venv/bin/stockfish')
player_keys = list(player_profiles.keys())
NUM_BOARDS = 24
games = []
boards = {i: {"board": chess.Board(), "games": []} for i in range(1, NUM_BOARDS + 1)}

game_lock = threading.Lock()

def create_game(player1, player2, board_id):
    game = {
        "board_id": board_id,
        "player1": player_profiles[player1],
        "player2": player_profiles[player2],
        "last_move_time": datetime.now().isoformat(),
        "turn": chess.WHITE
    }
    games.append(game)
    boards[board_id]["games"].append(game)
    board = boards[board_id]["board"]

    player_profiles[player1].add_game(game, chess.WHITE)
    player_profiles[player2].add_game(game, chess.BLACK)

    if not hasattr(player_profiles[player1], 'thread_started'):
        threading.Thread(target=player_profiles[player1].play_games, daemon=True).start()
        player_profiles[player1].thread_started = True

    if not hasattr(player_profiles[player2], 'thread_started'):
        threading.Thread(target=player_profiles[player2].play_games, daemon=True).start()
        player_profiles[player2].thread_started = True

    if logging_enabled:
        logging.debug(f"Game created on board {board_id} between {player1} and {player2}")

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

    if logging_enabled:
        logging.debug(f"New game started on board {board_id} between {player1} and {player2}")

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
    if logging_enabled:
        logging.debug("All games stopped")
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

@app.route('/get_images', methods=['GET'])
def get_images():
    img_dir = os.path.join(app.static_folder, 'img')
    img_files = []
    for root, _, files in os.walk(img_dir):
        for file in files:
            if file.endswith(('.png', '.jpg', '.jpeg', '.gif')):
                # Adjust the path to be relative to the static directory
                relative_path = os.path.relpath(os.path.join(root, file), app.static_folder)
                img_files.append(relative_path)
    return jsonify(img_files)

@app.route('/')
def index():
    boards_info = [{"board_id": board_id, "games": board_data["games"]} for board_id, board_data in boards.items()]
    return render_template('index.html', boards=boards_info)

if __name__ == '__main__':
    app.run(port=5000)
