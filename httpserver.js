const http = require('http');
const underscore = require('underscore');
const twoD = require('2d-array');

http.createServer((req, resp) => {
	var body = "";
	req.on('data', function (chunk) {
		body += chunk;
	});
	req.on('end', () => {
		resp.end(JSON.stringify(handleRequest(JSON.parse(body))));
	});
}).listen(1066);

var games = [];

const handleRequest = req => {
	switch(req.action) {
		case "newGame":
			do /* Avoid overwriting exising game */
				game = new Game(req.dims, req.mines);
			while(games[game.gameState().id])

			games[game.gameState().id] = game;

			return game.gameState();
			break;

		case "clear":
			return games[req.id].clearCell(dims);
			break;

		case "endGame":
			return games[req.id].reveal();

		return {};
	}
}

const Game = function(dims, mines) {
	const size = dims[0]*dims[1];

	if (mines > size){
		/* throw error */
	}

	const id = Math.random().toString(36).substr(2,10);
	var gameOver = false;
	var win = false;
	var cellsRem = size - mines;

	var gameGrid = twoD(underscore.shuffle(
		new Array(size).fill({}).fill({ mine: true }, 0, mines)
	), dims[1]);

	this.gameState = (cell) => {
		return {
			id: id,
			dims: dims,
			mines: mines,
			gameOver: gameOver,
			win: win,
			cellsRem: cellsRem,
			cell: cell
		}
	}

	this.clearCell = (dims) => {
		var cell = this.gameGrid[dims[0]][dims[1]]

		if(!gameOver)
		{
			if(!cell.surrounding)
			{
				cell.surrounding = 0;
				for (i of [-1, 0, 1])
					for (j of [-1, 0, 1])
						if((i !== 0 || j !== 0) && this.gameGrid[dims[0]+i][dims[1]+j].mine)
							cell.surrounding++;
			}

			if(cell.mine)
				gameOver = true;

			else if (!cell.cleared) {
				cell.cleared = true;
				if(--cellsRem <= 0)
					gameOver = true;
					win = true;
			}
		}

		return this.gameState(cell);
	}

	this.reveal = () => {
		gameOver = true;
		return this.gameState(gameGrid);
	}
}