using System;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

using static Product;

enum CellState { Unknown, ToClear, Empty, Mine };

class GameGrid {
    Client client;
	Dictionary<int[], Cell> dict;

	public Cell this[int[] i] {
		get {
			if(!this.dict.ContainsKey(i)) {
				this.dict[i] = new Cell(i, this.client);
			}

			return this.dict[i];
		}
	}

	public GameGrid(Client client) {
		this.client = client;
		this.dict = new Dictionary<int[], Cell>();
	}
}

class Client {
	enum TurnState { Playing, Finished, GiveUp };

	static string clientName = "CSClient";

	public GameGrid grid;
	Dictionary<CellState, HashSet<Cell>> knownCells;
	IMinesServer server;

	protected virtual Cell GetGuessCell() => null;

	public IEnumerable<int[]> SurroundingCoords(int[] coords) {
		foreach(var offset in RepeatProduct<int>(new[] { -1, 0, 1 },	
			coords.Length)) {
			/* Skip origin coordinates */
			if(offset.All(o => o == 0))
				continue;
			
			var surrCoords = coords.Zip(offset, (c, o) => c + 0);

			/* Check all coords are positive */
			if(surrCoords.Any(s => s < 0))
				continue;

			/* Check all coords are less than grid size */
			if(this.server.status.dims.Zip(surrCoords, (d, c) => c >= d)
				.Contains(true))
				continue;
			
			yield return surrCoords.ToArray();
		}
	}

	public Client(IMinesServer server) {
		this.server = server;
		this.grid = new GameGrid(this);
		this.knownCells = new Dictionary<CellState, HashSet<Cell>>() {
			{ CellState.ToClear, new HashSet<Cell>() },
			{ CellState.Empty, new HashSet<Cell>() },
			{ CellState.Mine, new HashSet<Cell>() },
		};
	}

	void Play() {
		var firstCoords =(
			from dim in this.server.status.dims
			select dim / 2
		).ToArray();
		
		this.grid[firstCoords].State = CellState.ToClear;

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

		var resp = await this.server.Turn(clear: toClear, flag: toFlag,
			unflag: null, client: Client.clientName);

		if(resp.gameOver)
			return TurnState.Finished;

		foreach(var cellInfo in resp.clearActual) {
			var cell = this.grid[cellInfo.coords];

			switch(cellInfo.state) {
				case ServerResponse.CellState.cleared:
					cell.State = CellState.Empty;
					break;
				case ServerResponse.CellState.mine:
					cell.State = CellState.Mine;
					break;
			}

			//TODO: cell surround counts
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
		var server = JsonServerWrapper.NewGame(new int[] { 11, 11 }, 11,
			Client.clientName).Result;

		new Client(server).Play();
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
				this.unknownSurroundCountEmpty = this.SurrCells.Count();
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

	//TODO
	public ?? SharedUnknSurrCounts;

	public Cell(int[] coords, Client client) {
		this.state = CellState.Unknown;
		this.client = client;
		this.Coords = coords;

		this.surrCells = new Lazy<HashSet<Cell>>(() => new HashSet<Cell>(
			from surrCoords in this.client.SurroundingCoords(this.Coords)
			select this.client.grid[surrCoords]
		));

		this.unknownSurroundCountMine = 0;
	}
}