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

from guess_ais import *

no_cores = multiprocessing.cpu_count()

# Chunksize for pools as calculated in multiprocessing module, but with the
# addition of a specified cap. Allows for more frequent progress counter updates
# on large game sets, with no noticeable performance impact (using the default
# of 100)
def get_chunksize(len, cores, max=100):
	if len == 0:
		return 0

	chunksize, extra = divmod(len, cores * 4)
	if extra:
		chunksize += 1
	return min(max, chunksize)

def play_session(
	game_run_func,
	repeats_per_config = 10,
	dim_length_range = (4, 21, 4), # range() params
	mine_count_range = (4, 21, 4),
	cell_mine_ratio_range = None, # Alternative parameter to mine count
	num_dims_range = (2, 3)
):
	configs = []

	# Get a list of all game parameters first
	for num_dims in range(*num_dims_range):
		for dim_length in range(*dim_length_range):
			cell_count = dim_length ** num_dims

			if cell_mine_ratio_range is not None:
				# setify to remove dups
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

	pool = multiprocessing.Pool(no_cores)
	results = pool.map_async(
		game_run_func,
		configs,
		chunksize = get_chunksize(len(configs), no_cores)
	)
	pool.close()

	# Run w/ progress bar, now we know how many games there are
	counter = progressbar.ProgressBar(
		widgets = [
			progressbar.Timer(format="%s"),
			" | ",
			progressbar.SimpleProgress(),
		],
		maxval = len(results._value)
	)

	counter_run = counter.start()
	while not results.ready():
		count = len(results._value) - results._value.count(None)
		counter_run.update(count)
		time.sleep(0.5)
	counter_run.finish()

	return results._value

class PoolCounter(progressbar.Widget):
	TIME_SENSITIVE = True

	def __init__(self, results_list):
		self.results = results_list
		self.length = len(results_list)

	def update(self, pbar):
		return "{} of {}".format(
			self.length - self.results.count(None),
			self.length
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

def get_fraction_cleared(game):
	empty_cell_count = (
		functools.reduce(lambda x,y: x*y, game.server.dims) - game.server.mines
	)
	return (empty_cell_count - game.server.cells_rem) / empty_cell_count

if __name__ == "__main__":
	# Game-running functions. Must be non-dynamic, top-level to work with the
	# pickle library used by multiprocessing.
	def play_game_no_guess(config):
		return ReactiveClient(
			PythonInternalServer(config["dims"], config["mines"])
		)

	def play_game_simple_guess(config):
		return ReactiveClientGuess(
			PythonInternalServer(config["dims"], config["mines"])
		)

	def play_game_count_empties(config):
		return ReactiveClientCountEmpties(
			PythonInternalServer(config["dims"], config["mines"])
		)

	def play_game_avg_empties(config):
		return ReactiveClientAvgEmpties(
			PythonInternalServer(config["dims"], config["mines"])
		)

	plot_clients = {
		"blue" : play_game_no_guess,
		"red" : play_game_simple_guess,
		"yellow" : play_game_count_empties,
		"green" : play_game_avg_empties,
	}

	# Option to assume games with zero mines would always be won, to save time
	# actually playing them.
	def plot(instances, x_fn, y_fn, colour, add_zero_mine=True):
		instances = sorted(instances, key=x_fn)
		pyplot.plot(
			([0] if add_zero_mine else []) + [x_fn(i) for i in instances],
			([100] if add_zero_mine else []) + [y_fn(i) for i in instances],
			c=colour,
		)

	for (colour, game_function) in plot_clients.items():
		games = play_session(
			game_function,
			repeats_per_config = 2000,
			dim_length_range = (6, 7),
			mine_count_range = (1, 17),
			num_dims_range = (2, 3)
		)

		# Pools return Exception object instead of the list, if one is raised in
		# in a subprocess
		if type(games) != list:
			raise games

		# No. mines vs % games won
		plot(
			group_by_repeats(games),
			lambda g: g[0].server.mines,
			lambda g: 100 * statistics.mean(
				[1 if _g.server.win else 0 for _g in g]
			),
			colour
		)

	# TODO: get pyplot.show() working...
	pyplot.savefig('img.png')
