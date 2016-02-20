"use strict";
const express = require('express');
const sse = require('express-eventsource');
const _ = require('underscore');
const nd = require('ndarray');
require('coffee-script/register');
const ty = require('assert-type');
const fs = require('fs');

const GAME_ID_LEN = 5;
const PUBLIC_HTML_DIR = 'public';

/* Validation definitions */
const TY_DIMS = ty.arr.of([ty.int.pos, ty.int.pos]);
const TY_COORDS_LIST = ty.arr.ne.of(ty.arr.of([ty.int.nonneg, ty.int.nonneg]));

const MinesError = function(error, info) {
	this.error = error;
	this.info = info;
}

const serverInit = () => {
	express()
		.use(express.static(PUBLIC_HTML_DIR))
		.use('/games', (req, resp, next) => {
			sseReplayer(gameLister, req, resp, next);
		})
		.use('/watch', (req, resp, next) => {
			sseReplayer(getGame(req.query.id).broadcaster, req, resp, next);
		})
		.post('/action', postResponse)
		.listen(1066);
}

/* Hacky; uses sse's reconnection replay to get all events from a given
point in history. */
const sseReplayer = (sse, req, resp, next) => {
	if(!req.get('last-event-id') && req.query.from !== undefined)
		req.headers['last-event-id'] = Number(req.query.from) - 1;

	sse.middleware()(req, resp, next);
}

const gameLister = sse({ history : Infinity });
gameLister.sendGames = () => {
	let gameStates = [];
	for(let id in games)
		gameStates.push(games[id].gameState());

	gameLister.send(gameStates);
}

let games = [];

const getGame = id => {
	let game = games[id];
	if(!game)
		throw new Error(`unknown game id: "${id}"`);
	return game;
};

/*	TODO: can't figure out how to process multiple requests at once!
	Seems post requests are queued, and a new one isn't started until the
	response for the last one is end()ed. */
const postResponse = (req, resp) => {
	let body = "";
	req.on('data', chunk => {
		body += chunk;
	});
	req.on('end', () => {
		let responseObj;
		try {
			responseObj = performAction(JSON.parse(body));
		} catch(e) {
			if(e instanceof SyntaxError)
				responseObj = { error: "malformed JSON request data" };
			else if (e instanceof MinesError) {
				responseObj = e;
				console.log(
					`Problem with client request: ${JSON.stringify(e)}`
				);
			} else {
				console.error(`Unhandled error: ${e.stack}`);
				responseObj = { error: "unknown error" };
			}
		}
		/* TODO: Proper http response codes */
		resp.end(JSON.stringify(responseObj));
	});
};

/* TODO: actual db. */
const db = {
	save : (gameState) => {
		fs.writeFile(`saves/${gameState.id}`, JSON.stringify(gameState));
	},
	load : (id) => {
		return JSON.parse(fs.readFileSync(`saves/${id}`))
	}
};

/* Performs the action requested by a player. Returns the gameState, and
broadcasts it. */
const performAction = req => {
	let actionName, gameAction, game;

	const newGameId = () => {
		let id;
		do { /* Avoid game id collision */
			id = Math.random().toString(36).substr(2, GAME_ID_LEN);
		} while(games[id]);
		return id;
	}

	/* Construct a Game and perform initialisation tasks */
	const registerGame = (id, pass, dims, mines, gridArray) => {
		if(games[id])
			throw new Error(`Tried to overwrite game id: "${id}"`);
		game = new Game(id, pass, dims, mines, gridArray);

		/* Save initial state to db to play again */
		db.save(game.gameState({ showGridArray: true }));

		/* Add to list of currently active games */
		games[id] = game;

		/* Update broadcasted list of games */
		gameLister.sendGames();
	}

	/* TODO: These can probably inherit a base GameAction class? */
	const actions = {
		newGame : {
			paramChecks : ty.obj.with({
				dims : TY_DIMS,
				mines : ty.int.pos,
				pass : ty.str.ne
			}),
			func : () => {
				registerGame(
					newGameId(),
					req.pass,
					req.dims,
					req.mines
				);
			}
		},

		clearCells : {
			paramChecks : ty.obj.with({
				id : ty.str.ne,
				pass :  ty.str.ne,
				coords : TY_COORDS_LIST
			}),
			func : () => {
				game = getGame(req.id);
				if(game.pass !== req.pass)
					throw new MinesError("Incorrect password!");
				game.clearCells(req.coords);
			}
		},

		/* TODO:
			optional game constructor param for initial board/mine positions;
			game.dump(): save dims and initial board/mine positions;
			saveGameParams();
			loadGameParams();
		probably save to file(s) at first; look at a db eventually */
		loadGame : {
			paramChecks : ty.obj.with({
				id : ty.str.ne
			}),
			func : () => {
				const params = db.load(req.id);
				registerGame(
					newGameId(),
					req.pass,
					params.dims,
					params.mines,
					params.gridArray
				);
			}
		}
	};

	if(!(actionName = req.action))
		throw new MinesError("no action specified",
			{ available_actions: Object.keys(actions) });

	if(!(gameAction = actions[actionName]))
		throw new MinesError("unknown action", {
			requested_action: actionName,
			available_actions: Object.keys(actions)
		});

	/*	Delete action at this point for a less confusing error message
		(when comparing supplied vs required, since the required list won't
		contain "action:string") */
	delete(req.action);
	try {
		ty.Assert(gameAction.paramChecks)(req);
	} catch(e) {
		if(e instanceof ty.TypeAssertionError) {
			throw new MinesError(
				`invalid parameters supplied for action "${actionName}"`,
				{
					required_params : ty.Describe(gameAction.paramChecks),
					supplied_params : req
				}
			);
		}
		else throw e;
	}
	gameAction.func();
	const gameState = game.gameState({ showLastCells: true });
	game.broadcaster.send(gameState);
	return gameState;
}

