import { registerWebhooks } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await shopify.authenticate.admin(request);

  // ✅ Register the webhook now that we have a valid session
  await registerWebhooks({
    session,
    webhooks: [
      {
        topic: "products/create",
        deliveryMethod: "http",
        callbackUrl: "https://2fb9b6c8bc85.ngrok-free.app/product-webhook/",
      },
    ],
  });

  return new Response("App installed & webhook registered!");
}
