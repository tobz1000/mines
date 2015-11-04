const nd = require('ndarray')
const underscore = require('underscore')
const net = require('net')
const jsonSocket = require('json-socket')

function Game(dims, mines) {

	this.finished = false
	this.won = false

	this.checkCell = (coords) => {
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
			this.finished = true
			return -1
		} else {
			
		}


		firstTurn = false
		return boom
	}

	const constr = () => {
		const size = dims.reduce((x, y) => x * y)
		mines = Math.min(mines, size)
		var mines_rem = mines
		var gameArray = new Array(size).fill(false).fill(true, 0, mines)
		gameArray = underscore.shuffle(gameArray)
		var gameGrid = new nd(gameArray, dims)
		var firstTurn = true
	}

	constr()
}

g = new Game([5, 5], 5)

module.exports = {Game: Game}