"use strict";

/* TODO: on game over, reveal whole game and stop click actions */

let $gameArea, game;

$(() => {
	$gameArea = $("#gameArea");
	$gameArea.on('contextmenu', (e) => { e.preventDefault() });
});

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
			game = new ClientGame(resp.id, pass, resp.dims, resp.mines,
					$gameArea);
		}
	);
};

const action = (req, respFn) => {
	const showMsg = msg => {
		$("#gameInfo").text(msg).show()
	}

	/* TODO - proper 'fail' handler, once the server gives proper HTTP codes */
	$.post('action', JSON.stringify(req), resp => {
		if(resp.error) {
			let errMsg = `Server error: ${resp.error}`;
			if(resp.info)
				errMsg += `\nInfo: ${JSON.stringify(resp.info)}`;
			showMsg(errMsg);
			return;
		}

		$("#gameInfo").hide();

		if(respFn)
			respFn(resp);

		if(resp.gameOver)
			showMsg(resp.win ? "Win!!!1" : "Lose :(((");
	}, 'json');
};

const ClientGame = function(id, pass, dims, mines, $gameArea) {
	const cellState = {
		UNKNOWN : "u",
		FLAGGED : "f"
	}

	new EventSource(`watch?id=${id}&from=0`)
		.addEventListener('message', (resp) => {
			const turnNumber = Number(resp.lastEventId);
			newTurn(JSON.parse(resp.data).newCellData, turnNumber);
			updateGrid(turnNumber);
			latestTurn = turnNumber;
		});

	const newTurn = (data, count) => {
		console.log(count);
		console.log(data);
		gameTurns[count] = data;
		$("#turnList").append($("<li>")
			.click(() => { updateGrid(count); })
			.text("Turn")
			.attr("value", count)
		);
	}

	const updateGrid = newTurnNumber => {
		const rev = newTurnNumber < currentTurn;
		const start = (rev ? newTurnNumber : currentTurn) + 1;
		const end = rev ? currentTurn : newTurnNumber;

		for (let i = start; i <= end; i++) {
			for (let cellData of gameTurns[i]) {
				changeState(
					cellData.coords,
					rev ? 'unknown' : cellData.state,
					cellData.surrounding
				);
			}
		}

		currentTurn = newTurnNumber;
	}

	if(dims.length !== 2)
		throw new Error("Only 2d games supported!");

	/*	Non-DOM representation of game state.
		TOOD: speed-test this versus only recording game state in DOM (i.e. with
		<td> classes) */
	const gameGrid = [];
	/* List of lists of cellDatas, to represent each turn in the game. */
	const gameTurns = [];
	let currentTurn = 0;
	let latestTurn = 0;

	const clearCells = coordsArr => {
		action({
			action : 'clearCells',
			id : id,
			pass: pass,
			coords : coordsArr
		});
	};

	/* Get surrounding co-ordinates that aren't cleared or flagged. */
	const surroundingUnknownCoords = coords => {
		let ret = [];
		for (let i of [-1, 0, 1])
			for (let j of [-1, 0, 1]) {
				if(i === 0 && j == 0)
					continue;

				let x = coords[0] + i, y = coords[1] + j;

				if(x < 0 || y < 0 || x > dims[0] - 1 || y > dims[1] - 1)
					continue;

				if(gameGrid[x][y] !== cellState.UNKNOWN)
					continue;

				ret.push([x, y]);
			}
		return ret;
	};

	/* TODO: figure out a nice way to stop the flashing when the cursor moves
	between two cells. Probably use border-collapse on the table, then some
	other CSS to retain the white edges on cells. */
	const hoverSurrounding = (coords, hoverOn) => {
		let surrCoords = surroundingUnknownCoords(coords);
		for(const coords of surrCoords)
			$getCell(coords).toggleClass("cellHover", hoverOn);
	}

	const clearSurrounding = (coords) => {
		let surrCoords = surroundingUnknownCoords(coords);
		if(surrCoords.length > 0)
			clearCells(surrCoords);

		hoverSurrounding(coords, false);
	}

	const cellId = coords => {
		return `cell-${coords[0]}-${coords[1]}`;
	}

	const $getCell = coords => {
		return $(`#${cellId(coords)}`);
	}

	const changeState = (coords, newStateName, surrCount) => {
		const states = {
			flagged : {
				gridState : cellState.FLAGGED,
				class : 'cellFlagged',
				contextmenu : () => { changeState(coords, 'unknown'); },
			},
			mine : {
				class : 'cellMine'
			},
			unknown : {
				gridState : cellState.UNKNOWN,
				class : 'cellUnknown',
				click : () => { clearCells([coords]); },
				contextmenu : () => { changeState(coords, 'flagged'); },
				mouseover : () => { $getCell(coords).addClass('cellHover'); },
				mouseout : () => { $getCell(coords).removeClass('cellHover'); }
			},
			cleared : {
				gridState : surrCount,
				class : 'cellCleared',
				text : surrCount > 0 ? surrCount : undefined,
				click : surrCount > 0 ?
					() => { clearSurrounding(coords); } : undefined,
				mouseover : surrCount > 0 ?
					() => { hoverSurrounding(coords, true); } : undefined,
				mouseout : surrCount > 0 ?
					() => { hoverSurrounding(coords, false); } : undefined
			}
		};

		/* Disable user game actions when viewing a past turn */
		const ifLatestTurn = func => {
			if (func && currentTurn === latestTurn)
				func();
		};

		const newState = states[newStateName];
		if(!newState)
			throw new Error(`unexpected cell state: "${newStateName}"`);

		const $cell = $getCell(coords);

		/* Reverse any current mouseover effect */
		$cell.mouseout();
		$cell.off();
		$cell.text("");

		for(const s in states)
			if(s !== newStateName && states[s].class)
				$cell.removeClass(states[s].class);

		gameGrid[coords[0]][coords[1]] = newState.gridState;
		$cell.addClass(newState.class);
		$cell.text(newState.text);

		/* Apply mouse actions to cell */
		for (let mouseAction of [
			'click',
			'contextmenu',
			'mouseover',
			'mouseout'
		]) {
			if(newState[mouseAction]) {
				/* Check game is on latest move before performing action */
				$cell.on(mouseAction, () => {
					if(currentTurn === latestTurn)
						newState[mouseAction]();
				});
			}
		}

		/* TODO: this is to meant to highlight surrounding cells right after
		clicking an unknown cell. Doesn't work (:hover is false); don't know
		why. */
		// if($cell.is(":hover"))
		// 	$cell.mouseover();
	}

	$gameArea.empty();

	let $gameTable = $("<table>");
	$gameArea.append($gameTable);
	$gameArea.append($("<ol>").attr("id", "turnList"));

	for(let i = 0; i < dims[0]; i++) {
		gameGrid[i] = [];
		let $row = $("<tr>");
		$gameTable.append($row);

		for(let j = 0; j < dims[1]; j++) {
			$row.append(
				$("<td>")
					.attr('id', cellId([i, j]))
					.addClass("cell")
			);
			changeState([i, j], 'unknown');
		}
	}
}
