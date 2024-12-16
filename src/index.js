import "dotenv/config";
import { buttifiable, buttify } from "./buttify.js";
import crypto from "crypto";
import express from "express";
import helmet from "helmet";

const app = express();

// Notification request headers
const TWITCH_MESSAGE_ID = "Twitch-Eventsub-Message-Id".toLowerCase();
const TWITCH_MESSAGE_TIMESTAMP =
  "Twitch-Eventsub-Message-Timestamp".toLowerCase();
const TWITCH_MESSAGE_SIGNATURE =
  "Twitch-Eventsub-Message-Signature".toLowerCase();
const MESSAGE_TYPE = "Twitch-Eventsub-Message-Type".toLowerCase();

// Notification message types
const MESSAGE_TYPE_VERIFICATION = "webhook_callback_verification";
const MESSAGE_TYPE_NOTIFICATION = "notification";
const MESSAGE_TYPE_REVOCATION = "revocation";

// Prepend this string to the HMAC that's created from the message
const HMAC_PREFIX = "sha256=";

let token = {
  access_token: null,
  expires_in: null,
  token_type: null,
  user: null,
};

async function sendMessage(broadcasterId, senderId, message) {
  let data = {
    broadcaster_id: broadcasterId,
    sender_id: senderId,
    message,
  };
  console.log(`sendMessage:${JSON.stringify(data)}`);
  return await fetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).then(async (res) => {
    // 200 OK = Successfully sent the message
    // 400 Bad Request
    // 401 Unauthorized
    // 403 Forbidden = The sender is not permitted to send chat messages to the broadcaster’s chat room.
    // 422 = The message is too large
    console.log(
      `${senderId} - ${res.status}:\n${JSON.stringify(await res.json(), null, 2)}`,
    );
    if (res.status >= 200 && res.status < 300) {
      return true;
    } else {
      return false;
    }
  });
}

async function getUser(
  id,
  clientId = process.env.TWITCH_CLIENT_ID,
  accessToken = token.access_token,
) {
  let apiUrl = id
    ? `https://api.twitch.tv/helix/users?id=${id}`
    : `https://api.twitch.tv/helix/users`;
  let userResponse = await fetch(apiUrl, {
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  }).then((res) => res.json());
  return userResponse.data[0];
}

async function getToken() {
  let clientCredentials = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    {
      method: "POST",
    },
  );
  if (clientCredentials.status >= 200 && clientCredentials.status < 300) {
    let clientCredentialsJson = await clientCredentials.json();
    token = {
      access_token: clientCredentialsJson.access_token,
      expires_in: clientCredentialsJson.expires_in,
      token_type: clientCredentialsJson.token_type,
      user: token.user
        ? token.user
        : await getUser(
            process.env.SENDER_ID,
            process.env.TWITCH_CLIENT_ID,
            clientCredentialsJson.access_token,
          ),
    };
    return token;
  }
}

app.use(helmet());

app.use(
  express.raw({
    type: "application/json",
  }),
);

app.get("/", (req, res) => {
  res.send("buttsbot");
});

function redirect(res, clientId, redirectUri, scopes) {
  res.redirect(
    `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(scopes.join(" "))}`,
  );
}

app.get("/streamer-auth", (req, res) => {
  redirect(res, process.env.TWITCH_CLIENT_ID, process.env.TWTICH_REDIRECT_URI, [
    "channel:bot",
  ]);
});

app.get("/chatter-auth", (req, res) => {
  redirect(res, process.env.TWITCH_CLIENT_ID, process.env.TWTICH_REDIRECT_URI, [
    "user:read:chat",
    "user:write:chat",
    "user:bot",
  ]);
});

app.get("/streamer-and-chatter-auth", (req, res) => {
  redirect(res, process.env.TWITCH_CLIENT_ID, process.env.TWTICH_REDIRECT_URI, [
    "channel:bot",
    "user:read:chat",
    "user:write:chat",
    "user:bot",
  ]);
});

function getForWhom(scopes) {
  if (scopes.includes("channel:bot")) {
    if (
      scopes.includes("user:read:chat") &&
      scopes.includes("user:write:chat") &&
      scopes.includes("user:bot")
    ) {
      return "Streamer and Chatter";
    } else {
      return "Streamer";
    }
  } else {
    if (
      scopes.includes("user:read:chat") &&
      scopes.includes("user:write:chat") &&
      scopes.includes("user:bot")
    ) {
      return "Chatter";
    } else {
      return "N/A";
    }
  }
}

