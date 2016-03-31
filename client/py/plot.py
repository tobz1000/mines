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

no_cores = multiprocessing.cpu_count()

# Chunksize for pools as calculated in multiprocessing module, but with the
# addition of a specified cap. Allows for more frequent progress counter updates
# on large game sets, with no noticeable performance impact (using the default
# of 100)
def get_chunksize(len, cores, max=100):
	chunksize, extra = divmod(len, cores * 4)
	if extra:
		chunksize += 1
	return min(max, chunksize)

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
		thread_map_fn,
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

def thread_map_fn(config):
	return ReactiveClient(PythonInternalServer(config["dims"], config["mines"]))

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

if __name__ == "__main__":
	games = play_session(
		repeats_per_config = 1000,
		dim_length_range = (6, 7),
		mine_count_range = (7, 17),
		num_dims_range = (2, 3)
	)

	# No. mines vs % games won
	scatter_plot(
		group_by_repeats(games),
		lambda g: g[0].server.mines,
		lambda g: statistics.mean([1 if _g.server.win else 0 for _g in g])
	)
