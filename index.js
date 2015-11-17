/*

// start server
var udp2p = require('./index.js');
var server = new udp2p({name: 'server', port: 2266});
server.on('message', function (data) {
  console.log('%s: %s', data.from, JSON.stringify(data.content));
});
server.on('file', function (data) {
  var savePath = '/Users/luphia/Desktop/' + data.name;
  console.log('recieve file [%s] from %s', data.name, data.from);
  data.r2x.save(savePath);
});

// start client1
var udp2p = require('./index.js');
client = new udp2p({name: 'client1'});
var server = { address: '127.0.0.1', port: 2266 };
client.get('name');
client.connect(server, function () {});
client.on('message', function (data) {
  console.log('%s: %s', data.from, JSON.stringify(data.content));
});
client.on('file', function (data) {
  var savePath = '/Users/luphia/Desktop/' + data.name;
  console.log('recieve file [%s] from %s', data.name, data.from);
  data.r2x.save(savePath);
});


// start client2
var udp2p = require('./index.js');
client = new udp2p({name: 'client2'});
var server = { address: 'laria.space', port: 2266 };
client.get('name');
client.connect(server, function () {
  client.fetchClient(function(e, d) {
    d.map(function(v) {
      var c = v.name;
      client.peerFile('/Users/luphia/Documents/Workspace/Playground/logo.png', c, function () {});
      client.peerMsg({message: 'YO!'}, c, function () {});
    });
  });
});

 */

var os = require('os'),
    fs = require('fs'),
    dgram = require('dgram'),
    net = require('net'),
    path = require('path'),
    textype = require('textype'),
    raid2x = require('raid2x'),
    dvalue = require('dvalue');

var server = {
  address: 'tracker.cc-wei.com',
  port: 2266
};

var sliceSize = 8192;
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

udp2p.toBuffer = function (data) {
  var type = textype.typeOf(data);
  var rs;
  switch(type) {
    case 1: // Buffer
      var name = new Buffer(data._name || '');
      rs = new Buffer(data.length + name.length + 2).fill(0);
      rs[0] = data._type || 1;
      rs[1] = name.length + 2;
      name.copy(rs, 2, 0);
      data.copy(rs, rs[1], 0);
      break;
    case 2: // JSON
      data = new Buffer(JSON.stringify(data));
      rs = new Buffer(data.length + 2).fill(0);
      rs[0] = 2;
      rs[1] = 2;
      data.copy(rs, rs[1], 0);
      break;
    default:
  }
  return rs;
};

udp2p.parseBuffer = function (buffer) {
  if(!Buffer.isBuffer(buffer)) { return false; }
  var type = buffer[0];
  var data = buffer.slice(buffer[1]);
  switch(type) {
    case 1: // Buffer
      data._name = buffer.slice(2, buffer[1]).toString();
      break;
    case 2: // JSON
      data = JSON.parse(data);
      break;
    case 30:
      data.type = 'bridge';
      data._target = buffer.slice(2, buffer[1]).toString();
      break;
    case 31:
      data.type = 'proxy';
      data._from = buffer.slice(2, buffer[1]).toString();
      break;
    case 33:
      data.type = 'broadcast';
      data._from = buffer.slice(2, buffer[1]).toString();
      break;
    default:
  }

  return data;
};

// prototype function
udp2p.prototype.init = function (config) {
  var self = this;
  this.info = {};
  this.clients = [];
  this.clientIndex = {};
  this.clientTunnel = {};
  this.tunnels = {};

  this.waiting = {};
  this.timeout = {};
  this.result = {};
  this.callback = {};
  this.locks = {};

  this.tmpFile = {};

  this.event = {
    message: function (msg) {
      console.log('Message from %s: %s', msg.from, JSON.stringify(msg.content));
    },
    file: function (msg) {
      console.log('File from %s: %s', msg.from, msg.name);
      msg.r2x.save('/Users/luphia/Desktop/' + msg.name);
    }
  }

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

udp2p.prototype.on = function (ev, cb) {
  switch(ev) {
    case 'message':
      if(typeof(cb) == 'function') {
        this.event.message = cb;
      }
      break;
    case 'file':
      if(typeof(cb) == 'function') {
        this.event.file = cb;
      }
      break;
    default:
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
    console.trace(err);
    bind();
  });

  bind(port);
};

udp2p.prototype.getStatus = function () {
  var status = {};
  return status;
};

