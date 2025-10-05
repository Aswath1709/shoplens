import pandas as pd
from fastapi import FastAPI, Request, Header
from fastapi.middleware.cors import CORSMiddleware
import json
import os
from datetime import datetime
from collections import defaultdict
import voyageai as vo
from pinecone import Pinecone

app = FastAPI()

# Get API keys from environment variables or use defaults for testing
VOYAGE_API_KEY = "pa-int4C_9EqFIwO4MusvoIGdIUE0t0jHP3E8YX5V6xXyB"
PINECONE_API_KEY = "pcsk_3JkiG3_Bd8FvZB1VaeUgFHdkw9BAHadPLqFRzCuk46qSx6iA7SvFEA93hwASkpoHPFxBUB"
PINECONE_INDEX_NAME = "productdisc"

# Initialize Voyage AI client
vo_client = vo.Client(api_key=VOYAGE_API_KEY)

# CORS middleware - IMPORTANT for Shopify
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, use ["https://your-store.myshopify.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]  # Add this to expose all headers
)

@app.post("/semantic-search/")
async def semantic_search(request: Request):
    data = await request.json()
    query = data.get("query", "")
    print(f"✅ Received search query: {query}")
    
    # Initialize Pinecone
    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index(PINECONE_INDEX_NAME)
    
    try:
        # Perform semantic search
        print("🔍 Creating embeddings...")
        query_embed = vo_client.multimodal_embed([[query]], model="voyage-multimodal-3").embeddings
        
        print("🔍 Querying Pinecone...")
        results = index.query(
            vector=query_embed[0],
            top_k=200,
            namespace="multimodal",
            include_metadata=True
        )
        
        print(f"📊 Got {len(results['matches'])} matches from Pinecone")
        
        scores_text = defaultdict(list)
        keyword_to_info = {}
        
        for match in results['matches']:
            keywords = match['metadata'].get("keywords", "")
            if not keywords:  # Skip if no keywords
                continue
                
            scores_text[keywords].append(match['score'])
            keyword_to_info[keywords] = {
                "id": match['metadata'].get("id", ""),
                "handle": match['metadata'].get("handle", ""),
                "title": match['metadata'].get("title", "Unknown Product"),
                "description": match['metadata'].get("description", ""),
                "price": match['metadata'].get("price", "0.00"),
                "image": match['metadata'].get("image", ""),
                "vendor": match['metadata'].get("vendor", ""),
            }
        
        if not scores_text:
            print("⚠️ No valid products found in results")
            return {
                "success": True,
                "query": query,
                "products": [],
                "count": 0,
                "message": "No products found matching your search"
            }
        
        # Average scores for products with same keywords
        for key, value in scores_text.items():
            scores_text[key] = sum(value) / len(value)
        
        # Get top 30 results
        top_k = dict(sorted(scores_text.items(), key=lambda x: x[1], reverse=True)[:50])
        documents = list(top_k.keys())
        
        print(f"🎯 Reranking top {len(documents)} products...")
        # Rerank top results
        reranking = vo_client.rerank(query, documents, model="rerank-2", top_k=min(50, len(documents)))
        
        # Format products for frontend
        products = []
        for r in reranking.results:
            if r.document in keyword_to_info:
                info = keyword_to_info[r.document]
                product_data = {
                    "title": info["title"],  # MOST IMPORTANT: This must match Shopify product titles
                    "relevance_score": r.relevance_score,
                    # Include other fields for debugging/future use
                    "id": info.get("id", ""),
                    "handle": info.get("handle", ""),
                    "description": info["description"],
                    "price": info.get("price", "0.00"),
                    "image": info.get("image", ""),
                    "vendor": info.get("vendor", ""),
                }
                products.append(product_data)
                
                # Log what we're returning for debugging
                print(f"  - {info['title']} (score: {r.relevance_score:.3f})")
        
        print(f"✅ Returning {len(products)} products for Shopify filtering")
        
        # Log the titles being returned (for debugging)
        print("Product titles being returned:")
        for p in products:  # Show first 5
            print(f"  - {p['title']}")
        
        return {
            "success": True,
            "query": query,
            "products": products,
            "count": len(products),
            "mode": "semantic"
        }
        
    except Exception as e:
        print(f"❌ Error in semantic search: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Return empty list on error so Shopify shows default results
        return {
            "success": False,
            "query": query,
            "products": [],
            "count": 0,
            "error": str(e),
            "mode": "error",
            "message": "Search service temporarily unavailable. Showing default results."
        }

@app.post("/receive-products/")
async def receive_products(request: Request):
    """
    This endpoint receives products from Shopify and saves them to a CSV file.
    """
    products = await request.json()
    print(f"✅ Received {len(products)} products from Shopify app.")
    
    # Log first product for debugging
    if products:
        print("\n📝 First Product in your Shopify store:")
        print(json.dumps(products[0], indent=2))
    
    # Prepare data for DataFrame
    product_data = []
    
    for product in products:
        # Extract image URLs as a list
        image_urls = []
        
        # Method 1: Get from imageUrls if available
        if 'imageUrls' in product and product['imageUrls']:
            image_urls = product['imageUrls']
        # Method 2: Get from images array if available
        elif 'images' in product and product['images']:
            image_urls = [img['url'] for img in product['images'] if 'url' in img]
        # Method 3: Fall back to single image if available
        elif 'image' in product and product['image']:
            image_urls = [product['image']]
        
        # Create row for DataFrame
        row = {
            'product_handle': product.get('handle', ''),
            'title': product.get('title', ''),
            'description': product.get('description', ''),
            'price': product.get('price', '0.00'),
            'images': json.dumps(image_urls)  # Store as JSON string for CSV
        }
        
        product_data.append(row)
    
    # Create DataFrame
    df = pd.DataFrame(product_data)
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_filename = f"shopify_products_{timestamp}.csv"
    
    # Save to CSV
    df.to_csv(csv_filename, index=False, encoding='utf-8')
    
    print(f"✅ CSV file saved: {csv_filename}")
    print(f"📊 DataFrame shape: {df.shape}")
    print(f"📋 Columns: {df.columns.tolist()}")
    
    # Also save a latest version (overwrite)
    df.to_csv("shopify_products_latest.csv", index=False, encoding='utf-8')
    
    # Optional: Display first few rows for verification
    print("\n📑 First 3 products in CSV:")
    print(df.head(3).to_string())
    
    # Calculate some statistics
    stats = {
        "total_products": len(df),
        "products_with_descriptions": df['description'].notna().sum(),
        "products_with_images": sum(1 for imgs in df['images'] if imgs != '[]'),
        "average_images_per_product": sum(len(json.loads(imgs)) for imgs in df['images']) / len(df) if len(df) > 0 else 0
    }
    
    return {
        "status": "received",
        "product_count": len(products),
        "csv_filename": csv_filename,
        "csv_saved": True,
        "statistics": stats
    }

@app.post("/product-webhook/")
async def product_webhook(
    request: Request,
    x_shopify_topic: str = Header(None),
    x_shopify_shop_domain: str = Header(None)
):
    """Handle Shopify product update webhooks"""
    data = await request.json()
    print(f"\nWebhook Event: {x_shopify_topic} from {x_shopify_shop_domain}")
    print(f"  Product ID: {data.get('id')}")
    print(f"  Title: {data.get('title')}")
    print(f"  Updated At: {data.get('updated_at')}")
    
    # TODO: Update product in Pinecone when it changes in Shopify
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "event": x_shopify_topic,
        "shop": x_shopify_shop_domain,
        "product_id": data.get("id"),
        "title": data.get("title"),
    }
    
    try:
        with open("product_webhook_log.json", "a") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        print(f"Error writing log: {e}")
    
    return {"status": "processed", "event": x_shopify_topic}

