"use strict";
const newGame = (dims, mines) => {
	/* TODO: post not get */
	$.post('http://localhost:1066', JSON.stringify({action:'newGame', dims:dims, mines:mines}), resp => {
		if(resp.error)
		{
			console.log("error: " + resp.error);
			return;
		}

		console.log("id: " + resp.id);
	}, 'json');
}

newGame([4,4], 10);