const Game = function(id, pass, dims, mines, gridArray) {
	const cellState = {
		EMPTY: 'empty',
		MINE: 'mine',
		CLEARED: 'cleared',
		UNKNOWN: 'unknown'
	};

	this.pass = pass;
	const size = dims.reduce((a, b) => a * b);
	const max_mines = size - 1;

	if (mines > max_mines)
		throw new MinesError("too many mines!", {
			requested_size : size,
			max_mines : max_mines,
			requested_mines : mines,
		});

	let gameOver = false;
	let win = false;
	let cellsRem = size - mines;
	/* Information about the last cell(s) cleared */
	let lastUserCells = [];

	gridArray = gridArray || _.shuffle(new Array(size)
		.fill(cellState.MINE, 0, mines)
		.fill(cellState.EMPTY, mines, size)
	)
	const gameGrid = nd(gridArray, dims);

	/* multi-dim version - broken. */
	// const surroundingCoords = function*() {
	// 	const iter = (baseCoords, modCoords, dim) => {
	// 		if(dim === 0) {
	// 			/* Don't count the central cell itself */
	// 			if(baseCoords.every((dim) => { return dim === 0; }))
	// 				return 0;

	// 			let newCoords = baseCoords.map((base, i) => {
	// 				return base + modCoords[i];
	// 			});

	// 			let state = gameGrid.get.apply(this, newCoords);
	// 			return state === cellState.MINE ? 1 : 0;
	// 		}

	// 		let ret = 0;
	// 		for(let i of [-1, 0, 1]) {
	// 			modCoords[dim - 1] = i;
	// 			ret += iter(baseCoords, modCoords, dim - 1);
	// 		}

	// 		return ret;
	// 	};

	// 	return iter(coords, [], coords.length);
	// }

	/* Yields coordinates of surrounding cells */
	const surroundingCoords = coords => {
		let ret = [];
		for (let i of [-1, 0, 1])
			for (let j of [-1, 0, 1]) {
				if(i === 0 && j == 0)
					continue;

				let x = coords[0] + i, y = coords[1] + j;

				if(x < 0 || y < 0 || x > dims[0] - 1 || y > dims[1] - 1)
					continue;

				ret.push([x, y]);
			}
		return ret;
	};

	/* Representation of a cell in the grid. gets/sets gameGrid state. */
	const Cell = function(coords) {
		this.surroundCount = () => {
			let surrCount = 0;

			for(let surrCoords of surroundingCoords(coords))
				if(new Cell(surrCoords).getState() === cellState.MINE)
					surrCount++;

			return surrCount;
		}

		this.getState = () => { return gameGrid.get(coords[0], coords[1]); };

		/* multidim version */
		//this.getState = () => gameGrid.get.apply(this, coords);

		/* multidim version */
		//this.uncover = () => {
		//	/*	ndarray.get needs coords as individual args, plus our new value
		//		on the end. So we have to duplicate coords and add the value
		//		to the end. */
		//	let args = coords.slice();
		//	args.push(cellState.CLEARED);
		//	gameGrid.set.apply(this, args);
		//};

		this.uncover = () => {
			if(this.getState() === cellState.MINE)
				gameOver = true;

			else if(this.getState() === cellState.EMPTY) {
				gameGrid.set(coords[0], coords[1], cellState.CLEARED);

				if(--cellsRem <= 0) {
					gameOver = true;
					win = true;
				}
			}
		};

		/* Information the player is allowed to know */
		this.userCell = () => {
			let state = this.getState(), surrounding;

			if(gameOver || state === cellState.CLEARED)
				surrounding = this.surroundCount();
			else
				state = cellState.UNKNOWN;

			return {
				coords : coords,
				surrounding : surrounding,
				state : state
			};
		};
	};

	this.broadcaster = sse({ history : Infinity });

	/*	Returns game info for the user or database. */
	/* TODO: default parameters not working in Node :( */
	this.gameState = (options) => {
		options = options || {}
		let state = {
			id : id,
			gameOver : gameOver,
			win : win,
			dims : dims,
			mines : mines,
			cellsRem : cellsRem
		};

		/* Clear lastUserCells after sending. */
		if(options.showLastCells) {
			state.newCellData = lastUserCells;
			lastUserCells = [];
		}

		if(options.showGridArray) {
			state.gridArray = gameGrid.data;
		}

		return state;
	};

	/* TODO: if the player loses, add all mines to lastUserCells */
	this.clearCells = coordsArr => {
		if(gameOver)
			throw new MinesError("Game over!");

		let coords;
		while(coords = coordsArr.pop()) {
			let cell = new Cell(coords);
			if(cell.getState() === cellState.CLEARED)
				continue;

			cell.uncover();

			lastUserCells.push(cell.userCell());
			if(cell.surroundCount() === 0) {
				for(let surrCoords of surroundingCoords(coords)) {
					coordsArr.push(surrCoords);
				}
			}
		}
	}
}

serverInit();
