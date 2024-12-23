import { getUser as getUserImpl } from "./utils.js";

async function getUser(
  id,
  clientId = process.env.TWITCH_CLIENT_ID,
  accessToken,
) {
  return getUserImpl(id, clientId, accessToken);
}

function redirect(res, clientId, redirectUri, scopes) {
  res.redirect(
    `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(scopes.join(" "))}`,
  );
}

export function streamerAuth(res, clientId, redirectUri) {
  redirect(res, clientId, redirectUri, ["channel:bot"]);
}

export function chatterAuth(res, clientId, redirectUri) {
  redirect(res, clientId, redirectUri, [
    "user:read:chat",
    "user:write:chat",
    "user:bot",
  ]);
}

export function streamerAndChatterAuth(res, clientId, redirectUri) {
  redirect(res, clientId, redirectUri, [
    "channel:bot",
    "user:read:chat",
    "user:write:chat",
    "user:bot",
  ]);
}

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

export async function authCallback(req, res) {
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
      const json = await fetchResponse.json();
      const accessToken = json.access_token;
      const user = await getUser(
        null,
        process.env.TWITCH_CLIENT_ID,
        accessToken,
      );
      const forWhom = getForWhom(json.scope);
      if (user.display_name.toLowerCase() == user.login) {
        res.send(`Got Tokens for ${forWhom} ${user.display_name}`);
      } else {
        res.send(
          `Got Tokens for ${forWhom} ${user.display_name} (${user.login})`,
        );
      }
    } else {
      res.send(await fetchResponse.text());
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
}
