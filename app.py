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

PGN_FILE = "games.pgn"
EVENT_NAME = "The Whimsical Chess Tournament"
SITE = "SIGGRAPH 2024"

class PlayerProfile:
    def __init__(self, name, profile_data, stockfish_path):
        self.name = name
        self.elo = profile_data["elo"]
        self.profile_image = profile_data["profile_image"]
        self.depth = profile_data.get("depth", 15)
        self.uci_elo = profile_data.get("uci_elo", 1320)
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
            "UCI_Elo": self.uci_elo
        })
        return engine

    def add_game(self, game, color):
        self.games.append({"game": game, "color": color, "initial_elo": self.elo})
        logging.debug(f"chess_demo: add_game: {self.name} Games: {self.games}")

    def remove_game(self, game):
        self.games = [g for g in self.games if g["game"] != game]
        logging.debug(f"chess_demo: remove_game: {self.name} Games: {self.games}")

    def play_move(self, board, board_id):
        try:
            result = self.engine.play(board, chess.engine.Limit(depth=self.depth, time=0.1))
            logging.debug(f"chess_demo: {self.name} move: {result.move}, board: {board_id}")
            return result.move
        except Exception as e:
            logging.error(f"chess_demo: Error playing move for {self.name}: {e}")
            return None

    def play_game(self, game_info):
        game = game_info["game"]
        board = boards[game["board_id"]]["board"]
        current_turn = game["turn"]

        if game_info["color"] != current_turn:
            return

        with self.lock:
            try:
                if not board.is_game_over():
                    move = self.play_move(board, game['board_id'])
                    if move and board.is_legal(move):
                        board.push(move)
                        game["last_move_time"] = datetime.now().isoformat()
                        game["turn"] = chess.BLACK if current_turn == chess.WHITE else chess.WHITE
                    else:
                        logging.warning(f"chess_demo: Illegal move or no move returned by {self.name} on board {game['board_id']}: {move}")
                else:
                    logging.info(f"chess_demo: Game on board {game['board_id']} is over.")
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

                    # Update opponent data
                    opponent_name = game["player2"].name if self == game["player1"] else game["player1"].name
                    if opponent_name not in self.opponents:
                        self.opponents[opponent_name] = {"games_played": 0}
                    self.opponents[opponent_name]["games_played"] += 1

                    logging.info(f"chess_demo: Updated ELO: {winner.name} {winner.elo}, {loser.name} {loser.elo}")

                    # Save updated profiles to file
                    save_profiles()

                    # Save the game to PGN file
                    save_game_to_pgn(game, board, result)

            except Exception as e:
                logging.error(f"chess_demo: Error in game on board {game['board_id']}: {e}")

    def play_games(self):
        while True:
            ongoing_games = [game_info for game_info in self.games if not boards[game_info["game"]["board_id"]]["board"].is_game_over()]
            for game_info in ongoing_games:
                self.play_game(game_info)
            time.sleep(0.1)

    def quit(self):
        self.engine.quit()

    def to_dict(self):
        profile_dict = {
            "name": self.name,
            "elo": self.elo,
            "profile_image": self.profile_image,
            "uci_elo": self.uci_elo,
            "opponents": self.opponents
        }
        return profile_dict

def load_player_profiles(stockfish_path):
    with open("player_profiles.json", "r") as file:
        profiles = json.load(file)
    return {name: PlayerProfile(name, data, stockfish_path) for name, data in profiles.items()}

def save_profiles():
    profiles = {name: profile.to_dict() for name, profile in player_profiles.items()}
    with open("player_profiles.json", "w") as file:
        json.dump(profiles, file, indent=4)
    logging.info("chess_demo: Saved updated player profiles to player_profiles.json")

def calculate_elo(player_elo, opponent_elo, result):
    K = 30
    expected_score = 1.0 * 1.0 / (1 + 1.0 * math.pow(10, 1.0 * (player_elo - opponent_elo) / 400))
    return round(player_elo + K * (result - expected_score))

def save_game_to_pgn(game, board, result):
    player1, player2 = game["player1"], game["player2"]
    opponent_name = player2.name if player1 == game["player1"] else player1.name
    round_number = player1.opponents[opponent_name]["games_played"]

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
        pgn_file.write(str(game_pgn) + "\n\n")
    logging.info("chess_demo: Saved game to PGN file")

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

    logging.info(f"chess_demo: creates_games: {created_games}")
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
    logging.debug("chess_demo: Boards requested: %s", response)
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
    logging.debug("chess_demo: Rendering index.html with boards: %s", boards_info)
    return render_template('index.html', boards=boards_info)

if __name__ == '__main__':
    app.run(port=5000)
