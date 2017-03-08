using System;
using System.Linq;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Threading.Tasks;

using static Itertools;

namespace SetsClient {

enum CellState { Unknown, Empty, Mine };

class Client {
	enum TurnState { Playing, Finished, GiveUp };

	public virtual string ClientName => "CSSets";

	Random random;

	public GameGrid Grid;
	IMinesServer Server;
	HashSet<Cell> toFlag;
	HashSet<Cell> toClear;


	protected virtual Cell getGuessCell() => null;

	protected int[] randomCoords() {
		return (from c in this.Server.Status.Dims select this.random.Next(c))
			.ToArray();
	}

	public Client(IMinesServer server) {
		this.random = new Random(0);
		this.Server = server;
		this.Grid = new GameGrid(this, server.Status.Dims);
		this.toFlag = new HashSet<Cell>();
		this.toClear = new HashSet<Cell>();
	}

	void Play() {
		var firstCoords =(
			from dim in this.Server.Status.Dims
			select dim / 2
		).ToArray();

		this.guessClear(this.Grid[firstCoords]);

		while(this.Turn().Result == TurnState.Playing)
			continue;
	}

	async Task<TurnState> Turn() {
		if(!this.toClear.Any()) {
			Cell guessCell = this.getGuessCell();

			if(guessCell == null)
				return TurnState.GiveUp;

			this.guessClear(guessCell);
		}

		var toClear = (from cell in this.toClear select cell.Coords).ToArray();
		var toFlag = (from cell in this.toFlag select cell.Coords).ToArray();

		this.toClear.Clear();
		this.toFlag.Clear();

		var resp = await this.Server.Turn(clear: toClear, flag: toFlag,
			unflag: null, client: this.ClientName);

		if(resp.gameOver)
			return TurnState.Finished;

		foreach(var cellInfo in resp.clearActual) {
			var cell = this.Grid[cellInfo.coords];
			var unknownSurrounding = (cell.SurrCells.Value.Where(
				c => c.State == CellState.Unknown));
			var cellSet = new CellSet(unknownSurrounding,
				cellInfo.surrounding, surrCell: cell);

			this.addCellSet(cellSet,addToTurn: false);
		}

		return TurnState.Playing;
	}

	HashSet<CellSet> intersectingSets(CellSet cellSet) => new HashSet<CellSet>(
		from cell in cellSet.Cells
		from otherSet in cell.IncludedSets
		select otherSet
	);

	void addCellSet(CellSet cellSet, bool addToTurn = true) {
		bool addSet = true;
		int cellCount = cellSet.Cells.Count();

		if(cellCount == 0)
			return;

		if(cellSet.MineCount == cellCount) {
			addSet = false;

			foreach(var cell in cellSet.Cells) {
				cell.State = CellState.Mine;

				if(addToTurn)
					this.toFlag.Add(cell);
			}
		}

		if(cellSet.MineCount == 0) {
			addSet = false;

			foreach(var cell in cellSet.Cells) {
				cell.State = CellState.Empty;

				if(addToTurn)
					this.toClear.Add(cell);
			}
		}

		foreach(var otherSet in this.intersectingSets(cellSet)) {
			if(cellSet.SharedMineCount(otherSet) != null) {
				foreach(var cell in otherSet.Cells) {
					cell.IncludedSets.Remove(otherSet);
				}

				this.addCellSet(otherSet - cellSet);
				this.addCellSet(cellSet - otherSet);
				this.addCellSet(cellSet & otherSet);

				return;
			}
		}

		if(addSet) {
			foreach(var cell in cellSet.Cells) {
				cell.IncludedSets.Add(cellSet);
			}
		}
	}

	void guessClear(Cell cell) {
		this.addCellSet(new CellSet(cell, 0));
	}

	public static void Main() {
		// foreach(var seed in new uint[] { 2043619729, 3064048551, 1929672436 }) {
		foreach(var seed in new uint[] { 1929672436 }) {
			var server = JsonServerWrapper.NewGame(dims: new[]{ 15, 15 },
				mines: 50, seed: seed).Result;

			new Client(server).Play();
		}
	}
}

class CellSet {
	public ImmutableHashSet<Cell> Cells { get; }
	public int MineCount { get; }
	Cell surrCell;

