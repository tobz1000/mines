using System;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json;

using static Itertools;

enum CellState { Unknown, ToClear, Empty, Mine };

class GameGrid {
	Client client;
	int[] dims;
	Cell[] arr;

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

	public GameGrid(Client client, int[] dims) {
		this.client = client;
		this.dims = dims;
		this.arr = new Cell[dims.Aggregate((a, b) => a * b)];
	}
}

class Client {
	enum TurnState { Playing, Finished, GiveUp };

	public virtual string ClientName => "CSClient";

	Random random;

	public GameGrid Grid;
	Dictionary<CellState, HashSet<Cell>> knownCells;
	IMinesServer Server;

	protected virtual Cell getGuessCell() => null;

	protected int[] randomCoords() {
		return (from c in this.Server.Status.Dims select this.random.Next(c))
			.ToArray();
	}

	public IEnumerable<int[]> SurroundingCoords(int[] coords) {
		foreach(var offset in RepeatProduct<int>(new[] { -1, 0, 1 },
			coords.Length)) {
			/* Skip origin coordinates */
			if(offset.All(o => o == 0))
				continue;

			var surrCoords = coords.Zip(offset, (c, o) => c + o);

			/* Check all coords are positive */
			if(surrCoords.Any(s => s < 0))
				continue;

			/* Check all coords are less than grid size */
			if(this.Server.Status.Dims.Zip(surrCoords, (d, c) => c >= d)
				.Contains(true))
				continue;

			yield return surrCoords.ToArray();
		}
	}

	public Client(IMinesServer server, bool debug = false) {
		this.random = new Random(0);
		this.Server = server;
		this.Grid = new GameGrid(this, server.Status.Dims);
		this.knownCells = new Dictionary<CellState, HashSet<Cell>>() {
			{ CellState.ToClear, new HashSet<Cell>() },
			{ CellState.Empty, new HashSet<Cell>() },
			{ CellState.Mine, new HashSet<Cell>() },
		};
	}

	void Play() {
		var firstCoords =(
			from dim in this.Server.Status.Dims
			select dim / 2
		).ToArray();

		this.Grid[firstCoords].State = CellState.ToClear;

		while(this.Turn().Result == TurnState.Playing)
			continue;
	}

	async Task<TurnState> Turn() {
		if(!this.knownCells[CellState.ToClear].Any()) {
			this.checkExclusiveCellsEmpty();
		}

		if(!this.knownCells[CellState.ToClear].Any()) {
			Cell guessCell = this.getGuessCell();

			if(guessCell == null)
				return TurnState.GiveUp;

			guessCell.State = CellState.ToClear;
		}

		var toClear = (
			from cell in this.knownCells[CellState.ToClear]
			select cell.Coords
		).ToArray();

		var toFlag = (
			from cell in this.knownCells[CellState.Mine]
			select cell.Coords
		).ToArray();

		var resp = await this.Server.Turn(clear: toClear, flag: toFlag,
			unflag: null, client: this.ClientName);

		if(resp.gameOver)
			return TurnState.Finished;

		foreach(var cellInfo in resp.clearActual) {
			var cell = this.Grid[cellInfo.coords];

			switch(cellInfo.state) {
				case ServerResponse.CellState.cleared:
					cell.State = CellState.Empty;
					break;
				case ServerResponse.CellState.mine:
					cell.State = CellState.Mine;
					break;
			}

			if(cellInfo.surrounding > 0) {
				cell.UnknownSurrCountMine += cellInfo.surrounding;
				cell.UnknownSurrCountEmpty -= cellInfo.surrounding;
			}
		}

		return TurnState.Playing;
	}

