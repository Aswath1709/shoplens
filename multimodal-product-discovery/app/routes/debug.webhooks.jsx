// app/routes/debug.webhooks.jsx
import { json } from "@remix-run/node";
import shopify from "../shopify.server";

/**
 * @param {import('@remix-run/node').LoaderFunctionArgs} args
 */
export const loader = async ({ request }) => {
  try {
    console.log("Attempting to authenticate admin...");
    const { admin, session } = await shopify.authenticate.admin(request);

    // Let's check what we received
    console.log("Authentication successful. Checking session...");
    if (!session || !session.accessToken) {
      console.error("Session is invalid or missing accessToken:", session);
      return json({ error: "Authentication succeeded but the session is invalid or missing an access token." }, { status: 500 });
    }

    console.log("Session is valid. Fetching webhooks...");
    const response = await admin.rest.resources.Webhook.all({
      session: session, // Using the session we destructured
    });

    console.log("Successfully fetched webhooks.");
    return json(response.data);

  } catch (error) {
    // If shopify.authenticate.admin fails, it often throws a Response object
    // to redirect. If it's a different error, we log it.
    if (error instanceof Response) {
      console.error("Authentication threw a Response, likely a redirect.");
      throw error; // Re-throw the response to let Remix handle the redirect
    }

    console.error("An unexpected error occurred:", error);
    return json({ error: "An unexpected error occurred.", message: error.message }, { status: 500 });
  }
};