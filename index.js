/*

var udp2p = require('udp2p');
var udp2p = require('./index.js');
client = new udp2p();

var server = { host: '127.0.0.1', port: 6312 };
client.connect(server);
var list = client.getClientList();
client.peerTo(list[1], function () {});

var msg = { test: 'message' };
client.send(msg, list[1], function () {});

 */

var os = require('os'),
    dgram = require('dgram'),
    net = require('net'),
    dvalue = require('dvalue');

var udp2p = function (config) {
  this.init(config);
};

udp2p.guid = function () {
	var s4 = function() {
		return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
	};
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +s4() + '-' + s4() + s4() + s4();
};

// get self IP for connection
udp2p.checkIP = function (cb) {
  var net = require('net');
  var socket = net.createConnection(80, 'laria.space');
  socket.on('connect', function() {
  	if(typeof(cb) == 'function') { cb(undefined, socket.address().address) }
  	socket.end();
  });
  socket.on('error', function(e) {
  	if(typeof(cb) == 'function') { cb(undefined, socket.address().address) }
    socket.end();
  });
};

// static function
udp2p.fetchIP = function (cb) {
  var IPs = [];
  this.checkIP(function(err, ip) {
    if(err || ip === undefined) {
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
      IPs.push(ip);
    }

    cb(undefined, { host: IPs });
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
  this.isReady = false;
  this.isStart = false;

  config = dvalue.default(config, {
      server: false,
      name: udp2p.guid()
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
  this.listen(undefined, function (err, data) {
    self.info.port = data;
  });
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
    self.exeMessage(msg, peer);
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

udp2p.prototype.exeMessage = function (msg, peer) {
  switch (msg.type) {
    case 'punch':
      var cmd = { type: 'ack' };
      var message = this.translate(cmd);
      this.send(message, peer);
      break;
    case 'connect':
      break;
    default:
  }
};

udp2p.prototype.translate = function (cmd) {
  if(typeof(cmd) != 'object') { cmd = { type: cmd }; }
  var message = {};
  switch (cmd.type) {
    case 'register':
      message.type = 'register';
      message.name = this.config.name;
      message.node = {
        host: this.info.host[0],
        port: this.info.port
      };
      break;
    case 'ack':
      break;
    default:
  }

  return message;
};

// Register as a candidate(to tracker) or a client(to leader)
udp2p.prototype.regist = function (server, cb) {

};

// need to link to tracker first
udp2p.prototype.connect = function (server, cb) {
  var self = this;
  this.start(function() {
    var msg = self.translate('register');
    self.send(msg, server, function() {});
  });
};

udp2p.prototype.peerTo = function (client, cb) {

};

udp2p.prototype.send = function (msg, peer, cb) {
  var data = new Buffer(JSON.stringify(msg));
  this.udp.send(data, 0, data.length, peer.port, peer.host, function(err, bytes) {});
};

module.exports = udp2p;
