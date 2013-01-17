var request = require('request');
var fs = require("fs");
var express = require('express');
var http = require('http');
var lev = require('levenshtein');
var app = express();
var server = http.createServer(app);

app.use(express.cookieParser());
app.use(express.bodyParser());
server.listen(8082);

var shows = [];
var defaultlist = []; //eventually put some common shows in this

fs.readFile(__dirname + '/episodebag.json', function (err, data) {
	if (!err){
		shows = JSON.parse(data);
	} else {
		console.log('episodebag.json NOT found');
	};
});

setInterval(function(){ //hourly db update just in case
	fs.writeFileSync(__dirname + '/episodebag.json', JSON.stringify(shows));
}, 3600000);

var currentShow = 0;

setInterval(function(){
	if (shows.length){
		request('http://services.tvrage.com/tools/quickinfo.php?sid=' + shows[currentShow].sid, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				body = body.split('\n');
				var tempname = '';
				var templatest = '';
				var tempnext = '';
				var tempnexttime = 0;
				var templatesttime = 0;
				var tempsid = -1;
				for (var i = 0; i < body.length; i++) {
					if (body[i].indexOf('Show Name@') != -1){
						tempname = body[i].substr(10);
					} else if (body[i].indexOf('Latest Episode@') != -1){
						templatest = body[i].substr(15);
						templatesttime = Date.parse(body[i].substr(15).split('^')[2])
					} else if (body[i].indexOf('Next Episode@') != -1){
						tempnext = body[i].substr(13);
						tempnexttime = Date.parse(body[i].substr(13).split('^')[2])
					} else if (body[i].indexOf('Show ID@') != -1){
						tempsid = +body[i].substr(13);
					};
				};
				if (tempsid != -1){
					for (var i = 0; i < shows.length; i++) {
						if (shows[i].sid == tempsid){
							shows[i].name = tempname;
							shows[i].latest = templatest;
							shows[i].latesttime = templatesttime;
							shows[i].next = tempnext;
							shows[i].nexttime = tempnexttime
						};
					};
				} else {
					console.log('Error fetching show');
				}
			} else {
				console.log(error);
			};
		});
		if (currentShow < (shows.length - 1)){
			currentShow++;
		} else {
			currentShow = 0;
		};
	};
}, 180000);

app.get('/', function (req, res) {
	var usershows = [];
	if (req.cookies){
		usershows = req.cookies.usershows;
		if (usershows === undefined || !Array.isArray(usershows) || usershows.length == 0){
			usershows = defaultlist;
		};
	} else {
		usershows = defaultlist;
	};
	fs.readFile(__dirname + '/episodebag.html', function (err, data) {
		if (!err){
			var mainhtml = data.toString('ascii');
			var listings = generatelistings(usershows);
			var allshowslist = getshowslist();
			var htmlinsert = '';
			for (var i = 0; i < listings.yourshows.length; i++) {
				listings.yourshows[i] = listings.yourshows[i][0] + ' : ' + listings.yourshows[i][1];
			};
			for (var i = 0; i < allshowslist.length; i++) {
				allshowslist[i] = allshowslist[i][0] + ' : ' + allshowslist[i][1];
			};
			for (var i = 0; i < listings.lastweek.length; i++) {
				listings.lastweek[i] = listings.lastweek[i][0] + ' : ' + listings.lastweek[i][1];
			};
			for (var i = 0; i < listings.nextweek.length; i++) {
				listings.nextweek[i] = listings.nextweek[i][0] + ' : ' + listings.nextweek[i][1];
			};
			htmlinsert += '<h3>Your shows</h3>' + listings.yourshows.join('<br />');
			htmlinsert += '<h3>All shows</h3>' + allshowslist.join('<br />');
			htmlinsert += '<h3>Last week</h3>' + listings.lastweek.join('<br />');
			htmlinsert += '<h3>Next week</h3>' + listings.nextweek.join('<br />');
			mainhtml = mainhtml.replace('{htmlinsert}', htmlinsert);
			mainhtml = mainhtml.replace('{defaultlist}', usershows.join(', '));
			res.send(mainhtml);
		} else {
			console.log('episodebag.html NOT found');
		};
	});
});

app.post('/addshow', function(req, res){
	searchshow(req.body.showname, req.body.usershows, res, 14);
});

function addshow(sid, showname, usershows, res){
	if (usershows === undefined || !Array.isArray(usershows) || usershows.length == 0){
		usershows = defaultlist;
	};
	if (usershows.indexOf(sid) == -1){
		usershows.push(sid);
		res.cookie('usershows', usershows, { maxAge: 90000000 });
		res.send({status: 201, sid: sid, message: showname + ' added successfully', listings: generatelistings(usershows)});
	} else {
		res.send({status: 409, message: showname + ' is already in your list of shows.'});
	};
};

