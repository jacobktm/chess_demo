#!/usr/bin/env python3

import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
import chess
import chess.engine
import time
import threading
from queue import Queue, Empty
import chess.pgn
from datetime import datetime
import random
import json
import os

class PlayerProfiles():

    def __init__(self):
        with open("player_profiles.json", "r") as file:
            self.profiles = json.load(file)
            self.player_names = list(self.profiles.keys())

    def save(self):
        with open("player_profiles.json", "w") as file:
            json.dump(self.profiles, file)

    def __getitem__(self, key):
        return self.profiles[key]
    
    def get_random_pairing(self):
        return random.sample(self.player_names, 2)

player_profiles = PlayerProfiles()

# Function to update ELO ratings
def update_elo(player1, player2, result):
    K = 32  # K-factor for Elo rating system
    expected_score1 = 1 / (1 + 10 ** ((player_profiles[player2]["elo"] - player_profiles[player1]["elo"]) / 400))
    expected_score2 = 1 - expected_score1
    if result == "1-0":
        actual_score1 = 1
        actual_score2 = 0
    elif result == "0-1":
        actual_score1 = 0
        actual_score2 = 1
    else:
        actual_score1 = 0.5
        actual_score2 = 0.5

    player_profiles[player1]["elo"] += K * (actual_score1 - expected_score1)
    player_profiles[player2]["elo"] += K * (actual_score2 - expected_score2)

# Function to run Stockfish engine for a single game on a single board
def run_game(queue, stop_event, board_number, player_engines):
    global game_counter

    while not stop_event.is_set():
        with game_counter_lock:
            game_counter += 1

        # Randomize pairings and colors
        player1, player2 = player_profiles.get_random_pairing()

        # Retrieve the pre-initialized engines for each player
        engine1 = player_engines[player1]
        engine2 = player_engines[player2]

        board = chess.Board()

        if random.choice([True, False]):
            white_player = player1
            black_player = player2
        else:
            white_player = player2
            black_player = player1

        white_elo_before = int(player_profiles[white_player]["elo"])
        black_elo_before = int(player_profiles[black_player]["elo"])

        game = chess.pgn.Game()
        game.headers["White"] = white_player
        game.headers["Black"] = black_player
        game.headers["Date"] = datetime.now().strftime("%Y.%m.%d")
        game.headers["Event"] = "The Enchanted Chess Invitational"
        game.headers["Site"] = "SIGGRAPH"
        game.headers["Round"] = str(game_counter)
        game.headers["WhiteElo"] = str(white_elo_before)
        game.headers["BlackElo"] = str(black_elo_before)

        ponder_move = None

        while not board.is_game_over() and not stop_event.is_set():
            if board.turn == chess.WHITE:
                result = engine1.play(board, chess.engine.Limit(depth=player_profiles[white_player]["depth"]), info=chess.engine.INFO_PV, ponder=ponder_move)
            else:
                result = engine2.play(board, chess.engine.Limit(depth=player_profiles[black_player]["depth"]), info=chess.engine.INFO_PV, ponder=ponder_move)
            board.push(result.move)
            ponder_move = result.ponder if player_profiles[white_player]["ponder"] or player_profiles[black_player]["ponder"] else None
            queue.put((board.copy(), white_player, black_player, board_number))

        result = board.result(claim_draw=True)
        game.headers["Result"] = result
        node = game
        for move in board.move_stack:
            node = node.add_variation(move)

        # Update ELO ratings
        update_elo(white_player, black_player, result)

        # Save the game to a PGN file
        save_game_to_pgn(game)

        # Save player profiles
        player_profiles.save()

