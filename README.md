# UDP2P
P2P connection with UDP hole punching

## Provides hole punching services (Server Mode)
```node
var udp2p = require('udp2p');
var tracker = {
  host: 'tracker.cc-wei.com',
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
  host: 'tracker.cc-wei.com',
  port: 2266
};

client.connect(tracker, function(err) {
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
client.peerMsg(message, peer, function(err, response) {
  console.log('send to %s', peer);
});
```
