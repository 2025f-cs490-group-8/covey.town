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