function searchshow(query, usershows, res, tolerance){
	var match;
	if (shows.length > 0){
		match = stringmatch(query); //try to find match in existing list of shows
	} else {
		match = [-1, -1, -1];
	};
	if (match[2] > tolerance){ //found in list of existing shows
		addshow(match[1], match[0], usershows, res);
	} else if (match[2] <= tolerance && tolerance == 0){ //prevents it from going into an infinite loop
		res.send({status: 500, message: 'Could not find show'});
	} else { //looks up show via API
		request('http://services.tvrage.com/tools/quickinfo.php?show=' + encodeURIComponent(query), function (error, response, body) {
			if (!error && response.statusCode == 200) {
				if (body.indexOf('Show Name@') != -1){
					body = body.split('\n');
					var tempname = '';
					var templatest = '';
					var tempnext = '';
					var tempnexttime = 0;
					var templatesttime = 0;
					var tempsid = -1;
					// parsing response:
					for (var i = 0; i < body.length; i++) {
						if (body[i].indexOf('Show Name@') != -1){
							tempname = body[i].substr(10);
						} else if (body[i].indexOf('Latest Episode@') != -1){
							templatest = body[i].substr(15);
							templatesttime = Date.parse(body[i].substr(15).split('^')[2])
						} else if (body[i].indexOf('Next Episode@') != -1){
							tempnext = body[i].substr(13);
							tempnexttime = Date.parse(body[i].substr(13).split('^')[2])
						} else if (body[i].indexOf('Show ID@') != -1){
							tempsid = +body[i].substr(13);
						};
					};
					//if it parsed somewhat correctly:
					if (tempsid != -1){
						for (var i = 0; i < shows.length; i++) {
							if (shows[i].sid == tempsid){
								addshow(tempsid, shows[i].name, usershows, res);
							};
						};
						shows.push({
							sid: tempsid,
							name: tempname,
							latest: templatest,
							latesttime: templatesttime,
							next: tempnext,
							nexttime: tempnexttime
						});
						shows.sort(function(a,b){
							if (a.name.indexOf('The ') == 0) a.name = a.name.substr(4);
							if (b.name.indexOf('The ') == 0) b.name = b.name.substr(4);
							if (a.name < b.name) return -1;
							if (a.name > b.name) return 1;
							return 0;
						});
						addshow(tempsid, tempname, usershows, res);
						fs.writeFileSync(__dirname + '/episodebag.json', JSON.stringify(shows));
						return;
					} else { //try again with fault tolerance lowered
						searchshow(query, usershows, res, 0);
					}
				} else { // something screwy with API response, maybe switch this try again with lowered tolerance
					res.send({status: 500, message: 'Could not find show'});
				}
			} else { //try again with fault tolerance lowered
				searchshow(query, usershows, res, 0);
			};
		});
	};
};

function stringmatch(tomatch){
	var scores = [];
	tomatch = tomatch.toLowerCase();
	for (var i = 0; i < shows.length; i++) {
		scores.push({
			name: shows[i].name,
			sid: shows[i].sid,
			score: 0
		});
	};
	p1 = tomatch.split(' ');
	for (var i = 0; i < p1.length; i++) {
		for (var j = 0; j < shows.length; j++) {
			p2 = scores[j].name.toLowerCase().split(' ');
			var tempscore = 0;
			for (var k = 0; k < p2.length; k++) {
				if (lev(p1[i], p2[k]) < 3 && p1[i].length > 3) tempscore += 10;
				if (lev(p1[i], p2[k]) < 5 && p2[k].length > 5 && Math.abs(p1.length - p2.length) < 3 ) tempscore += 5;
				if (p2[k].indexOf(p1[i]) != -1 && p1[i].length > 3) tempscore += 15;
				scores[j].score += tempscore;
			};
			if (lev(tomatch, scores[j].name) < 4 && tomatch.length > 4) scores[j].score += 20;
			if (lev(tomatch, p2.join('').substr(0, tomatch.length - 1)) < 5 && tomatch.length > 5) scores[j].score += 25;
			if (tomatch == scores[j].name) scores[j].score += 50;
		};
	};
	scores.sort(function(a,b) {
		return parseInt(b.score,10) - parseInt(a.score,10);
	});
	//console.log(tomatch + ' : ' + scores[0].name + ' - ' + scores[0].score);
	return [scores[0].name, scores[0].sid, scores[0].score];
};

function generatelistings(usershows){
	var lastweek = [];
	var nextweek = [];
	//var showslist = [];
	var yourshows = [];
	for (var i = 0; i < shows.length; i++) {
		if (usershows.indexOf(shows[i].sid) != -1){
			yourshows.push([shows[i].name, shows[i].sid]);
			if (shows[i].latesttime >= (new Date().getTime() - 604800000)){
				lastweek.push(shows[i]);
			};
			if (shows[i].nexttime <= (new Date().getTime() + 604800000) && shows[i].nexttime > (new Date().getTime() - 86400000)){
				nextweek.push(shows[i]);
			};
		};
		//showslist.push([shows[i].name, shows[i].sid]);
	};
	lastweek.sort(function(a,b) {
		return parseInt(a.latesttime,10) - parseInt(b.latesttime,10);
	});
	nextweek.sort(function(a,b) {
		return parseInt(a.nexttime,10) - parseInt(b.nexttime,10);
	});
	for (var i = 0; i < lastweek.length; i++) {
		lastweek[i] = [lastweek[i].name, lastweek[i].latest];
	};
	for (var i = 0; i < nextweek.length; i++) {
		nextweek[i] = [nextweek[i].name, nextweek[i].next];
	};
	var returnobject = {
		yourshows: yourshows,
		lastweek: lastweek,
		nextweek: nextweek
	};
	return returnobject;
};

function getshowslist(){
	var showslist = [];
	for (var i = 0; i < shows.length; i++) {
		showslist.push([shows[i].name, shows[i].sid]);
	};
	return showslist;
};