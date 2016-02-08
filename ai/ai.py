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

# A grouping of cells with a potential number of mines within them.
class MineZone:
	def __init__(self, coords, min_mines, max_mines):
		if(min_mines > max_mines):
			raise Exception("Constructed MineZone with greater min_mines than"
					"max_mines.", self)

		self.cells = frozenset(coords)
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

		return MinesZone(self.cells | other.cells, min_mines, max_mines)

	def __and__(self, other):
		if(len(self.cells & other.cells) == 0):
			return MineZone((), 0, 0)

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

		return MinesZone(self.cells & other.cells, min_mines, max_mines)

	def __sub__(self, other):
		if(self <= other):
			return MineZone([], 0, 0)

		if(self > other):
			return MineZone(
				self.cells - other.cells,
				self.min_mines - other.min_mines,
				self.max_mines - other.max_mines
			)

		return self - (self & other)

# Determine whether a newly transformed list of MineZones is better than old.
# Priorities:
# 1. Return any with min == max == 0, or min == max == size
# 2. From 2 with min == max, to 3 with min == max
# 3. From either/both min != max, to all with mix == max
def compare_zone_sets(old, new):
	def zone_list_union(zone):
		return functools.reduce(lambda x, y: x | y, zone)

	if zone_list_union(old) != zone_list_union(new):
		raise Exception("Tried to compare zone sets which cover different "
				"cells!")

	if any([z.can_flag for z in old]):
		raise Exception("There are cells to clear before comparing!")

	if any([z.can_clear for z in old]):
		raise Exception("There are mines to flag before comparing!")

	# Something ready to clear/flag!
	if any(z.can_flag or z.can_clear for z in new):
		return True

	# TODO: Not currently doing any evaluation for new a set which isn't fixed;
	# figure out what should be calculated here.
	if not all(z.fixed for z in new):
		return False
	elif not all(z.fixed for z in old):
		return True

	# No. of mines in all old & new zones is fixed. New is an improvement if
	# it's more broken down.
	if len(new) > len(old):
		return True

	# TODO: Same number of zones in each set; all set fixed. Not sure what to
	# do. Maybe keep original and new?
	return False

class GameEnd(Exception):
	def __init__(self,  win):
		print("{}".format("Win!!11" if win else "Lose :((("))

class Game:
	id = None
	dims = None
	mines = None
	game_grid = None
	password = "pass"
	game_over = False
	win = False
	mine_zones = None

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

	def clear_cells(self, coords_arr):
		self.action({
			"action": "clearCells",
			"coords": coords_arr
		})

		print(self.game_grid)

		# Create a MineZone for each cell with mines around
		self.mine_zones = []
		for coords in numpy.transpose((self.game_grid > 0).nonzero()):
			coords = tuple(coords)
			zone_cells = frozenset([surr for surr in
					self.get_surrounding(coords) if
					self.game_grid[surr] == UNKNOWN])

			if len(zone_cells) == 0:
				continue

			self.mine_zones += [MineZone(zone_cells, self.game_grid[coords],
					self.game_grid[coords])]

		print("\n".join(map(str, self.mine_zones)))


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


	def first_turn(self	):
		def rand_coord(dim):
			return math.floor(random.random() * self.dims[dim])

		self.clear_cells([[rand_coord(0), rand_coord(1)]])

game = Game([4, 4], 3)
game.first_turn()
