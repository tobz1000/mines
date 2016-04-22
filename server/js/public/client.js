"use strict";

/* TODO: render latest turn only when switching games, instead of rendering all
in turn. May need to implement something on the server to retrieve the current
turn number. */
/* TODO: store game passwords in cookies */
/* TODO: prettier game list & turn list; highlight current game/turn */

let $gameArea, $gameList, currentGame, gamePasses = [];

$(() => {
	$gameArea = $("#gameArea");
	$gameList = $("#gameList");
	$gameArea.on('contextmenu', (e) => { e.preventDefault() });

	new EventSource(`games?from=0`)
		.addEventListener('message', refreshGameList);
});

const refreshGameList = resp => {
	$gameList.empty();

	for(const g of JSON.parse(resp.data)) {
		/* TODO: race condition for display of "watchable"/"playable", if the
		response from newGame() comes is received after the gameLister entry. */
		const label = `${g.id} (${g.dims[0]}x${g.dims[1]}, ${g.mines}, ` +
				`${gamePasses[g.id] ? "playable" : "watchable"})`;
		$gameList.append($("<li>")
			.text(label)
			.click(() => { displayGame(g, gamePasses[g.id]); })
		);
	}
}

const newGame = () => {
	const getVal = (id, defaultVal) => {
		return parseInt($(`#${id}`).val(), 10) || defaultVal;
	}

	const x = getVal(`dims0`, 10);
	const y = getVal(`dims1`, 10);
	const mines = getVal(`mineCount`, 10);
	const pass = Math.random().toString(36).substr(2, 10);

	action(
		{ action: 'newGame', dims: [x, y], mines: mines, pass: pass },
		resp => {
			gamePasses[resp.id] = pass;
			displayGame(resp, pass);
		}
	);
};

const displayGame = (gameData, pass) => {
	currentGame && currentGame.close();
	currentGame = new ClientGame(
		gameData.id,
		gameData.dims,
		gameData.mines,
		pass,
		true
	);
}

const showMsg = msg => {
	$("#gameInfo").text(msg).show()
}

/* Send a request to the server; optionally perform an action based on the
response. */
const action = (req, respFn) => {
	/* TODO - proper 'fail' handler, once the server gives proper HTTP codes */
	$.post('action', JSON.stringify(req), resp => {
		if(resp.error) {
			let errMsg = `Server error: ${resp.error}`;
			if(resp.info)
				errMsg += `\nInfo: ${JSON.stringify(resp.info)}`;
			showMsg(errMsg);
			return;
		}

		if(respFn)
			respFn(resp);
	}, 'json');
};

