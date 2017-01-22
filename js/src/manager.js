"use strict";
const PythonShell = require("python-shell");

const pythonRoot = __dirname + "/../../py";

// const _ = require("underscore");

// const managerInit = async () => {

// };

// const batchInitiate = async ({games}) => {

// };

// module.exports = {
// 	init : managerInit,
// 	actions : {
// 		initiate : {
// 			func : batchInitiate
// 		}
// 	};
// };

const joinPythonGame = (client, id) => {
	new PythonShell("game_init.py", {
		pythonPath : pythonRoot + "/venv/bin/python3",
		scriptPath : pythonRoot + "/src",
		args : JSON.stringify([{
			action : "join",
			client : client,
			game_id : id
		}])
	}, (err, res) => err && console.error(err)).on(
		"message", (msg) => console.log(msg)
	);
}

const joinGame = (domain, client, id) => {
	({ "python" : joinPythonGame })[domain](client, id);
};

module.exports = {
	join : joinGame
};