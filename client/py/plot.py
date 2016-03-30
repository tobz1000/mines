#!/usr/bin/env python3.4
import functools
import math
import multiprocessing
import statistics
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
	configs = []
	results = []

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
					configs.append({
						"dims": [dim_length] * num_dims,
						"mines": mine_count
					})

	# TODO: progressbar for parallel jobs using pool.map_async
	pool = multiprocessing.Pool(2)
	results = pool.map(thread_map_fn, configs)

	# Run w/ progress bar, now we know how many games there are
	#counter = progressbar.ProgressBar(widgets=[
	#	progressbar.widgets.Timer(format="%s"),
	#	" | ",
	#	progressbar.widgets.SimpleProgress(),
	#])

	#for config in counter(configs):
	#	results.append(ReactiveClient(
	#		PythonInternalServer(config["dims"], config["mines"])
	#	))

	return results

def thread_map_fn(config):
	return ReactiveClient(PythonInternalServer(config["dims"], config["mines"]))

games = play_session(
	repeats_per_config = 100,
	dim_length_range = (10, 11),
	mine_count_range = (20, 30),
	num_dims_range = (2, 3)
)

# Returns a dict of lists of games with identical configs
def group_by_repeats(games):
	games_by_config = {}
	for g in games:
		key = (tuple(g.server.dims), g.server.mines)
		if key not in games_by_config:
			games_by_config[key] = []
		games_by_config[key].append(g)
	return games_by_config.values()

def scatter_plot(instances, x_fn, y_fn):
	pyplot.scatter([x_fn(i) for i in instances], [y_fn(i) for i in instances])

	# TODO: line fit: http://stackoverflow.com/a/19069028

	# TODO: get pyplot.show() working...
	pyplot.savefig('img.png')

def get_fraction_cleared(game):
	empty_cell_count = (
		functools.reduce(lambda x,y: x*y, game.server.dims) - game.server.mines
	)
	return (empty_cell_count - game.server.cells_rem) / empty_cell_count

# No. mines vs % games won
scatter_plot(
	group_by_repeats(games),
	lambda g: g[0].server.mines,
	lambda g: 100 * statistics.mean([1 if _g.server.win else 0 for _g in g])
)
