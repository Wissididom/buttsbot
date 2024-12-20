import "dotenv/config";
import { buttifiable, buttify } from "./buttify.js";
import crypto from "crypto";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import {
  authCallback,
  chatterAuth,
  streamerAndChatterAuth,
  streamerAuth,
} from "./auth.js";

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

const limiter = rateLimit();

app.use(helmet());

app.use(
  express.raw({
    type: "application/json",
  }),
);

app.get("/", (req, res) => {
  res.send("buttsbot");
});

app.get("/streamer-auth", limiter, (req, res) => {
  streamerAuth(
    res,
    process.env.TWITCH_CLIENT_ID,
    process.env.TWTICH_REDIRECT_URI,
  );
});

app.get("/chatter-auth", limiter, (req, res) => {
  chatterAuth(
    res,
    process.env.TWITCH_CLIENT_ID,
    process.env.TWTICH_REDIRECT_URI,
  );
});

app.get("/streamer-and-chatter-auth", limiter, (req, res) => {
  streamerAndChatterAuth(
    res,
    process.env.TWITCH_CLIENT_ID,
    process.env.TWTICH_REDIRECT_URI,
  );
});

app.get("/auth-callback", authCallback);

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
