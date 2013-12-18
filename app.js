#!/usr/bin/env node
/*
  SciVisum WebSocket / SignalR debug proxy
  © SciVisum Limited 2013
*/
/**
 * Module dependencies.
 */
require('colors');
var express = require('express');
var WebSocketServer = require('websocket').server;
var WebSocketClient = require('websocket').client;
var http = require('http');
var url = require('url');
var path = require('path');
var request = require('request');
var program = require('commander');

program
  .option('-p, --port <port>', 'Override listening port, default 3000', parseInt, 3000)
  .option('-h, --host <SignalR Web Hostname>', 'Set SignalR hostname/port, default http://signalrserver:81', url.parse, url.parse('http://signalrserver:81'))
  .option('-w, --wshost <SignalR WebSocket Hostname', 'Override WebSocket connection URL, defaults to host with ws(s)://', url.parse, null)
  .on('--help', function () {
    console.log('Example iptables rule to redirect to this proxy:')
    console.log('iptables -t nat -A OUTPUT -p tcp --dest host_to_proxy --dport 81 -j DNAT --to-destination my_ip:3000')
    console.log()
  })
  .parse(process.argv)

if (! program.wshost)
  program.wshost = url.parse(program.host.href.replace(/^http/, 'ws'));

console.log('Booting with config:'.bold.green, 'See --help for config options'.green);
console.log('  Listen port'.bold.green, program.port.toString().green);
console.log('  Forward http to'.bold.green, program.host.href.green);
console.log('  Forward websocket to'.bold.green, program.wshost.href.green);

var app = express();

// all environments
app.set('port', program.port);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

var ips = []
  , colours = ['blue', 'cyan', 'green', 'magenta', 'red', 'yellow'].reverse()

function colorIp (ip) {
  if ('string' !== typeof ip)
    return ip;
  ip = ip.trim();
  var index = ips.indexOf(ip);
  if (! ~ index)
    index = ips.push(ip) - 1;
  return ip[colours[index % colours.length]]
}

app.get('//:file', function (req, res) {
  var proxyReq = request({
      method: 'GET'
    , url: program.host.href + '/' + req.params.file
    , qs: req.query
    , headers: req.headers
  });
  // proxyReq.on('data', function (data) {
    // data = data.toString('utf8')
    // console.log(colorIp(req.ip), 'Get req response chunk'.magenta, proxyReq.uri.path)
    // console.log(data.slice(0,512))
    // if (data.length > 512)
    //   console.log('Chunk truncated at 512 chars'.bold.red)
    // console.log(colorIp(req.ip), 'End get req response'.red, proxyReq.uri.path)
  // });
  proxyReq.pipe(res);
});
app.get('/signalr/:file', function (req, res) {
  var proxyReq = request({
      method: 'GET'
    , url: program.host.href + 'signalr/' + req.params.file
    , qs: req.query
    , headers: req.headers
  });
  proxyReq.on('data', function (data) {
    data = data.toString('utf8')
    console.log(colorIp(req.ip), 'Get req response chunk'.magenta, proxyReq.uri.path)
    console.log(data.slice(0,512))
    if (data.length > 512)
      console.log('Chunk truncated at 512 chars'.bold.red)
    console.log(colorIp(req.ip), 'End get req response'.red, proxyReq.uri.path)
  });
  proxyReq.pipe(res);
})

var server = http.createServer(app);

var wsServer = new WebSocketServer({
    httpServer: server
})


wsServer.on('request', function (req) {
  try {
    console.log(colorIp(req.remoteAddress), 'WebSocket connection started:'.bold.yellow, req.resource);
    var client = new WebSocketClient;
    client.on('connectFailed', function (error) {
      req.reject();
    })
    client.on('connect', function (clientConnection) {
      var serverConnection = req.accept('', req.origin);
      serverConnection.on('message', function (msg) {
        console.log(colorIp(req.remoteAddress), 'WebSocket Data Web to Server'.magenta)
        console.log(msg)
        console.log(colorIp(req.remoteAddress), 'WebSocket End Data Web to Server'.red)
        if (msg.type === 'utf8')
          clientConnection.sendUTF(msg.utf8Data);
        else
          clientConnection.sendBytes(msg.binaryData);
      });
      clientConnection.on('message', function (msg) {
        console.log(colorIp(req.remoteAddress), 'WebSocket Data Server to Web'.cyan)
        console.log(msg)
        console.log(colorIp(req.remoteAddress), 'WebSocket End Data Server to Web'.blue)
        if (msg.type === 'utf8')
          serverConnection.sendUTF(msg.utf8Data);
        else
          serverConnection.sendBytes(msg.binaryData);
      })
      function closeHandler (connection, log) { var log = [].slice.call(arguments, 1); return function () { connection.close(); console.log.apply(console, log)} }
      serverConnection.on('close', closeHandler(clientConnection, colorIp(req.remoteAddress), 'WebSocket closed by Web'.bold.magenta));
      clientConnection.on('close', closeHandler(serverConnection, colorIp(req.remoteAddress), 'WebSocket closed by Server'.bold.cyan));
    })
    client.connect(program.wshost.href + req.resource.slice(1), req.protocols, req.origin, req.headers)
  } catch (e) {
    console.error('An exception was raised within the websocket forwarder', e, colorIp(req.remoteAddress));
    req.reject();
  }

})

server.listen(app.get('port'), function(){
  console.log('Express server listening on port'.bold.red, app.get('port').toString().red);
});