	public override string ToString() {
		return (this.surrCell != null ? "~" + this.surrCell + ":" : "") +
			"{" + string.Join(",", this.Cells) + "}" + "m" + this.MineCount;
	}

	public CellSet(Cell cell, int mineCount)
		: this(new[] { cell }, mineCount) {}

	public CellSet(IEnumerable<Cell> cells, int mineCount,
		Cell surrCell = null) {
		this.Cells = new HashSet<Cell>(cells).ToImmutableHashSet();
		this.MineCount = mineCount;
		this.surrCell = surrCell;
	}

	public static CellSet operator -(CellSet c1, CellSet c2) {
		return new CellSet(c1.Cells.Except(c2.Cells),
			c1.MineCount - c1.SharedMineCount(c2).Value);
	}

	public static CellSet operator &(CellSet c1, CellSet c2) {
		return new CellSet(c1.Cells.Intersect(c2.Cells),
			c1.SharedMineCount(c2).Value);
	}

	public int SharedCellCount(CellSet other) {
		return this.Cells.Intersect(other.Cells).Count();
	}

	public int? SharedMineCount(CellSet other) {
		int minShared = this.minSharedMines(other);
		int maxShared = this.maxSharedMines(other);

		if(minShared > maxShared) {
			throw new Exception("Impossible CellSet intersection: " + this +
				", " + other + "; " + "minShared=" + minShared + " maxShared=" +
				maxShared);
		}

		if(minShared == maxShared)
			return minShared;
		
		return null;
	}

	int minSharedMines(CellSet other) {
		int sharedCount = this.SharedCellCount(other);
		return Math.Max(Math.Max(
			this.MineCount - (this.Cells.Count() - sharedCount),
			other.MineCount - (other.Cells.Count() - sharedCount)
		), 0);
	}

	int maxSharedMines(CellSet other) {
		int sharedCount = this.SharedCellCount(other);
		int minSharedEmpty = Math.Max(
			sharedCount - this.MineCount,
			sharedCount - other.MineCount
		);

		return sharedCount - Math.Max(minSharedEmpty, 0);
	}
}

class GameGrid {
	Client client;
	int[] dims;
	Cell[] arr;

	public GameGrid(Client client, int[] dims) {
		this.client = client;
		this.dims = dims;
		this.arr = new Cell[dims.Aggregate((a, b) => a * b)];
	}

	public Cell this[int[] coords] {
		get {
			var index = 0;

			for(int i = 0; i < coords.Length; i++) {
				index *= this.dims[i];
				index += coords[i];
			}

			if(this.arr[index] == null) {
				this.arr[index] = new Cell(coords, this.client);
			}

			return this.arr[index];
		}
	}

	public IEnumerable<Cell> SurroundingCells(Cell cell) {
		foreach(var offset in RepeatProduct<int>(new[] { -1, 0, 1 },
			cell.Coords.Length)) {
			/* Skip origin coordinates */
			if(offset.All(o => o == 0))
				continue;

			var surrCoords = cell.Coords.Zip(offset, (c, o) => c + o);

			/* Check all coords are positive */
			if(surrCoords.Any(s => s < 0))
				continue;

			/* Check all coords are less than grid size */
			if(this.dims.Zip(surrCoords, (d, c) => c >= d).Contains(true))
				continue;

			yield return this[surrCoords.ToArray()];
		}
	}
}

class Cell {
	Client client;
	public CellState State;
	public int[] Coords { get; private set; }
	public HashSet<CellSet> IncludedSets;
	public Lazy<Cell[]> SurrCells;

	public override string ToString() =>
		"[" + string.Join(",", this.Coords) + "]";

	public Cell(int[] coords, Client client) {
		this.State = CellState.Unknown;
		this.client = client;
		this.Coords = coords;
		this.IncludedSets = new HashSet<CellSet>();
		this.SurrCells = new Lazy<Cell[]>(() =>
			this.client.Grid.SurroundingCells(this).ToArray());
	}
}

}