app.get("/auth-callback", async (req, res) => {
  res.setHeader("content-type", "text/plain");
  if (req.query.code) {
    const authCode = req.query.code;
    const fetchResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code: authCode,
        grant_type: "authorization_code",
        redirect_uri: process.env.TWTICH_REDIRECT_URI,
      }),
    });
    if (fetchResponse.ok) {
      const json = fetchResponse.json();
      const accessToken = json.access_token;
      const user = getUser(null, process.env.TWITCH_CLIENT_ID, accessToken);
      const forWhom = getForWhom(json.scope);
      if (user.display_name.toLowerCase() == user.login) {
        res.send(`Got Tokens for ${forWhom} ${user.display_name}`);
      } else {
        res.send(
          `Got Tokens for ${forWhom} ${user.display_name} (${user.login})`,
        );
      }
    } else {
      res.send(fetchResponse.text());
    }
  } else if (req.query.error) {
    if (req.query.error_description) {
      res.send(
        `The following error occured:\n${req.query.error}\n${req.query.error_description}`,
      );
    } else {
      res.send(`The following error occured:\n${req.query.error}`);
    }
  } else {
    res.send(
      "This endpoint is intended to be redirected from Twitch's auth flow. It is not meant to be called directly",
    );
  }
});

app.post("/", async (req, res) => {
  let secret = process.env.EVENTSUB_SECRET;
  let message =
    req.headers[TWITCH_MESSAGE_ID] +
    req.headers[TWITCH_MESSAGE_TIMESTAMP] +
    req.body;
  let hmac =
    HMAC_PREFIX +
    crypto.createHmac("sha256", secret).update(message).digest("hex");

  if (verifyMessage(hmac, req.headers[TWITCH_MESSAGE_SIGNATURE])) {
    // Get JSON object from body, so you can process the message.
    let notification = JSON.parse(req.body);
    switch (req.headers[MESSAGE_TYPE]) {
      case MESSAGE_TYPE_NOTIFICATION:
        if (notification.subscription.type == "channel.chat.message") {
          let msg = notification.event.message.text;
          let lowercaseMsg = msg.toLowerCase();
          if (
            lowercaseMsg.includes(token.user.login) ||
            lowercaseMsg.includes(token.user.display_name)
          ) {
            const specialResponses = [
              {
                // frown
                emoji: "☹️",
                keywords: ["no"],
              },
              {
                // smile
                emoji: "☺️",
                keywords: ["yes", "yeah", "yea"],
              },
              {
                // weird
                emoji: "🥴",
                keywords: ["why"],
              },
              {
                // wink
                emoji: "😉",
                keywords: ["please", "pls", "plz"],
              },
            ];
            for (let response of specialResponses) {
              for (let keyword of response.keywords) {
                if (new RegExp(`\\b${keyword}\\b`, "g").test(lowercaseMsg)) {
                  await sendMessage(
                    notification.event.broadcaster_user_id,
                    process.env.SENDER_ID,
                    response.emoji,
                  );
                  break;
                }
              }
            }
          }
          if (
            notification.event.chatter_user_id != process.env.SENDER_ID &&
            buttifiable(msg, 30 /*frequency*/)
          ) {
            const buttified = buttify(msg, "butt" /*word*/, 10 /*rate*/);
            if (buttified) {
              await sendMessage(
                notification.event.broadcaster_user_id,
                process.env.SENDER_ID,
                buttified,
              );
            }
          }
        } else {
          console.log(`Event type: ${notification.subscription.type}`);
          console.log(JSON.stringify(notification.event, null, 4));
        }
        res.sendStatus(204);
        break;
      case MESSAGE_TYPE_VERIFICATION:
        res
          .set("Content-Type", "text/plain")
          .status(200)
          .send(notification.challenge);
        break;
      case MESSAGE_TYPE_REVOCATION:
        res.sendStatus(204);
        console.log(`${notification.subscription.type} notifications revoked!`);
        console.log(`reason: ${notification.subscription.status}`);
        console.log(
          `condition: ${JSON.stringify(notification.subscription.condition, null, 4)}`,
        );
        break;
      default:
        res.sendStatus(204);
        console.log(`Unknown message type: ${req.headers[MESSAGE_TYPE]}`);
        break;
    }
  } else {
    console.log("403 - Signatures didn't match.");
    res.sendStatus(403);
  }
});

function verifyMessage(hmac, verifySignature) {
  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(verifySignature),
  );
}

const port = process.env.PORT || 3000;

app.listen(port, async () => {
  console.log(`Server ready on port ${port}.`);
  await getToken();
  setTimeout(async () => {
    await getToken();
  }, token.expires_in);
});
