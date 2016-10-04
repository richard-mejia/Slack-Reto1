"use strict";

var mongo = require("mongodb"),
    fs = require("fs"),         // to read static files
    io = require("socket.io"),  // socket io server
    http = require("http");

var mongodbUri = "mongodb://10.131.137.215/chat";

var app = http.createServer(handler);
io = io.listen(app);
app.listen(3000);
console.log("http server on port 3000");

function handler(req, res)
{
  fs.readFile(__dirname + "/index.html",
  function (err, data)
  {
    res.writeHead(200);
    res.end(data);
  });
}

var db;

mongo.MongoClient.connect(mongodbUri, function(err, _db)
{
  if (err)
    throw err;

  console.log("connected");
  db = _db;
});

io.sockets.on('connection', function(socket)
{
  db.collection('msgRing')
    .find({}, {tailable: true, awaitdata: true, numberOfRetries: -1})
    .sort({ $natural: 1 })
    .each(function(err, doc)
    {
      if (err)
        throw err;

      socket.emit('message', doc, doc.channel);
      console.log("cursor got a message");
    });

  db.collection('usrRing')
    .find({}, {tailable: true, awaitdata: true, numberOfRetries: -1})
    .sort({ $natural: 1})
    .each(function(err, doc)
    {
      if (err)
        throw err;

      db.collection('users')
        .find({"channel": doc.channel})
        .toArray(function(_err, users)
        {
          if (_err)
            throw err;

          socket.emit('updateUsers', users, doc.channel);
        });
    });

  socket.on('newMessage', function(alias, content, channel)
  {
    publishMessage(alias, content, channel);
  });

  socket.on('newUser', function(alias, channel)
  {
    db.collection('users').insert({"alias": alias, "channel": channel, "socketId": socket.id}, function(err, res)
    {
      if (err)
        throw err;

      publishUser(alias, channel);
      console.log("new user: " + alias + " in channel " + channel);
    });
  });

  socket.on('disconnect', function()
  {
    db.collection('users')
      .remove({"socketId": socket.id}, function(err, res)
      {
        if (err)
          throw err;

        publishUser("null", "null");
        console.log("user  has left");
      });
  });

  socket.on('changeChannel', function(alias, prevChannel, newChannel)
  {
    db.collection('users')
      .update({"socketId": socket.id}, {$set: {"channel": newChannel}}, function(err, res)
      {
        if (err)
          throw err;

        publishMessage("ChatBot", "user " + alias + " has left this channel: " + prevChannel, prevChannel);
        publishMessage("ChatBot", "user " + alias + " has joined this channel: " + newChannel, newChannel);
        publishUser("null", prevChannel);
        publishUser("null", newChannel);
        console.log("changed to the " + newChannel + " channel");
      });
  });
});

function publishUser(alias, channel)
{
  db.collection('usrRing')
    .insert({"alias": alias, "channel": channel}, function(err, res)
  {
    if (err)
      throw err;

    console.log("user published");
  });
}

function publishMessage(alias, content, channel)
{
  db.collection('msgRing')
    .insert({"alias": alias, "content": content, "channel": channel}, function(err, res)
    {
      if (err)
        throw err;

      console.log("message published");
    });
}

