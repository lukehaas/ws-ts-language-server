#!/usr/bin/env node

import getPort from 'get-port';
import { WebSocketServer } from 'ws';
import argv from 'minimist';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createConnection,
  createServerProcess,
  forward,
} from 'vscode-ws-jsonrpc/server';
import { WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';

const { execPath } = argv(process.argv.slice(2));

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename);

function toSocket(webSocket) {
  return {
    send: content => webSocket.send(content),
    onMessage: cb => {
      webSocket.onmessage = event => cb(event.data);
    },
    onError: cb => {
      webSocket.onerror = event => {
        if ('message' in event) {
          cb(event.message);
        }
      };
    },
    onClose: cb => {
      webSocket.onclose = event => cb(event.code, event.reason);
    },
    dispose: () => webSocket.close(),
  };
}
function nodeJSONRPC({ languageServers, port }) {
  const wss = new WebSocketServer({
    host: 'localhost',
    // path: '/typescript',
    // noServer: true,
    port,
    perMessageDeflate: false,
  });
  wss.on('connection', (client, request) => {
    let langServer;
    Object.keys(languageServers).forEach(key => {
      if (request.url === `/${key}`) {
        langServer = languageServers[key];
      }
    });
    if (!langServer || !langServer.length) {
      return client.close();
    }

    const localConnection = createServerProcess(
      'jsonrpc',
      langServer[0],
      langServer.slice(1)
    );
    const socket = toSocket(client);
    const reader = new WebSocketMessageReader(socket);
    const writer = new WebSocketMessageWriter(socket);
    const connection = createConnection(reader, writer, () => socket.dispose());
    forward(connection, localConnection, message => {
      return message;
    });
  });
}

const languageServerPath = path.resolve(
  __dirname,
  '../node_modules/typescript-language-server/lib/cli.mjs'
);

getPort()
  .then(port => {
    nodeJSONRPC({
      port,
      languageServers: {
        typescript: [
          execPath,
          languageServerPath,
          '--stdio',
        ],
        // html:[
        //   'node',
        //   './node_modules/vscode-html-languageserver-bin/htmlServerMain.js',
        //   '--stdio'
        // ],
        // css:[
        //   'node',
        //   './node_modules/vscode-css-languageserver-bin/cssServerMain.js',
        //   '--stdio'
        // ]
      },
    });
    process.stdout.write(`${port}`);
  })
  .catch(() => {
    process.stderr.write('Failed to start server');
  });
