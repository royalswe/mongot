# General Testing

Run these commands from `general.mongot.com`:

```sh
npm install
npx playwright install chromium
npm test
npm run test:coverage
npm run test:e2e
npm run test:all
brew services start mongodb-community # start mongodb
COOKIE_SECRET=hello node app.js # start app
```

`npm test` runs deterministic map, rating, and game-state tests with Node's built-in test runner. `npm run test:e2e` starts an isolated app on port 5182 and checks the lobby, map setup, and mobile layout in Chromium. Test mode skips MongoDB, so the browser suite does not read or write account data.

Before deploying, remember:

Run production with NODE_ENV=production.
Copy reserved-names.js and models.js to the root of mongot_prod.