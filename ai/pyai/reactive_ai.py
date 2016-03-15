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

# Whether the game server can be relied upon to auto-clear zero-cells. Allows
# for greater performance if so.
SERVER_CLEARS_ZEROES = True

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
	wait_time = None

	def __init__(self, dims=None, mines=None, reload_id=None):
		self.wait_time = float(0)

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

		# Reverse lookup table for grid
		self.known_cells = {
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

		wait_start = time.time()

		# TODO: error handling, both from "error" JSON and other server
		# response/no server response
		resp = json.loads(requests.post(SERVER_ADDR + "/action",
				data=json.dumps(params)).text)

		self.wait_time += time.time() - wait_start

		err = resp.get("error")

		if err:
			raise Exception('Server error response: "{}"; info: {}'.format(err,
					json.dumps(resp.get("info"))))

		self.game_over = resp["gameOver"]
		self.win = resp["win"]

		self.cells_rem = resp["cellsRem"]

		for cell_data in resp["newCellData"]:
			cell = self.game_grid[tuple(cell_data["coords"])]
			surr_mine_count = cell_data["surrounding"]

			cell.state = {
				'empty':	EMPTY,
				'cleared':	EMPTY,
				'mine':		MINE,
				'unknown':	UNKNOWN
			}[cell_data["state"]]

			# The check avoids unnecessary calculations on zero-cells, can speed
			# up some games a lot.
			if surr_mine_count > 0 or not SERVER_CLEARS_ZEROES:
				cell.unkn_surr_mine_cnt += cell_data["surrounding"]
				cell.unkn_surr_empt_cnt -= cell_data["surrounding"]

		return resp

	def clear_cells(self):
		coords_list = tuple(cell.coords for cell in self.known_cells[TO_CLEAR])

		print(" {}".format(len(coords_list)), end='', flush=True)

		self.turns_hash_sum += hash(coords_list)

		resp = self.action({
			"action": "clearCells",
			"coords": coords_list
		})

		print("->{}".format(len(resp["newCellData"])), end='', flush=True)

		if self.game_over:
			raise GameEnd(self)

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

class Cell(object):
	def __init__(self, coords, parent_game):
		self.coords = coords
		self.parent_game = parent_game

		self._state = UNKNOWN
		self._surr_cells = None
		self._unkn_surr_mine_cnt = 0
		self._unkn_surr_empt_cnt = None

	def __str__(self):
		return (
			"Cell {}: {} surrounding; state={}; unkn_surr_mine_cnt={}; "
			"unkn_surr_empt_cnt={}".format(
				self.coords,
				len(self.surr_cells),
				self.state,
				self.unkn_surr_mine_cnt,
				self.unkn_surr_empt_cnt
			)
		)

	@property
	def state(self):
		return self._state

	@state.setter
	def state(self, val):
		known_cells = self.parent_game.known_cells
		if self._state in known_cells and self in known_cells[self._state]:
			known_cells[self._state].remove(self)
		if val in known_cells:
			known_cells[val].append(self)

		self._state = val

		if val == MINE:
			for cell in self.surr_cells:
				cell.unkn_surr_mine_cnt -= 1

		if val == EMPTY:
			for cell in self.surr_cells:
				cell.unkn_surr_empt_cnt -= 1

	@property
	def surr_cells(self):
		if self._surr_cells is None:
			self._surr_cells = []

			for offset in itertools.product(*([-1, 0, 1],) * len(self.coords)):
				surr_coords = tuple(sum(c) for c in zip(offset, self.coords))

				# Check all coords are positive
				if any(c < 0 for c in surr_coords):
					continue

				# Check all coords are within grid size
				if any(c >= d for c, d in zip(surr_coords,
						self.parent_game.dims)):
					continue

				self._surr_cells.append(self.parent_game.game_grid[surr_coords])

		return self._surr_cells

	@property
	def unkn_surr_mine_cnt(self):
		return self._unkn_surr_mine_cnt

	@unkn_surr_mine_cnt.setter
	def unkn_surr_mine_cnt(self, val):
		if val == 0 and self.state == EMPTY:
			for cell in self.surr_cells:
				if cell.state == UNKNOWN:
					cell.state = TO_CLEAR
		self._unkn_surr_mine_cnt = val

	@property
	def unkn_surr_empt_cnt(self):
		if self._unkn_surr_empt_cnt is None:
			self._unkn_surr_empt_cnt = len(self.surr_cells)
		return self._unkn_surr_empt_cnt

	@unkn_surr_empt_cnt.setter
	def unkn_surr_empt_cnt(self, val):
		if val == 0:
			for cell in self.surr_cells:
				if cell.state == UNKNOWN:
					cell.state = MINE
		self._unkn_surr_empt_cnt = val

def play_game(game):
	try:
		game.first_turn(0)
		while True:
			game.turn()
	except GameEnd as e:
		pass
	return game.id

if __name__ == '__main__':
	play_game(ReactiveGame([200, 200], 4000))
	# play_game(ReactiveGame(reload_id="ku5h4"))
