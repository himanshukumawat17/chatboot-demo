const express = require('express')
const axios = require('axios')
const dotenv = require('dotenv')
const cors = require('cors')
const bodyParser = require('body-parser')

dotenv.config()

const app = express()
const port = process.env.PORT || 10026

// Set up the OAuth constants
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET
const SHOPIFY_SCOPE = 'read_products,write_orders,read_themes,write_themes'
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
app.get('/auth/callback', async (req, res) => {
  const { code, shop } = req.query
  if (!code || !shop)
    return res.status(400).send('Missing code or shop parameter')

  try {
    // === 1. Exchange authorization code for access token ===
    const tokenRes = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code
      }
    )

    const accessToken = tokenRes.data.access_token
    console.log(`✅ Access Token for ${shop}: ${accessToken}`)

    // === 2. Optional: Check granted scopes ===
    const scopes = await axios.get(
      `https://${shop}/admin/oauth/access_scopes.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken }
      }
    )
    console.log('Granted Scopes:', scopes.data)

    // === 3. Get all themes ===
    const themesRes = await axios.get(
      `https://${shop}/admin/api/2023-10/themes.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken }
      }
    )

    const themes = themesRes.data.themes || []
    if (!themes.length) return res.status(404).send('No themes found')
    console.log(`🧩 Found ${themes.length} theme(s)`)

    // === 4. Loop through each theme and update settings_data.json ===
    for (const theme of themes) {
      try {
        console.log(`🔍 Processing theme ID: ${theme.id} (${theme.name})`)

        // Get settings_data.json
        const assetRes = await axios.get(
          `https://${shop}/admin/api/2023-10/themes/${theme.id}/assets.json`,
          {
            headers: { 'X-Shopify-Access-Token': accessToken },
            params: { 'asset[key]': 'config/settings_data.json' }
          }
        )

        // Parse settings JSON
        let settingsData = JSON.parse(assetRes.data.asset.value)

        // Ensure the field exists or create it
        if (!settingsData.current) settingsData.current = {}

        // ✅ Dynamically set disable = true
        settingsData.current.disable = true

        // Update file
        await axios.put(
          `https://${shop}/admin/api/2023-10/themes/${theme.id}/assets.json`,
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

        console.log(`✅ Updated disable=true for theme ID: ${theme.id}`)
      } catch (themeErr) {
        // Gracefully handle missing file or errors per theme
        console.warn(
          `⚠️ Skipped theme ID ${theme.id}:`,
          themeErr.response?.data?.errors || themeErr.message
        )
      }
    }

    // === 5. Redirect to admin after all updates ===
    res.redirect(`https://${shop}/admin/themes/current/editor?context=apps`)
  } catch (error) {
    console.error(
      '❌ Error during callback or updating themes:',
      error.response?.data || error.message
    )
    res.status(500).send('Failed to install app or update settings')
  }
})

// Start the server
app.listen(port, () => {
  console.log(`App is listening on port ${port}`)
})
