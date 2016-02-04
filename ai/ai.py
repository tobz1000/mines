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

# A grouping of cells with a potential number of mines within them.
class MineZone:
	def __init__(self, coordsArr, minMines, maxMines):
		# TODO: possibly move tuplefying out of constructor, for speed when
		# creating new MinesZones through operations
		self.cells = frozenset([tuple(coords) for coords in coordsArr])
		self.minMines = max(minMines, 0)
		self.maxMines = min(maxMines, len(self.cells))
		if(self.minMines > self.maxMines):
			raise Exception("Constructed MineZone with greater minMines than"
					"maxMines.", self)

	def __len__(self):
		return len(self.cells)

	# maMines/minMines not considered for equality
	def __eq__(self):
		return self.cells == other.cells

	def __gt__(self):
		return self.cells > other.cells

	def __ge__(self):
		return self.cells >= other.cells

	def __or__(self, other):
		if(len(self.cells & other.cells) == 0):
			return MineZone(
				self.cells | other.cells,
				self.minMines + other.minMines,
				self.maxMines + other.maxMines,
			)

		if(self == other):
			return self & other

		# If self is a superset, the new MineZone will be identical; with the
		# exception that other may inform us of a higher minimum mine count
		if(self > other):
			return MineZone(
				self.cells,
				max(self.minMines, other.minMines),
				self.maxMines
			)

		if(self < other):
			return other | self

		# if neither is a subset of the other, calculate possible mine count
		# range for union
		minMines = max(self.minMines, other.minMines)
		maxMines = self.maxMines + other.maxMines - len(self.cells & other.cells)

		return MinesZone(self.cells | other.cells, minMines, maxMines)


	def __and__(self, other):
		if(len(self.cells & other.cells) == 0):
			return MineZone([], 0, 0)

		if(self == other):
			return MineZone(
				self.cells,
				max(self.minMines, other.minMines),
				min(self.maxMines, other.maxMines)
			)

		# If self is a subset, the new MineZone will be identical; with the
		# exception that other may inform us of a lower maximum mine count
		if(self < other):
			return MineZone(
				self.cells,
				self.minMines,
				min(self.maxMines, other.maxMines)
			)

		if(self > other):
			return other & self

		# if neither is a subset of the other, calculate possible mine count
		# range for intersection
		minMines = max(
			0,
			self.minMines - len(self.cells - other.cells),
			other.minMines - len(other.cells - self.cells)
		)
		maxMines = min(self.maxMines, other.maxMines)

		return MinesZone(self.cells & other.cells, minMines, maxMines)



	def __sub__(self, other):
		if(self <= other):
			return MineZone([], 0, 0)

		if(self > other):
			return MineZone(
				self.cells - other.cells,
				self.minMines - other.minMines,
				self.maxMines - other.maxMines
			)

		return self - (self & other)

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
