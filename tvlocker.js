/***********************
*       TVLocker       *
*  BEN W + ERIC R = <3 *
***********************/


var request = require('request');
var fs = require("fs");
var express = require('express');
var http = require('http');
var lev = require('levenshtein');
var app = express();
var server = http.createServer(app);

app.use(express.cookieParser());
app.use(express.bodyParser());
server.listen(9012);

var shows = [];
//var defaultlist = [4202,19267,8322,18967,21686,6061,22589,15319,3183,25056,3171,4204,23658,28304,22622,23369,24493,4628,8511,30909,17544,31839,24607,26254,25542,30753]; 
var defaultlist = [3171,4204,8322,30909,23369,24493,24607,28304,2649,15319,17544,22589,23561,23658,25056,27219,27811,];
fs.readFile(__dirname + '/tvlocker.json', function (err, data) {
	if (!err){
		shows = JSON.parse(data);
		checkposters();
	} else {
		console.log('tvlocker.json NOT found');
	};
});


var currentpostershow = 0;
var noposters = [];

function checkposters(){
	for (var i = 0; i < shows.length; i++) {
		if (!fs.existsSync(__dirname + '/tvlocker/' + shows[i].sid + '.jpg')){
			noposters.push([shows[i].sid, shows[i].name]);
		}
	};
	if (noposters.length > 0){
		downloadPosterBacklog();
	}
}
function downloadPosterBacklog(){
	request('http://thetvdb.com/api/GetSeries.php?seriesname=' + encodeURI(noposters[currentpostershow][1]), function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var temptvdbid = body.split('seriesid')[1];
			var tvdbID = temptvdbid.replace('>', '').replace('</', '');
			console.log('thetvDB seriesid is: ' + tvdbID);
			request('http://www.thetvdb.com/banners/_cache/posters/' + tvdbID + '-1.jpg').pipe(fs.createWriteStream(__dirname + '/tvlocker/' + noposters[currentpostershow][0] + '.jpg'))
			//request('http://www.thetvdb.com/banners/_cache/graphical/' + tvdbID + '-g.jpg').pipe(fs.createWriteStream(__dirname + '/tvlocker/' + noposters[currentpostershow][0] + '.jpg'))
		}
	});
	if (currentpostershow < (noposters.length - 1)){
		setTimeout(function(){
			currentpostershow++;
			downloadPosterBacklog();
		}, 10000);
	}
}


setInterval(function(){
	fs.writeFileSync(__dirname + '/tvlocker.json', JSON.stringify(shows));
}, 1800000);

var currentShow = 0;

// REFRESH DB FROM TVRAGE API
setInterval(function(){
	updateShowData();
}, 1800000);

