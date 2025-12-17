# Store API Documentation

Complete API reference for integrating with your store's backend.

## Base URL

```
https://uffmgvdtkoxkjolfrhab.supabase.co/functions/v1/store-api
```

## Authentication

All requests require an API key which can be passed in two ways:

1. **Query Parameter**: `?api_key=YOUR_API_KEY`
2. **Header**: `X-API-Key: YOUR_API_KEY`

Your API key can be found in Store Settings.

## Endpoints

### 1. Get Configuration

Get store configuration, delivery fees, and template customization.

**Endpoint**: `GET /config`

**Response**:
```json
{
  "mapbox_token": "pk.xxx...",
  "cash_payment_enabled": true,
  "cash_payment_fee": 0,
  "home_delivery_fee": 15,
  "locker_delivery_fee": 10,
  "customization": {
    "primary_color": "#000000",
    "background_color": "#FFFFFF",
    "text_color": "#000000",
    "accent_color": "#666666",
    "hero_image_url": "https://...",
    "logo_url": "https://...",
    "hero_title": "Welcome to Our Store",
    "hero_subtitle": "Discover amazing products",
    "hero_button_text": "Shop now",
    "store_name": "My Store",
    "show_reviews": true
  }
}
```

---

### 2. Get Products

Get all products with images, discounts, and pricing.

**Endpoint**: `GET /products`

