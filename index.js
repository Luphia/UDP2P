/*

// start server
var udp2p = require('./index.js');
var server = new udp2p({port: 2266});

// start client
var udp2p = require('./index.js');
client = new udp2p();
var server = { address: '127.0.0.1', port: 2266 };

client.connect(server, function () {
  client.fetchClient(function(e, d) {
    d.map(function(v) {
      var c = v.name;
      client.peerTo(c, function (ee, dd) {
        console.log(dd);
        client.tunnelMsg({message: 'Hello, ' + c}, dd, function () {});
      });
    })
  });
});

 */

var os = require('os'),
    dgram = require('dgram'),
    net = require('net'),
    raid2x = require('raid2x'),
    dvalue = require('dvalue');

var server = {
  address: 'tracker.cc-wei.com',
  port: 2266
};

var period = 10000;
var waitingRate = 3;

var udp2p = function (config) {
  this.init(config);
};

// get self IP for connection
udp2p.checkIP = function (cb) {
  var net = require('net');
  var socket = net.createConnection(80, 'laria.space');
  socket.on('connect', function() {
  	if(typeof(cb) == 'function') { cb(undefined, socket.address().address); }
  	socket.end();
  });
  socket.on('error', function(e) {
  	if(typeof(cb) == 'function') { cb(undefined, socket.address().address); }
    socket.end();
  });
};

// static function
udp2p.fetchIP = function (cb) {
  var IPs = [];
  this.checkIP(function(err, addr) {
    if(err || addr === undefined || addr.address === undefined ) {
      var interfaces = os.networkInterfaces();
      for(var i in interfaces) {
        if(Array.isArray(interfaces[i])) {
          for(var j in interfaces[i]) {
            var iface = interfaces[i][j];
            if('IPv4' == iface.family && iface.internal == false) {
              IPs.push(iface.address);
            }
          }
        }
      }
    }
    else {
      IPs.push(addr);
    }

    cb(undefined, { address: IPs });
  });
};

udp2p.fetchInfo = function (cb) {
  var self = this;
  var todo = 1;
  var info = {};
  var finish = false;
  var done = function (err, data) {
    todo --;
    if(!err && !!data) {
      var key = data._type;
      if(key) { info[key] = data; }
      else { for(var k in data) { info[k] = data[k]; } }
    }

    if (todo == 0 && !finish) {
      if(err) {
        cb(err);
      }
      else {
        cb(undefined, info);
      }
      finish = true;
    }
  };

  todo++;
  this.fetchIP(done);

  done();
};

// prototype function
udp2p.prototype.init = function (config) {
  var self = this;
  this.info = {};
  this.clients = [];
  this.clientIndex = {};

  this.waiting = {};
  this.result = {};
  this.callback = {};

  this.isReady = false;
  this.isStart = false;

  config = dvalue.default(config, {
      server: false,
      name: dvalue.guid()
  });

  udp2p.fetchInfo(function (err, data) {
    if(!err) {
      for(var k in data) {
        self.info[k] = data[k];
      }
      self.ready();
    }
  });

  this.config = config;

  // 0: server, 1: client
  this.mode = config.server? 0: 1;
  this.listen(config.port, function (err, data) {
    self.info.port = data;
  });
};

udp2p.prototype.get = function (key) {
  var key = new String(key).toLowerCase();
  var rs;
  switch (key) {
    case 'name':
      rs = this.config.name;
      break;
    default:
  }
  return rs;
};

udp2p.prototype.ready = function () {
  this.isReady = true;
  if(this.isStart) {
    this.readyToDo();
    delete this.readyToDo;
  }
};

udp2p.prototype.start = function (todo, cb) {
  this.isStart = true;
  if(typeof(todo) == 'function') {
    if(this.isReady) {
      todo(cb);
      return true;
    }
    else {
      this.readyToDo = function() { todo(cb) };
      return false;
    }
  }
};

udp2p.prototype.listen = function (port, cb) {
  var self = this;
  this.udp = dgram.createSocket('udp4');
  this.udp.on('listening', function () {
    var port = self.udp.address().port;
    cb(undefined, port)
  });

  var bind = function (port) {
    self.udp.bind(port);
  };

  this.udp.on('message', function (msg, peer) {
    self.execMessage(msg, peer);
  });
  this.udp.on('error', function (err) {
    bind();
  });

  bind(port);
};

udp2p.prototype.getStatus = function () {
  var status = {};
  return status;
};

