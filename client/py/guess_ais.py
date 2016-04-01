#!/usr/bin/env python3.4
from reactive_ai import *

# Just finds first cleared cell with surrounding unknown empties.
class ReactiveClientGuess(ReactiveClient):
	def get_adjacent_unknown_cells(self):
		# TODO: Sometimes returns None; figure out the situation that causes
		# this and see what might be the next best thing to do (just pick random
		# unknown?)
		for cell in self.known_cells[EMPTY]:
			if cell.unkn_surr_empt_cnt <= 0:
				continue

			for surr_cell in cell.surr_cells:
				if surr_cell.state == UNKNOWN:
					yield (cell, surr_cell)

	def get_guess_cell(self):
		for (cell, surr_cell) in self.get_adjacent_unknown_cells():
			return surr_cell

# For all unknowns next to an empty, choose the one next to fewest empties
class ReactiveClientCountEmpties(ReactiveClientGuess):
	def get_guess_cell(self):
		adjacent_unknowns = set(
			s[1] for s in self.get_adjacent_unknown_cells()
		)

		if len(adjacent_unknowns) == 0:
			return None
		else:
			return min(
				adjacent_unknowns,
				key=lambda c: c.unkn_surr_empt_cnt + c.unkn_surr_mine_cnt
			)

# For all unknowns next to an empty, sum the unknown surrounding empty count vs
# the total unknown surrounding count for each cleared empty cell. Choose the
# unknown with the highest ratio; hopefully it's the most likely to be empty.
class ReactiveClientAvgEmpties(ReactiveClientGuess):
	def get_guess_cell(self):
		def empty_fraction(dict_entry_pair):
			(empty, mines) = dict_entry_pair[1]
			return empty / (empty + mines)

		surr_surr_counts = {}

		for (cell, surr_cell) in self.get_adjacent_unknown_cells():
			if surr_cell not in surr_surr_counts:
				# Pair is (sum(empty count), sum(mine count) for each cleared
				# cell next to surr_cell
				surr_surr_counts[surr_cell] = [0, 0]
			surr_surr_counts[surr_cell][0] += cell.unkn_surr_empt_cnt
			surr_surr_counts[surr_cell][1] += cell.unkn_surr_mine_cnt

		if len(surr_surr_counts) == 0:
			return None
		else:
			return max(
				surr_surr_counts.items(),
				key=empty_fraction
			)[0]

# Just pick something.
class ReactiveClientGuessAny(ReactiveClient):
	def get_guess_cell(self):
		while True:
			cell = self.game_grid[self.random_coords()]
			if cell.state == UNKNOWN:
				return cell
