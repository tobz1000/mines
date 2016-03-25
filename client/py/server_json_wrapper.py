#!/usr/bin/env python3.4
import json
import requests

SERVER_ADDR = "http://localhost:1066"

class JSONServerWrapper(object):
	id = None
	password = "pass"

	# Whether the game server can be relied upon to auto-clear zero-cells.
	# Allows for greater performance if so.
	clears_zeroes = True

	dims = None
	mines = None

	def __init__(self, dims=None, mines=None, reload_id=None):
		self.reload_id = reload_id

		if(dims is not None and mines is not None):
			resp = self.action({
				"action": "newGame",
				"dims": dims,
				"mines": mines
			})
		elif(reload_id is not None):
			resp = self.action({
				"action": "loadGame",
				"id": reload_id
			})
		else:
			raise Exception("Insufficient game parameters")

		self.id = resp["id"]
		self.dims = resp["dims"]
		self.mines = resp["mines"]

	def clear_cells(self, coords_list):
		return self.action({
			"action": "clearCells",
			"coords": coords_list
		})["newCellData"]

	def action(self, params):
		params["id"] = self.id
		params["pass"] = self.password

		# TODO: error handling, both from "error" JSON and other server
		# response/no server response
		resp = json.loads(requests.post(
			SERVER_ADDR + "/action",
			data=json.dumps(params)
		).text)

		if "error" in resp:
			raise Exception('Server error response: "{}"; info: {}'.format(
				resp["error"],
				json.dumps(resp.get("info"))
			))

		self.cells_rem = resp["cellsRem"]
		self.game_over = resp["gameOver"]
		self.win = resp["win"]

		return resp