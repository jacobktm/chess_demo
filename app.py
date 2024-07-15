from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Mock data for boards
boards = [{'id': i} for i in range(6)]

@app.route('/')
def index():
    return render_template('index.html', boards=boards)

@app.route('/start_games', methods=['POST'])
def start_games():
    # Logic to start games
    return '', 204

@app.route('/get_boards')
def get_boards():
    return jsonify({'boards': boards})

@app.route('/get_board/<int:board_id>')
def get_board(board_id):
    # Logic to get the current state of the board
    # Example response
    board_data = {
        'id': board_id,
        'pgn': '[Event ""]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4'
    }
    return jsonify(board_data)

if __name__ == '__main__':
    app.run(debug=True)

