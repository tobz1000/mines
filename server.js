const nd = require('ndarray')
const underscore = require('underscore')
const net = require('net')
const jsonSocket = require('json-socket')

var Game = function(dims, mines) {

	var finished = false
	var won = false

	checkCell : (coords) => {
		var surrCount
		boom = gameGrid.get.apply(this, arguments)

		if (boom && firstTurn){
			// Remove the mine if the user sets it off first turn
			gameGrid.set.apply(this, arguments.concat(false))
			do // And put it somewhere else
				var newCellInd = Math.floor(Math.random() * gameArray.length)
			while (gameArray[newCellInd] != false)
			gameArray[newCellInd] = true
			boom = false
		}
		if(boom) {
			finished = true
			return -1
		} else {a
			// Grab a square/cube/hypercube of size 3 around the chosen cell.
			surrCellsGrid = gameGrid.lo(coords.map(x => x - 1)).hi(
					coords.map(x => 3))
		}

		firstTurn = false
		return surrCount

		// Recursive
		const count_mines = (dims, pivot) => {
			if (dims.length === 1) {/*...*/}
			for (var i = -1; i <= 1; i++) {
				count_mines(dims.slice(1))
			}
		}
	}

	const size = dims.reduce((x, y) => x * y)
	mines = Math.min(mines, size)
	var mines_rem = mines
	var gameArray = new Array(size).fill(false).fill(true, 0, mines)
	gameArray = underscore.shuffle(gameArray)
	var gameGrid = new nd(gameArray, dims)
	var firstTurn = true
}

g = new Game([5, 5], 5)

module.exports = {Game: Game}