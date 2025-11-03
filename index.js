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
app.get('/auth/callback', async (req, res) => {
  const { code, shop } = req.query

  if (!code || !shop) {
    return res.status(400).send('Missing code or shop parameter')
  }

  try {
    // Step 1: Exchange authorization code for access token
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code
      }
    )

    const accessToken = tokenResponse.data.access_token

    console.log(`Access Token for ${shop}: ${accessToken}`)

    // Step 2: Get the main (published) theme
    const themesResponse = await axios.get(
      `https://${shop}/admin/api/2024-07/themes.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      }
    )

    const mainTheme = themesResponse.data.themes.find(
      theme => theme.role === 'main'
    )

    if (mainTheme) {
      const themeId = mainTheme.id

      // Step 3: Fetch settings_data.json
      const settingsResponse = await axios.get(
        `https://${shop}/admin/api/2024-07/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`,
        {
          headers: {
            'X-Shopify-Access-Token': accessToken
          }
        }
      )

      const settingsJson = JSON.parse(settingsResponse.data.asset.value)

      // Step 4: Enable your app embed block
      const appEmbedId = 'chatbot' // change this to your actual embed block ID

      if (
        settingsJson.current &&
        settingsJson.current.blocks &&
        settingsJson.current.blocks[appEmbedId]
      ) {
        settingsJson.current.blocks[appEmbedId].disabled = false
        console.log('✅ App embed found and enabled!')
      } else {
        // fallback: try to enable all your app-related blocks
        for (const key in settingsJson.current.blocks) {
          if (key.includes('chatbot') || key.includes('convexai')) {
            settingsJson.current.blocks[key].disabled = false
            console.log(`✅ Enabled block: ${key}`)
          }
        }
      }

      // Step 5: Upload updated settings_data.json
      await axios.put(
        `https://${shop}/admin/api/2024-07/themes/${themeId}/assets.json`,
        {
          asset: {
            key: 'config/settings_data.json',
            value: JSON.stringify(settingsJson, null, 2)
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken
          }
        }
      )

      console.log('🎉 App embed successfully enabled in theme!')
    } else {
      console.log('⚠️ No main theme found for this store.')
    }

    // Step 6: Redirect merchant to Theme Editor (or your app dashboard)
    const redirectUrl = `https://${shop}/admin/themes/current/editor?context=apps`
    res.redirect(redirectUrl)
  } catch (error) {
    console.error(
      '❌ Error during app installation:',
      error.response?.data || error.message
    )
    res.status(500).send('Failed to install app')
  }
})

// Start the server
app.listen(port, () => {
  console.log(`App is listening on port ${port}`)
})
