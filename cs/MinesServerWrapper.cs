using System;
using System.Threading.Tasks;
using System.Net.Http;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

interface IMinesServer {
	ServerResponse status;
	Task<ServerResponse> Turn(int[] clear, int[] flag, int[] unflag);
}

class JsonServerWrapper : IMinesServer {
	string url = "http://localhost:1066/server/";
	string client;
	public ServerResponse status;

	public static async Task<JsonServerWrapper> JoinGame(string id,
		string client) {
		var inst = new JsonServerWrapper { client = client };
		await inst.Action(new StatusRequest { id = id });
		return inst;
	}

	public static async Task<JsonServerWrapper> NewGame(int[] dims, int mines,
		string client) {
		var inst = new JsonServerWrapper { client = client };
		await inst.Action(new NewGame { dims = dims, mines = mines,
			client = client });
		return inst;
	}

	public Task<ServerResponse> Turn(int[] clear = null, int[] flag = null,
		int[] unflag = null) {
		if(clear == null && flag == null && unflag == null)
			throw new ArgumentNullException();

		var req = new TurnRequest { id = this.status.id, client = this.client,
			clear = clear, flag = flag, unflag = unflag };

		return this.Action(req);
	}

	async Task<ServerResponse> Action(ServerRequest req) {
		using(var client = new HttpClient()) {
			var resp = await client.PostAsync(this.url + req.action,
				new StringContent(JsonConvert.SerializeObject(req)));
			var respStr = await resp.Content.ReadAsStringAsync();

			this.status = JsonConvert.DeserializeObject<ServerResponse>(
				respStr);

			return this.status;
		}
	}

	static void Main(string[] args) {
		Task.Run(async () => {
			var game = await JsonServerWrapper.NewGame(new int[] {4, 4}, 3,
				"CSClient");

			Console.WriteLine(game.status.id);
		}).Wait();
	}
}

abstract class ServerRequest {
	public virtual string action { get; }
}

class TurnRequest : ServerRequest {
	[JsonIgnoreAttribute]
	public override string action {
		get { return "turn"; }
	}
	public string id;
	public string client;
	public int[] clear;
	public int[] flag;
	public int[] unflag;
}

class NewGame : ServerRequest {
	[JsonIgnoreAttribute]
	public override string action {
		get { return "new"; }
	}
	public int[] dims;
	public int mines;
	public string client;
}

class StatusRequest : ServerRequest {
	[JsonIgnoreAttribute]
	public override string action {
		get { return "status"; }
	}
	public string id;
}

public class ServerResponse {
	public enum CellState { cleared, mines };
	public class CellInfo {
		public int surrounding;
		[JsonConverter(typeof(StringEnumConverter))]
		public CellState state; //TODO - enum?
		public int[] coords;
	}
	public string id;
	public int[] dims;
	public int mines;
	public int turnNum;
	public bool gameOver;
	public bool win;
	public int cellsRem;
	public int[,] flagged;
	public int[,] unflagged;
	public CellInfo[] clearActual;
	public int[,] clearReq;
	public DateTime turnTakenAt;
}