**Response**:
```json
{
  "products": [
    {
      "id": "uuid",
      "title": "Product Name",
      "description": "Product description",
      "price": 99.99,
      "stock": 50,
      "sku": "SKU123",
      "category": "Electronics",
      "image": "https://...",
      "low_stock_threshold": 5,
      "images": [
        {
          "id": "uuid",
          "product_id": "uuid",
          "image_url": "https://...",
          "is_primary": true,
          "display_order": 0
        }
      ],
      "primary_image": "https://...",
      "image_count": 3,
      "original_price": 99.99,
      "discounted_price": 79.99,
      "has_discount": true,
      "discount_percentage": 20,
      "savings_amount": 20,
      "final_price": 79.99,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### 3. Get Single Product

Get detailed information about a specific product.

**Endpoint**: `GET /product?id=PRODUCT_ID`

**Response**:
```json
{
  "product": {
    "id": "uuid",
    "title": "Product Name",
    "description": "Product description",
    "price": 99.99,
    "stock": 50,
    "images": [...],
    "original_price": 99.99,
    "discounted_price": 79.99,
    "has_discount": true,
    "discount_percentage": 20,
    "final_price": 79.99
  }
}
```

---

### 4. Get Collections

Get all collections with their products.

**Endpoint**: `GET /collections`

**Response**:
```json
{
  "collections": [
    {
      "id": "uuid",
      "name": "Summer Collection",
      "description": "Hot summer deals",
      "image_url": "https://...",
      "products": [...],
      "product_count": 15,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### 5. Get Single Collection

Get a specific collection with its products.

**Endpoint**: `GET /collection?id=COLLECTION_ID`

**Response**:
```json
{
  "id": "uuid",
  "name": "Summer Collection",
  "description": "Hot summer deals",
  "image_url": "https://...",
  "products": [...],
  "product_count": 15
}
```

---

### 6. Get Carriers

Get available shipping carriers and their services.

**Endpoint**: `GET /carriers`

**Response**:
```json
{
  "carriers": [
    {
      "id": 1,
      "code": "fancourier",
      "name": "Fan Courier",
      "api_base_url": "https://...",
      "is_active": true,
      "logo_url": "https://...",
      "services": [
        {
          "id": 1,
          "carrier_id": 1,
          "service_code": "standard",
          "name": "Standard Delivery",
          "description": "2-3 business days",
          "is_active": true
        }
      ]
    }
  ]
}
```

---

### 7. Get Discounts

Get all active discounts.

**Endpoint**: `GET /discounts`

**Response**:
```json
{
  "discounts": [
    {
      "id": "uuid",
      "name": "Summer Sale",
      "description": "20% off all summer items",
      "discount_type": "percentage",
      "discount_value": 20,
      "start_date": "2024-06-01T00:00:00Z",
      "end_date": "2024-08-31T23:59:59Z",
      "is_active": true,
      "product_count": 25
    }
  ]
}
```

---

### 8. Get Lockers

Get available lockers for a carrier in a specific location.

**Endpoint**: `GET /lockers?carrier_code=CARRIER_CODE&locality=CITY&county=COUNTY`

**Query Parameters**:
- `carrier_code` (required): Carrier code (e.g., "fancourier", "sameday")
- `locality` (optional): City name
- `county` (optional): County name

**Response**:
```json
{
  "success": true,
  "carrier": {
    "id": 1,
    "name": "Fan Courier",
    "code": "fancourier"
  },
  "lockers": [
    {
      "id": "locker123",
      "name": "Fan Courier Locker - Mall",
      "address": "Str. Example 123, Bucharest",
      "city": "Bucharest",
      "county": "Bucuresti",
      "latitude": 44.4268,
      "longitude": 26.1025,
      "carrier_id": 1,
      "available": true
    }
  ],
  "count": 15
}
```

---

### 9. Create Order

Create a new order with optional payment processing.

**Endpoint**: `POST /orders`

**Request Body** (Home Delivery):
```json
{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "+40123456789",
  "total": 149.99,
  "items": [
    {
      "product_id": "uuid",
      "title": "Product Name",
      "price": 79.99,
      "quantity": 1
    }
  ],
  "payment_method": "card",
  "delivery_type": "home",
  "customer_city": "Bucharest",
  "customer_county": "Bucuresti",
  "customer_street": "Strada Exemplu",
  "customer_street_number": "123",
  "customer_block": "A1",
  "customer_apartment": "45"
}
```

**Request Body** (Locker Delivery):
```json
{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "+40123456789",
  "total": 149.99,
  "items": [...],
  "payment_method": "card",
  "delivery_type": "locker",
  "selected_carrier_code": "fancourier",
  "locker_id": "locker123",
  "locker_name": "Fan Courier Locker - Mall",
  "locker_address": "Str. Example 123, Bucharest"
}
```

**Response** (Card Payment):
```json
{
  "order": {
    "id": "uuid",
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "total": 149.99,
    "payment_status": "pending",
    "order_status": "awaiting_payment",
    "shipping_status": "pending",
    "delivery_type": "home",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "items": [...],
  "payment_url": "https://secure.netopia.ro/payment/..."
}
```

**Response** (Cash Payment):
```json
{
  "order": {
    "id": "uuid",
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "total": 149.99,
    "payment_status": "pending",
    "order_status": "paid",
    "shipping_status": "pending"
  },
  "items": [...]
}
```

**Payment Methods**:
- `card` - Credit/Debit card payment via Netopia
- `cash` - Cash on delivery

**Delivery Types**:
- `home` - Home delivery (requires: customer_city, customer_county, customer_street, customer_street_number)
- `locker` - Locker delivery (requires: selected_carrier_code, locker_id, locker_name)

---

### 10. Get Orders

Get all orders or a specific order.

**Endpoint**: `GET /orders` or `GET /orders?order_id=ORDER_ID`

**Response** (All Orders):
```json
{
  "orders": [
    {
      "id": "uuid",
      "customer_name": "John Doe",
      "customer_email": "john@example.com",
      "customer_address": "Strada Exemplu 123, Bucharest",
      "customer_phone": "+40123456789",
      "total": 149.99,
      "payment_status": "paid",
      "shipping_status": "shipped",
      "order_status": "paid",
      "awb_number": "AWB123456",
      "carrier_name": "Fan Courier",
      "tracking_url": "https://...",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Response** (Single Order):
```json
{
  "order": {
    "id": "uuid",
    "customer_name": "John Doe",
    ...
  }
}
```

---

### 11. Check Payment Status

Check the status of a payment.

**Endpoint**: `GET /payment-status?payment_id=PAYMENT_ID`

**Response**:
```json
{
  "status": "confirmed",
  "payment_id": "ntpXXXXX",
  "order_id": "uuid",
  "amount": 149.99,
  "currency": "RON"
}
```

**Payment Statuses**:
- `pending` - Payment initiated but not completed
- `confirmed` - Payment successful
- `canceled` - Payment canceled
- `credit` - Payment refunded/credited

---

### 12. Cleanup Abandoned Orders

Delete orders older than 24 hours that are still awaiting payment.

**Endpoint**: `POST /cleanup-abandoned-orders`

**Response**:
```json
{
  "success": true,
  "deleted_count": 5
}
```

---

### 13. Get Product Reviews

Get all approved reviews for a product with average rating.

**Endpoint**: `GET /product-reviews?product_id=PRODUCT_ID`

**Response**:
```json
{
  "reviews": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "customer_name": "John D.",
      "rating": 5,
      "review_text": "Amazing product! Highly recommend.",
      "is_approved": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "average_rating": 4.5,
  "total_reviews": 12
}
```

**Note**: Only returns reviews where `is_approved = true`. Returns empty array if `show_reviews` is disabled in store settings.

---

### 14. Submit a Review

Submit a customer review for a product.

**Endpoint**: `POST /reviews`

**Request Body**:
```json
{
  "product_id": "uuid",
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "rating": 5,
  "review_text": "Great product, fast delivery!"
}
```

**Response**:
```json
{
  "success": true,
  "review": {
    "id": "uuid",
    "product_id": "uuid",
    "customer_name": "John Doe",
    "rating": 5,
    "review_text": "Great product, fast delivery!",
    "is_approved": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Fields**:
- `product_id` (required): UUID of the product being reviewed
- `customer_name` (required): Customer's display name
- `customer_email` (optional): Customer's email
- `rating` (required): Integer from 1 to 5
- `review_text` (optional): Written review content

**Note**: Reviews are automatically approved by default (`is_approved = true`). Store owners can disable/delete reviews from their admin panel.

---

### 15. Get All Reviews (Store Owner)

Get all reviews for the store (including non-approved).

**Endpoint**: `GET /reviews`

**Response**:
```json
{
  "reviews": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "customer_name": "John D.",
      "customer_email": "john@example.com",
      "rating": 5,
      "review_text": "Amazing product!",
      "is_approved": true,
      "created_at": "2024-01-01T00:00:00Z",
      "product_title": "Product Name"
    }
  ]
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

**Common HTTP Status Codes**:
- `200` - Success
- `201` - Created
- `400` - Bad Request (missing parameters)
- `401` - Unauthorized (invalid API key)
- `404` - Not Found
- `500` - Internal Server Error

---

## Order Status Flow

### Order Status (`order_status`):
1. `draft` - Order created but not submitted
2. `awaiting_payment` - Waiting for card payment (card payments only)
3. `paid` - Payment confirmed or cash order created
4. `cancelled` - Order cancelled

### Payment Status (`payment_status`):
- `pending` - Payment not completed
- `paid` - Payment successful

### Shipping Status (`shipping_status`):
- `pending` - Not yet shipped
- `processing` - Preparing for shipment
- `shipped` - Shipped with AWB
- `delivered` - Delivered to customer
- `returned` - Returned to sender

---

## Stock Management

**Important**: Stock is ONLY reduced when order status changes to `paid`:
- **Card payments**: Stock reduced after payment confirmation
- **Cash payments**: Stock reduced immediately when order is created

Orders with status `awaiting_payment` do NOT reduce stock until payment is confirmed.

---

## Discount Calculation

Products automatically include discount information in their response:
- `original_price` - Base price without discount
- `discounted_price` - Price after discount (null if no discount)
- `has_discount` - Whether product has active discount
- `discount_percentage` - Percentage saved
- `final_price` - Final price to charge customer

Discounts are automatically applied based on:
1. Active discount (is_active = true)
2. Current date within discount date range
3. Best discount if multiple apply (highest savings)

---

## Delivery Address Collection

### Delivery Types

Your checkout must support two delivery types:
- `home` - Home/address delivery
- `locker` - Pickup locker delivery

### Home Delivery Address Fields

When `delivery_type: "home"` is selected, collect these fields:

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `customer_city` | Yes | City name | "București" |
| `customer_county` | Yes | County/region | "București" |
| `customer_street` | Yes | Street name | "Strada Victoriei" |
| `customer_street_number` | Yes | Street number | "123" |
| `customer_block` | No | Building/block | "A1" |
| `customer_apartment` | No | Apartment number | "45" |

**Example Form Structure (HTML)**:
```html
<form id="home-delivery-form">
  <input type="text" name="customer_city" placeholder="Oraș" required />
  <input type="text" name="customer_county" placeholder="Județ" required />
  <input type="text" name="customer_street" placeholder="Strada" required />
  <input type="text" name="customer_street_number" placeholder="Număr" required />
  <input type="text" name="customer_block" placeholder="Bloc (opțional)" />
  <input type="text" name="customer_apartment" placeholder="Apartament (opțional)" />
</form>
```

### Locker Delivery Fields

When `delivery_type: "locker"` is selected, collect these fields:

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `selected_carrier_code` | Yes | Carrier code from `/carriers` | "fancourier" |
| `locker_id` | Yes | Locker ID from `/lockers` | "FC_BUC_001" |
| `locker_name` | Yes | Locker display name | "Fan Courier - AFI Mall" |
| `locker_address` | No | Locker full address | "Bd. Vasile Milea 4, București" |

---

## Locker Map Implementation

Display available lockers on an interactive map using Mapbox GL JS.

### Step 1: Get Mapbox Token

Retrieve the Mapbox public token from config:

```javascript
const configResponse = await fetch(`${BASE_URL}/config?api_key=${API_KEY}`);
const config = await configResponse.json();
const mapboxToken = config.mapbox_token;
```

### Step 2: Fetch Available Lockers

```javascript
async function fetchLockers(carrierCode, city, county) {
  const params = new URLSearchParams({
    api_key: API_KEY,
    carrier_code: carrierCode,
    locality: city || '',
    county: county || ''
  });
  
  const response = await fetch(`${BASE_URL}/lockers?${params}`);
  const data = await response.json();
  return data.lockers; // Array of locker objects with lat/lng
}
```

### Step 3: Initialize Mapbox Map

```html
<!-- Include Mapbox CSS and JS -->
<link href="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js"></script>

<div id="locker-map" style="width: 100%; height: 400px;"></div>
```

```javascript
// Initialize map
mapboxgl.accessToken = mapboxToken;

const map = new mapboxgl.Map({
  container: 'locker-map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [26.1025, 44.4268], // Default: Bucharest
  zoom: 11
});

// Add navigation controls
map.addControl(new mapboxgl.NavigationControl(), 'top-right');

// Add geolocation control (optional)
map.addControl(new mapboxgl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true
}));
```

### Step 4: Add Locker Markers

```javascript
let selectedLocker = null;
const markers = [];

function displayLockers(lockers) {
  // Clear existing markers
  markers.forEach(marker => marker.remove());
  markers.length = 0;
  
  // Add markers for each locker
  lockers.forEach(locker => {
    // Create custom marker element
    const el = document.createElement('div');
    el.className = 'locker-marker';
    el.style.cssText = `
      width: 32px;
      height: 32px;
      background: #3b82f6;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: pointer;
    `;
    
    // Create popup
    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
      <div style="padding: 8px;">
        <strong>${locker.name}</strong>
        <p style="margin: 4px 0; font-size: 12px;">${locker.address}</p>
        <button onclick="selectLocker('${locker.id}')" style="
          background: #3b82f6;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          width: 100%;
        ">Selectează</button>
      </div>
    `);
    
    // Add marker to map
    const marker = new mapboxgl.Marker(el)
      .setLngLat([locker.longitude, locker.latitude])
      .setPopup(popup)
      .addTo(map);
    
    markers.push(marker);
  });
  
  // Fit map to show all markers
  if (lockers.length > 0) {
    const bounds = new mapboxgl.LngLatBounds();
    lockers.forEach(locker => {
      bounds.extend([locker.longitude, locker.latitude]);
    });
    map.fitBounds(bounds, { padding: 50 });
  }
}

// Locker selection handler
function selectLocker(lockerId) {
  const locker = lockers.find(l => l.id === lockerId);
  if (locker) {
    selectedLocker = {
      locker_id: locker.id,
      locker_name: locker.name,
      locker_address: locker.address,
      selected_carrier_code: locker.carrier_code || carrierCode
    };
    
    // Update UI to show selection
    document.getElementById('selected-locker-display').textContent = locker.name;
  }
}
```

### Step 5: Complete Locker Selection UI

```html
<div id="locker-selection">
  <!-- Carrier Selection -->
  <label>Selectează curier:</label>
  <select id="carrier-select" onchange="onCarrierChange()">
    <option value="">-- Selectează --</option>
    <!-- Populated from /carriers endpoint -->
  </select>
  
  <!-- Optional: City filter -->
  <input type="text" id="city-filter" placeholder="Filtrează după oraș" />
  
  <!-- Map Container -->
  <div id="locker-map" style="width: 100%; height: 400px; margin: 16px 0;"></div>
  
  <!-- Selected Locker Display -->
  <div id="selected-locker-info" style="display: none;">
    <strong>Locker selectat:</strong>
    <span id="selected-locker-display"></span>
  </div>
</div>
```

### Step 6: Submit Order with Locker

```javascript
async function submitLockerOrder() {
  if (!selectedLocker) {
    alert('Te rugăm să selectezi un locker');
    return;
  }
  
  const orderData = {
    customer_name: document.getElementById('name').value,
    customer_email: document.getElementById('email').value,
    customer_phone: document.getElementById('phone').value,
    total: calculateTotal(),
    items: cartItems,
    payment_method: 'card', // or 'cash'
    delivery_type: 'locker',
    selected_carrier_code: selectedLocker.selected_carrier_code,
    locker_id: selectedLocker.locker_id,
    locker_name: selectedLocker.locker_name,
    locker_address: selectedLocker.locker_address
  };
  
  const response = await fetch(`${BASE_URL}/orders?api_key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  });
  
  const result = await response.json();
  
  if (result.payment_url) {
    window.location.href = result.payment_url;
  }
}
```

### Locker Object Structure

Each locker from the `/lockers` endpoint has:

```json
{
  "id": "FC_BUC_001",
  "name": "Fan Courier - AFI Cotroceni",
  "address": "Bd. Vasile Milea 4, București",
  "city": "București",
  "county": "București",
  "latitude": 44.4323,
  "longitude": 26.0547,
  "carrier_id": 1,
  "available": true
}
```

### React/TypeScript Example

```tsx
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Locker {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export function LockerMap({ 
  mapboxToken, 
  lockers, 
  onSelect 
}: { 
  mapboxToken: string;
  lockers: Locker[];
  onSelect: (locker: Locker) => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;
    
    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [26.1025, 44.4268],
      zoom: 11
    });
    
    map.current.addControl(new mapboxgl.NavigationControl());
    
    return () => map.current?.remove();
  }, [mapboxToken]);
  
  useEffect(() => {
    if (!map.current || !lockers.length) return;
    
    lockers.forEach(locker => {
      const marker = new mapboxgl.Marker()
        .setLngLat([locker.longitude, locker.latitude])
        .addTo(map.current!);
      
      marker.getElement().addEventListener('click', () => onSelect(locker));
    });
  }, [lockers, onSelect]);
  
  return <div ref={mapContainer} style={{ width: '100%', height: '400px' }} />;
}
```

---

## Integration Examples

### JavaScript/TypeScript

```javascript
const API_KEY = 'your-api-key-here';
const BASE_URL = 'https://uffmgvdtkoxkjolfrhab.supabase.co/functions/v1/store-api';

// Get products
async function getProducts() {
  const response = await fetch(`${BASE_URL}/products?api_key=${API_KEY}`);
  const data = await response.json();
  return data.products;
}

// Create order with card payment
async function createOrder(orderData) {
  const response = await fetch(`${BASE_URL}/orders?api_key=${API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderData)
  });
  const data = await response.json();
  
  if (data.payment_url) {
    // Redirect to payment page
    window.location.href = data.payment_url;
  }
  
  return data;
}

// Get lockers
async function getLockers(carrierCode, city, county) {
  const params = new URLSearchParams({
    api_key: API_KEY,
    carrier_code: carrierCode,
    locality: city,
    county: county
  });
  
  const response = await fetch(`${BASE_URL}/lockers?${params}`);
  const data = await response.json();
  return data.lockers;
}
```

### Using Headers for API Key

```javascript
const headers = {
  'X-API-Key': 'your-api-key-here',
  'Content-Type': 'application/json'
};

const response = await fetch(`${BASE_URL}/products`, { headers });
```

---

## Support

For API issues or questions:
- Check edge function logs in Supabase dashboard
- Review error messages in API responses
- Contact support with order ID or payment ID for specific issues

## Rate Limits

Currently no rate limits are enforced, but we recommend:
- Maximum 100 requests per minute
- Use pagination for large datasets when available
- Cache product/collection data when possible
