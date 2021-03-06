var _ = require('underscore'),
  net = require('net'),
  vm = require('vm');

function Sandbox(opts) {
  _.extend(this, {
    socket: '/tmp/sandcastle.sock'
  }, opts);
}

Sandbox.prototype.start = function() {
  var _this = this;
  var data = '';

  this.server = net.createServer(function(c) {
    c.on('data', function(chunk) {
      var chunk = chunk.toString();

      if (chunk.charCodeAt(chunk.length - 1) !== 0) {
        data += chunk;
        // data is still incomplete
        return;
      } else {
        // append all but the separator
        data += chunk.substr(0, chunk.length - 1);
      }
      // execute the script with all data
      _this.executeScript(c, data);
      // reset data for the next data transfer
      data = '';
    });
  });

  this.server.listen(this.socket, function() {
    console.log('sandbox server created');
  });

  this.server.on('error', function() {
    setTimeout(function() {
      _this.start();
    }, 500);
  });
};

Sandbox.prototype.executeScript = function(connection, data) {

  var exitFunction = function(output) {
    try {
      connection.write(JSON.stringify(output) + '\u0000'); // separator char
    } catch(e) {
      connection.write(JSON.stringify({
        error: {
          message: e.message,
          stack: e.stack.replace()
        }
      }) + '\u0000');
    }
  }
  var contextObject = {
      exit: exitFunction,
      _send_message: function () {
        try {
          connection.write(JSON.stringify(arguments) + '\u0001'); // message separator char
        } catch (e) {
          connection.write(JSON.stringify({
            error: {
              message: e.message,
              stack: e.stack
            }
          }) + '\u0001');
        }
      },
      console: {
        log: function () {
        	contextObject._send_message(arguments)
        }
      },
      request: {params: {}, body: {}, query: {}, headers: {}},
      response: {send: exitFunction}
    };

  try {
    var script = JSON.parse(data);

    // The trusted API.
    if (script.sourceAPI) {
      var api = eval(script.sourceAPI);

      Object.keys(api).forEach(function(key) {
        contextObject[key] = api[key];
      });
    }

    // The trusted global variables.
    if (script.globals) {
      var globals = JSON.parse(script.globals);

      Object.keys(globals).forEach(function(key) {
        contextObject[key] = globals[key];
      });
    }

    vm.runInContext( this.wrapForExecution(script.source), vm.createContext(contextObject));
  } catch (e) {
    connection.write(JSON.stringify({
      error: {
        message: e.message,
        stack: e.stack
      }
    }) + '\u0000');
  }

};

Sandbox.prototype.wrapForExecution = function(source) {
  return "var exports = {};" + source + "\nexports.main();"
};

exports.Sandbox = Sandbox;
