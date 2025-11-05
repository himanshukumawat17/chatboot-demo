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
  console.log('==========================')
  console.log(`🧠 Starting block injection for ${shop}`)
  console.log('==========================')

  try {
    console.log(
      `🔑 Access Token (first 10 chars): ${accessToken.slice(0, 10)}...`
    )

    // 1️⃣ Get all themes
    console.log(`📡 Fetching themes for shop: ${shop}`)
    const themesResponse = await axios.get(
      `https://${shop}/admin/api/2024-07/themes.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken }
      }
    )

    console.log('🧾 Themes response:', themesResponse.data.themes)
    const mainTheme = themesResponse.data.themes.find(
      theme => theme.role === 'main'
    )
    if (!mainTheme) throw new Error('No main theme found')

    console.log(`✅ Found main theme: ${mainTheme.name} (${mainTheme.id})`)

    // 2️⃣ Fetch settings_data.json
    const settingsUrl = `https://${shop}/admin/api/2024-07/themes/${mainTheme.id}/assets.json?asset[key]=config/settings_data.json`
    console.log(`📡 Fetching settings_data.json from: ${settingsUrl}`)

    const settingsResponse = await axios.get(settingsUrl, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    })

    console.log('📜 Existing settings_data.json fetched successfully')

    const settingsData = JSON.parse(settingsResponse.data.asset.value)

    // 3️⃣ Ensure "current" and "blocks" exist
    if (!settingsData.current) settingsData.current = {}
    if (!settingsData.current.blocks) settingsData.current.blocks = {}

    const chatbotBlockId = '3693381111320325491'
    const chatbotBlock = {
      type: 'shopify://apps/convex-ai-chatbot/blocks/chatbot/f62e808d-7883-49d1-ad07-3b5489568894',
      disabled: false,
      settings: {
        website_url: '',
        email_id: ''
      }
    }

    if (!settingsData.current.blocks[chatbotBlockId]) {
      settingsData.current.blocks[chatbotBlockId] = chatbotBlock
      console.log('✅ Chatbot block added successfully')
    } else {
      settingsData.current.blocks[chatbotBlockId].disabled = false
      console.log('ℹ️ Chatbot block already existed — ensured it’s enabled')
    }

    // 4️⃣ Prepare upload
    const uploadUrl = `https://${shop}/admin/api/2024-07/themes/${mainTheme.id}/assets.json`
    const payload = {
      asset: {
        key: 'config/settings_data.json',
        value: JSON.stringify(settingsData, null, 2)
      }
    }

    console.log('📤 Upload URL:', uploadUrl)
    console.log(
      '📦 Payload preview:',
      JSON.stringify(payload).slice(0, 500) + '...'
    )
    console.log('📋 Headers:', {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken.slice(0, 10) + '...'
    })

    // 5️⃣ Upload updated settings_data.json
    try {
      const putResponse = await axios.put(uploadUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        }
      })
      console.log('🎉 Chatbot block successfully injected!')
      console.log('📡 Shopify Response:', putResponse.data)
    } catch (err) {
      console.error('❌ PUT failed — response data:', err.response?.data)
      if (err.response?.data?.errors === 'Not Found') {
        console.log('⚠️ settings_data.json missing — creating new one...')
        const postResponse = await axios.post(uploadUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          }
        })
        console.log(
          '✅ Created new settings_data.json successfully!',
          postResponse.data
        )
      } else {
        console.error(
          '💥 Unexpected upload error:',
          err.response?.data || err.message
        )
      }
    }
  } catch (error) {
    console.error(
      '❌ Error adding chatbot block:',
      error.response?.data || error.message
    )
  }

  console.log('==========================')
  console.log(`🏁 Finished block injection for ${shop}`)
  console.log('==========================')
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
  console.log(`🔗 Redirecting for installation: ${installUrl}`)
  res.redirect(installUrl)
})

// 🧩 OAuth Callback
app.get('/auth/callback', async (req, res) => {
  const { code, shop } = req.query
  if (!code || !shop)
    return res.status(400).send('Missing code or shop parameter')

  console.log('📥 OAuth callback received for shop:', shop)
  console.log('🔑 Code:', code)

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
    console.log(`🔄 Redirecting to Theme Editor: ${redirectUrl}`)
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
