import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";

const BACKEND_URL = "http://127.0.0.1:8000/receive-products/";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Get the shop domain from session
  const shopDomain = session.shop;
  
  const query = `#graphql
    query getProducts($cursor: String) {
      products(first: 10, after: $cursor) {
        edges {
          node {
            id
            title
            handle
            productType
            description
            onlineStoreUrl
            featuredImage {
              url
              altText
            }
            images(first: 50) {
              edges {
                node {
                  url
                  altText
                  id
                }
              }
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
            options {
              name
              values
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  price
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  let hasNextPage = true;
  let cursor = null;
  const allProducts = [];

  while (hasNextPage) {
    const response = await admin.graphql(query, { variables: { cursor } });
    const data = await response.json();
    const products = data.data.products;

    products.edges.forEach(edge => {
      const product = edge.node;
      
      // Extract color from options
      const colorOption = product.options?.find(opt =>
        opt.name.toLowerCase() === 'color' ||
        opt.name.toLowerCase() === 'colour'
      );

      // Get all available colors
      const availableColors = colorOption?.values || [];

      // Get colors from variants
      const variantColors = product.variants.edges.map(v => {
        const colorOpt = v.node.selectedOptions?.find(opt =>
          opt.name.toLowerCase() === 'color' ||
          opt.name.toLowerCase() === 'colour'
        );
        return colorOpt?.value;
      }).filter(Boolean);

      // Get price from first variant or price range
      const price = product.variants.edges[0]?.node?.price || 
                   product.priceRangeV2?.minVariantPrice?.amount || 
                   "0.00";

      // Extract all image URLs
      const allImages = product.images.edges.map(edge => ({
        url: edge.node.url,
        altText: edge.node.altText || product.title,
        id: edge.node.id
      }));

      // Construct URLs
      const adminUrl = `https://${shopDomain}/admin/products/${product.id.split('/').pop()}`;
      const storefrontUrl = product.onlineStoreUrl || `https://${shopDomain}/products/${product.handle}`;

      allProducts.push({
        id: product.id,
        title: product.title,
        handle: product.handle,  // Important for URL construction
        productType: product.productType,
        description: product.description,
        colors: availableColors,
        variantColors: [...new Set(variantColors)],
        price: price,
        // Single featured image (backwards compatibility)
        image: product.featuredImage?.url || "",
        imageAlt: product.featuredImage?.altText || product.title,
        // ALL images
        images: allImages,  // Array of all product images
        imageUrls: allImages.map(img => img.url),  // Just the URLs if needed
        // URLs
        shopifyUrl: storefrontUrl,  // Customer-facing product page
        adminUrl: adminUrl,         // Admin product page
        onlineStoreUrl: product.onlineStoreUrl,  // Direct from Shopify if available
      });
    });

    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  // Send products to Python backend
  const backendRes = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(allProducts),
  });

  const backendReply = await backendRes.json();

  return json({
    count: allProducts.length,
    products: allProducts,
    backendReply,
    shopDomain
  });
};

export default function ProductsAPI() {
  const { count, products, backendReply, shopDomain } = useLoaderData();

  return (
    <div style={{ padding: 24 }}>
      <h2>{count} Products (sent to backend)</h2>
      
      {backendReply && (
        <pre style={{ background: "#f5f5f5", padding: 12, marginBottom: 20 }}>
          Backend said: {JSON.stringify(backendReply, null, 2)}
        </pre>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {products.map((p) => (
          <li key={p.id} style={{ 
            marginBottom: 16, 
            border: "1px solid #eee", 
            borderRadius: 8, 
            padding: 12 
          }}>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ minWidth: 100 }}>
                {/* Show main image */}
                {p.image && (
                  <img 
                    src={p.image} 
                    alt={p.imageAlt} 
                    style={{ 
                      width: 100, 
                      height: 100, 
                      objectFit: "cover",
                      borderRadius: 4 
                    }} 
                  />
                )}
                
                {/* Show thumbnail strip of all images */}
                {p.images.length > 1 && (
                  <div style={{ 
                    display: "flex", 
                    gap: 4, 
                    marginTop: 8,
                    flexWrap: "wrap"
                  }}>
                    {p.images.slice(0, 4).map((img, idx) => (
                      <img 
                        key={img.id || idx}
                        src={img.url} 
                        alt={img.altText} 
                        style={{ 
                          width: 20, 
                          height: 20, 
                          objectFit: "cover",
                          borderRadius: 2,
                          border: "1px solid #ddd"
                        }} 
                      />
                    ))}
                    {p.images.length > 4 && (
                      <div style={{
                        width: 20,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        background: "#f0f0f0",
                        borderRadius: 2,
                        border: "1px solid #ddd"
                      }}>
                        +{p.images.length - 4}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 18 }}>{p.title}</strong>
                
                <div style={{ marginTop: 8, color: "#666" }}>
                  <div>Type: {p.productType || "N/A"}</div>
                  <div>Handle: {p.handle}</div>
                  <div>Price: ${p.price}</div>
                  <div>Colors: {p.colors.join(", ") || "No colors"}</div>
                  <div>Images: {p.images.length} total</div>
                  {p.description && (
                    <div style={{ marginTop: 8 }}>
                      Description: {p.description.substring(0, 100)}...
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                  <a 
                    href={p.shopifyUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      padding: "6px 12px",
                      background: "#5c6ac4",
                      color: "white",
                      textDecoration: "none",
                      borderRadius: 4,
                      fontSize: 14
                    }}
                  >
                    View in Store →
                  </a>
                  
                  <a 
                    href={p.adminUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      padding: "6px 12px",
                      background: "#f4f6f8",
                      color: "#202223",
                      textDecoration: "none",
                      borderRadius: 4,
                      fontSize: 14,
                      border: "1px solid #c4cdd5"
                    }}
                  >
                    Edit in Admin →
                  </a>
                </div>

                <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
                  ID: {p.id}
                </div>
                
                {/* Debug: Show all image URLs */}
                <details style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
                  <summary style={{ cursor: 'pointer' }}>All Image URLs ({p.images.length})</summary>
                  <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                    {p.images.map((img, idx) => (
                      <li key={img.id || idx} style={{ wordBreak: 'break-all' }}>
                        {img.url}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}