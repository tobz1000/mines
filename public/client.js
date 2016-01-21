"use strict";

const post = (req, respFn) => {
	$.post('action', JSON.stringify(req), resp => {
		respFn(resp);
	}, 'json');
};

const newGame = (dims, mines) => {
	post({action:'newGame', dims:dims, mines:mines}, resp => {
		if(resp.error)
		{
			console.log("error: " + resp.error);
			return;
		}

		document.write(JSON.stringify(resp));
	});
};