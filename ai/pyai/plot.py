#!/usr/bin/env python3.4
import math
import scipy
import statsmodels.api as sm
import numpy as np
import matplotlib.pyplot as pyplot
import progressbar # github.com/coagulant/progressbar-python3

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
	counter = progressbar.ProgressBar(widgets=[
		progressbar.widgets.Timer(format="%s"),
		" | ",
		progressbar.widgets.SimpleProgress(),
	])

	for entry in counter(game_entries):
		game = ReactiveGame(entry["dims"], entry["mines"])
		entry["win"] = game.win
		entry["cells_rem"] = game.cells_rem

	return game_entries

#play_session(cell_mine_ratio_range = (21, 2, -3), repeats_per_config = 10)

games = play_session(
	repeats_per_config = 100,
	dim_length_range = (5, 6),
	mine_count_range = (1, 25),
	num_dims_range = (2, 3)
)


def scatter_plot(x_fn, y_fn):
	pyplot.scatter([x_fn(g) for g in games], [y_fn(g) for g in games])

	# TODO: line fit: http://stackoverflow.com/a/19069028

	# TODO: get pyplot.show() working...
	pyplot.savefig('img.png')

def get_fraction_cleared(game):
	empty_cell_count = (
		functools.reduce(lambda x,y: x*y, game["dims"]) - game["mines"]
	)
	return (empty_cell_count - game["cells_rem"]) / empty_cell_count

scatter_plot(lambda g: g["mines"], get_fraction_cleared)