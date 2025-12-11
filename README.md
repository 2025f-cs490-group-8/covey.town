# Covey.Town

Covey.Town provides a virtual meeting space where different groups of people can have simultaneous video calls, allowing participants to drift between different conversations, just like in real life.
Covey.Town was built for Northeastern's [Spring 2021 software engineering course](https://neu-se.github.io/CS4530-CS5500-Spring-2021/), and is designed to be reused across semesters.
You can view our reference deployment of the app at [app.covey.town](https://app.covey.town/), and our project showcase ([Fall 2022](https://neu-se.github.io/CS4530-Fall-2022/assignments/project-showcase), [Spring 2022](https://neu-se.github.io/CS4530-Spring-2022/assignments/project-showcase), [Spring 2021](https://neu-se.github.io/CS4530-CS5500-Spring-2021/project-showcase)) highlight select student projects.

![Covey.Town Architecture](docs/covey-town-architecture.png)

The figure above depicts the high-level architecture of Covey.Town.
The frontend client (in the `frontend` directory of this repository) uses the [PhaserJS Game Library](https://phaser.io) to create a 2D game interface, using tilemaps and sprites.
The frontend implements video chat using the [Twilio Programmable Video](https://www.twilio.com/docs/video) API, and that aspect of the interface relies heavily on [Twilio's React Starter App](https://github.com/twilio/twilio-video-app-react). Twilio's React Starter App is packaged and reused under the Apache License, 2.0.

A backend service (in the `townService` directory) implements the application logic: tracking which "towns" are available to be joined, and the state of each of those towns.

## Running this app locally

Running the application locally entails running both the backend service and a frontend.

### Setting up the backend

To run the backend, you will need a Twilio account. Twilio provides new accounts with $15 of credit, which is more than enough to get started.
To create an account and configure your local environment:

1. Go to [Twilio](https://www.twilio.com/) and create an account. You do not need to provide a credit card to create a trial account.
2. Create an API key and secret (select "API Keys" on the left under "Settings")
3. Create a `.env` file in the `townService` directory with the following environment variables:

#### Required Environment Variables

| Config Value            | Description                               | Where to Find It                                    |
| ----------------------- | ----------------------------------------- | --------------------------------------------------- |
| `TWILIO_ACCOUNT_SID`    | Your Twilio Account SID                   | Visible on your [Twilio account dashboard](https://console.twilio.com/) under "Account Info" |
| `TWILIO_API_KEY_SID`    | The SID of the API key you created        | Created when you create an API key (select "API Keys" under "Settings" in Twilio console) |
| `TWILIO_API_KEY_SECRET` | The secret for the API key you created    | Shown only once when you create the API key - save it immediately! |
| `TWILIO_API_AUTH_TOKEN` | Your Twilio Auth Token                    | Visible on your [Twilio account dashboard](https://console.twilio.com/) under "Account Info" |

#### Database Configuration (Required if using database features)

| Config Value | Description                    | Default | Where to Get It                                                                         |
| ------------ | -------------------------------| ------- | ----------------------------------------------------------------------------------------|
| `DB_HOST`    | MySQL database host address    | ------- | Your database provider (e.g., `localhost` for local MySQL, or your cloud database host) |
| `DB_PORT`    | MySQL database port number     | `3306`  | Standard MySQL port is 3306, or your database provider's port                           |
| `DB_USER`    | MySQL database username        | ------- | Created when setting up your MySQL database                                             |
| `DB_PASSWORD`| MySQL database password        | ------- | Set when creating your MySQL database user                                              |
| `DB_NAME`    | MySQL database name            | ------- | The name of your database (create it if it doesn't exist)                               |

#### Google OAuth Configuration 

| Config Value          | Description                    | Where to Get It |
| ----------------------| -------------------------------| --------------- |
| `GOOGLE_CLIENT_ID`    | Google OAuth 2.0 Client ID     | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET`| Google OAuth 2.0 Client Secret | Same as above - shown when you create the OAuth client |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI             | Must match the URI configured in your Google OAuth client (e.g., `http://localhost:8081/auth/google/callback`) |



### Starting the backend

Once your backend is configured, you can start it by running `npm start` in the `townService` directory (the first time you run it, you will also need to run `npm install`).
The backend will automatically restart if you change any of the files in the `townService/src` directory.

### Configuring the frontend

Create a `.env` file in the `frontend` directory with the following environment variables:

#### Required Environment Variables

| Config Value                    | Description                      | Example Value                                                                |
| ------------                    | -----------                      | -------------                                                                |
| `NEXT_PUBLIC_TOWNS_SERVICE_URL` | URL of the backend towns service | `http://localhost:8081` (for local development) or your deployed backend URL |

For ease of debugging, you might also set the environmental variable `NEXT_PUBLIC_TOWN_DEV_MODE=true`. When set to `true`, the frontend will automatically connect to the town with the friendly name "DEBUG_TOWN" (creating one if needed), and will *not* try to connect to the Twilio API. This is useful if you want to quickly test changes to the frontend (reloading the page and re-acquiring video devices can be much slower than re-loading without Twilio).

#### Another Required Environment Variables (Make sure to create `.env.local` file in the `frontend` directory)

| Config Value                       | Description                      | Where to find                                                                |
| ------------                       | -----------                      | -------------                                                                |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`     | Google OAuth 2.0 Client ID       | Enter the same ID from `.env` file in townService                            |
| `NEXT_PUBLIC_TOWNS_SERVICE_URI`    | URL of the backend towns service | Enter the same URI in `.env` file in frontend                                |
| `NEXT_PUBLIC_GOOGLE_REDIRECT_URI`  | OATH Redirect URI                | Enter the same URI in `.env` file in townService                             |  




### Running the frontend

In the `frontend` directory, run `npm start` (again, you'll need to run `npm install` the very first time). After several moments (or minutes, depending on the speed of your machine), a browser will open with the frontend running locally.
The frontend will automatically re-compile and reload in your browser if you change any files in the `frontend/src` directory.

## Running Tests

This project uses **Jest** for testing. Before running tests, you must generate the required code files using **TSOA** (TypeScript OpenAPI) and **OpenAPI TypeScript Codegen**. These tools generate API routes, Swagger specifications, and TypeScript client code that the tests depend on.

### Prerequisites for Testing

The test setup requires several code generation steps:

1. **TSOA** - Generates Swagger/OpenAPI specification and Express routes from TypeScript controllers
2. **OpenAPI TypeScript Codegen** - Generates TypeScript client code from the Swagger specification
3. **tsx** - TypeScript execution engine (used by the backend)
4. **ts-node** - TypeScript execution for Node.js

### Setup Steps Before Running Tests

**Important:** You must complete these steps in order before running any tests:

1. **Install all dependencies:**
   ```bash
   # Install shared dependencies
   cd shared
   npm install
   cd ..
   
   # Install backend dependencies
   cd townService
   npm install
   cd ..
   
   # Install frontend dependencies
   cd frontend
   npm install
   cd ..
   ```

2. **Generate backend code (TSOA):**
   ```bash
   cd townService
   npm run prestart
   ```
   This runs `tsoa spec-and-routes`, which:
   - Generates `townService/generated/routes.ts` (Express route handlers)
   - Generates `shared/generated/swagger.json` (OpenAPI specification)
   
   **Note:** If you see errors about missing `tsoa` or `npx tsx`, ensure all dependencies are installed with `npm install` in the `townService` directory.

3. **Generate frontend client code (OpenAPI):**
   ```bash
   cd frontend
   npm run prestart
   ```
   This runs `npm run client`, which executes:
   ```bash
   openapi --input ../shared/generated/swagger.json --output ./src/generated/client --client axios --name TownsServiceClient
   ```
   This generates the TypeScript client code in `frontend/src/generated/client/` from the Swagger specification.
   
   **Note:** If you see errors about `openapi` command not found, ensure `openapi-typescript-codegen` is installed. It should be installed automatically with `npm install`, but if not, run:
   ```bash
   npm install --save-dev openapi-typescript-codegen
   ```

### Running Backend Tests

After completing the setup steps above:

```bash
cd townService
npm test
```

The backend tests use Jest and will:
- Run all test files matching `*.test.ts` patterns
- Use the generated routes and types from TSOA
- Require the Swagger specification to be generated first

**Common Issues:**
- **Error: "Cannot find module '../generated/routes'"** - Run `npm run prestart` in the `townService` directory first
- **Error: "tsoa: command not found"** - Run `npm install` in the `townService` directory
- **Error: "npx tsx: command not found"** - Ensure Node.js 18.x.x and npm 9.x.x are installed, then run `npm install` again

### Running Frontend Tests

After completing the setup steps above:

```bash
cd frontend
npm test
```

Or to run tests in watch mode:

```bash
cd frontend
npm run test-watch
```

The frontend tests use Jest with React Testing Library and will:
- Run all test files matching `*.test.ts` and `*.test.tsx` patterns
- Use the generated client code from OpenAPI TypeScript Codegen
- Require the Swagger specification and generated client to exist first

**Common Issues:**
- **Error: "Cannot find module './src/generated/client'"** - Run `npm run prestart` in the `frontend` directory first (this generates the client from swagger.json)
- **Error: "Cannot find module '../shared/generated/swagger.json'"** - Ensure you've run `npm run prestart` in the `townService` directory first to generate the Swagger specification
- **Error: "openapi: command not found"** - The `openapi` command comes from `openapi-typescript-codegen`. Run `npm install` in the `frontend` directory

### Running All Tests

To run both backend and frontend tests:

```bash
# From the root directory
cd townService && npm run prestart && npm test && cd ../frontend && npm run prestart && npm test
```

Or manually:
1. `cd townService && npm run prestart && npm test`
2. `cd ../frontend && npm run prestart && npm test`

### Test Troubleshooting

**Issue: Tests fail with "Module not found" errors**
- Ensure you've run `npm run prestart` in both `townService` and `frontend` directories
- Verify that `shared/generated/swagger.json` exists
- Verify that `frontend/src/generated/client/` directory exists and contains generated files

**Issue: "tsoa" or "openapi" commands not found**
- These are npm scripts that use packages installed via `npm install`
- Run `npm install` in the respective directories (`townService` or `frontend`)
- If the issue persists, try deleting `node_modules` and `package-lock.json`, then run `npm install` again

**Issue: "npx tsx" command not found**
- `tsx` is a dependency that should be installed with `npm install`
- Ensure you're using Node.js 18.x.x and npm 9.x.x as specified in `package.json`
- Try running `npm install` again in the `townService` directory

**Issue: Generated files are out of date**
- If you modify controller files in `townService/src/town/*Controller.ts`, you need to regenerate:
  - Run `npm run prestart` in `townService` to regenerate Swagger and routes
  - Run `npm run prestart` in `frontend` to regenerate the client code
- The `prestart` scripts are automatically run when you use `npm start`, but for tests, you may need to run them manually

- If everything is fine, you could `npm start` in both townService and frontend to start the program