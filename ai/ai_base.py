#!/usr/bin/env python3
import json
import requests
import random
import math
import itertools
import time

SERVER_ADDR = "http://localhost:1066"

class GameEnd(Exception):
	def __init__(self, game, msg=None):
		end_time = time.time()

		print()

		if msg:
			print(msg)

		turns_id = "{:x}".format(abs(game.turns_hash_sum))[:5]

		print("{}".format("Win!!11" if game.win else "Lose :((("))
		print("Turns id: {}".format(turns_id))
		print("Time elapsed: {:.5}s".format(end_time - game.start_time))
		print("="*50)

class GameBase:
	id = None
	dims = None
	mines = None
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

		for cell in resp["newCellData"]:
			self.game_grid[tuple(cell["coords"])] = {
				'empty':	cell["surrounding"],
				'cleared':	cell["surrounding"],
				'mine':		MINE,
				'unknown':	UNKNOWN
			}[cell["state"]]

		return resp

	def clear_cells(self, coords_list):
		print(" {}".format(len(coords_list)), end='', flush=True)

		self.turns_hash_sum += hash(coords_list)

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

	def first_turn(self, coords=None):
		self.start_time = time.time()
		if coords == None:
			coords = tuple(
				math.floor(random.random() * dim) for dim in self.dims
			)

		# Allow lazy coords specification because lazy
		if type(coords) is int:
			coords = (coords,) * len(self.dims)

		print("Clearing...", end='', flush=True)
		self.clear_cells([coords])


	def play_game(game, strategy_name):
		try:
			game.first_turn(0)
			while True:
				game.turn(strategy_name)
		except GameEnd as e:
			pass
		return game.id

def play_all_strategies(dims, mines):
	game = Game(dims, mines)
	play_game(game, "strat0")
	game_repeat = Game(reload_id=game.id)
	play_game(game_repeat, "strat1")
	game_repeat = Game(reload_id=game.id)
	play_game(game_repeat, "strat2")

play_all_strategies([80, 80], 500)
