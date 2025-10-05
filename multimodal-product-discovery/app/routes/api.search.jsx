import { json } from "@remix-run/node";
import db from "../db.server";

// ✅ Manual CORS headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://discoverd2c.myshopify.com",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ✅ CORS response wrapper
function corsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// ✅ GET Handler — Fetch search data
export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");

  if (!customerId || !shop || !productId) {
    return corsJson({
      message: "Missing data. Required: customerId, productId, shop",
      method: "GET",
    }, 400);
  }

  const search = await db.search.findMany({
    where: { customerId, shop, productId },
  });

  return corsJson({
    ok: true,
    message: "Success",
    data: search,
  });
}

// ✅ POST Handler — Add or Remove from search
export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const form = Object.fromEntries(await request.formData());
  const { customerId, productId, shop } = form;

  if (!customerId) return corsJson({ message: "Missing customerId" }, 400);
  if (!productId) return corsJson({ message: "Missing productId" }, 400);
  if (!shop) return corsJson({ message: "Missing shop" }, 400);

  // Check if already exists
  const existing = await db.search.findFirst({
    where: { customerId, productId, shop },
  });

  let response;
  if (existing) {
    // If exists, delete (toggle off)
    await db.search.deleteMany({
      where: { customerId, productId, shop },
    });
    response = { message: "Removed from search", searched: false };
  } else {
    // If not exists, create (toggle on)
    await db.search.create({
      data: { customerId, productId, shop },
    });
    response = { message: "Added to search", searched: true };
  }

  return corsJson(response);
}