/* Optional 'pass' param if game is controllable */
const ClientGame = function(id, dims, mines, pass, debug) {
	const cellState = {
		UNKNOWN : "u",
		FLAGGED : "f"
	}

	const serverWatcher = new EventSource(`watch?id=${id}&from=0`);

	/* Representation of game state; each cell is a 'GameCell'. */
	const gameGrid = [];
	/* List of lists of cellDatas, to represent each turn in the game. */
	const gameTurns = [];
	/* Debug info (which isn't specific to a cell) for each turn */
	const debugInfo = []
	let currentTurn = 0;
	let latestTurn = 0;
	let gameOver = false;

	/* Add turn new data from server to list & GUI */
	const newTurn = (data, count) => {
		gameTurns[count] = data;
		$("#turnList").append($("<li>")
			.click(() => { displayTurn(count); })
			.text("Turn")
			.attr("value", count)
		);
	}

	const displayTurn = newTurnNumber => {
		$gameTable.detach();
		const reverse = newTurnNumber < currentTurn;
		const start = (reverse ? newTurnNumber : currentTurn) + 1;
		const end = reverse ? currentTurn : newTurnNumber;

		for (let i = start; i <= end; i++) {
			for (let cellData of gameTurns[i]) {
				gameGrid[cellData.coords[0]][cellData.coords[1]].changeState(
					reverse ? 'unknown' : cellData.state,
					cellData.surrounding
				);
			}
		}

		$gameArea.prepend($gameTable);
		currentTurn = newTurnNumber;
	}

	/* Perform a turn: send request to server */
	const clearCells = coordsArr => {
		if(!pass)
			throw new Error(`Don't have the password for game '${id}'`);

		action({
			action : 'clearCells',
			id : id,
			pass: pass,
			coords : coordsArr
		});
	};

	const cellId = coords => {
		return `cell-${coords[0]}-${coords[1]}`;
	}

	const $getCell = coords => {
		return $(`#${cellId(coords)}`);
	}

	/* Disable user game actions when viewing a past turn, or someone else's
	game */
	const inPlayState = () => {
		return pass && !gameOver && currentTurn === latestTurn;
	}

	const GameCell = function(coords) {
		let _surroundingUnknownCoords;

		/* Get surrounding co-ordinates that aren't cleared or flagged. */
		const surroundingUnknownCoords = () => {
			if(!_surroundingUnknownCoords) {
				_surroundingUnknownCoords = [];
				for (let i of [-1, 0, 1])
					for (let j of [-1, 0, 1]) {
						if(i === 0 && j === 0)
							continue;

						let x = coords[0] + i, y = coords[1] + j;

						if(x < 0 || y < 0 || x > dims[0] - 1 || y > dims[1] - 1)
							continue;

						if(gameGrid[x][y].state !== cellState.UNKNOWN)
							continue;

						_surroundingUnknownCoords.push([x, y]);
					}
			}
			return _surroundingUnknownCoords;
		};

		/* TODO: figure out a nice way to stop the flashing when the cursor
		moves between two cells. Probably use border-collapse on the table, then
		some other CSS to retain the white edges on cells. Or just use fancy
		fading. */
		const hoverSurrounding = hoverOn => {
			for(const c of surroundingUnknownCoords()){
				$getCell(c).toggleClass("cellHover", hoverOn);
			}
		}

		const clearSurrounding = () => {
			const surrCoords = surroundingUnknownCoords();
			if(surrCoords.length > 0)
				clearCells(surrCoords);

			hoverSurrounding(false);
		}

		this.$elm = $("<td>")
			.attr('id', cellId(coords))
			.addClass("cell laminate");

		/* Change state of one cell; perform internal data & GUI changes */
		this.changeState = (newStateName, surrCount) => {
			const states = {
				flagged : {
					cellState : cellState.FLAGGED,
					class : 'cellFlagged',
					contextmenu : () => { this.changeState('unknown'); },
				},
				mine : {
					class : 'cellMine'
				},
				unknown : {
					cellState : cellState.UNKNOWN,
					class : 'cellUnknown',
					click : () => { clearCells([coords]); },
					contextmenu : () => { this.changeState('flagged'); },
					mouseover : () => { this.$elm.addClass('cellHover'); },
					mouseout : () => { this.$elm.removeClass('cellHover'); }
				},
				cleared : {
					cellState : surrCount,
					class : 'cellCleared',
					text : surrCount > 0 ? surrCount : undefined,
					click : surrCount > 0 ?
						() => { clearSurrounding(); } : undefined,
					mouseover : surrCount > 0 ?
						() => { hoverSurrounding(true); } : undefined,
					mouseout : surrCount > 0 ?
						() => { hoverSurrounding(false); } : undefined
				}
			};

			const newState = states[newStateName];
			if(!newState)
				throw new Error(`unexpected cell state: "${newStateName}"`);

			/* Reverse any current mouseover effect */
			this.$elm.mouseout();
			this.$elm.off();
			this.$elm.text("");

			for(const s in states)
				if(s !== newStateName && states[s].class)
					this.$elm.removeClass(states[s].class);

			this.state = newState.cellState;
			this.$elm.addClass(newState.class);
			this.$elm.text(newState.text);

			/* Apply mouse actions to cell */
			for (let mouseAction of [
				'click',
				'contextmenu',
				'mouseover',
				'mouseout',
				'mouseup'
			]) {
				if(newState[mouseAction]) {
					this.$elm.on(mouseAction, () => {
						if(inPlayState())
							newState[mouseAction]();
					});
				}
			}

			if(debug)
				this.$elm.on('mouseover', () => {
					/* Show the debug info passed from the client on this
					specific turn. */
					/* TODO: what is this C null-checking crap */
					if(
						debugInfo[currentTurn] &&
						debugInfo[currentTurn].cellInfo
					)
						$("#debugAreaCell").html(
							debugInfo[currentTurn].cellInfo[coords]
						);
				});

			/* TODO: this is meant to highlight surrounding cells right after
			clicking an unknown cell. Doesn't work (:hover is false); don't know
			why. */
			// if(this.$elm.is(":hover"))
			// 	this.$elm.mouseover();
		};

		this.changeState('unknown');
	};

	if(dims.length !== 2)
		throw new Error("Only 2d games supported!");

	serverWatcher.addEventListener('message', (resp) => {
		const turnNumber = Number(resp.lastEventId);
		const data = JSON.parse(resp.data);

		newTurn(data.newCellData, turnNumber);
		displayTurn(turnNumber);
		latestTurn = turnNumber;

		if(data.gameOver) {
			gameOver = true;
			showMsg(data.win ? "Win!!!1" : "Lose :(((");
		}
	});

	debug && serverWatcher.addEventListener('debug', (resp) => {
		const turnNumber = Number(resp.lastEventId);
		const data = JSON.parse(resp.data);

		debugInfo[turnNumber] = data;
	});

	let $gameTable = $("<table>");

	for(let i = 0; i < dims[0]; i++) {
		gameGrid[i] = [];
		let $row = $("<tr>");
		$gameTable.append($row);

		for(let j = 0; j < dims[1]; j++) {
			gameGrid[i][j] = new GameCell([i, j]);
			$row.append(gameGrid[i][j].$elm);
		}
	}

	$gameArea.append($("<ol>").attr("id", "turnList").addClass("laminate"));
	$gameArea.append(
		$("<div>").attr("id", "debugArea").append(
			$("<div>").attr("id", "debugAreaCell")
		)
	);

	this.close = () => {
		$gameArea.empty();
		$("#gameInfo").hide();
		serverWatcher.close();
	}
}