function updateShowData(){
	if (shows.length){
		console.log('Updating show: ' + shows[currentShow].name);
		request('http://services.tvrage.com/tools/quickinfo.php?sid=' + shows[currentShow].sid, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				body = body.split('\n');
				var tempname = '';
				var templatest = '';
				var tempnext = '';
				var tempnexttime = 0;
				var templatesttime = 0;
				var tempsid = -1;
				var tempairtime = '';
				var tempspecifictime = '';
				var tempnodst = 0;
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
					} else if (body[i].indexOf('Airtime@') != -1){
						tempairtime = body[i].substr(8);
					} else if (body[i].indexOf('RFC3339@') != -1){
						tempspecifictime = body[i].substr(8);
					} else if (body[i].indexOf('GMT+0 NODST@') != -1){
						tempnodst = +body[i].substr(12);
					};
				};
				if (tempsid != -1){
					for (var i = 0; i < shows.length; i++) {
						if (shows[i].sid == tempsid){
							shows[i].name = tempname;
							shows[i].latest = templatest;
							shows[i].latesttime = templatesttime;
							shows[i].next = tempnext;
							shows[i].nexttime = tempnexttime;
							shows[i].airtime = tempairtime;
							shows[i].specifictime = tempspecifictime;
							shows[i].nodst = tempnodst;
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
}

// Serve index html
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
	fs.readFile(__dirname + '/tvlocker.html', function (err, data) {
		if (!err){
			var mainhtml = data.toString('ascii');
			mainhtml = mainhtml.replace(/{usershows}/gi, JSON.stringify(usershows));
			mainhtml = mainhtml.replace(/{showdata}/gi, generateListings(usershows));
			res.send(mainhtml);
		} else {
			console.log('tvlocker.html NOT found');
		};
	});
});

// EXPRESS FOR EVERYTHING ELSE STATIC
app.use('/static', express.static(__dirname + '/tvlocker'));



///// AJAX CALLS ////////////////////////

// On users initial search
app.post('/addshow', function(req, res){
	if (req.body.showname && req.body.usershows){
		var usershows = req.body.usershows
		var matchedResult = stringmatch(req.body.showname);
		console.log('matched SID is: ' + matchedResult[0] + '.\n');
		res.send({status: 201, sid: matchedResult[0], showname: matchedResult[1]});
	};
});

// Confirming an addition from the JSON db
app.post('/confirmadd', function(req, res){
	if (req.body.showname && req.body.sid && req.body.usershows){
		var usershows = req.body.usershows
		var showname = req.body.showname;
		var sid = req.body.sid;
		addshow(sid, showname, usershows, res);
	};
});

// Asking to search from the tvrage API
app.post('/apiSearch', function(req, res){
	if (req.body.showname && req.body.usershows){
		console.log('searching api for ' + req.body.showname);
		request('http://services.tvrage.com/tools/quickinfo.php?show=' + encodeURIComponent(req.body.showname), function (error, response, body) {
			if (!error && response.statusCode == 200) {
				rageSuccess(body,req.body.usershows,res);
			} else {
				res.send({status: 504, error: 'Could not connect to database (API timeout)'});
			}
		});
	};
});

// Remove show from users usershows, update cookie, and push list
app.post('/remove', function(req, res){
	if (req.body.sid && req.body.usershows && !isNaN(parseInt(req.body.sid))){
		var usershows = req.body.usershows;
		if (Array.isArray(usershows) && usershows.indexOf(parseInt(req.body.sid)) != -1){
			for (var i = 0; i < usershows.length; i++) {
				if (usershows[i] == req.body.sid){
					usershows.splice(i, 1);
					i--;
				};
			};
			res.cookie('usershows', usershows, { maxAge: 2628000000 });
			res.send({status: 201, message: 'Show removed'});
		};
	};
});

// ADD SHOW- UPDATE COOKIE AND PUSH RESULT
function addshow(sid, showname, usershows, res){
	if (usershows === undefined || !Array.isArray(usershows) || usershows.length == 0){
		usershows = defaultlist;
	};
	if (usershows.indexOf(sid) == -1){
		usershows.push(sid);
		res.cookie('usershows', usershows, { maxAge: 2628000000 });
		res.send({status: 201, showname: showname});
	} else {
		res.send({status: 409, error: showname + ' is already in your list of shows.'});
	};
};

// INITIAL USER SEARCH ///////////
function searchshow(query, usershows, res, tolerance){
	var match;
	console.log('shows.length = ' + shows.length);
	if (shows.length > 0){
		match = stringmatch(query); //try to find match in JSON db
		console.dir(match);
	} else {
		match = [-1, -1, -1, -1, -1, -1];
	};
	
	if (match[5] > tolerance){ //found in list of existing shows. change 5 to last item
		console.log('found show ' + match[1]);
		addshow(match[0], match[1], match[2], match[3], match[4], usershows, res);
		return;
	} else if (match[2] <= tolerance && tolerance == 0){ //prevents it from going into an infinite loop
		console.log('couldnt find show');
		res.send({status: 500, error: 'Could not find show'});
		return;
	} else { //looks up show via API
		console.log('searching api for ' + query);
		request('http://services.tvrage.com/tools/quickinfo.php?show=' + encodeURIComponent(query), function (error, response, body) {
			if (!error && response.statusCode == 200) {
				rageSuccess(body,usershows,res);
			}
			else { //try again with fault tolerance lowered
				searchshow(query, usershows, res, 0);
			};
		});
	};
};
// end searchshow()

// MATCHING FROM JSON DB ///////////////
function stringmatch(tomatch){
	var scores = [];
	//name: shows[i].name.toLowerCase().replace(/[^\w\s]/gi, ''),
	tomatch = tomatch.toLowerCase().replace(/[^\w\s]/gi, '');
	if (tomatch.indexOf('svu') != -1) tomatch = 'law and order: special victims unit';
	for (var i = 0; i < shows.length; i++) {
		scores.push({
			name: shows[i].name.toLowerCase().replace(/[^\w\s]/gi, ''),
			originalName: shows[i].name,
			sid: shows[i].sid,
			latest: shows[i].latest,
			next: shows[i].next,
			nodst: shows[i].nodst,
			score: 0
		});
	};
	for (var i = 0; i < scores.length; i++) {
		if (scores[i].name.indexOf(tomatch) != -1) scores[i].score += 50;
		if (tomatch == scores[i].name) scores[i].score += 50;
		if (lev(tomatch, scores[i].name) < tomatch.length - 2) scores[i].score += 20;
		if (lev(tomatch, scores[i].name.substr(0, tomatch.length - 1)) < tomatch.length - 2) scores[i].score += 25;
		if (tomatch.replace('the ', '').length > 4 && scores[i].name.replace('the ', '').length > 4 && tomatch.replace('the ', '').substr(0, 4) == scores[i].name.replace('the ', '').substr(0, 4)) scores[i].score += 20;
	};
	p1 = tomatch.split(' ');
	for (var i = 0; i < p1.length; i++) {
		for (var j = 0; j < shows.length; j++) {
			p2 = scores[j].name.split(' ');
			for (var k = 0; k < p2.length; k++) {
				if (p1[i] == p2[k] && p1 != 'the' && p1 != 'a') scores[j].score += 5;
				if (lev(p1[i], p2[k]) < p1[i].length - 1) scores[j].score += 10;
				if (lev(p1[i], p2[k]) < p2[k].length - 1 && Math.abs(p1.length - p2.length) < 3 ) scores[j].score += 5;
				if (p2[k].indexOf(p1[i]) != -1 && p1[i].length > 3) scores[j].score += 15;
			};
		};
	};
	scores.sort(function(a,b) {
		return parseInt(b.score,10) - parseInt(a.score,10);
	});
	console.log(scores[0].name + ' ' + scores[0].score);
	console.log(scores[1].name + ' ' + scores[1].score);
	console.log(scores[2].name + ' ' + scores[2].score);
	console.log(scores[3].name + ' ' + scores[3].score);

	//marker to update
	return [scores[0].sid, scores[0].originalName, scores[0].latest, scores[0].next, scores[0].nodst, scores[0].score];
};


// WHEN THERE IS A TVRAGE API MATCH
function rageSuccess(body, usershows, res){
	if (body.indexOf('Show Name@') != -1){
		body = body.split('\n');
		var tempname = '';
		var templatest = '';
		var tempnext = '';
		var tempnexttime = 0;
		var templatesttime = 0;
		var tempsid = -1;
		var tempairtime = '';
		var tempspecifictime = '';
		var tempnodst = 0;
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
			} else if (body[i].indexOf('Airtime@') != -1){
				tempairtime = body[i].substr(8);
			} else if (body[i].indexOf('RFC3339@') != -1){
				tempspecifictime = body[i].substr(8);
			} else if (body[i].indexOf('GMT+0 NODST@') != -1){
				tempnodst = +body[i].substr(12);
			};
		};
		//if it parsed somewhat correctly:
		if (tempsid != -1){
			shows.push({
				sid: tempsid,
				name: tempname,
				latest: templatest,
				latesttime: templatesttime,
				next: tempnext,
				nexttime: tempnexttime,
				airtime: tempairtime,
				specifictime: tempspecifictime,
				nodst: tempnodst,
			});
			shows.sort(function(a,b){
				if (a.name.indexOf('The ') == 0) a.name = a.name.substr(4);
				if (b.name.indexOf('The ') == 0) b.name = b.name.substr(4);
				if (a.name < b.name) return -1;
				if (a.name > b.name) return 1;
				return 0;
			});
			fs.writeFileSync(__dirname + '/tvlocker.json', JSON.stringify(shows));
			//Download poster:
			request('http://thetvdb.com/api/GetSeries.php?seriesname=' + encodeURI(tempname), function (error, response, body) {
				if (!error && response.statusCode == 200) {
					var temptvdbid = body.split('seriesid')[1];
					var tvdbID = temptvdbid.replace('>', '').replace('</', '');
					console.log('thetvDB seriesid is: ' + tvdbID);
					request('http://www.thetvdb.com/banners/_cache/posters/' + tvdbID + '-1.jpg').pipe(fs.createWriteStream(__dirname + '/tvlocker/' + tempsid + '.jpg'))
					//request('http://www.thetvdb.com/banners/_cache/graphical/' + tvdbID + '-g.jpg').pipe(fs.createWriteStream(__dirname + '/tvlocker/' + tempsid + '.jpg'))
				}
			});
			res.send({status: 201, sid: tempsid, showname: tempname});
			return;
		} else { //try again with fault tolerance lowered
			//searchshow(query, usershows, res, 0);
			res.send({status: 500, error: 'Could not find show'});
		}
	} else { // something screwy with API response, maybe switch this try again with lowered tolerance
		res.send({status: 500, error: 'Could not find show'});
	}
} // end rageSuccess()


