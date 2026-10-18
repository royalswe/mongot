import type { HttpResponse, HttpRequest } from 'uWebSockets.js';
import uWebSockets from 'uWebSockets.js';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { getErrorMessage, reportError } from './helpers/errorHandling';
import { getUserByCookie } from './helpers/cookieHandler';
import { EVENT } from './constants/events';
import Game from './game';
import Lobby from './lobby';
import highscoreStore from './highscores';

const port = process.env.PORT || 5300;
if (!process.env.COOKIE_SECRET) {
  throw new Error('COOKIE_SECRET must match the secret used by the mongot.com session service.');
}
const devCertDir = resolve(process.cwd(), '../.local-certs');
const loadTestToken = process.env.NODE_ENV === 'development'
  ? process.env.SNAKE_LOAD_TEST_TOKEN
  : undefined;
const loadTestEventLoop = loadTestToken ? monitorEventLoopDelay({ resolution: 20 }) : null;
loadTestEventLoop?.enable();

const uws = uWebSockets.SSLApp({
  key_file_name:
    process.env.NODE_ENV === 'development'
      ? resolve(devCertDir, 'key.pem')
      : '/etc/letsencrypt/live/mongot.com/privkey.pem',
  cert_file_name:
    process.env.NODE_ENV === 'development'
      ? resolve(devCertDir, 'certificate.pem')
      : '/etc/letsencrypt/live/mongot.com/cert.pem',
});

const open = (ws: any) => {
  if (ws.url === '/api/lobby') {
    Lobby.open(ws);
  } else if (ws.url === '/api/room') {
    Game.open(ws);
  }
};

const close = (ws: any, _code: any, _msg: any): void => {
  if (ws.url === '/api/lobby') {
    Lobby.close(ws);
  } else if (ws.url === '/api/room') {
    Game.close(ws);
  }
};

const sessionMiddleware = (next: any) => (res: HttpResponse, req: HttpRequest) => {
  getUserByCookie(req);
  next(res, req);
};

uws
  .ws('/*', {
    idleTimeout: 32,
    maxBackpressure: 1024,
    maxPayloadLength: 512,

    /* This immediately calls open handler, you must not use res after this call  */
    upgrade: (res, req, context) => {
      // check origin 
      if (process.env.NODE_ENV !== 'development' && req.getHeader('origin') !== 'https://snake.mongot.com') {
        return console.log('invalid origin');
      }

      res.upgrade(
        {
          url: req.getUrl(),
          user: getUserByCookie(req)
        },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context
      );
    },

    open,
    message: (ws: any, arrayBuffer, isBinary) => {
      try {
        if (ws.url === '/api/room') {
          return Game.listen(ws, arrayBuffer, isBinary);
        } else if (ws.url === '/api/lobby') {
          return Lobby.listen(ws, arrayBuffer, isBinary);
        }
      } catch (err) {
        reportError({ message: getErrorMessage(err) });
        return ws.send(
          JSON.stringify({ type: EVENT.error, msg: getErrorMessage(err) }),
          isBinary,
          true
        );
      }
    },
    close,
  })
  .get('/__load_test/metrics', (res, req) => {
    if (
      !loadTestToken ||
      !loadTestEventLoop ||
      req.getHeader('authorization') !== `Bearer ${loadTestToken}`
    ) {
      res.writeStatus('404').end('404 not found from server');
      return;
    }

    res
      .writeHeader('content-type', 'application/json; charset=utf-8')
      .end(JSON.stringify({
        memory: process.memoryUsage(),
        eventLoopDelayMs: {
          mean: Number.isFinite(loadTestEventLoop.mean) ? loadTestEventLoop.mean / 1e6 : 0,
          p95: loadTestEventLoop.percentile(95) / 1e6,
          p99: loadTestEventLoop.percentile(99) / 1e6,
          max: loadTestEventLoop.max / 1e6
        }
      }));
  })
  .get('/api/highscores', (res) => {
    let aborted = false;
    res.onAborted(() => {
      aborted = true;
    });
    void highscoreStore.getTop().then((scores) => {
      if (aborted) return;
      res.cork(() => {
        res
          .writeHeader('content-type', 'application/json; charset=utf-8')
          .end(JSON.stringify(scores));
      });
    }).catch((error: unknown) => {
      reportError({ message: `Could not load high scores: ${getErrorMessage(error)}` });
      if (aborted) return;
      res.cork(() => {
        res.writeStatus('500 Internal Server Error').end('Could not load high scores');
      });
    });
  })
  .get('/*', res => { res.writeStatus('404').end('404 not found from server'); })
  .get('/api/user', sessionMiddleware((res: HttpResponse, req: any) => {
    res.end(`account ${JSON.stringify(req.user?.username) || 'guest'}`);
  }))

  .post('/api/authenticate', (res, req: any) => {
    if (process.env.NODE_ENV === 'development') {
      res.writeHeader("Access-Control-Allow-Origin", req.getHeader('origin')); //allow cors
      res.writeHeader("Access-Control-Allow-Credentials", "true");
    }
    // check if user is logged in with cookie middleware
    const user = getUserByCookie(req);

    res.end(user?.username || 'guest');
  });

uws.listen(+port, (token) => {
  token
    ? console.log(`Listening to uws ${port}`)
    : console.log(`Failed to listen uws port ${port}`);
});

export default uws;
