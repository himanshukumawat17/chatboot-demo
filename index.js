const express = require('express')
const axios = require('axios')
const dotenv = require('dotenv')
const cors = require('cors')
const bodyParser = require('body-parser')

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

// 🧩 Shopify OAuth constants
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET
const SHOPIFY_SCOPE =
  'read_themes,write_themes,read_products,write_products,read_script_tags,write_script_tags'
const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI

app.use(cors())
app.use(express.static('public'))
app.use(bodyParser.json())
app.set('view engine', 'ejs')

// 🧠 In-memory store (replace with DB later)
let customerDataStore = {}
let shopDataStore = {}

// ⚙️ Add chatbot block to theme

async function addChatbotBlock (shop, accessToken) {
  try {
    console.log(`✅ Access Token for ${shop}:`, accessToken)

    // 1️⃣ Get all themes
    const themesResponse = await axios.get(
      `https://${shop}/admin/api/2024-07/themes.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken }
      }
    )

    const mainTheme = themesResponse.data.themes.find(
      theme => theme.role === 'main'
    )
    if (!mainTheme) throw new Error('No main theme found')

    console.log(`🧩 Found main theme: ${mainTheme.name} (${mainTheme.id})`)

    // 2️⃣ Fetch settings_data.json
    const settingsResponse = await axios.get(
      `https://${shop}/admin/api/2024-07/themes/${mainTheme.id}/assets.json?asset[key]=config/settings_data.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken }
      }
    )

    const settingsData = JSON.parse(settingsResponse.data.asset.value)

    // 3️⃣ Ensure "current" exists
    if (!settingsData.current) settingsData.current = {}

    // 4️⃣ Add chatbot block under "current"
    if (!settingsData.current.blocks) {
      settingsData.current.blocks = {}
    }

    const chatbotBlockId = '3693381111320325491'
    if (!settingsData.current.blocks[chatbotBlockId]) {
      settingsData.current.blocks[chatbotBlockId] = {
        type: 'shopify://apps/convex-ai-chatbot/blocks/chatbot/f62e808d-7883-49d1-ad07-3b5489568894',
        disabled: false,
        settings: {
          website_url: '',
          email_id: ''
        }
      }
      console.log('✅ Chatbot block added successfully')
    } else {
      console.log('ℹ️ Chatbot block already exists')
    }

    // 5️⃣ Upload updated settings_data.json
    console.log(
      '🧠 Uploading updated settings_data.json to:',
      `https://${shop}/admin/api/2024-07/themes/${mainTheme.id}/assets.json`
    )

    await axios.put(
      `https://${shop}/admin/api/2024-07/themes/${mainTheme.id}/assets.json`,
      {
        asset: {
          key: 'config/settings_data.json',
          value: JSON.stringify(settingsData, null, 2)
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        }
      }
    )

    console.log(
      '🎉 Chatbot block successfully injected into settings_data.json!'
    )
  } catch (error) {
    console.error(
      '❌ Error adding chatbot block:',
      error.response?.data || error.message
    )
  }
}

// 🏠 Home route (installation start)
app.get('/', (req, res) => {
  const shop = req.query.shop
  res.render('install', {
    title: 'Install My App',
    message: 'Welcome to Shopify App!',
    shopName: shop
  })
})

// 🚀 Begin OAuth
app.get('/auth', (req, res) => {
  const shop = req.query.shop
  if (!shop) return res.status(400).send('Missing shop parameter')

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPE}&redirect_uri=${SHOPIFY_REDIRECT_URI}`
  res.redirect(installUrl)
})

// 🧩 OAuth Callback
app.get('/auth/callback', async (req, res) => {
  const { code, shop } = req.query
  if (!code || !shop)
    return res.status(400).send('Missing code or shop parameter')

  try {
    // 1️⃣ Exchange code for access token
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code
      }
    )

    const accessToken = tokenResponse.data.access_token
    console.log(`✅ Access Token for ${shop}: ${accessToken}`)

    // 2️⃣ Automatically enable Chatbot
    await addChatbotBlock(shop, accessToken)

    // 3️⃣ Redirect to Shopify Theme Editor
    const redirectUrl = `https://${shop}/admin/themes/current/editor?context=apps`
    res.redirect(redirectUrl)
  } catch (error) {
    console.error(
      '❌ Error in /auth/callback:',
      error.response?.data || error.message
    )
    res.status(500).send('Failed to install app')
  }
})

// 🧹 GDPR Endpoints (for compliance)
app.post('/customer-data-request', (req, res) => {
  const { customer_id, request_id } = req.body
  if (!customer_id || !request_id)
    return res.status(400).json({ error: 'Missing customer_id or request_id' })

  const customerData = customerDataStore[customer_id]
  if (!customerData)
    return res.status(404).json({ error: 'Customer data not found' })

  res.json({ request_id, customer_id, data: customerData })
})

app.post('/customer-data-erasure', (req, res) => {
  const { customer_id, request_id } = req.body
  if (!customer_id || !request_id)
    return res.status(400).json({ error: 'Missing customer_id or request_id' })

  delete customerDataStore[customer_id]
  res.json({ request_id, customer_id, status: 'Data erased successfully' })
})

app.post('/shop-data-erasure', (req, res) => {
  const { shop_id, request_id } = req.body
  if (!shop_id || !request_id)
    return res.status(400).json({ error: 'Missing shop_id or request_id' })

  delete shopDataStore[shop_id]
  res.json({ request_id, shop_id, status: 'Shop data erased successfully' })
})

// 🖥️ Start server
app.listen(port, () => {
  console.log(`🚀 App is running on port ${port}`)
})