# Function to update the GUI board
def update_gui_board(gui_board, board, images, square_size, white_player, black_player, white_profile, black_profile):
    gui_board.delete("all")
    for i in range(8):
        for j in range(8):
            x1, y1 = i * square_size + 140, j * square_size
            x2, y2 = x1 + square_size, y1 + square_size
            color = "white" if (i + j) % 2 == 0 else "gray"
            gui_board.create_rectangle(x1, y1, x2, y2, fill=color)
            piece = board.piece_at(chess.square(i, 7-j))
            if piece:
                image = images[piece.symbol()]
                gui_board.create_image(x1 + square_size // 2, y1 + square_size // 2, image=image)

    # Function to split player names into two lines
    def split_name(name):
        words = name.split()
        if len(words) == 4:
            return f"{words[0]} {words[1]}\n{words[2]} {words[3]}"
        else:
            return name

    # Display player names, ELO ratings, and profile pictures
    gui_board.create_text(70, 15, text=split_name(black_player), font=("Arial", 10), fill="black")
    gui_board.create_text(70, 45, text=f"ELO: {int(player_profiles[black_player]['elo'])}", font=("Arial", 9), fill="black")
    gui_board.create_image(70, 65, image=black_profile, anchor="n")

    gui_board.create_image(70, 415, image=white_profile, anchor="s")
    gui_board.create_text(70, 435, text=f"ELO: {int(player_profiles[white_player]['elo'])}", font=("Arial", 9), fill="black")
    gui_board.create_text(70, 460, text=split_name(white_player), font=("Arial", 10), fill="black")

# Function to process the queue and update the GUI
def process_queue(queue, gui_boards, images, square_size, profiles, stop_event):
    try:
        while True:
            board, white_player, black_player, board_number = queue.get_nowait()
            update_gui_board(gui_boards[board_number], board, images, square_size, white_player, black_player, profiles[white_player], profiles[black_player])
    except Empty:
        pass
    if not stop_event.is_set():
        root.after(16, process_queue, queue, gui_boards, images, square_size, profiles, stop_event)

# Load piece images
def load_images(square_size):
    pieces = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p']
    images = {}
    for piece in pieces:
        filename = f'images/{piece}.png'  # Ensure you have these images in the current directory
        image = Image.open(filename)
        images[piece] = ImageTk.PhotoImage(image.resize((square_size, square_size)))
    return images

# Load profile images
def load_profiles():
    profiles = {}
    for player, data in player_profiles.items():
        profiles[player] = ImageTk.PhotoImage(Image.open(f"images/{data['profile_image']}").resize((100, 100)))
    return profiles

# Function to save a single game to a PGN file
def save_game_to_pgn(game, filename="games.pgn"):
    with open(filename, "a") as f:
        exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=True)
        f.write(game.accept(exporter) + "\n\n")

# Main function to set up the GUI and run the game
def main():
    global root
    stockfish_path = "./.venv/bin/stockfish"  # Replace with the correct path to your Stockfish binary
    players = list(player_profiles.keys())

    # Initialize game counter and lock
    global game_counter
    global game_counter_lock
    game_counter = 0
    game_counter_lock = threading.Lock()

    # Initialize Tkinter root
    root = tk.Tk()
    root.title("Whimsical Chess Players")
    
    # GUI settings
    board_size = 480
    square_size = board_size // 8
    padding = 20

    # Load piece images
    images = load_images(square_size)

    # Load profile images
    profiles = load_profiles()

    # Create GUI boards
    frames = []
    gui_boards = []
    for i in range(2):
        frame = ttk.Frame(root, width=board_size + 140, height=board_size)  # Adjust width to accommodate text and profile pictures
        frame.grid(row=0, column=i, padx=padding, pady=padding)
        gui_board = tk.Canvas(frame, width=board_size + 140, height=board_size)  # Adjust width to accommodate text and profile pictures
        gui_board.pack()
        frames.append(frame)
        gui_boards.append(gui_board)

    # Set up game queue and stop event
    queue = Queue()
    stop_event = threading.Event()

    # Create player engines
    player_engines = {}
    for player in players:
        engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        engine.configure({
            "UCI_LimitStrength": True,
            "UCI_Elo": max(player_profiles[player]["uci_elo"], 1320)
        })
        player_engines[player] = engine

    # Start the game threads
    game_threads = []
    for board_number in range(2):
        game_thread = threading.Thread(target=run_game, args=(queue, stop_event, board_number, player_engines))
        game_threads.append(game_thread)
        game_thread.start()

    # Start GUI update process
    root.after(16, process_queue, queue, gui_boards, images, square_size, profiles, stop_event)

    # Handle window close event
    def on_closing():
        stop_event.set()
        for engine in player_engines.values():
            engine.quit()
        root.quit()

    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()

    for game_thread in game_threads:
        game_thread.join()

if __name__ == "__main__":
    main()

