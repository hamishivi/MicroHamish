'use strict'
var express = require('express');
var mongodb = require('mongodb');
var request = require('request');
var multer = require('multer');
var app = express();

app.use('/public', express.static(process.cwd() + '/public'));

app.get('/', function(req, res) {
    res.sendFile(process.cwd() + '/public/index.html');
});


// Timestamp
app.get('/time/:time', function(req, res) {
    var str = req.params["time"];
    var unix, natural, dat;
    if (isNaN(str)) {
        dat = new Date(str);
    } else {
        dat = new Date(parseInt(str * 1000));
    }
    console.log(dat.getTime())
    if (isNaN(dat.getTime())) {
        unix = null;
        natural = null;
    } else {
        unix = dat.getTime() / 1000;
        natural = naturalTime(dat);
    }
    var json = JSON.stringify({
        "unix": unix,
        "natural": natural
    });
    res.json(json);
});

// WhoAreYou
app.get('/whoareyou', function(req, res) {
    var lan = req["headers"]['accept-language'];
    var ag = req["headers"]['user-agent'];
    var ip = req["headers"]['x-forwarded-for'];
    var ind1 = ag.indexOf('(');
    var ind2 = ag.indexOf(')');
    var json = JSON.stringify({
        "ipaddress": ip,
        "language": lan.substring(0, 5),
        "software": ag.substring(ind1 + 1, ind2)
    });
    res.json(json);
});

// HamUrl
app.get('/h/:url*', function(req, res) {
    var param = req.params["url"] + req.params["0"];
    if (urlValidate(param)) {
        newLink(param, res);
    } else {
        if (parseInt(param)) {
            findLink(param, res);
        } else {
            res.json({
                "error": "There was an error, Make sure your url is full and correct"
            });
        }
    }
});

var MongoClient = mongodb.MongoClient;

// Use connect method to connect to the Server
function newLink(newurl, res) {
    var url = process.env.MONGOLAB_URI;
    MongoClient.connect(url, function(err, db) {
        if (err) {
            console.log('Unable to connect to the mongoDB server. Error:', err);
        } else {
            console.log('Connection established to', url);
            console.log("Establishing new link...");
            // do some work here with the database.
            var collection = db.collection('links');
            // find counter, get redirect, update database
            collection.find({
                url: "count"
            }, {
                _id: 0,
                url: 0
            }).toArray(function(err, docs) {
                if (err) throw err;
                var count = docs[0].num;
                collection.insert({
                    url: newurl,
                    num: count
                });
                collection.update({
                    url: "count"
                }, {
                    $inc: {
                        num: 1
                    }
                }, function(err) {
                    if (err) throw err;
                    db.close();
                });
                res.json({
                    "original url": newurl,
                    "new url": process.env.NEW_URL + count
                });
            });
        }
    });
}

function findLink(redirectnum, res) {
    var url = process.env.MONGOLAB_URI;
    MongoClient.connect(url, function(err, db) {
        if (err) {
            console.log('Unable to connect to the mongoDB server. Error:', err);
        } else {
            console.log('Connection established to', url);
            console.log("finding link...");
            // do some work here with the database.
            var collection = db.collection('links');
            // find link with number
            // return url and then redirect
            collection.find({
                num: parseInt(redirectnum)
            }, {
                _id: 0,
                num: 0
            }).toArray(function(err, docs) {
                if (err) throw err;
                console.log(docs);
                var url = docs[0].url;
                db.close();
                res.redirect(url);
            });
        }
    });
}

// IvisonImage
app.get('/image/latest', function(req, res) {
    console.log("using latest thing");
    var url = process.env.MONGOLAB_URI;
    MongoClient.connect(url, function(err, db) {
        if (err) {
            console.log('Unable to connect to the mongoDB server. Error:', err);
        } else {
            console.log('Connection established to', url);
            console.log("Establishing new link...");
            var collection = db.collection('images');
            // find counter, get redirect, update database
            var result = collection.find({}, {
                    _id: 0
                }).toArray()
                .then(function(data) {
                    res.json(data);
                });
        }
    });
});

app.get('/image/api/:search*', function(req, res) {
    var param = req.params["search"];
    var offset = req.query["offset"];
    if (!offset) {
        offset = 0;
    }
    var startIndex = offset * 10 + 1
    console.log(param);
    console.log(offset);
    imageSearch(param, res, startIndex);
});

function imageSearch(search, res, page) {
    if (search != "favicon.ico") {
        addImage(search);
    }
    var key = process.env.GOOGLE_KEY;
    var id = process.env.GOOGLE_ID;
    var url = "https://www.googleapis.com/customsearch/v1?key=" + key + "&cx=" + id + "&searchType=image&start=" + page + "&q=" + search;
    request(url, function(error, response, body) {
        var list = [];
        if (!error && response.statusCode == 200) {
            body = JSON.parse(body);
            console.log(body.item);
            for (var i = 0; i < body["items"].length; i++) {
                var json = {
                    "url": body.items[i].link,
                    "snippet": body.items[i].snippet,
                    "context": body.items[i].displayLink
                };
                list.push(json);
            }
            res.json(list);
        } else {
            res.json(
                "error : api failure"
            );
        }
    });
}

// Use connect method to connect to the Server
function addImage(search) {
    var url = process.env.MONGOLAB_URI;
    MongoClient.connect(url, function(err, db) {
        if (err) {
            console.log('Unable to connect to the mongoDB server. Error:', err);
        } else {
            console.log('Connection established to', url);
            console.log("Establishing new link...");
            // do some work here with the database.
            var collection = db.collection('links');
            // find counter, get redirect, update database
            collection.count({}, function(error, num) { // counts up docs
                if (num < 10) {
                    collection.insert({
                        "search": search,
                        "when": timeStamp()
                    });
                } else {
                    collection.deleteOne({});
                    collection.insert({
                        "search": search,
                        "when": timeStamp()
                    });
                }
            });
        }
    });
}

// Fileseizer
var upload = multer({
    dest: 'uploads/'
});

app.post('/file-size', upload.single('file'), function(req, res) {
    res.json({
        size: req.file.size
    });
});


app.listen(process.env.PORT || 8080, function() {
    console.log("Listening!");
});

// Helper Functions
function naturalTime(dat) {
    var month = dat.getMonth();
    var day = dat.getDate();
    var year = dat.getFullYear();
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var res = months[month] + " " + day + ", " + year;
    return res;
}


function urlValidate(url) {
    var reg = /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/;
    return url.match(reg);
}

function timeStamp() {
    // Create a date object with the current time
    var now = new Date();
    // Create an array with the current month, day and time
    var date = [now.getMonth() + 1, now.getDate(), now.getFullYear()];
    // Create an array with the current hour, minute and second
    var time = [now.getHours(), now.getMinutes(), now.getSeconds()];
    // Determine AM or PM suffix based on the hour
    var suffix = (time[0] < 12) ? "AM" : "PM";
    // Convert hour from military time
    time[0] = (time[0] < 12) ? time[0] : time[0] - 12;
    // If hour is 0, set it to 12
    time[0] = time[0] || 12;
    // If seconds and minutes are less than 10, add a zero
    for (var i = 1; i < 3; i++) {
        if (time[i] < 10) {
            time[i] = "0" + time[i];
        }
    }
    // Return the formatted string
    return date.join("/") + " " + time.join(":") + " " + suffix;
}
