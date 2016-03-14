#!/usr/bin/env python3.4

import json
import requests
import random
import math
import itertools
import time
from profilehooks import profile

from ai import GameEnd

SERVER_ADDR = "http://localhost:1066"

# Ghetto enum
MINE = -1
UNKNOWN = -2
EMPTY = -3
TO_CLEAR = -4

class ReactiveGame(object):
	id = None
	dims = None
	mines = None
	game_grid = None
	password = "pass"
	game_over = False
	win = False
	turns_hash_sum = 0
	start_time = None

	def __init__(self, dims=None, mines=None, reload_id=None):
		if(dims and mines):
			resp = self.action({
				"action": "newGame",
				"dims": dims,
				"mines": mines
			})
		elif(reload_id):
			resp = self.action({
				"action": "loadGame",
				"id": reload_id
			})
		else:
			raise Exception("Insufficient game parameters")

		self.dims = resp["dims"]
		self.mines = resp["mines"]
		self.id = resp["id"]

		self.game_grid = GameGrid(self.dims, self)

		self.known_cells = {
			MINE : [],
			EMPTY : [],
			TO_CLEAR : []
		}

		print("New game: {} (original {}) dims: {} mines: {}".format(
			self.id,
			reload_id or self.id,
			self.dims,
			self.mines
		))

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
			raise GameEnd(self)

		self.cells_rem = resp["cellsRem"]

		for cell_data in resp["newCellData"]:
			cell = self.game_grid[tuple(cell_data["coords"])]

			cell.state = {
				'empty':	EMPTY,
				'cleared':	EMPTY,
				'mine':		MINE,
				'unknown':	UNKNOWN
			}[cell_data["state"]]

			cell.unkn_surr_mine_cnt += cell_data["surrounding"]
			cell.unkn_surr_empt_cnt -= cell_data["surrounding"]

		return resp

	def clear_cells(self):
		print("known_cells: {}".format(self.known_cells))
		coords_list = tuple(cell.coords for cell in self.known_cells[TO_CLEAR])

		print(" {}".format(len(coords_list)), end='', flush=True)

		self.turns_hash_sum += hash(coords_list)

		self.action({
			"action": "clearCells",
			"coords": coords_list
		})

	def first_turn(self, coords=None):
		self.start_time = time.time()
		if coords == None:
			coords = tuple(
				math.floor(random.random() * dim) for dim in self.dims
			)

		if coords == 0:
			coords = (0,) * len(self.dims)

		print("Clearing...", end='', flush=True)
		self.game_grid[coords].state = TO_CLEAR
		self.clear_cells()

	def turn(self):
		if not any(self.known_cells[TO_CLEAR]):
			raise GameEnd(self, "Out of ideas!")

		self.clear_cells()


class GameGrid(dict):
	def __init__(self, dims, parent_game):
		self.dims = dims
		self.parent_game = parent_game

	def __getitem__(self, coords):
		if not coords in self:
			dict.__setitem__(self, coords, Cell(coords, self.parent_game))
		return dict.__getitem__(self, coords)

class UnknownSurrMineCount(object):
	_val = 0

	def __get__(self, instance, owner):
		return self._val

	def __set__(self, instance, val):
		if val == 0 and instance.state == EMPTY:
			for cell in instance.surr_cells:
				if cell.state == UNKNOWN:
					cell.state = TO_CLEAR
		self._val = val

class UnknownSurrEmptyCount(object):
	_val = None

	# TODO: the @reify decorator from "Pyramid" framework does the
	# create-once-and-store pattern used here. Try with that instead of my own
	# implementation.
	def __get__(self, instance, owner):
		if self._val is None:
			self._val = len(instance.surr_cells)
		return self._val

	def __set__(self, instance, val):
		if val == 0:
			for cell in instance.surr_cells:
				if cell.state == UNKNOWN:
					cell.state = MINE
		self._val = val

class CellState(object):
	_val = UNKNOWN

	def __get__(self, instance, owner):
		return self._val

	def __set__(self, instance, val):
		known_cells = instance.parent_game.known_cells
		game_grid = instance.parent_game.game_grid
		if self._val in known_cells and instance in known_cells[self._val]:
			known_cells[self._val].remove(instance)
		known_cells[val].append(instance)
		self._val = val

		if val == MINE:
			for cell in instance.surr_cells:
				cell.unkn_surr_mine_cnt -= 1

		if val == EMPTY:
			for cell in instance.surr_cells:
				cell.unkn_surr_empt_cnt -= 1


class SurrCells(object):
	_val = None

	def __get__(self, instance, owner):
		if self._val is None:
			centre_coords = instance.coords
			self._val = []

			for offset in itertools.product(*([-1, 0, 1],) * len(centre_coords)):
				surr_coords = tuple(sum(c) for c in zip(offset, centre_coords))

				# Check all coords are positive
				if any(c < 0 for c in surr_coords):
					continue

				# Check all coords are within grid size
				if any(c >= d for c, d in zip(surr_coords,
						instance.parent_game.dims)):
					continue

				self._val.append(instance.parent_game.game_grid[surr_coords])

		return self._val

class Cell(object):
	state = CellState()
	surr_cells = SurrCells()
	unkn_surr_mine_cnt = UnknownSurrMineCount()
	unkn_surr_empt_cnt = UnknownSurrEmptyCount()

	def __init__(self, coords, parent_game):
		self.coords = coords
		self.parent_game = parent_game

def play_game(game):
	try:
		game.first_turn(0)
		while True:
			game.turn()
	except GameEnd as e:
		pass
	return game.id

if __name__ == '__main__':
	play_game(ReactiveGame([10, 10], 10))