// GENERATE LISTINGS FROM usershows
function generateListings(usershows){
	var tempoldshows = [];
	var tempnewshows = [];
	for (var i = 0; i < shows.length; i++) {
		if (usershows.indexOf(shows[i].sid) != -1){
			if (shows[i].latest){
				var split = shows[i].latest.split('^');
				if (split.length == 3){
					if (new Date(Date.parse(split[2])).getTime() >= (new Date().getTime() - 1209600000)){
						tempoldshows.push([shows[i].name, new Date(Date.parse(split[2])).getTime(), split[2], '<a href="http://www.nzbclub.com/search.aspx?q=' + encodeURIComponent(shows[i].name) + '+' + 's' + split[0].replace('x', 'e') + '&st=1">' + split[1] + ' - ' + split[0] + '</a>', shows[i].sid]);
					}
				}
			}
			if (shows[i].next){
				var split = shows[i].next.split('^');
				if (split.length == 3){
					if (new Date(Date.parse(split[2])).getTime() <= (new Date().getTime() + 1209600000)){
						tempnewshows.push([shows[i].name, new Date(Date.parse(split[2])).getTime(), split[2], '<a href="http://www.nzbclub.com/search.aspx?q=' + encodeURIComponent(shows[i].name) + '+' + 's' + split[0].replace('x', 'e') + '&st=1">' + split[1] + ' - ' + split[0] + '</a>', shows[i].sid]);
					}
				}
			}
		};
	};

	tempoldshows.sort(function(a,b) {
		return parseInt(a[1],10) - parseInt(b[1],10);
	});
	tempnewshows.sort(function(a,b) {
		return parseInt(a[1],10) - parseInt(b[1],10);
	});

	var listings = '<h2>Recent and upcoming:</h2>';
	for (var i = 0; i < tempnewshows.length; i++) {
		listings += '<div class="showcontainer"><img src="/static/' + tempnewshows[i][4] + '.jpg" style="width:300px;height:440px;"><div class="showinfo"><span id="' + tempnewshows[i][4] + '" class="removeshow">ⓧ</span> ' + tempnewshows[i][0] + '<div class="small">' + tempnewshows[i][2] + '</div>' + tempnewshows[i][3] + '</div></div>';
	};
	listings += '<h2>Previously:</h2>'
	for (var i = 0; i < tempoldshows.length; i++) {
		listings += '<div class="showcontainer"><img src="/static/' + tempoldshows[i][4] + '.jpg" style="width:300px;height:440px;"><div class="showinfo"><span id="' + tempoldshows[i][4] + '" class="removeshow">ⓧ</span> ' + tempoldshows[i][0] + '<div class="small">' + tempoldshows[i][2] + '</div>' + tempoldshows[i][3] + '</div></div>';
	};
	return listings;
};