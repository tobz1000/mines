#!/usr/bin/env python3
import json
import requests
import random
import math
import numpy
import functools
import itertools

SERVER_ADDR = "http://localhost:1066"

# Ghetto enums for cell value; non-neg values are surround count for cleared
# cells
MINE = -1
UNKNOWN = -2
TO_CLEAR = -3

# A grouping of cells with a potential number of mines within them.
class MineZone:
	def __init__(self, cells=frozenset(), min_mines=0, max_mines=0):
		if(min_mines > max_mines):
			raise Exception("Constructed MineZone with greater min_mines than"
					"max_mines (min={} max={}).".format(min_mines, max_mines))

		self.cells = cells
		self.min_mines = max(min_mines, 0)
		self.max_mines = min(max_mines, len(self.cells))
		self.fixed = self.min_mines == self.max_mines
		self.can_clear = self.fixed and self.min_mines == 0
		self.can_flag = self.fixed and self.min_mines == len(self.cells)

	def __str__(self):
		return "MineZone (min {} max {}): {}".format(self.min_mines,
				self.max_mines, tuple(self.cells))

	def __len__(self):
		return len(self.cells)

	# maMines/min_mines not considered for equality
	def __eq__(self, other):
		return self.cells == other.cells

	def __gt__(self, other):
		return self.cells > other.cells

	def __ge__(self, other):
		return self.cells >= other.cells

	def __or__(self, other):
		if(len(self.cells & other.cells) == 0):
			return MineZone(
				self.cells | other.cells,
				self.min_mines + other.min_mines,
				self.max_mines + other.max_mines,
			)

		if(self == other):
			return self & other

		# If self is a superset, the new MineZone will be identical; with the
		# exception that other may inform us of a higher minimum mine count
		if(self > other):
			return MineZone(
				self.cells,
				max(self.min_mines, other.min_mines),
				self.max_mines
			)

		if(self < other):
			return other | self

		# if neither is a subset of the other, calculate possible mine count
		# range for union
		min_mines = max(self.min_mines, other.min_mines)
		max_mines = self.max_mines + other.max_mines - len(self.cells &
				other.cells)

		return MineZone(self.cells | other.cells, min_mines, max_mines)

	def __and__(self, other):
		if(len(self.cells & other.cells) == 0):
			return MineZone()

		if(self == other):
			return MineZone(
				self.cells,
				max(self.min_mines, other.min_mines),
				min(self.max_mines, other.max_mines)
			)

		# If self is a subset, the new MineZone will be identical; with the
		# exception that other may inform us of a lower maximum mine count
		if(self < other):
			return MineZone(
				self.cells,
				self.min_mines,
				min(self.max_mines, other.max_mines)
			)

		if(self > other):
			return other & self

		# if neither is a subset of the other, calculate possible mine count
		# range for intersection
		min_mines = max(
			0,
			self.min_mines - len(self.cells - other.cells),
			other.min_mines - len(other.cells - self.cells)
		)
		max_mines = min(self.max_mines, other.max_mines)

		return MineZone(self.cells & other.cells, min_mines, max_mines)

	def __sub__(self, other):
		if(self <= other):
			return MineZone()

		if(self > other):
			return MineZone(
				self.cells - other.cells,
				self.min_mines - other.min_mines,
				self.max_mines - other.max_mines
			)

		return self - (self & other)

class GameEnd(Exception):
	def __init__(self, win, msg=None):
		if msg:
			print(msg)

		print("{}".format("Win!!11" if win else "Lose :((("))

