"use strict";
const express = require('express');
const sse = require('express-eventsource');
const _ = require('underscore');
const nd = require('ndarray');
require('coffee-script/register');
const ty = require('assert-type');

const GAME_ID_LEN = 5;
const PUBLIC_HTML_DIR = 'public';

/* Validation definitions */
const TY_DIMS = ty.arr.of([ty.int.pos,ty.int.pos]);
const TY_COORDS_LIST = ty.arr.ne.of(ty.arr.of([ty.int.nonneg,ty.int.nonneg]));

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
		throw new Error(`unknown game  id: ${JSON.stringify(id)}`);
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
			else if (e instanceof MinesError)
				responseObj = e;
			else {
				console.error(`Unhandled error: ${e.stack}`);
				responseObj = { error: "unknown error" };
			}
		}
		/* TODO: Proper http response codes */
		resp.end(JSON.stringify(responseObj));
	});
};

/* Performs the action requested by a player. Returns the gameState, and
broadcasts it. */
const performAction = req => {
	let actionName, gameAction, game;

	/* TODO: These can probably inherit a base GameAction class? */
	const actions = {
		newGame : {
			paramChecks : ty.obj.with({
				dims : TY_DIMS,
				mines : ty.int.pos,
				pass : ty.str.ne
			}),
			func : () => {
				let id;
				do { /* Avoid game id collision */
					id = Math.random().toString(36).substr(2, GAME_ID_LEN);
				} while(games[id]);
				game = new Game(id, req.pass, req.dims, req.mines);
				games[id] = game;
				for(let id in games)
				gameLister.sendGames();
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
	const gameState = game.gameState();
	game.broadcaster.send(gameState);
	return gameState;
}

const Game = function(id, pass, dims, mines) {
	const cellState = {
		EMPTY: 'empty',
		MINE: 'mine',
		CLEARED: 'cleared',
		UNKNOWN: 'unknown'
	};

	this.pass = pass;
	const size = dims.reduce((x, y) => x * y);
	const max_mines = size - 1;

	if(mines % 1 !== 0 || mines < 1)
		throw new MinesError(
			`invalid number of mines specified (${mines})`,
			{ min_mines : 1, max_mines : max_mines }
		);

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

	const gameGrid = nd(_.shuffle(new Array(size)
		.fill(cellState.MINE, 0, mines)
		.fill(cellState.EMPTY, mines, size)
	), dims);

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

	const clearSurrounding = coords => {
		for(let surrCoords of surroundingCoords(coords)) {
			if(gameOver)
				break;

			/* TODO: make getState() callable statically, with coords as params. */
			if(new Cell(surrCoords).getState() !== cellState.CLEARED)
				this.clearCells([surrCoords]);
		}
	}

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
			if(this.getState() === cellState.CLEARED)
				throw new MinesError(
					"Cell already cleared!",
					{ coords : coords }
				)


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

	/*	Returns info to be seen by user (when there are no errors), and resets
		lastUserCells for next turn. */
	this.gameState = verbose => {
		let state = {
			id : id,
			gameOver : gameOver,
			win : win,
			dims : dims,
			mines : mines,
			cellsRem : cellsRem,
			newCellData : lastUserCells
		};
		lastUserCells = [];
		return state;
	};

	/* TODO: if we lose, add all mines to lastUserCells */
	this.clearCells = coordsArr => {
		if(gameOver)
			throw new MinesError("game over!");

		for(let coords of coordsArr) {
			let cell = new Cell(coords);
			cell.uncover();

			lastUserCells.push(cell.userCell());
			if(cell.surroundCount() === 0)
				clearSurrounding(coords);
		}
	}
}

serverInit();
