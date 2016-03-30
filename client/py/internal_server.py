#!/usr/bin/env python3.4
import numpy
import functools
import itertools

# Ghetto enums for cell value
MINE = 1
CLEAR = 0

def get_surrounding_coords(coords, dims):
	ret = []

	for offset in itertools.product(*([-1, 0, 1],) * len(coords)):
		# Don't include self
		if all(c == 0 for c in offset):
			continue

		surr_coords = tuple(sum(c) for c in zip(offset, coords))

		# Check all coords are positive
		if any(c < 0 for c in surr_coords):
			continue

		# Check all coords are within grid size
		if any(c >= d for c, d in zip(surr_coords, dims)):
			continue

		ret.append(surr_coords)

	return ret

def count_empty_cells(dims, mines):
	return functools.reduce(lambda x,y: x*y, dims) - mines

class PythonInternalServer(object):
	id = "py_internal_game"
	reload_id = None

	# Whether the game server can be relied upon to auto-clear zero-cells.
	# Allows for greater performance if so.
	clears_zeroes = False

	dims = None
	mines = None

	cells_rem = None
	game_over = False
	win = False

	game_grid = None

	def __init__(self, dims=None, mines=None):
		self.dims = dims
		self.mines = mines
		self.cells_rem = count_empty_cells(dims, mines)

		# Create grid
		self.game_grid = numpy.ndarray(self.dims, dtype=int)
		self.game_grid.fill(CLEAR)
		self.game_grid.ravel()[:mines].fill(MINE)
		numpy.random.shuffle(self.game_grid.ravel())

	def clear_cells(self, coords_list):
		cleared_cells = []
		for coords in coords_list:
			if self.game_grid[coords] == MINE:
				self.game_over = True
				return []
			else:
				cleared_cells.append({
					"coords" : coords,
					"surrounding" : sum([
						self.game_grid[surr_coords]
						for surr_coords in get_surrounding_coords(
							coords,
							self.dims
						)
					]),
					"state" : "cleared"
				})

		# Result already returned if game is lost
		self.cells_rem -= len(coords_list)
		if self.cells_rem == 0:
			self.win = True
			self.game_over = True

		return cleared_cells