udp2p.prototype.execMessage = function (msg, peer) {
  var self = this;
  try {
    msg = udp2p.parseBuffer(msg);
    peer.name = msg._from;
    // if(msg.type) console.log('--- get %s: %s from %s', msg.type, JSON.stringify(msg), JSON.stringify(peer)); //--
    switch (msg.type) {
      // for client mode
      case 'clientList':
        msg.clientList.map(function (v) {
          self.addClient(v);
        });
        this.done(msg._id, msg.clientList);
        break;
      case 'openTunnel':
        var client = msg.client;
        this.openTunnel(function(err, tunnel) {
          self.setTunnel(client.name, tunnel);
          var message = self.translate({
            type: 'readyConnect',
            target: client.name
          });
          self.sendBy(message, tunnel, peer, function () {});
          self.punch(client, function () {});
        });
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

        var message = this.translate({type: 'serverInfo'});
        this.send(message, peer, function () {});

        var message = this.translate({type: 'clientList', from: peer});
        this.send(message, peer, function () {});

        var command = this.translate({type: 'online', client: node});
        this.leaderMsg(command, [node.name], function () {});
        break;
      case 'serverInfo':
        node = {
            name: msg.name,
            public: true,
            connections: {
              local: msg.linfo,
              public: peer
            },
            timestamp: new Date() / 1
        };
        this.addClient(node);
        break;
      case 'connect':
        var target = this.getClient(msg.to).connections.public;
        var client = this.getClient(msg._from);
        client.connections.public = peer;
        client.connections.local.port = peer.port;
        var message = this.translate({
          _id: msg._id,
          type: 'openTunnel',
          client: client
        });
        this.send(message, target, function () {});
        break;
      case 'readyConnect':
        var target = this.getClient(msg.to).connections.public;
        var client = this.getClient(msg._from);
        client.connections.public = peer;
        client.connections.local.port = peer.port;
        var message = this.translate({
          _id: msg._id,
          type: 'connection',
          client: client
        });
        this.send(message, target, function () {});
        break;
      case 'fetchClient':
        var message = this.translate({
          _id: msg._id,
          type: 'clientList',
          from: peer
        });
        this.send(message, peer, function() {});
        break;
      case 'bridge':
        var sender = this.findClient(peer);
        var target = this.getClient(msg._target).connections.public;
        msg._name = sender;
        msg._type = 31;
        this.send(msg, target, function() {});
        break;
      case 'proxy':
        var sender = msg._from;
        var msg = udp2p.parseBuffer(msg);
        if(sender) {
          this.onPeerMsg(msg, sender);
        }
        else {
          this.onLeaderMsg(msg);
        }
        break;
      case 'broadcast':
        var sender = this.findClient(peer);
        msg._name = sender;
        this.broadcast(msg, [sender], function () {});
        break;
      default:
        if(!msg._from) {
          var sender = this.findClient(peer);
          self.onPeerMsg(msg, sender);
        }
    }

    // every message as heartbeat
    var id = msg._from;
    if (msg._from !== undefined && this.getClient(id)) {
      if(msg.type != 'connect' && msg.type != 'readyConnect') {
        delete peer.name;
        this.setClient(id, {
          connections: {
            public: peer
          },
          timestamp: new Date() / 1
        });
      }
      else {
        this.setClient(id, {
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
    case 'serverInfo':
      message.type = 'serverInfo';
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
      message.to = cmd.target;
      break;
    case 'readyConnect':
      message.type = 'readyConnect';
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
    case 'openTunnel':
      message.type = 'openTunnel';
      message.client = cmd.client;
      break;
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
    case 'online':
      message.type = 'online';
      message.client = cmd.client;
      break;
    case 'offline':
      message.type = 'offline';
      message.client = cmd.client;
      break;
    default:
  }

  return message;
};

// Register as a candidate(to tracker) or a client(to leader)
udp2p.prototype.regist = function (target, cb) {
  var self = this;
  var msg = this.translate('register');
  this.send(msg, target, function() {
    self.heartbeat();
    if(typeof(cb) == 'function') { cb(); }
  });
};

// need to link to tracker first
udp2p.prototype.connect = function (node, cb) {
  var self = this;
  if(arguments.length == 1 && typeof(node) == 'function') { cb = arguments[0]; node = undefined; }
  server = dvalue.default(node, server);

  this.start(function() {
    self.regist(server, cb);
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
  var msg = this.translate('heartbeat');
  this.send(msg, server, function () {});
};

udp2p.prototype.fetchClient = function (cb) {
  cb = dvalue.default(cb, function () {});
  var self = this;
  var msg = self.translate('fetchClient');
  this.addJob(msg._id, 1, function (err, data) {
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
udp2p.prototype.findClient = function (peer) {
  var rs = false;
  for(var k in this.clients) {
    if(this.clients[k].connections.public.address == peer.address && this.clients[k].connections.public.port == peer.port) {
      rs = this.clients[k].name;
    }
  }
  return rs;
};
udp2p.prototype.getClientList = function () {
  return dvalue.clone(this.clients);
};

udp2p.prototype.addClient = function (client) {
  if(this.isLock(client.name)) {
    var self = this;
    setTimeout(function () {
      self.addClient(client);
    }, 10);
    return;
  }
  this.lock(client.name);
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
  this.unlock(client.name);
  return this.clientIndex[client.name];
};

udp2p.prototype.getClientTunnel = function (client) {
  if(this.isPublic(client)) {
    tunnel = this.getClient(client).connections.public;
  }
  else {
    tunnel = this.clientTunnel[client];
  }
  return tunnel;
};
udp2p.prototype.setClientTunnel = function (client, tunnel) {
  if(!!client) {
    this.clientTunnel[client] = tunnel;
    var ev = 'punch_' + client;
    this.done(ev, tunnel);
    return true;
  }
  return false;
};

udp2p.prototype.getTunnel = function (client) {
  if(this.isPublic(client)) {
    tunnel = this.udp;
  }
  else {
    tunnel = this.tunnels[client];
  }
  return tunnel;
};
udp2p.prototype.setTunnel = function (client, tunnel) {
  if(!!client) {
    this.tunnels[client] = tunnel;
    return true;
  }
  return false;
};

udp2p.prototype.tunnelReady = function (client) {
  return this.isPublic(client) || (!!this.clientTunnel[client] && !!this.tunnels[client]);
};

udp2p.prototype.isPublic = function (client) {
  var node =  this.getClient(client) || {};
  return !!node.public;
};

udp2p.prototype.isPunching = function (client) {
  var index = this.clientIndex[client];
  return (index > -1) && !!this.clients[index].punching;
};

udp2p.prototype.onLeaderMsg = function (msg) {
  switch(msg.type) {
    case 'online':
      this.addClient(msg.client);
      break;
    case 'offline':
      break;
    default:
  }
};
udp2p.prototype.onPeerMsg = function (msg, sender) {
  var recieveMsg = {
    from: sender
  };
  if(msg._meta) { // initial file recieve
    this.tmpFile[msg._name] = new raid2x(msg._meta);
  }
  else if(Buffer.isBuffer(msg)) { // recieve file shard
    var r2x = this.tmpFile[msg._name];
    if(r2x) {
      if(r2x.importShard(msg) == 1) {
        recieveMsg.name = r2x.attr.name;
        recieveMsg.r2x = r2x;
        this.event.file(recieveMsg);
      }
    }
  }
  else if(typeof(msg) == 'object') { // recieve msg
    recieveMsg.content = msg;
    this.event.message(recieveMsg);
  }
};
udp2p.prototype.openTunnel = function (cb) {
  var self = this;
  var tunnel = dgram.createSocket('udp4');
  tunnel.on('listening', function () {
    var port = tunnel.address().port;
    cb(undefined, tunnel);
  });

  tunnel.on('message', function (msg, peer) {
    try {
      msg = udp2p.parseBuffer(msg);
      peer.name = msg._from;
      switch (msg.type) {
        case 'punch':
          tunnel._target = msg._from;
          self.getPunch(msg, peer);
          var message = self.translate({ _id: msg._id, type: 'ack' });
          self.sendBy(message, tunnel, peer, function() {});
          break;
        case 'ack':
          tunnel._target = msg._from;
          self.getAck(msg, peer);
          break;

        default:
          self.onPeerMsg(msg, tunnel._target);
      }
    }
    catch (err) {
      console.trace(err);
    }
  });
  tunnel.on('error', function (err) {});

  tunnel.bind();
};

udp2p.prototype.punch = function (client, cb) {
  var self = this;
  var ev = 'punch_' + client.name;
  this.addJob(ev, 0, cb);
  if(!this.isPunching(client.name)) {
    var tunnel = this.getTunnel(client.name);
    this.setClient(client.name, {punching: true});
    var message = this.translate({ _id: ev, type: 'punch', target: client });
    this.doUntil(ev, function () {
      for(var k in client.connections) {
        self.sendBy(message, tunnel, client.connections[k], function () {});
      }
    }, 1000, 10000, function () {
      if(!self.tunnelReady(client)) {
        var old = self.getTunnel(client.name);
        if(typeof(old.close) == 'function') { old.close(); }
        self.setTunnel(client.name, -1);
        self.setClientTunnel(client.name, {name: client.name});
      }
    });
  }
};

udp2p.prototype.getPunch = function (msg, peer) {
  var client = msg._from;
  var ev = 'punch_' + client;
  this.setClient(client, {ack: true});
  this.setClientTunnel(client, peer);
};
udp2p.prototype.getAck = function (msg, peer) {
  var client = msg._from;
  var ev = msg._id;
  this.setClient(client, {ack: true});
  this.setClientTunnel(client, peer);
};

udp2p.prototype.peerTo = function (client, cb) {
  cb = dvalue.default(cb, function () {});
  var self = this;
  if(this.tunnelReady(client)) {
    cb(undefined, true);
  }
  else {
    var msg = self.translate({ type: 'connect', target: client });
    var ev = 'punch_' + client;
    this.addJob(ev, 0, cb);
    this.openTunnel(function (err, tunnel) {
      self.setTunnel(client, tunnel);
      self.sendBy(msg, tunnel, server, function (err, data) {});
    });
  }
};

udp2p.prototype.broadcastMsg = function (msg, cb) {
  msg = udp2p.toBuffer(msg);
  msg._type = 33;
  this.send(msg, server, cb);
};
udp2p.prototype.peerMsg = function (msg, client, cb) {
  var self = this;
  if(this.tunnelReady(client)) {
    var tunnel = this.getTunnel(client);
    var peer = this.getClientTunnel(client);
    this.sendBy(msg, tunnel, peer, cb);
  }
  else {
    this.peerTo(client, function (err, data) {
      self.peerMsg(msg, client, cb);
    });
  }
};
udp2p.prototype.peerFile = function (file, client, cb) {
  var self = this;
  if(this.tunnelReady(client)) {
    var tunnel = this.getTunnel(client);
    var peer = this.getClientTunnel(client);
    var r2x = new raid2x(file);
    r2x.setSliceSize(sliceSize - 8);
    var name = dvalue.randomID();
    var msg = {
      _name: name,
      _meta: r2x.getMeta(true)
    };
    var sliceCount = msg._meta.sliceCount;
    self.peerMsg(msg, client, function () {
      for(var i = 0; i < sliceCount; i++) {
        var buffer = r2x.getShard(i);
        buffer._name = name;
        self.sendBy(buffer, tunnel, peer, function () {});
      }
    });
  }
  else {
    this.peerTo(client, function (err, data) {
      self.peerFile(file, client, cb);
    });
  }
};

udp2p.prototype.send = function (msg, peer, cb) {
  var data = udp2p.toBuffer(msg);
  this.udp.send(data, 0, data.length, peer.port, peer.address, function(err, bytes) {
    if(typeof(cb) == 'function') { cb(); }
  });
  // if(!!msg.type) console.log('--- send %s: %s to %s', msg.type, JSON.stringify(msg), JSON.stringify(peer)); //--
};
udp2p.prototype.sendBy = function (msg, tunnel, peer, cb) {
  if(!!msg.type) { msg._from = this.get('name'); }
  var data = udp2p.toBuffer(msg);
  if(tunnel != -1) {
    tunnel.send(data, 0, data.length, peer.port, peer.address, function(err, bytes) {
      if(typeof(cb) == 'function') { cb(); }
    });
  }
  else {
    data._type = 30;
    data._name = peer.name;
    this.send(data, server, cb);
  }
};
udp2p.prototype.broadcast = function (msg, exception, cb) {
  if(arguments.length == 2) {
    if(typeof(arguments[1]) == 'function') {
      exception = [];
      cb = arguments[1];
    }
  }
  var self = this;
  msg._type = 31;
  exception = dvalue.default(exception, []);
  if(!Array.isArray(exception)) { exception = [exception]; }
  this.clients.map(function (v) {
    if(exception.indexOf(v.name) > -1) { return; }
    self.send(msg, v.connections.public, function () {});
  });
};
udp2p.prototype.leaderMsg = function (msg, exception, cb) {
  msg = udp2p.toBuffer(msg);
  this.broadcast(msg, exception, cb);
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
udp2p.prototype.doUntil = function (event, job, interval, timeout, after) {
  interval = dvalue.default(interval, 1000);
  if(timeout > 0) { this.timeout[event] = new Date() / 1 + timeout; }
  var self = this;
  if(this.waiting[event] > 0) {
    if(this.timeout[event] > 0 && new Date() / 1 > this.timeout[event]) {
      if(typeof(after) == 'function') { after(); }
      return;
    }
    job();
    setTimeout(function () {
      self.doUntil(event, job, interval, 0, after);
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

udp2p.prototype.lock = function (ev) {
  ev = dvalue.default(ev, '_lock');
  this.locks[ev] = true;
};
udp2p.prototype.unlock = function (ev) {
  delete this.locks[ev];
};
udp2p.prototype.isLock = function (ev) {
  return !!this.locks[ev];
};

module.exports = udp2p;
