const express = require('express')
const axios = require('axios')
const dotenv = require('dotenv')
const cors = require('cors')
const bodyParser = require('body-parser')

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

// Set up the OAuth constants
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET
const SHOPIFY_SCOPE = 'read_products,write_orders' // Adjust the scopes as needed
const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI

app.use(cors())

app.set('view engine', 'ejs')

// Serve static files (if any, like stylesheets, images)
app.use(express.static('public'))

app.use(bodyParser.json())

// Sample data store (replace with a real database in production)
let customerDataStore = {} // Stores customer data by customer_id
let shopDataStore = {} // Stores shop data by shop_id

// Endpoint for Customer Data Request
app.post('/customer-data-request', (req, res) => {
  const { customer_id, request_id } = req.body

  if (!customer_id || !request_id) {
    return res.status(400).json({ error: 'Missing customer_id or request_id' })
  }

  const customerData = customerDataStore[customer_id]

  if (!customerData) {
    return res.status(404).json({ error: 'Customer data not found' })
  }

  // Return customer data in the response (ensure this complies with data privacy rules)
  return res.json({
    request_id,
    customer_id,
    data: customerData
  })
})

// Endpoint for Customer Data Erasure
app.post('/customer-data-erasure', (req, res) => {
  const { customer_id, request_id } = req.body

  if (!customer_id || !request_id) {
    return res.status(400).json({ error: 'Missing customer_id or request_id' })
  }

  const customerData = customerDataStore[customer_id]

  if (!customerData) {
    return res.status(404).json({ error: 'Customer data not found' })
  }

  // Erase customer data from the store (in production, this will interact with your DB)
  delete customerDataStore[customer_id]

  return res.json({
    request_id,
    customer_id,
    status: 'Data erased successfully'
  })
})

// Endpoint for Shop Data Erasure
app.post('/shop-data-erasure', (req, res) => {
  const { shop_id, request_id } = req.body

  if (!shop_id || !request_id) {
    return res.status(400).json({ error: 'Missing shop_id or request_id' })
  }

  const shopData = shopDataStore[shop_id]

  if (!shopData) {
    return res.status(404).json({ error: 'Shop data not found' })
  }

  // Erase shop data from the store (in production, this will interact with your DB)
  delete shopDataStore[shop_id]

  return res.json({
    request_id,
    shop_id,
    status: 'Shop data erased successfully'
  })
})

app.get('/', (req, res) => {
  const shop = req.query.shop
  res.render('install', {
    title: 'My Home Page',
    message: 'Welcome to Node.js with EJS!',
    shopName: shop
  })
})

// Home route to start the OAuth flow
app.get('/auth', (req, res) => {
  const shop = req.query.shop
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPE}&redirect_uri=${SHOPIFY_REDIRECT_URI}`
  res.redirect(installUrl)
})

// OAuth callback to handle the token exchange
// Get settings_data.json
const settingsRes = await axios.get(
  `https://${shop}/admin/api/2024-10/themes/${themeId}/assets.json`,
  {
    headers: { 'X-Shopify-Access-Token': accessToken },
    params: { 'asset[key]': 'config/settings_data.json' }
  }
)

let settingsData = JSON.parse(settingsRes.data.asset.value)

// Ensure structure exists
if (!settingsData.current) settingsData.current = {}
if (!settingsData.current.blocks) settingsData.current.blocks = {}
if (!settingsData.current.block_order) settingsData.current.block_order = []

// Define your block
const blockId = '3693381111320325491'
const blockType =
  'shopify://apps/convex-ai-chatbot/blocks/chatbot/f62e808d-7883-49d1-ad07-3b5489568894'

// Add if not already present
if (!settingsData.current.blocks[blockId]) {
  settingsData.current.blocks[blockId] = {
    type: blockType,
    disabled: false,
    settings: {
      website_url: '',
      email_id: ''
    }
  }
  settingsData.current.block_order.push(blockId)
  console.log('✅ Chatbot block added to settings_data.json')
} else {
  console.log('ℹ️ Chatbot block already exists.')
}

// Upload updated settings
await axios.put(
  `https://${shop}/admin/api/2024-10/themes/${themeId}/assets.json`,
  {
    asset: {
      key: 'config/settings_data.json',
      value: JSON.stringify(settingsData, null, 2)
    }
  },
  {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  }
)

// Start the server
app.listen(port, () => {
  console.log(`App is listening on port ${port}`)
})
