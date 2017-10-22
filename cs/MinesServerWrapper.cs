using System;
using System.Threading.Tasks;
using System.Net.Http;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

interface IMinesServer {
	ServerResponse Status { get; }
	Task<ServerResponse> Turn(int[][] clear, int[][] flag, int[][] unflag,
		string client);
}

class JsonServerWrapper : IMinesServer {
	string url = "http://localhost:1066/server/";
	string client;
	public ServerResponse Status { get; private set; }

	public static async Task<JsonServerWrapper> JoinGame(
		string id,
		string client
	) {
		var inst = new JsonServerWrapper { client = client };
		await inst.Action(new StatusRequest { id = id });
		return inst;
	}

	public static async Task<JsonServerWrapper> NewGame(
		int[] dims,
		int mines,
		uint? seed = null,
		string client = null,
		bool? autoclear = null
	) {
		var inst = new JsonServerWrapper { client = client };
		await inst.Action(new NewGame {
			dims = dims,
			mines = mines,
			client = client,
			seed = seed,
			autoclear = autoclear
		});
		return inst;
	}

	public Task<ServerResponse> Turn(
		int[][] clear = null,
		int[][] flag = null,
		int[][] unflag = null,
		string client = null
	) {
		if(clear == null && flag == null && unflag == null)
			throw new ArgumentNullException();

		this.client = client ?? this.client;

		var req = new TurnRequest {
			id = this.Status.id,
			client = this.client,
			clear = clear,
			flag = flag,
			unflag = unflag
		};

		return this.Action(req);
	}

	async Task<ServerResponse> Action(ServerRequest req) {
		using(var client = new HttpClient()) {
			var resp = await client.PostAsync(
				this.url + req.action,
				new StringContent(JsonConvert.SerializeObject(req))
			);
			var respStr = await resp.Content.ReadAsStringAsync();

			this.Status = JsonConvert.DeserializeObject<ServerResponse>(
				respStr
			);

			return this.Status;
		}
	}
}

abstract class ServerRequest {
	public virtual string action { get; }
}

class TurnRequest : ServerRequest {
	[JsonIgnoreAttribute]
	public override string action => "turn";
	public string id;
	public string client;
	public int[][] clear;
	public int[][] flag;
	public int[][] unflag;
}

class NewGame : ServerRequest {
	[JsonIgnoreAttribute]
	public override string action => "new";
	public uint? seed;
	public int[] dims;
	public int mines;
	public string client;
	public bool? autoclear;
}

class StatusRequest : ServerRequest {
	[JsonIgnoreAttribute]
	public override string action => "status";
	public string id;
}

public class ServerResponse {
	public enum CellState { cleared, mine };
	public class CellInfo {
		public int surrounding;
		[JsonConverter(typeof(StringEnumConverter))]
		public CellState state;
		public int[] coords;
	}
	public string id;
	public uint seed;
	public int[] Dims;
	public int mines;
	public int turnNum;
	public bool gameOver;
	public bool win;
	public int cellsRem;
	public int[][] flagged;
	public int[][] unflagged;
	public CellInfo[] clearActual;
	public int[][] clearReq;
	public DateTime turnTakenAt;
}