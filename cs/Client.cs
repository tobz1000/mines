using System;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

class GameGrid {
    Client client;
	Dictionary<int[], Cell> dict;

	public Cell this[int[] i] {
		get {
			if(!this.dict.ContainsKey(i)) {
				this.dict[i] = new Cell(i, this.parentGame);
			}

			return this.dict[i];
		}
	}

	public GameGrid(Client client) {
		this.client = client;
	}
}

class Client {
	static string clientName = "CSClient";

	GameGrid grid;
	Dictionary<Cell.State, HashSet<Cell>> knownCells;
	IMinesServer server;

	public Client(IMinesServer server) {
		this.grid = new GameGrid(this);
		this.server = server;
		this.knownCells = new Dictionary<Cell.State, HashSet<Cell>>() {
			{ Cell.State.ToClear, new HashSet<Cell>() },
			{ Cell.State.Empty, new HashSet<Cell>() },
			{ Cell.State.Mine, new HashSet<Cell>() },
		};
	}

	void Play() {
		var firstCoords =
			(from dim in this.server.status.dims
			select dim / 2).ToArray();
		
		this.grid[firstCoords].state = Cell.State.ToClear;
	}

	public void AddKnownCell(Cell cell) {
		foreach(var d in this.knownCells) {
			if(cell.state == d.Key) {
				d.Value.Add(cell)
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
	public enum State { Unknown, ToClear, Empty, Mine };

	Client client;

	private State _state;
	public State state {
		get { return this._state; }
		set {
			if(this._state == value)
				return;

			this._state = value;
			this.client.AddKnownCell(this);
		}
	}

	public Cell(int[] coords, Client client) {
		this._state = State.Unknown;
		this.client = client;
	}
}