@app.get("/test")
async def test_endpoint():
    """Test endpoint to verify backend is running"""
    return {
        "status": "Backend is working!",
        "timestamp": datetime.utcnow().isoformat(),
        "voyage_configured": True,
        "pinecone_configured": True,
        "index_name": PINECONE_INDEX_NAME
    }

@app.get("/test-search/{query}")
async def test_search(query: str):
    """Test search endpoint for debugging"""
    print(f"Test search for: {query}")
    
    # Call the semantic search with the test query
    result = await semantic_search(Request(
        scope={
            "type": "http",
            "method": "POST",
            "headers": [],
        },
        receive=lambda: {"body": json.dumps({"query": query}).encode()}
    ))
    
    return result

@app.get("/")
def health_check():
    return {
        "status": "Backend is running!",
        "endpoints": [
            "/semantic-search/",
            "/receive-products/",
            "/product-webhook/",
            "/test",
            "/test-search/{query}"
        ],
        "pinecone_index": PINECONE_INDEX_NAME,
        "voyage_status": "configured",
        "pinecone_status": "configured"
    }

if __name__ == "__main__":
    import uvicorn
    print("\n🚀 Starting Findopia Backend Server...")
    print(f"📊 Pinecone Index: {PINECONE_INDEX_NAME}")
    print(f"🔑 Voyage API: Configured")
    print(f"🔑 Pinecone API: Configured")
    print("🌐 Server will be available at: http://localhost:8000")
    print("📝 API Documentation: http://localhost:8000/docs")
    print("\n⚠️  IMPORTANT: Make sure the product titles in Pinecone match your Shopify product titles!\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)