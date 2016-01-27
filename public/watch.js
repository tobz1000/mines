"use strict";
$(() => {
	$("#button").click(() => {
		new EventSource(`watch?id=${$("#gameId").val()}`)
			.addEventListener('message', (resp) => { console.log(resp); });
	});
});