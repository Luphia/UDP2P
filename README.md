# UDP2P
P2P connection with UDP hole punching

## Install
```shell
npm install udp2p
```

## Quick start
```node
var udp2p = require('udp2p');
var client = new udp2p();

client.connect(function () {
  client.fetchClient(function(e, d) {
    d.map(function(v) {
      var c = v.name;
      client.peerMsg({message: 'Hello, ' + c}, c, function (ee, dd) {});
    })
  });
});

```

## Provides hole punching services (Server Mode)
```node
var udp2p = require('udp2p');
var tracker = {
  address: 'tracker.cc-wei.com',
  port: 2266
};
var options = {
  server: true,
  port: 2266,
  tracker: [tracker]
};

var server = new udp2p(options);
```

## Connect with hole punching server (Client Mode)
```node
var udp2p = require('udp2p');
var client = new udp2p();
var server = {
  address: 'tracker.cc-wei.com',
  port: 2266
};

client.connect(server, function(err) {
  console.log("status:", client.getStatus());
});
```
### Fetch client list
```node
client.fetchClient(function(err, list) {
  console.log(list);
});
```
### Send message
```node
var message = {
  message: 'Hello UDP2P!'
};

var peer = client.getClientList().pop().name;
client.peerMsg(message, peer, function(err, response) {});
```
### Send file
```node
var filepath = '/Users/luphia/Documents/Workspace/Playground/logo.png';
var peer = client.getClientList().pop().name;
client.peerFile(filepath, peer, function(err, response) {});
```
### Setup event
```node
client.on('message', function (data) {
  console.log('%s: %s', data.from, JSON.stringify(data.content));
});

client.on('file', function (data) {
  var savePath = '/Users/luphia/Desktop/logo.png';
  console.log('recieve file [%s] from %s', data.from, data.name);
  data.r2x.save(savePath);
});
```
