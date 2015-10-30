/*

var udp2p = require('udp2p');
var udp2p = require('./index.js');
client = new udp2p();

 */

var os = require('os'),
    dgram = require('dgram'),
    net = require('net'),
    dvalue = require('dvalue');

var udp2p = function (config) {
  this.init(config);
};

// get self IP for connection
udp2p.checkIP = function (cb) {

};

// static function
udp2p.fetchIP = function () {


  var ifaces = os.getNetworkInterfaces();
  var interfaces = os.getNetworkInterfaces();
  var IPs = [];
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
  return IPs;
};

udp2p.fetchInfo = function () {
  var info = {
		IPs: this.fetchIP()
	};
	return info;
};

// prototype function
udp2p.prototype.init = function (config) {
  config = dvalue.default(config, {
      server: false
  });

  this.info = udp2p.fetchInfo();
  this.config = config;

  // 0: server, 1: client
  this.mode = config.server? 0: 1;
  this.listen();
};

udp2p.prototype.listen = function (port) {
  var that = this;
  this.udp = dgram.createSocket('udp4');
  this.udp.on('listening', function () {

  });

  this.udp.on('message', function () {
    that.parseMessage();
  });

  this.udp.bind(port);
};

udp2p.prototype.getStatus = function () {
  var status = {};
  return status;
};

udp2p.prototype.parseMessage = function (message) {

};

// Register as a candidate(to tracker) or a client(to leader)
udp2p.prototype.regist = function (server, cb) {

};

// need to link to tracker first
udp2p.prototype.connect = function (server, cb) {

};

udp2p.prototype.peerTo = function (client, cb) {

};

module.exports = udp2p;
