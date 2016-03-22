#!/usr/bin/env python3.4
import math
#import statsmodels.api as sm
#import numpy as np
#import matplotlib.pyplot as pyplot
import progressbar

from reactive_ai import *

def play_session(
	repeats_per_config = 10,
	dim_length_range = (4, 21, 4), # range() params
	mine_count_range = (4, 21, 4),
	cell_mine_ratio_range = None, # Alternative parameter to mine count
	num_dims_range = (2, 3)
):
	game_entries = []

	# Get a list of all game parameters first
	for num_dims in range(*num_dims_range):
		for dim_length in range(*dim_length_range):
			cell_count = dim_length ** num_dims

			if cell_mine_ratio_range is not None:
				# setify to remove dups (messes up order but that's okay)
				mine_counts = list(set(
					math.floor(cell_count/m)
					for m in range(*cell_mine_ratio_range)
				))
			else:
				mine_counts = list(range(*mine_count_range))

			# Remove invalid values
			mine_counts = [m for m in mine_counts if m < cell_count and m > 0]

			for mine_count in mine_counts:
				for i in range(repeats_per_config):
					game_entries.append({
						"dims": [dim_length] * num_dims,
						"mines": mine_count
					})

	# Run w/ progress bar, now we know how many games there are
	bar = progressbar.ProgressBar()
	for entry in bar(game_entries):
		game = ReactiveGame(entry["dims"], entry["mines"])
		entry["win"] = game.win
		entry["cells_rem"] = game.cells_rem

	return game_entries

play_session(cell_mine_ratio_range = (21, 2, -3), repeats_per_config = 1)
