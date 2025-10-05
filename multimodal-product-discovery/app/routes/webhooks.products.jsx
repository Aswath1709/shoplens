// app/routes/webhooks.products.jsx

import { shopify } from "../shopify.server";

export const action = async ({ request }) => {
  // ✅ Validates the webhook signature and parses the data
  const { topic, shop, body } = await shopify.webhooks.validateAndParse(request);

  // 📝 Log the data to your terminal to see it working
  console.log(`✅ [WEBHOOK RECEIVED] ${topic} from ${shop}`);
  console.log(JSON.parse(body));

  // Your logic to save the data to a database would go here.

  // ❗ Shopify requires a 200 OK response within 5 seconds.
  return new Response("OK", { status: 200 });
};