"use strict";
const express = require('express');
const _ = require('underscore');
const nd = require('ndarray');
require('coffee-script/register');
const ty = require('assert-type');

const GAME_ID_LEN = 10;

/* Validation definitions */
const TY_DIMS = ty.arr.of([ty.int.pos,ty.int.pos]);
const TY_ID = ty.str.ne;

const server = express();

const MinesError = function(error, info){
	this.error = error;
	this.info = info;
}

server.post('/action', (req, resp) => {
	let body = "";
	req.on('data', function (chunk) {
		body += chunk;
	});
	req.on('end', () => {
		let responseObj;
		try {
			responseObj = handleRequest(JSON.parse(body));
		} catch(e) {
			let msg;
			if(e instanceof SyntaxError)
				responseObj = { error: "malformed JSON request data" };
			else if (e instanceof MinesError)
				responseObj = e;
			else
			{
				console.log("Unhandled error: " + e.stack);
				responseObj = { msg: "unknown error" };
			}
		}

		resp.end(JSON.stringify(responseObj));
	});
}).listen(1066);


let games = {};

const handleRequest = req => {
	let actionFn, id;

	/* TODO handle invalid id */
	const actions = {
		newGame : {
			paramChecks : { dims : TY_DIMS, mines : ty.int.pos },
			func : () => {
				let game;
				do /* Avoid overwriting existing game */
					id = Math.random().toString(36).substr(2, GAME_ID_LEN);
				while(games[id]);
				game = new Game(id, req.dims, req.mines);
				games[id] = game;
			}
		},

		clearCell : {
			paramChecks : { id : TY_ID, dims : TY_DIMS },
			func : () => {
				id = req.id;
				games[req.id].clearCell(req.dims);
			}
		},

		// checkCell : {
		// 	paramChecks : { id : TY_ID, dims : TY_DIMS },
		// 	func : () => {
		// 		id = req.id;
		// 		games[req.id].checkCell(req.dims);
		// 	}
		// },

		endGame : {
			paramChecks : { id : TY_ID },
			func : () => {
				id = req.id;
				games[req.id].endGame();
			}
		},

		/* No action, just return current game state. */
		gameState : {
			paramChecks : { id : TY_ID }
		}
	}

	if(!req.action)
		throw new MinesError("no action specified",
			{ available_actions: Object.keys(actions) });

	if(!(actionFn = actions[req.action]))
		throw new MinesError("unknown action", {
			requested_action: req.action,
			available_actions: Object.keys(actions)
		});

	/* TODO: param checks */

	if(actionFn.func)
		actionFn.func();

	return games[id].gameState();
}

const Game = function(id, dims, mines) {
	const cellState = {
		EMPTY: 0,
		MINE: 1,
		CLEARED: 2
	}

	if(mines % 1 !== 0 || mines < 1)
		throw new MinesError("invalid number of mines specified (" + mines +
			")");

	const size = dims[0]*dims[1];
	if (mines > size)
		throw new MinesError("more mines than cells!", {
			requested_size: size,
			requested_mines: mines
		});

	let gameOver = false;
	let win = false;
	let cellsRem = size - mines;
	/* Information about the last cell cleared */
	let userCell;

	const gameGrid = nd(_.shuffle(new Array(size)
		.fill(cellState.MINE, 0, mines)
		.fill(cellState.EMPTY, mines, size)
	), dims);

	this.gameState = verbose => {
		return {
			id : id,
			gameOver : gameOver,
			win : win,
			dims : dims,
			mines : mines,
			cellsRem : cellsRem,
			lastCell : userCell,
			/* TODO: current cellState enums may be confusing for user. Possible
			solution is to create two grids: one for mine positions, and one for
			cleared squares - so the mine grid would just be 0 and 1, easy to
			understand. Additionally, the user could request the 'cleared' grid
			without ending the game. So they could 'save' a game and come back
			to it? */
			grid : gameOver && verbose ? gameGrid : undefined
		}
	}

	this.clearCell = dims => {
		let surrounding;

		if(gameOver)
			throw new MinesError("game over!");

		/* Representation of a cell in the grid. gets/sets gameGrid state. */
		let cell = {
			set: val => { gameGrid.set(dims[0], dims[1], val); },
			state: () => { return gameGrid.get(dims[0], dims[1]); }
		};

		if(cell.state() === cellState.MINE)
			gameOver = true;

		else if (cell.state() === cellState.EMPTY) {
			cell.set(cellState.CLEARED);
			if(--cellsRem <= 0) {
				gameOver = true;
				win = true;
			}
		}

		if(!gameOver) {
			surrounding = 0;
			for (let i of [-1, 0, 1])
				for (let j of [-1, 0, 1])
					if((i !== 0 || j !== 0) && gameGrid.get(
							[dims[0]+i],[dims[1]+j]) === cellState.MINE)
						surrounding++;
		}

		userCell = { dims: dims, surrounding: surrounding };
	}


	/* TODO finish this, merge functionality with clearCell */
	// this.checkCell = (dims) => {
	// 	userCell = { dims: dims, }
	// }

	this.endGame = () => {
		gameOver = true;
	}
}