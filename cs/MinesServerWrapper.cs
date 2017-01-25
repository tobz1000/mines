using System;
using System.Threading.Tasks;
using System.Net.Http;
using Newtonsoft.Json;

class MinesServerWrapper {
	string url;
	public ServerResponse status;
	
	public static async Task<MinesServerWrapper> JoinGame(string url,
		string id) {
		var inst = new MinesServerWrapper { url = url };
		await inst.Action(new Status { id = id });
		return inst;
	}

	public static async Task<MinesServerWrapper> NewGame(string url,
		int[] dims, int mines) {
		var inst = new MinesServerWrapper { url = url };
		await inst.Action(new NewGame { dims = dims, mines = mines,
			client = "CSClient" });
		return inst;
	}

	public Task<ServerResponse> Turn(TurnRequest req) {
		return this.Action(req);
	}

	public async Task<ServerResponse> Action(ServerRequest req) {
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
			var game = await MinesServerWrapper.NewGame(
				"http://localhost:1066/server/", new int[] {4, 4}, 3);
			
			Console.WriteLine(game.status.id);
		}).Wait();
	}
}

public abstract class ServerRequest {
	public virtual string action {
		get { return null; }
	}
}

public class TurnRequest : ServerRequest {
	[JsonIgnoreAttribute]
	public override string action {
		get { return "turn"; }
	}
	public string id;
	public int[,] clear;
	public int[,] flag;
	public int[,] unflag;
	public string client;
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

class Status : ServerRequest {
	[JsonIgnoreAttribute]
	public override string action {
		get { return "status"; }
	}
	public string id;
}

public class ServerResponseCellInfo {
	public int surrounding;
	public string state; //TODO - enum?
	public int[] coords;
}

public class ServerResponse {
	public string id;
	public int[] dims;
	public int mines;
	public int turnNum;
	public bool gameOver;
	public bool win;
	public int cellsRem;
	public int[,] flagged;
	public int[,] unflagged;
	public ServerResponseCellInfo[] clearActual;
	public int[,] clearReq;
	public DateTime turnTakenAt;
}