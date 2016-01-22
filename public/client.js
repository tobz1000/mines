"use strict";

let $gameArea, game;

$(() => {
	$gameArea = $("#gameArea");
})

const action = (req, respFn) => {
	$.post('action', JSON.stringify(req), resp => {
		if(resp.error) {
			let errMsg = "Server error: " + resp.error;
			if(resp.info)
				errMsg += "\nInfo: " + JSON.stringify(resp.info);
			console.error(errMsg);
			return;
		}

		respFn(resp);
	}, 'json');
};

const newGame = (dims, mines) => {
	action({action:'newGame', dims:dims, mines:mines}, resp => {
		game = new ClientGame(resp.id, resp.dims, resp.mines, $gameArea);
	});
};

const ClientGame = function(id, dims, mines, $gameArea) {
	if(dims.length !== 2)
		throw new Error("Only 2d games supported!");

	/*	Non-DOM representation of game state.
		TOOD: speed-test this versus only recording game state in DOM (i.e. with
		<td> classes) */
	const gameGrid = [];
	for (let i = 0; i < dims[0]; i++) {
		gameGrid[i] = [];
		for (let j = 0; j < dims[1]; j++) {
			gameGrid[i][j] = null;
		}
	}

	const clearCell = coords => {
		action({action:'clearCell', id:id, coords:coords}, resp => {
			if(resp.lastCell.coords[0] !== coords[0] ||
					resp.lastCell.coords[1] !== coords[1]) {
				throw new Error("received coordinates do not match: coords=" +
					coords + " response=" + resp);
			}

			/* TODO: a function to get this, or at least the id */
			let $cell = $("#cell-" + coords[0] + "-" + coords[1]);
			$cell.removeClass("cellUnknown");

			if(resp.lastCell.state === 'cleared') {
				if(resp.lastCell.surrounding === 0)
					clearSurrounding(coords);
				else
					$cell.text(resp.lastCell.surrounding);

				$cell
					.off('click')
					.off('contextmenu')
					.click(() => { clearSurrounding(coords); })
				gameGrid[coords[0]][coords[1]] = resp.lastCell.surrounding;
			}
			else if(resp.lastCell.state === 'mine')
				$cell.addClass("cellMine");
			else
				throw new Error("unexpected cell state from server: \"" +
						resp.lastCell.state + "\"");
		});
	};

	const clearSurrounding = coords => {
		for (let i of [-1, 0, 1])
			for (let j of [-1, 0, 1]) {
				if(i === 0 && j === 0)
					continue;

				let x = coords[0] + i, y = coords[1] + j;

				if(x < 0 || y < 0 || x > dims[0] - 1 || y > dims[1] - 1)
					continue;

				/*	Don't attempt to clear an already-cleared cell, or a flagged
					cell */
				if(gameGrid[x][y] !== null)
					continue;

				clearCell([x, y]);
			}
	}

	const toggleFlag = (coords, flag) => {
		const FLAGGED_VAL = "f";
		const flagged = gameGrid[coords[0]][coords[1]];
		const $cell = $("#cell-" + coords[0] + "-" + coords[1]);

		if(flagged !== FLAGGED_VAL && flagged !== null) {
			console.error("Attempted to flag/unflag a revealed call at " +
					coords);
			return;
		}

		gameGrid[coords[0]][coords[1]] = flagged ? null : FLAGGED_VAL;
		$cell.toggleClass("cellUnknown cellFlagged");
	}

	$gameArea.empty();

	for(let i = 0; i < dims[0]; i++) {
		let $row = $("<tr>");
		$gameArea.append($row);

		for(let j = 0; j < dims[1]; j++) {
			$row.append(
				$("<td>")
					.addClass("cell cellUnknown")
					.attr('id', 'cell-' + i + '-' + j)
					.click(() => { clearCell([i, j]) })
					.on('contextmenu', (e) => {
						e.preventDefault();
						toggleFlag([i, j]);
					})
			);
		}
	}
}

newGame([10,10], 10);