udp2p.prototype.execMessage = function (msg, peer) {
  try {
    msg = JSON.parse(msg);
    peer.name = msg._from;
    console.log('--- get %s from %s', JSON.stringify(msg), JSON.stringify(peer)); //--
    switch (msg.type) {
      // for client mode
      case 'clientList':
        this.done(msg._id, msg.clientList);
        break;
      case 'punch':
        var message = this.translate({ _id: msg._id, type: 'ack' });
        this.send(message, peer);
        break;
      case 'ack':
        this.getAck(msg, peer);
        break;
      case 'connection':
        var client = msg.client;
        this.addClient(client);
        this.punch(client, function () {});
        break;

      // for server mode
      case 'register':
        var node = {
            name: msg.name,
            connections: {
              local: msg.linfo,
              public: peer
            },
            timestamp: new Date() / 1
        };
        this.addClient(node);
        break;
      case 'connect':
        var couple = [ this.getClient(msg._from), this.getClient(msg.to) ]
        for (var i=0; i<couple.length; i++) {
          if (!couple[i]) { break; }
        }
        for (var i=0; i<couple.length; i++) {
          var message = this.translate({
            _id: msg._id,
            type: 'connection',
            client: couple[(i+1) % couple.length],
          });
          this.send(message, couple[i].connections.public, function () {});
        }
        break;
      case 'fetchClient':
        var message = this.translate({
          _id: msg._id,
          type: 'clientList',
          from: peer
        });
        this.send(message, peer, function() {});
        break;

      default:
        if(msg.message) {
          console.log('++++++ Message from %s: %s', msg._from, msg.message);
          var message = { message: 'Hello, %s' + msg._from };
          var self = this;
          setTimeout(function () {
            self.peerMsg(message, msg._from, function () {});
          }, 1000);
        }
    }

    // every message as heartbeat
    if (msg._from !== undefined) {
      var id = msg._from;
      if(this.getClient(id)) {
        delete peer.name;
        this.setClient(id, {
          connections: {
            public: peer
          },
          timestamp: new Date() / 1
        });
      }
    }
  }
  catch (err) {
    // recieve file buffer
  }
};

udp2p.prototype.translate = function (cmd) {
  if(typeof(cmd) != 'object') { cmd = { type: cmd }; }
  var message = {
    _id: cmd._id || dvalue.randomID(),
    _from: this.get('name')
  };
  switch (cmd.type) {
    // for client mode
    case 'register':
      message.type = 'register';
      message.name = this.get('name');
      message.linfo = {
        address: this.info.address[0],
        port: this.info.port
      };
      break;
    case 'fetchClient':
      message.type = 'fetchClient';
      break;
    case 'connect':
      message.type = 'connect';
      message.from = this.get('name');
      message.to = cmd.target;
      break;
    case 'punch':
      message.type = 'punch';
      break;
    case 'ack':
      message.type = 'ack';
      break;
    case 'heartbeat':
      break;

    // for server mode
    case 'connection':
      message.type = 'connection';
      message.client = cmd.client;
      break;
    case 'clientList':
      message.type = 'clientList';
      message.clientList = [];
      var list = this.getClientList();
      for(var k in list) {
        if(new Date() - list[k].timestamp < (waitingRate * period) && list[k].name != cmd.from.name && (list[k].connections.public.address != cmd.from.address || list[k].connections.public.port != cmd.from.port)) {
          message.clientList.push(list[k]);
        }
      }
      break;
    default:
  }

  return message;
};

// Register as a candidate(to tracker) or a client(to leader)
udp2p.prototype.regist = function (server, cb) {

};

// need to link to tracker first
udp2p.prototype.connect = function (node, cb) {
  var self = this;
  if(arguments.length == 1 && typeof(node) == 'function') { cb = arguments[0]; node = undefined; }
  server = dvalue.default(node, server);

  this.start(function() {
    var msg = self.translate('register');
    self.send(msg, server, function() {
      self.heartbeat();
      if(typeof(cb) == 'function') { cb(); }
    });
  });
};

udp2p.prototype.heartbeat = function () {
  var self = this;
  this.sendHeartbeat(server);
  if(this.isAlive) { return; }
  this.isAlive = setTimeout(function () {
    delete self.isAlive;
    self.heartbeat();
  }, period);
};
udp2p.prototype.sendHeartbeat = function (server) {
  var self = this;
  if(Array.isArray(server)) {
    server.map(function (v) {
      self.sendHeartbeat(v);
    });
  }
  else {
    var msg = this.translate('heartbeat');
    this.send(msg, server, function () {})
  }
};

udp2p.prototype.fetchClient = function (cb) {
  cb = dvalue.default(cb, function () {});
  var self = this;
  var msg = self.translate('fetchClient');
  this.addJob(msg._id, 1, function (err, data) {
      data.map(function (v) {
        self.addClient(v);
      });
      cb(undefined, dvalue.clone(self.clients));
  });
  this.send(msg, server, function () {});
};

udp2p.prototype.setClient = function (name, data) {
  if((this.clientIndex[name] > -1)) {
    var newValue = dvalue.default(data, this.clients[this.clientIndex[name]]);
    this.clients[this.clientIndex[name]] = newValue;
  }
  else {
    data.name = name;
    this.addClient(data);
  }
};
udp2p.prototype.getClient = function (name) {
  return (this.clientIndex[name] > -1)? dvalue.clone(this.clients[this.clientIndex[name]]): undefined;
};
udp2p.prototype.getClientList = function () {
  return dvalue.clone(this.clients);
};

