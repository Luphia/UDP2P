#!/usr/bin/env node

var udp2p = require('../index.js');
client = new udp2p();

var server = { address: '127.0.0.1', port: 2266 };
client.connect(server, function () {
  client.getClientList(function(e, d) {
    var c = d[0].name;
    console.log(c);
    client.peerTo(c, function (ee, dd) {
      console.log('Say hello to', c);
      client.tunnelMsg({message: 'Hello, ' + c}, dd, function () {});
    });
  });
});
