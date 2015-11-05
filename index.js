/*

// start server
var udp2p = require('./index.js');
var server = new udp2p({server: true});

// start client
var udp2p = require('./index.js');
client = new udp2p();
var server = { address: '127.0.0.1', port: 2266 };

client.connect(server, function () {
  client.fetchClient(function(e, d) {
    var c = d.pop().name;
    console.log(c);
    client.peerTo(c, function (ee, dd) {
      console.log(dd);
      client.tunnelMsg({message: 'Hello, ' + c}, dd, function () {});
    });
  });
});

 */

var os = require('os'),
    dgram = require('dgram'),
    net = require('net'),
    raid2x = require('raid2x'),
    dvalue = require('dvalue');

var server = {
  address: 'laria.space',
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
  if(config.server) {
    this.startServer(config);
  }
  else {
    this.listen(undefined, function (err, data) {
      self.info.port = data;
    });
  }
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
    switch (msg.type) {
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
      default:
        console.log('Message from %s: %s', msg._from, msg.message);//--
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
    case 'register':
      message.type = 'register';
      message.name = this.get('name');
      message.linfo = {
        address: this.info.address[0],
        port: this.info.port
      };
      break;
    case 'clientList':
      message.type = 'clientList';
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
  var msg = self.translate('clientList');
  this.addJob(msg._id, 1, function (err, data) {
      data.map(function (v) {
        self.addClient(v);
      });
      cb(undefined, dvalue.clone(self.clients));
  });
  this.send(msg, server, function () {});
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
    var message = this.translate({ type: 'punch', target: client });
    this.doUntil(ev, function () {
      for(var k in client.connections) {
        self.send(message, client.connections[k], function () {});
      }
    }, 1000);
  }
};

udp2p.prototype.getAck = function (msg, peer) {
  var client = msg._from;
  var ev = 'punch_' + client;
  var index = this.clientIndex[client];
  this.clients[index].ack = true;
  this.clients[index].tunnel = peer;
  this.done(ev, peer);
};

udp2p.prototype.peerTo = function (client, cb) {
  cb = dvalue.default(cb, function () {});
  var self = this;
  if(this.tunnelReady(client)) {
    var node = this.clients[this.clientIndex[client]];
    cb(undefined, node);
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

udp2p.prototype.startServer = function (options) {
  options = dvalue.default(options, {
    port: 2266
  });

  var udp_matchmaker = dgram.createSocket('udp4');
  var clients = {};

  udp_matchmaker.on('listening', function() {
    var address = udp_matchmaker.address();
    console.log('# listening [%s:%s]', address.address, address.port);
  });

  udp_matchmaker.on('message', function(data, rinfo) {
		delete rinfo.size;
    try {
      data = JSON.parse(data);
    } catch (e) {
      return console.log('! Couldn\'t parse data (%s):\n%s', e, data);
    }
    if (data.type == 'register') {
      clients[data.name] = {
          name: data.name,
          connections: {
            local: data.linfo,
            public: rinfo
          },
					timestamp: new Date() / 1
      };
      console.log('# Client registered: %s@[%s:%s | %s:%s]', data.name,
                  rinfo.address, rinfo.port, data.linfo.address, data.linfo.port);
    }
		else if (data.type == 'connect') {
      var couple = [ clients[data.from], clients[data.to] ]
      for (var i=0; i<couple.length; i++) {
        if (!couple[i]) return console.log('Client unknown!');
      }

      for (var i=0; i<couple.length; i++) {
        send(couple[i].connections.public.address, couple[i].connections.public.port, {
					_id: data._id,
          type: 'connection',
          client: couple[(i+1)%couple.length],
        });
      }
    }
		else if (data.type == 'clientList') {
			var response = {
				_id: data._id,
				type: 'clientList',
				clientList: []
			}
			var list = dvalue.clone(clients);
			for(var k in list) {
				if(new Date() - list[k].timestamp < (waitingRate * period) && (list[k].connections.public.address != rinfo.address || list[k].connections.public.port != rinfo.port)) {
					response.clientList.push(list[k]);
				}
			}
			send(rinfo.address, rinfo.port, response);
		}

    // every message as heartbeat
    if (data._from !== undefined) {
      var id = data._from;
      if(typeof(clients[id]) == 'object') {
        clients[id].connections.public = rinfo;
        clients[id].timestamp = new Date() / 1;
      }
    }
  });

  var send = function(host, port, msg, cb) {
    var data = new Buffer(JSON.stringify(msg));
    udp_matchmaker.send(data, 0, data.length, port, host, function(err, bytes) {
      if (err) {
        udp_matchmaker.close();
        console.log('# stopped due to error: %s', err);
      } else {
        console.log('# sent '+msg.type);
        if (cb) cb();
      }
    });
  }

  udp_matchmaker.bind(options.port);
};

module.exports = udp2p;
