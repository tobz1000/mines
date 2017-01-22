#!/usr/bin/env python3
"""Start a number of client-server pairs to play the specified games."""
#TODO: take CLI-style arguments too

import sys
import json

import guess_ais

def run_game_config(
	dims,
	mines,
	repeats=1,
	client=guess_ais.ReactiveClient,
	server=guess_ais.PythonInternalServer,
):
	for _ in range(repeats):
		client(server(dims, mines))

def join_game(game_id, client=guess_ais.ReactiveClient):
	client(guess_ais.PythonInternalServer(game_id))

def str_to_class(obj):
	"""Get class types from strings for the client/server parameters"""
	for param in "client", "server":
		if(param in obj and type(obj[param]) is str):
			obj[param] = getattr(guess_ais, obj[param])
	return obj

if __name__ == '__main__':
	try:
		args = json.loads(sys.argv[1], object_hook=str_to_class)
	except:
		print("Must provide parameters as a JSON string.")
		raise
	for cfg in args:
		action = {"new": run_game_config, "join": join_game}[cfg.pop("action")]
		print("{}({})".format(action, cfg))
		action(**cfg)