	void checkExclusiveCellsEmpty() {
		foreach(var cell in this.knownCells[CellState.Empty]) {
			if(cell.SurroundingChanged == false)
				continue;

			cell.SurroundingChanged = false;

			if(cell.UnknownSurrCountEmpty == 0 &&
				cell.UnknownSurrCountMine == 0)
				continue;
			
			foreach(var other in cell.SurrCells) {
				if(cell.ExclusiveCellsEmpty(other)) {
					string describeCell(Cell _cell) {
						return _cell + ":"
							+ "\n  UnkEmpt: " + _cell.UnknownSurrCountEmpty
							+ "\n  UnkMine: " + _cell.UnknownSurrCountMine
							+ "\n  UnkSurr: " + string.Join(",",
								_cell.SurrCells.Where(c =>
									c.State == CellState.Unknown));
					}
					var turnNum = this.Server.Status.turnNum;
					Console.WriteLine("Turn " + turnNum + " Excl: ");
					Console.WriteLine("In " + describeCell(cell));
					Console.WriteLine("Not in " + describeCell(other));

					Console.Write("Clear:");
					foreach(var surr in cell.ExclusiveUnknownSurrCells(other)) {
						Console.Write(surr);
						surr.State = CellState.ToClear;
					}
					Console.WriteLine();

					Console.Write("Flag:");
					foreach(var surr in other.ExclusiveUnknownSurrCells(cell)) {
						Console.Write(surr);
						surr.State = CellState.Mine;
					}
					Console.WriteLine();
				}
			}
		}
	}

	public void AddKnownCell(Cell cell) {
		foreach(var d in this.knownCells) {
			if(cell.State == d.Key) {
				d.Value.Add(cell);
			} else {
				d.Value.Remove(cell);
			}
		}
	}

	public static void Main() {
		foreach(var _ in new int[20]) {
			var server = JsonServerWrapper.NewGame(dims: new[]{ 15, 15 },
				mines: 50).Result;

			new GuessClient(server, debug : true).Play();
		}
	}
}

class GuessClient : Client {
	public GuessClient(IMinesServer server, bool debug) : base(server, debug) {}

	public override string ClientName => "CSGuessClient";

	protected override Cell getGuessCell() {
		Cell cell;

		do {
			cell = this.Grid[this.randomCoords()];
		} while(cell.State != CellState.Unknown);

		return cell;
	}
}

class Cell {
	Client client;

	public int[] Coords { get; private set; }

	public bool SurroundingChanged;

	CellState state;
	public CellState State {
		get { return this.state; }
		set {
			if(this.state == value)
				return;

			this.state = value;
			this.client.AddKnownCell(this);

			foreach(var cell in this.SurrCells) {
				cell.SurroundingChanged = true;

				if(value == CellState.Mine)
					cell.UnknownSurrCountMine -= 1;
				else if(value == CellState.Empty)
					cell.UnknownSurrCountEmpty -= 1;
			}
		}
	}

	public override string ToString() => "[" + string.Join(",", this.Coords) + "]";

	public HashSet<Cell> ExclusiveUnknownSurrCells(Cell other) {
		return new HashSet<Cell>(this.SurrCells.Except(other.SurrCells)
			.Where(c => c.State == CellState.Unknown));
	}

	public bool ExclusiveCellsEmpty(Cell other) {
		return
			this.UnknownSurrCountEmpty >
				this.ExclusiveUnknownSurrCells(other).Count() &&
			other.UnknownSurrCountMine >
				other.ExclusiveUnknownSurrCells(this).Count();
	}

	IEnumerable<int[]> surrCoords;

	Lazy<HashSet<Cell>> surrCells;
	public HashSet<Cell> SurrCells => this.surrCells.Value;

	int unknownSurrCountMine;
	public int UnknownSurrCountMine {
		get { return this.unknownSurrCountMine; }
		set {
			if(value == 0 && this.State == CellState.Empty) {
				foreach(var cell in this.SurrCells) {
					if(cell.State == CellState.Unknown) {
						cell.State = CellState.ToClear;
					}
				}
			}

			this.unknownSurrCountMine = value;
		}
	}

	int? unknownSurrCountEmpty;
	public int UnknownSurrCountEmpty {
		get {
			if(this.unknownSurrCountEmpty == null) {
				this.unknownSurrCountEmpty = this.surrCoords.Count();
			}

			return this.unknownSurrCountEmpty.Value;
		}
		set {
			if(value == 0) {
				foreach(var cell in this.SurrCells) {
					if(cell.State == CellState.Unknown) {
						cell.State = CellState.Mine;
					}
				}
			}

			this.unknownSurrCountEmpty = value;
		}
	}

	public Cell(int[] coords, Client client) {
		this.state = CellState.Unknown;
		this.client = client;
		this.Coords = coords;
		this.surrCoords = this.client.SurroundingCoords(this.Coords);

		this.surrCells = new Lazy<HashSet<Cell>>(() => new HashSet<Cell>(
			from c in this.surrCoords select this.client.Grid[c]
		));

		this.unknownSurrCountMine = 0;

		this.SurroundingChanged = true;
	}
}