udp2p.prototype.addClient = function (client) {
  client = dvalue.default(client, {
    "name": undefined,
    "connections": {
      "local": {
        "address": undefined,
        "port": undefined
      },
      "public": {
        "address": undefined,
        "family": undefined,
        "port": undefined
      }
    }
  });
  if(!this.clientIndex[client.name]) {
    this.clientIndex[client.name] = (this.clients.push(client) - 1);
  }
  return this.clientIndex[client.name]
};

udp2p.prototype.getTunnel = function (client) {
  var index = this.clientIndex[client];
  return (this.clients[index])? this.clients[index].tunnel: undefined;
};

udp2p.prototype.tunnelReady = function (client) {
  var index = this.clientIndex[client];
  return  (index > -1) && !!this.clients[index].ack
};

udp2p.prototype.isPunching = function (client) {
  var index = this.clientIndex[client];
  return  (index > -1) && !!this.clients[index].punching;
};

udp2p.prototype.punch = function (client, cb) {
  var self = this;
  var ev = 'punch_' + client.name;
  this.addJob(ev, 0, cb);
  if(!this.isPunching(client.name)) {
    var index = this.clientIndex[client.name];
    this.clients[index].punching = true;
    var message = this.translate({ _id: ev, type: 'punch', target: client });
    this.doUntil(ev, function () {
      for(var k in client.connections) {
        self.send(message, client.connections[k], function () {});
      }
    }, 1000);
  }
};

udp2p.prototype.sendAck = function (msg, peer) {
  var message = this.translate({ _id: msg._id, type: 'ack' });
  this.send(message, peer, function () {});
};
udp2p.prototype.getAck = function (msg, peer) {
  var client = msg._from;
  var ev = msg._id;
  var index = this.clientIndex[client];
  this.clients[index].ack = true;
  this.clients[index].tunnel = peer;
  this.done(ev, peer);
};

udp2p.prototype.peerTo = function (client, cb) {
  cb = dvalue.default(cb, function () {});
  var self = this;
  if(this.tunnelReady(client)) {
    var tunnel = this.getTunnel(client);
    cb(undefined, tunnel);
  }
  else {
    var msg = self.translate({ type: 'connect', target: client });
    var ev = 'punch_' + client;
    this.addJob(ev, 0, cb);
    self.send(msg, server, function (err, data) {});
  }
};

udp2p.prototype.peerMsg = function (msg, client, cb) {
  var tunnel = this.getTunnel(client);
  if(tunnel) {
    this.tunnelMsg(msg, tunnel, cb);
  }
  else {
    this.peerTo(client, function (err, data) {
      this.tunnelMsg(msg, data, cb);
    });
  }
};
udp2p.prototype.tunnelMsg = function (msg, tunnel, cb) {
  msg._from = this.get('name');
  this.send(msg, tunnel, cb);
};

udp2p.prototype.send = function (msg, peer, cb) {
  var data = new Buffer(JSON.stringify(msg));
  this.udp.send(data, 0, data.length, peer.port, peer.address, function(err, bytes) {
    if(typeof(cb) == 'function') { cb(); }
  });
  console.log('--- send %s to %s', JSON.stringify(msg), JSON.stringify(peer));
};

udp2p.prototype.initEvent = function (event) {
	if(!event) { event = "_job"; }
	this.waiting[event] = 0;
	this.result[event] = [];
  this.callback[event] = [];
};
udp2p.prototype.addJob = function (event, n, callback) {
	if(!event) { event = "_job"; }
	if(!this.waiting[event]) { this.initEvent(event); }

	this.waiting[event] += n >= 0? n: 1;
  if(this.waiting[event] == 0) this.waiting[event] = 1;

	if(typeof(callback) == 'function') {
		this.callback[event].push(callback);
	}
};
udp2p.prototype.doUntil = function (event, job, interval) {
  interval = dvalue.default(interval, 1000);
  var self = this;
  if(this.waiting[event] > 0) {
    job();

    setTimeout(function () {
      self.doUntil(event, job, interval);
    }, interval);
  }
};
udp2p.prototype.done = function (event, data) {
	if(!event) { event = "_job"; }
	if(!this.waiting[event]) { return false; }
	if(data) { this.result[event].push(data); }

	this.waiting[event] --;
	this.waiting[event] = this.waiting[event] < 0? 0: this.waiting[event];
	if(this.waiting[event] == 0) {
		if(this.result[event].length == 1) { this.result[event] = this.result[event][0]; }
		this.cbReturn(false, this.result[event], this.callback[event]);
		this.cleanEvent(event);
	}
};
udp2p.prototype.cleanEvent = function (event) {
	if(!event) { event = "_job"; }
	if(!this.waiting[event]) { return false; }

	delete this.result[event];
	delete this.waiting[event];
  delete this.callback[event];
	return true;
};
udp2p.prototype.cbReturn = function (err, data, cb) {
	cb.map(function (f) {if(typeof f == 'function') f(err, data); });
};

module.exports = udp2p;
