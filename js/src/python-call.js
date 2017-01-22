"use strict";

/* Example code to hook into Python domain. */

const PythonShell = require("python-shell");

const pythonRoot = __dirname + "/../../py";

const games = [
	{
		action : "new",
		dims : [2,2],
		mines : 1,
		server : "JSONServerWrapper",
		repeats : 10
	},
];

const ps = new PythonShell(
	"game_init.py",
	{
		pythonPath : pythonRoot + "/venv/bin/python3",
		scriptPath : pythonRoot + "/src",
		args : JSON.stringify(games)
	},
	(err, res) => err && console.error(err)
);
ps.on("message", (msg) => console.log(msg));