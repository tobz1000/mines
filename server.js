const nd = require('ndarray')
const underscore = require('underscore')
const net = require('net')
const jsonSocket = require('json-socket')

const server = net.createServer()
server.listen(1066)
server.on('connection', soc => {
	soc = new jsonSocket(soc)
	soc.on('message', obj => {
		newGame(obj.dims, obj.mines)
		soc.sendEndMessage({status: "okay"})
	})
})

const newGame = (dims, mines) => {
	var size = dims.reduce((x, y) => x * y)
	if (size < mines) ; /* error? */
	var mines_rem = mines;

	var gameArray = new Array(size).fill(false).fill(true, 0, mines)
	gameArray = underscore.shuffle(gameArray)

	var gameGrid = new nd(gameArray, dims)

	return gameGrid
}

const client = {
	const newGame = () => {
		const conn = new jsonSocket(new net.Socket())
		conn.connect(1066)
		conn.on('connect', () => {
			conn.sendMessage({dims: [10, 10], mines: 30})
			conn.on('message', obj => {
				console.log("Status: " + obj.status)
			})
		})
	}
}

server.listen(1066)

module.exports = {newGame: client.newGame}