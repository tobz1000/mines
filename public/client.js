"use strict";

/* TODO: on game over, reveal whole game and stop click actions */

let $gameArea, game;

$(() => {
	$gameArea = $("#gameArea");
	$gameArea.on('contextmenu', (e) => { e.preventDefault() });
})

const newGame = () => {
	const getVal = (id, defaultVal) => {
		return parseInt($(`#${id}`).val(), 10) || defaultVal;
	}

	const x = getVal(`dims0`, 10);
	const y = getVal(`dims1`, 10);
	const mines = getVal(`mineCount`, 10);

	action(
		{ action: 'newGame', dims: [x, y], 	mines: mines },
		resp => {
			game = new ClientGame(resp.id, resp.dims, resp.mines, $gameArea);
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
		respFn(resp);

		if(resp.gameOver)
			showMsg(resp.win ? "Win!!!1" : "Lose :(((");
	}, 'json');
};

const ClientGame = function(id, dims, mines, $gameArea) {
	const cellState = {
		UNKNOWN : "u",
		FLAGGED : "f"
	}
	if(dims.length !== 2)
		throw new Error("Only 2d games supported!");

	/*	Non-DOM representation of game state.
		TOOD: speed-test this versus only recording game state in DOM (i.e. with
		<td> classes) */
	const gameGrid = [];

	const clearCells = coordsArr => {
		action({ action:'clearCells', id:id, coords:coordsArr }, resp => {
			for(let cellInfo of resp.newCellData)
				changeState(
					cellInfo.coords, cellInfo.state, cellInfo.surrounding
				);
		});
	};

	const clearSurrounding = coords => {
		let surrCoords = [];
		for (let i of [-1, 0, 1])
			for (let j of [-1, 0, 1]) {
				if(i === 0 && j === 0)
					continue;

				let x = coords[0] + i, y = coords[1] + j;

				if(x < 0 || y < 0 || x > dims[0] - 1 || y > dims[1] - 1)
					continue;

				/*	Don't clear an already-cleared cell, or a flagged cell */
				if(gameGrid[x][y] !== cellState.UNKNOWN)
					continue;

				surrCoords.push([x, y]);
			}
		if(surrCoords.length > 0)
			clearCells(surrCoords);
	}

	const cellId = coords => {
		return `cell-${coords[0]}-${coords[1]}`;
	}

	const changeState = (coords, newStateName, surrCount) => {
		const states = {
			flagged : {
				gridState : cellState.FLAGGED,
				class : 'cellFlagged',
				rightClick : () => { changeState(coords, 'unknown'); },
			},
			mine : {
				class : 'cellMine'
			},
			unknown : {
				gridState : cellState.UNKNOWN,
				class : 'cellUnknown',
				click : () => { clearCells([coords]); },
				rightClick: () => { changeState(coords, 'flagged'); }
			},
			cleared : {
				gridState : surrCount,
				class : 'cellCleared',
				text : surrCount > 0 ? surrCount : undefined,
				click : surrCount > 0 ?
					() => { clearSurrounding(coords); } : undefined
			}
		};

		const newState = states[newStateName];
		if(!newState)
			throw new Error(`unexpected cell state: "${newStateName}"`);

		const $cell = $(`#${cellId(coords)}`);

		$cell.off('click contextmenu');

		for(const s in states)
			if(s !== newStateName && states[s].class)
				$cell.removeClass(states[s].class);

		gameGrid[coords[0]][coords[1]] = newState.gridState;
		$cell.addClass(newState.class);
		$cell.text(newState.text);
		$cell.on('click', newState.click);
		$cell.on('contextmenu', newState.rightClick);
	}

	$gameArea.empty();

	for(let i = 0; i < dims[0]; i++) {
		gameGrid[i] = [];
		let $row = $("<tr>");
		$gameArea.append($row);

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