class Game:
	id = None
	dims = None
	mines = None
	game_grid = None
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

		self.game_grid = numpy.ndarray(dims, dtype=int)
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

		err = resp.get("error")

		if err:
			raise Exception('Server error response: "{}"; info: {}'.format(err,
					json.dumps(resp.get("info"))))

		self.game_over = resp["gameOver"]
		self.win = resp["win"]

		if self.game_over:
			raise GameEnd(self.win)

		self.cells_rem = resp["cellsRem"]

		for cell in resp["newCellData"]:
			self.game_grid[tuple(cell["coords"])] = {
				'empty':	cell["surrounding"],
				'cleared':	cell["surrounding"],
				'mine':		MINE,
				'unknown':	UNKNOWN
			}[cell["state"]]

		return resp

	def clear_cells(self):
		coords_list = tuple(c.tolist() for c in
			numpy.transpose((self.game_grid == TO_CLEAR).nonzero())
		)

		print("Clearing: {}".format(coords_list))
		self.action({
			"action": "clearCells",
			"coords": coords_list
		})

	# Iterator for co-ordinate tuples of all cells in contact with a given cell.
	def get_surrounding(self, coords):
		for shift in itertools.product(*([-1, 0, 1],) * len(coords)):
			surr_coords = tuple(sum(c) for c in zip(shift, coords))

			# Check all coords are positive
			if any(c < 0 for c in surr_coords):
				continue

			# Check all coords are within grid size
			if any(c >= d for c, d in zip(surr_coords, self.dims)):
				continue

			yield surr_coords


	def first_turn(self):
		self.game_grid[tuple(
			math.floor(random.random() * dim) for dim in self.dims
		)] = TO_CLEAR

		self.clear_cells()

	# If a pass of a state results in a change, go back to the previous stage.
	# A turn is ready to submit when the final stage passes without a change,
	# and there is at least one cell set to TO_CLEAR.
	def turn(self):
		mine_zones = None

		# 1. Create a MineZone for each cell with mines around
		def create_zones():
			nonlocal mine_zones
			mine_zones = []

			for coords in numpy.transpose((self.game_grid > 0).nonzero()):
				coords = tuple(coords)
				zone_cells = frozenset([
					surr for surr in self.get_surrounding(coords) if
							self.game_grid[surr] == UNKNOWN
				])

				known_mines = sum(1 for surr in self.get_surrounding(coords)
						if self.game_grid[surr] == MINE)

				zone_mines = self.game_grid[coords] - known_mines

				if len(zone_cells) == 0:
					continue

				mine_zones.append(MineZone(
					zone_cells,
					zone_mines,
					zone_mines
				))

			return False

		# 2. Check for zones to clear/flag
		def mark_clear_flag():
			changed = False
			for zone in mine_zones:
				if zone.can_flag:
					for coords in zone.cells:
						self.game_grid[coords] = MINE
						changed = True
				if zone.can_clear:
					for coords in zone.cells:
						self.game_grid[coords] = TO_CLEAR
						changed = True
			return changed

		# 3. Substract from zones which fully cover another zone
		def subtract_subsets():
			nonlocal mine_zones
			changed = False
			for i, j in itertools.combinations(range(len(mine_zones)), 2):
				if len(mine_zones[i]) == 0 or len(mine_zones[j]) == 0:
					continue

				if mine_zones[i] == mine_zones[j]:
					changed = True
					mine_zones[i] &= mine_zones[j]
					mine_zones[j] = MineZone()

				elif mine_zones[i] < mine_zones[j]:
					changed = True
					mine_zones[j] -= mine_zones[i]

				elif mine_zones[i] > mine_zones[j]:
					changed = True
					mine_zones[i] -= mine_zones[j]

			return changed

		# 4. Cleverer zone manipulation? (partial overlaps)
		# 5. Exhaustive test of all possible mine positions in overlapping zones

		stages = [
			create_zones,
			mark_clear_flag,
			subtract_subsets
		]

		i = 0
		while i < len(stages):
			changed = stages[i]()
			if changed and i > 0:
				i -= 1
			else:
				i += 1

		if (self.game_grid == TO_CLEAR).any():
			self.clear_cells()
		else:
			raise GameEnd(False, "Out of ideas!")

game = Game([10, 10], 5)

try:
	game.first_turn()
	while True:
		game.turn()
except GameEnd as e:
	pass