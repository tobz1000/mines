"use strict";
const http = require('http');
const underscore = require('underscore');
const nd = require('ndarray');

http.createServer((req, resp) => {
	// Set CORS headers- https://gist.github.com/balupton/3696140
	resp.setHeader('Access-Control-Allow-Origin', '*');
	resp.setHeader('Access-Control-Request-Method', '*');
	resp.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
	resp.setHeader('Access-Control-Allow-Headers', '*');

	let body = "";
	req.on('data', function (chunk) {
		body += chunk;
	});
	req.on('end', () => {
		let responseObj;
		try {
			responseObj = handleRequest(JSON.parse(body));
		} catch(e) {
			let errMsg;
			if(e instanceof SyntaxError)
				errMsg = "malformed_request";
			else if (e.errType === "MineCount")
				errMsg = "more mines than cells!";
			else
			{
				console.log("Unhandled error: " + e.stack);
				errMsg = "unknown_error";
			}

			responseObj = { error: errMsg };
		}

		resp.end(JSON.stringify(responseObj));
	});
}).listen(1066);

let games = {};

const handleRequest = req => {
	switch(req.action) {
		case "newGame":
			let game;
			do /* Avoid overwriting existing game */
				game = new Game(req.dims, req.mines);
			while(games[game.gameState().id])

			games[game.gameState().id] = game;

			return game.gameState();
			break;

		case "clear":
			return games[req.id].clearCell(req.dims);
			break;

		case "endGame":
			return games[req.id].reveal();

		return { error: "no action specified" };
	}
}

const Game = function(dims, mines) {
	const cellState = {
		EMPTY: 0,
		MINE: 1,
		CLEARED: 2
	}

	const size = dims[0]*dims[1];
	if (mines > size) {
		throw { errType: "MineCount" };
	}

	const id = Math.random().toString(36).substr(2,10);
	let gameOver = false;
	let win = false;
	let cellsRem = size - mines;

	const gameGrid = nd(underscore.shuffle(
			new Array(size)
					.fill(cellState.MINE, 0, mines)
					.fill(cellState.EMPTY, mines, size)
	), dims);

	if(size < 20)
		console.log(gameGrid);

	this.gameState = cell => {
		return {
			id: id,
			gameOver: gameOver,
			win: win,
			dims: dims,
			mines: mines,
			cellsRem: cellsRem,
			cell: cell
		}
	}

	this.clearCell = dims => {
		/* Representation of a cell in the grid. gets/sets gameGrid state. */
		let cell = {
			set: val => { gameGrid.set(dims[0], dims[1], val); },
			state: () => { return gameGrid.get(dims[0], dims[1]); }
		};

		cell.surrounding = 0;
		for (let i of [-1, 0, 1])
			for (let j of [-1, 0, 1])
				if(		(i !== 0 || j !== 0) &&
						gameGrid.get([dims[0]+i],[dims[1]+j]) === cellState.MINE)
					cell.surrounding++;

		if(!gameOver)
		{
			if(cell.state() === cellState.MINE)
				gameOver = true;

			else if (cell.state() === cellState.EMPTY) {
				cell.set(cellState.CLEARED);
				if(--cellsRem <= 0) {
					gameOver = true;
					win = true;
				}
			}
		}

		return this.gameState({
			dims: dims,
			surrounding: cell.surrounding
		});
	}

	this.reveal = () => {
		gameOver = true;
		return this.gameState(gameGrid.data);
	}
}