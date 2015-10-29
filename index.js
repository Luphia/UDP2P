/*

var udp2p = require('udp2p');
var udp2p = require('./index.js');
client = new udp2p();

 */

var os = require('os'),
    dvalue = require('dvalue');

var udp2p = function (config) {
  this.init(config);
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
};


udp2p.prototype.getStatus = function () {
  var status = {

  };
  return status;
};

module.exports = udp2p;
