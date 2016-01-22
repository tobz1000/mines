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

	const size = dims.reduce((x, y) => x * y);
	const cellsRem = size - mines;

	const clearCell = (coords, $cell) => {
		action({action:'clearCell', id:id, coords:coords}, resp => {
			if(resp.lastCell.coords[0] !== coords[0] ||
					resp.lastCell.coords[1] !== coords[1]) {
				throw new Error("received coordinates do not match: coords=" +
					coords + " response=" + resp);
			}

			$cell.removeClass("cellUnknown");

			if(resp.lastCell.state === 'cleared')
				$cell.text(resp.lastCell.surrounding);
			else if(resp.lastCell.state === 'mine')
				$cell.addClass("cellMine");
			else
				throw new Error("unexpected cell state from server: \"" +
						resp.lastCell.state + "\"");
		});
	};

	$gameArea.empty();

	for(let i = 0; i < dims[0]; i++) {
		let $row = $("<tr>");
		$gameArea.append($row);

		for(let j = 0; j < dims[1]; j++) {
			let $cell = $("<td>").addClass("cell cellUnknown")
				// .attr('id', 'cell' + i + ',' + j)
				.click(() => { clearCell([i, j], $cell) });
			$row.append($cell);
		}
	}
}

newGame([5,6], 5);