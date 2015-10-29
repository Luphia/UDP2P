# UDP2P
P2P connection with UDP hole punching

## Provides hole punching services
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

server = new udp2p(options);
server.start(function(err) {
  console.log("status:", server.getStatus());
});
```

## Connect with hold punching server
```node
var udp2p = require('udp2p');
var client = new udp2p();
var tracker = {
  host: 'tracker.cc-wei.com',
  port: 2266
};

client.connect(tracker, function(err) {
  console.log("status:", client.getStatus());
});
```
### Fetch client list and connect to the first one
```node
client.fetchClient(function(err, list) {
  if(err || list.length == 0) { return; }
  client.peerTo(list[0], function(err) {
    console.log("status:", client.getStatus());
  });
});
```
### Send message
```node
var message = {
  hello: 'udp2p'
};
client.send(message, function(err, response) {
  console.log('get response:', response);
});
```
