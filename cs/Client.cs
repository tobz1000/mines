using System;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

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

	static string ClientName = "CSClient";

	Random random;

	public GameGrid Grid;
	Dictionary<CellState, HashSet<Cell>> knownCells;
	IMinesServer Server;

	protected virtual Cell GetGuessCell() {
		Cell cell;

		do {
			cell = this.Grid[this.randomCoords()];
		} while(cell.State != CellState.Unknown);

		return cell;
	}

	int[] randomCoords() {
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

	public Client(IMinesServer server) {
		this.random = new Random();
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
			Cell guessCell = this.GetGuessCell();

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
			unflag: null, client: Client.ClientName);

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
				cell.UnknownSurroundCountMine += cellInfo.surrounding;
				cell.UnknownSurroundCountEmpty -= cellInfo.surrounding;
			}
		}


		return TurnState.Playing;
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
		foreach(var _ in new int[5]) {
			var server = JsonServerWrapper.NewGame(new int[] { 15, 15 }, 40,
				Client.ClientName).Result;

			new Client(server).Play();
		}
	}
}

class Cell {
	Client client;

	public int[] Coords { get; private set; }

	CellState state;
	public CellState State {
		get { return this.state; }
		set {
			if(this.state == value)
				return;

			this.state = value;
			this.client.AddKnownCell(this);

			if(value == CellState.Mine) {
				foreach(var cell in this.SurrCells)
					cell.UnknownSurroundCountMine -= 1;
			} else if (value == CellState.Empty) {
				foreach(var cell in this.SurrCells)
					cell.UnknownSurroundCountEmpty -= 1;
			}
		}
	}

	IEnumerable<int[]> surrCoords;

	Lazy<HashSet<Cell>> surrCells;
	public HashSet<Cell> SurrCells => this.surrCells.Value;

	int unknownSurroundCountMine;
	public int UnknownSurroundCountMine {
		get { return this.unknownSurroundCountMine; }
		set {
			if(value == 0 && this.State == CellState.Empty) {
				foreach(var cell in this.SurrCells) {
					if(cell.State == CellState.Unknown) {
						cell.State = CellState.ToClear;
					}
				}
			}

			this.unknownSurroundCountMine = value;
		}
	}

	int? unknownSurroundCountEmpty;
	public int UnknownSurroundCountEmpty {
		get {
			if(this.unknownSurroundCountEmpty == null) {
				this.unknownSurroundCountEmpty = this.surrCoords.Count();
			}

			return this.unknownSurroundCountEmpty.Value;
		}
		set {
			if(value == 0) {
				foreach(var cell in this.SurrCells) {
					if(cell.State == CellState.Unknown) {
						cell.State = CellState.Mine;
					}
				}
			}

			this.unknownSurroundCountEmpty = value;
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

		this.unknownSurroundCountMine = 0;
	}
}
