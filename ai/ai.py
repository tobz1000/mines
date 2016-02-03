#!/usr/bin/env python3

import json
import requests
import random
import math
from numpy import ndarray

SERVER_ADDR = "http://localhost:1066"

# Ghetto enums for cell value; positive values are surround count
MINE = -1
UNKNOWN = -2

class Game:
	id = None
	password = "pass"
	game_over = False
	win = False

	def __init__(self, dims, mines):
		resp = self.action({
			"action": "newGame",
			"dims": dims,
			"mines": mines
		})

		self.dims = resp["dims"]
		self.mines = resp["mines"]
		self.id = resp["id"]

		self.game_grid = ndarray(dims)
		self.game_grid.fill(UNKNOWN)

	def action(self, params):
		if self.id:
			params["id"] = self.id

		if self.password:
			params["pass"] = self.password

		# TODO: error handling, both from "error" JSON and other server
		# response/no server response
		resp = json.loads(requests.post(SERVER_ADDR + "/action",
				data=json.dumps(params)).text)

		self.cells_rem = resp["cellsRem"]
		self.game_over = resp["gameOver"]
		self.win = resp["win"]

		for cell in resp["newCellData"]:
			self.game_grid[tuple(cell["coords"])] = {
				'empty':	cell["surrounding"],
				'cleared':	cell["surrounding"],
				'mine':		MINE,
				'unknown':	UNKNOWN
			}[cell["state"]]

		return resp

	def clear_cells(self, coords_arr):
		self.action({
			"action": "clearCells",
			"coords": coords_arr
		})

	def first_turn(self	):
		def rand_coord(dim):
			return math.floor(random.random() * self.dims[dim])

		self.clear_cells([[rand_coord(0), rand_coord(1)]])

game = Game([2, 2], 1)
game.first_turn()
game.first_turn()