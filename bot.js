const TelegramBot = require('node-telegram-bot-api')
const GROQ_API_KEY = process.env.GROQ_API_KEY
const axios = require('axios')
const express = require('express')

// ─── SERVER ───────────────────────────────────────────────────────────────────
const app = express()
app.get('/', (req, res) => res.send('PECKER BOT is alive!'))
app.get('/health', (req, res) => res.json({ status: 'ok' }))
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('PECKER BOT running on port ' + PORT))

const BOT_TOKEN = process.env.BOT_TOKEN
const OWNER_ID = 7404076592
const CA = '0x7dff55cff05da3b29c3bf0de765ce6092db26dfa'
const PECKER_GROUP = 'https://t.me/pecker_on_bsc'
const MINI_APP = 'https://t.me/PECKER_BSC_BOT/app'
const WEBSITE = 'https://www.peckeronbsc.com'
const DEXSCREENER = `https://dexscreener.com/bsc/${CA}`
const PANCAKESWAP = `https://pancakeswap.finance/swap?outputCurrency=${CA}`

const bot = new TelegramBot(BOT_TOKEN, { polling: true })

// ─── PECKER KNOWLEDGE BASE ────────────────────────────────────────────────────
const PECKER_KNOWLEDGE = `
You are PECKER BOT — the official AI assistant for $PECKER token on BNB Chain.
You are witty, energetic, bullish, and speak like a crypto degen who believes in the project.
You NEVER give the same response twice — always rephrase, use different emojis, different energy.
Mix in woodpecker references, bird puns, and crypto slang naturally.

FACTS YOU KNOW (always accurate):
- Token: $PECKER
- Chain: BNB Chain (BEP-20)
- Contract Address (CA): 0x7dff55cff05da3b29c3bf0de765ce6092db26dfa
- Total Supply: 1,000,000,000 (1 Billion)
- Max Wallet: 3.2%
- Buy Tax: 2% (goes to liquidity)
- Sell Tax: 3% (goes to marketing)
- Launch: Nano market cap — one of the smallest possible launches
- Liquidity Pool: 70% of supply (700,000,000 tokens)
- Airdrop & Community: 25% of supply (250,000,000 tokens) — distributed when MC hits $10,000+
- Team: 5% of supply (50,000,000 tokens)
- Telegram Group: https://t.me/pecker_on_bsc
- Telegram Channel: https://t.me/PECKER_BSC
- Mini App: https://t.me/PECKER_BSC_BOT/app
- Website: https://www.peckeronbsc.com
- Twitter/X: https://x.com/pecker_bsc
- Buy on: PancakeSwap
- DexScreener: https://dexscreener.com/bsc/0x7dff55cff05da3b29c3bf0de765ce6092db26dfa

HOW TO BUY:
1. Get MetaMask or Trust Wallet
2. Buy BNB from any exchange
3. Go to PancakeSwap
4. Paste CA and swap BNB for $PECKER
5. Set slippage to 6-8%

MINI APP:
- Earn points through tasks, daily check-ins, referrals
- Leaderboard competition
- Points convert to $PECKER tokens when MC hits $10K+
- Join at: https://t.me/PECKER_BSC_BOT/app

RULES:
- Never say price predictions or "this will go to X"
- Never give financial advice
- Always say DYOR (Do Your Own Research)
- If asked about rug pull: project is transparent, 70% liquidity, committed team
- If asked about team: anonymous but committed, focused on building
- Keep responses SHORT (2-5 sentences max) unless explaining how to buy
- End responses with a bird/pecker emoji when appropriate 🐦
`

// ─── STATE ────────────────────────────────────────────────────────────────────
let buyBotActive = false
let buyBotChatId = null
let lastTxHash = null  // FIX: use null not '' to avoid skip-on-restart bug
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY
const warnings = {}
const bannedUsers = new Set()

// Track last welcome message per chat: { chatId: messageId }
const lastWelcomeMsgId = {}

// Track last activity per chat for silence detection: { chatId: timestamp }
const lastActivityTime = {}

// ─── BUY BOT — FIXED ─────────────────────────────────────────────────────────
async function checkBuys() {
  if (!buyBotActive || !buyBotChatId || !BSCSCAN_API_KEY) return
  try {
    // FIX 1: Use BSCScan API directly instead of Etherscan v2 with chainid=56
    const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${CA}&sort=desc&offset=10&page=1&apikey=${BSCSCAN_API_KEY}`
    const res = await axios.get(url, { timeout: 15000 })

    if (!res.data || res.data.status !== '1' || !Array.isArray(res.data.result)) return
    const txs = res.data.result
    if (txs.length === 0) return

    // FIX 2: On first run, just save the latest hash and return — don't skip
    if (lastTxHash === null) {
      lastTxHash = txs[0].hash
      return
    }

    const newTxs = []
    for (const tx of txs) {
      if (tx.hash === lastTxHash) break
      newTxs.push(tx)
    }

    // Process from oldest to newest
    for (const tx of newTxs.reverse()) {
      const amount = parseFloat(tx.value) / 1e18

      // FIX 3: Lowered threshold from 1000 to 100 so small buys aren't missed
      if (amount < 100) continue

      // Only post buys (token going TO buyer, FROM PancakeSwap router)
      // to = buyer's wallet
      const buyer = tx.to.slice(0, 6) + '...' + tx.to.slice(-4)
      const txLink = `https://bscscan.com/tx/${tx.hash}`

      const buyMessages = [
        `🟢 *NEW $PECKER BUY DETECTED!* 🐦\n\n💰 *${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} $PECKER* just got pecked up!\n👤 Buyer: \`${buyer}\`\n\n🥞 [Buy now on PancakeSwap](${PANCAKESWAP})\n🔍 [View TX](${txLink})`,
        `🚀 *PECKER ALERT — NEW BUY!*\n\n🐦 Someone just grabbed *${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} $PECKER*!\n👤 \`${buyer}\`\n\nAre you next? 👀\n[🥞 PancakeSwap](${PANCAKESWAP}) | [🔍 TX](${txLink})`,
        `🟢 *A woodpecker just landed!*\n\n💸 *${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} $PECKER* scooped up\n👤 \`${buyer}\`\n\nThe flock is growing 🐦\n[Buy $PECKER](${PANCAKESWAP}) | [TX](${txLink})`,
        `🔔 *BUY ALERT!*\n\n🐦 *${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} $PECKER* just found a new nest!\n👤 \`${buyer}\`\n\nJoin the early flock → [PancakeSwap](${PANCAKESWAP})\n[🔍 View TX on BSCScan](${txLink})`
      ]

      const msg = buyMessages[Math.floor(Math.random() * buyMessages.length)]
      await bot.sendMessage(buyBotChatId, msg, { parse_mode: 'Markdown', disable_web_page_preview: true })
    }

    lastTxHash = txs[0].hash
  } catch (e) {
    console.error('Buy bot error: ' + e.message)
  }
}

setInterval(checkBuys, 30000)

// ─── SILENCE DETECTOR — drop bullish message after 1hr of no activity ────────
const BULLISH_MESSAGES = [
  `🐦 *Pssst... the chart doesn't lie.*\n\nNano MC launch. 70% liquidity locked in the pool. 25% airdrop waiting for $10K MC.\n\nThe woodpecker pecks when others sleep 🚀\n\n[Buy $PECKER](${PANCAKESWAP}) | [Chart](${DEXSCREENER})`,
  `🌙 *While you sleep, $PECKER builds.*\n\nEvery peck counts. Every holder matters. We launched at nano MC — the only direction is up.\n\nDYOR and ape in early 🐦\n[PancakeSwap](${PANCAKESWAP})`,
  `🚀 *Reminder: You are EARLY.*\n\nNot many projects launch this small. Not many give 25% to the community.\n$PECKER is built different. 🐦\n\n[📊 Check the chart](${DEXSCREENER})`,
  `🐦 *The flock is quiet but the woodpecker never stops.*\n\nContracts verified. Liquidity deep. Airdrop incoming at $10K MC.\n\nAre you in yet? 👀\n[Buy $PECKER](${PANCAKESWAP})`,
  `💎 *Real ones hold through the silence.*\n\n$PECKER — nano launch, big vision. Community airdrop locked and loading.\n\nPeck responsibly. DYOR. 🐦\n[Chart](${DEXSCREENER}) | [Buy](${PANCAKESWAP})`,
  `⏰ *Tick tock. Nano MC won't last forever.*\n\nEvery minute you wait, someone else gets cheaper $PECKER than you.\n\nJust saying 🐦\n[🥞 PancakeSwap](${PANCAKESWAP})`,
  `🌲 *Best trees are claimed by the early birds.*\n\n$PECKER launched at nano MC. 70% liquidity. No VC dump. No presale whales.\n\nThis is as clean as it gets. 🐦\n[Buy now](${PANCAKESWAP}) | [Verify CA](${DEXSCREENER})`
]

async function checkSilence() {
  for (const [chatId, lastTime] of Object.entries(lastActivityTime)) {
    const now = Date.now()
    const oneHour = 60 * 60 * 1000
    if (now - lastTime >= oneHour) {
      const msg = BULLISH_MESSAGES[Math.floor(Math.random() * BULLISH_MESSAGES.length)]
      await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', disable_web_page_preview: true })
      // Reset timer after posting
      lastActivityTime[chatId] = now
    }
  }
}

setInterval(checkSilence, 5 * 60 * 1000) // check every 5 minutes

// ─── FETCH LIVE PRICE ─────────────────────────────────────────────────────────
async function getLivePrice() {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${CA}`, { timeout: 10000 })
    const pair = res.data.pairs?.[0]
    if (!pair) return null
    return {
      price: parseFloat(pair.priceUsd || 0),
      mc: parseFloat(pair.fdv || 0),
      change24h: parseFloat(pair.priceChange?.h24 || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      liquidity: parseFloat(pair.liquidity?.usd || 0),
      pairAddress: pair.pairAddress
    }
  } catch (e) {
    return null
  }
}

// ─── AI RESPONSE ──────────────────────────────────────────────────────────────
async function getAIResponse(userMessage, username) {
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: PECKER_KNOWLEDGE },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 300,
        temperature: 0.95
      },
      {
        headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000
      }
    )
    const response = res.data.choices[0].message.content.trim()
    if (response === 'IGNORE') return null
    return response
  } catch (e) {
    const fallbacks = [
      'The woodpecker is sharpening its beak! Try again in a moment 🐦',
      'PECKER BOT is catching its breath after that last pump 🚀 Ask again!',
      'Even woodpeckers need a coffee break ☕ Try again shortly!'
    ]
    return fallbacks[Math.floor(Math.random() * fallbacks.length)]
  }
}

// ─── FORMAT NUMBERS ───────────────────────────────────────────────────────────
function formatNum(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(4)}`
}

// ─── AUTO-DELETE HELPER ───────────────────────────────────────────────────────
async function deleteMessageAfter(chatId, messageId, delayMs) {
  setTimeout(async () => {
    try {
      await bot.deleteMessage(chatId, messageId)
    } catch (e) {
      // Message may already be deleted, ignore
    }
  }, delayMs)
}

// ─── WELCOME MESSAGE — with auto-delete of previous welcome ──────────────────
async function sendWelcome(chatId, newMember) {
  const name = newMember.first_name || 'fren'

  // Delete previous welcome message for this chat if it exists
  if (lastWelcomeMsgId[chatId]) {
    try {
      await bot.deleteMessage(chatId, lastWelcomeMsgId[chatId])
    } catch (e) {
      // Already deleted or too old, ignore
    }
    delete lastWelcomeMsgId[chatId]
  }

  const welcomes = [
    `🐦 *Welcome to the flock, ${name}!*\n\nThe woodpecker doesn't wait — and neither should you. You just joined the earliest $PECKER community on BNB Chain.\n\n🎮 Earn points → [Mini App](${MINI_APP})\n📊 Track price → [DexScreener](${DEXSCREENER})\n🌐 Website → [peckeronbsc.com](${WEBSITE})`,
    `🥚 *A new egg has hatched! Welcome ${name}!*\n\nYou found $PECKER at the perfect time — nano MC launch means you're genuinely early.\n\n🎮 Start earning → [Mini App](${MINI_APP})\n💰 Buy $PECKER → [PancakeSwap](${PANCAKESWAP})\n🌐 Learn more → [Website](${WEBSITE})`,
    `🐦 *${name} just joined the nest!*\n\nSmart birds find the best trees early. Welcome to $PECKER — the token that hits different.\n\n📱 Join the airdrop → [Mini App](${MINI_APP})\n📊 Live chart → [DexScreener](${DEXSCREENER})\n📢 Channel → [@PECKER_BSC](https://t.me/PECKER_BSC)`,
    `🌲 *${name} landed in the right tree!*\n\nNano MC. Deep liquidity. Community airdrop. You're early, fren 🚀\n\n🎮 [Earn points](${MINI_APP}) | 🥞 [Buy $PECKER](${PANCAKESWAP}) | 📊 [Chart](${DEXSCREENER})`,
    `🚀 *New pecker in the flock — ${name}!*\n\nThe best time to find $PECKER was at launch. The second best time is RIGHT NOW.\n\n[🎮 Mini App](${MINI_APP}) | [🌐 Website](${WEBSITE}) | [📊 Chart](${DEXSCREENER})`
  ]

  const msg = welcomes[Math.floor(Math.random() * welcomes.length)]
  const sent = await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', disable_web_page_preview: true })

  // Store this welcome message ID so it can be deleted when next member joins
  lastWelcomeMsgId[chatId] = sent.message_id
}

// ─── COMMANDS ─────────────────────────────────────────────────────────────────

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const starts = [
    `🐦 *PECKER BOT is live and pecking!*\n\nYour all-in-one $PECKER assistant on BNB Chain.\n\n*Commands:*\n/price — Live price & stats\n/ca — Contract address\n/buy — How to buy guide\n/chart — DexScreener chart\n/socials — All links\n/app — Mini App link\n/tokenomics — Token details\n/help — All commands\n\nOr just ask me anything about $PECKER! 🚀`,
    `🚀 *PECKER BOT has entered the chat!*\n\nReady to answer all your $PECKER questions.\n\n/price /ca /buy /chart /socials /app /tokenomics /help\n\nJust ask me anything — I'm powered by AI 🤖🐦`
  ]
  await bot.sendMessage(chatId, starts[Math.floor(Math.random() * starts.length)], { parse_mode: 'Markdown' })
})

// /price
bot.onText(/\/price/, async (msg) => {
  const chatId = msg.chat.id
  const data = await getLivePrice()
  if (!data || data.price === 0) {
    const notListed = [
      `🐦 *$PECKER Price*\n\n⏳ Not yet listed on DEX or still loading!\n\n💰 Get ready to ape in early → [PancakeSwap](${PANCAKESWAP})\n📊 Watch the launch → [DexScreener](${DEXSCREENER})`,
      `📊 *$PECKER hasn't launched on DEX yet!*\n\nThis is your chance to be first 🐦\n\n[🥞 PancakeSwap](${PANCAKESWAP}) | [📊 DexScreener](${DEXSCREENER})`
    ]
    await bot.sendMessage(chatId, notListed[Math.floor(Math.random() * notListed.length)], { parse_mode: 'Markdown', disable_web_page_preview: true })
    return
  }
  const arrow = data.change24h >= 0 ? '🟢' : '🔴'
  const change = data.change24h >= 0 ? `+${data.change24h.toFixed(2)}%` : `${data.change24h.toFixed(2)}%`
  const priceResponses = [
    `🐦 *$PECKER Live Price*\n\n💰 Price: $${data.price.toFixed(10)}\n${arrow} 24h: ${change}\n📊 Market Cap: ${formatNum(data.mc)}\n💧 Liquidity: ${formatNum(data.liquidity)}\n📈 Volume 24h: ${formatNum(data.volume24h)}\n\n[🥞 Buy](${PANCAKESWAP}) | [📊 Chart](${DEXSCREENER})`,
    `📈 *$PECKER Stats — Live*\n\n🔢 Price: $${data.price.toFixed(10)}\n${arrow} Change: ${change}\n💹 FDV: ${formatNum(data.mc)}\n💧 Liq: ${formatNum(data.liquidity)}\n\nStill early. DYOR 🐦\n[Buy on PancakeSwap](${PANCAKESWAP})`
  ]
  await bot.sendMessage(chatId, priceResponses[Math.floor(Math.random() * priceResponses.length)], { parse_mode: 'Markdown', disable_web_page_preview: true })
})

// /ca
bot.onText(/\/ca/, async (msg) => {
  const chatId = msg.chat.id
  const cas = [
    `🐦 *$PECKER Contract Address*\n\n\`${CA}\`\n\nCopy it, paste it on PancakeSwap, ape in. Simple. 🚀`,
    `📋 *Here's the CA, fren:*\n\n\`${CA}\`\n\nBNB Chain • BEP-20 • 3.2% max wallet 🐦`,
    `🔑 *Official $PECKER CA:*\n\n\`${CA}\`\n\nAlways verify before buying. One and only. ✅`,
    `🐦 *Tap to copy the CA:*\n\n\`${CA}\`\n\nBNB Chain | BEP-20 | 2% Buy / 3% Sell Tax`
  ]
  await bot.sendMessage(chatId, cas[Math.floor(Math.random() * cas.length)], { parse_mode: 'Markdown' })
})

// /buy
bot.onText(/^\/buy$/, async (msg) => {
  const chatId = msg.chat.id
  const buys = [
    `🥞 *How to Buy $PECKER*\n\n*Step 1* — Get MetaMask or Trust Wallet\n*Step 2* — Buy BNB from any exchange\n*Step 3* — Go to PancakeSwap\n*Step 4* — Paste the CA:\n\`${CA}\`\n*Step 5* — Set slippage to 6-8%\n*Step 6* — Swap BNB → $PECKER 🐦\n\n[🥞 Open PancakeSwap](${PANCAKESWAP})`,
    `🚀 *Ready to ape into $PECKER?*\n\n1️⃣ Trust Wallet or MetaMask\n2️⃣ Get BNB\n3️⃣ PancakeSwap → paste CA\n\`${CA}\`\n4️⃣ Slippage: 6-8%\n5️⃣ Swap & welcome to the flock 🐦\n\n[Buy $PECKER now](${PANCAKESWAP})`
  ]
  await bot.sendMessage(chatId, buys[Math.floor(Math.random() * buys.length)], { parse_mode: 'Markdown', disable_web_page_preview: true })
})

// /chart
bot.onText(/\/chart/, async (msg) => {
  const chatId = msg.chat.id
  const charts = [
    `📊 *$PECKER Live Chart*\n\n[👉 Open on DexScreener](${DEXSCREENER})\n\nTrack every peck in real time! 🐦`,
    `📈 *Chart's looking spicy!*\n\n[View $PECKER on DexScreener](${DEXSCREENER})\n\nCA: \`${CA}\` 🐦`,
    `🔍 *Watch $PECKER move in real time*\n\n[📊 DexScreener Chart](${DEXSCREENER})\n[🥞 Buy on PancakeSwap](${PANCAKESWAP})`
  ]
  await bot.sendMessage(chatId, charts[Math.floor(Math.random() * charts.length)], { parse_mode: 'Markdown', disable_web_page_preview: true })
})

// /socials
bot.onText(/\/socials/, async (msg) => {
  const chatId = msg.chat.id
  const socials = [
    `🌐 *$PECKER Official Links*\n\n✈️ [Telegram Group](${PECKER_GROUP})\n📢 [Telegram Channel](https://t.me/PECKER_BSC)\n🎮 [Mini App](${MINI_APP})\n🐦 [Twitter/X](https://x.com/pecker_bsc)\n🌐 [Website](${WEBSITE})\n📊 [DexScreener](${DEXSCREENER})\n🥞 [PancakeSwap](${PANCAKESWAP})\n\n*Always verify links before connecting your wallet!* ✅`,
    `🔗 *All $PECKER Links — Verified*\n\n[Telegram](${PECKER_GROUP}) | [Channel](https://t.me/PECKER_BSC) | [Mini App](${MINI_APP})\n[Twitter](https://x.com/pecker_bsc) | [Website](${WEBSITE})\n[Chart](${DEXSCREENER}) | [Buy](${PANCAKESWAP})\n\nStay safe. Only use official links 🐦`
  ]
  await bot.sendMessage(chatId, socials[Math.floor(Math.random() * socials.length)], { parse_mode: 'Markdown', disable_web_page_preview: true })
})

// /app
bot.onText(/\/app/, async (msg) => {
  const chatId = msg.chat.id
  const apps = [
    `🎮 *$PECKER Mini App*\n\nEarn points, complete tasks, refer frens and climb the leaderboard!\n\nPoints convert to $PECKER when MC hits $10,000+ 🚀\n\n[👉 Open Mini App](${MINI_APP})`,
    `📱 *The Mini App is live!*\n\nCheck in daily. Refer frens. Stack points. Convert to $PECKER at $10K MC 🐦\n\n[Launch Mini App](${MINI_APP})`
  ]
  await bot.sendMessage(chatId, apps[Math.floor(Math.random() * apps.length)], { parse_mode: 'Markdown', disable_web_page_preview: true })
})

// /tokenomics
bot.onText(/\/tokenomics/, async (msg) => {
  const chatId = msg.chat.id
  const tokenomics = [
    `📊 *$PECKER Tokenomics*\n\n🪙 Total Supply: 1,000,000,000\n⛓️ Chain: BNB Chain (BEP-20)\n\n🟡 70% — Liquidity Pool (700M)\n🟠 25% — Airdrop & Community (250M)\n🟢 5% — Team (50M)\n\n💸 Buy Tax: 2% → Liquidity\n💸 Sell Tax: 3% → Marketing\n🔒 Max Wallet: 3.2%\n\n🎁 Airdrop drops when MC hits $10K+ 🐦`,
    `🐦 *The $PECKER breakdown:*\n\n1B total supply\n700M → Liquidity (70%)\n250M → Community Airdrop (25%)\n50M → Team (5%)\n\nBuy: 2% | Sell: 3% | Max wallet: 3.2%\n\nClean. Transparent. Built to last 🚀`
  ]
  await bot.sendMessage(chatId, tokenomics[Math.floor(Math.random() * tokenomics.length)], { parse_mode: 'Markdown' })
})

// /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id
  await bot.sendMessage(chatId,
    `🐦 *PECKER BOT Commands*\n\n📈 /price — Live price & market cap\n📋 /ca — Contract address\n🥞 /buy — How to buy guide\n📊 /chart — DexScreener chart\n💹 /tokenomics — Token details\n🎮 /app — Mini App link\n🌐 /socials — All official links\n❓ /help — This menu\n\n💬 *Or just ask me anything about $PECKER!*\nPowered by AI 🤖🐦`,
    { parse_mode: 'Markdown' }
  )
})

// ─── ADMIN COMMANDS ───────────────────────────────────────────────────────────

// /warn
bot.onText(/\/warn/, async (msg) => {
  if (!msg.reply_to_message) return
  const chatId = msg.chat.id
  const admins = await bot.getChatAdministrators(chatId)
  const isAdmin = msg.from.id === OWNER_ID || admins.some(a => a.user.id === msg.from.id)
  if (!isAdmin) return
  const targetId = msg.reply_to_message.from.id
  const targetName = msg.reply_to_message.from.first_name
  warnings[targetId] = (warnings[targetId] || 0) + 1
  if (warnings[targetId] >= 3) {
    await bot.banChatMember(chatId, targetId)
    await bot.sendMessage(chatId, `🚫 ${targetName} has been banned after 3 warnings. Flock stays clean 🐦`)
    delete warnings[targetId]
  } else {
    await bot.sendMessage(chatId, `⚠️ *Warning ${warnings[targetId]}/3* for ${targetName}.\n\nOne more and it's a ban.`, { parse_mode: 'Markdown' })
  }
})

// /ban
bot.onText(/\/ban/, async (msg) => {
  if (!msg.reply_to_message) return
  const chatId = msg.chat.id
  const admins = await bot.getChatAdministrators(chatId)
  const isAdmin = msg.from.id === OWNER_ID || admins.some(a => a.user.id === msg.from.id)
  if (!isAdmin) return
  const targetId = msg.reply_to_message.from.id
  const targetName = msg.reply_to_message.from.first_name
  await bot.banChatMember(chatId, targetId)
  await bot.sendMessage(chatId, `🚫 *${targetName} has been banned.* The flock stays clean 🐦`, { parse_mode: 'Markdown' })
})

// /unban
bot.onText(/\/unban/, async (msg) => {
  if (!msg.reply_to_message) return
  const chatId = msg.chat.id
  const admins = await bot.getChatAdministrators(chatId)
  const isAdmin = msg.from.id === OWNER_ID || admins.some(a => a.user.id === msg.from.id)
  if (!isAdmin) return
  const targetId = msg.reply_to_message.from.id
  const targetName = msg.reply_to_message.from.first_name
  await bot.unbanChatMember(chatId, targetId)
  await bot.sendMessage(chatId, `✅ *${targetName} has been unbanned.* Welcome back to the flock 🐦`, { parse_mode: 'Markdown' })
})

// /mute
bot.onText(/\/mute/, async (msg) => {
  if (!msg.reply_to_message) return
  const chatId = msg.chat.id
  const admins = await bot.getChatAdministrators(chatId)
  const isAdmin = msg.from.id === OWNER_ID || admins.some(a => a.user.id === msg.from.id)
  if (!isAdmin) return
  const targetId = msg.reply_to_message.from.id
  const targetName = msg.reply_to_message.from.first_name
  await bot.restrictChatMember(chatId, targetId, {
    permissions: { can_send_messages: false },
    until_date: Math.floor(Date.now() / 1000) + 3600
  })
  await bot.sendMessage(chatId, `🔇 *${targetName} has been muted for 1 hour.* 🐦`, { parse_mode: 'Markdown' })
})

// /unmute
bot.onText(/\/unmute/, async (msg) => {
  if (!msg.reply_to_message) return
  const chatId = msg.chat.id
  const admins = await bot.getChatAdministrators(chatId)
  const isAdmin = msg.from.id === OWNER_ID || admins.some(a => a.user.id === msg.from.id)
  if (!isAdmin) return
  const targetId = msg.reply_to_message.from.id
  const targetName = msg.reply_to_message.from.first_name
  await bot.restrictChatMember(chatId, targetId, {
    permissions: {
      can_send_messages: true,
      can_send_media_messages: true,
      can_send_other_messages: true
    }
  })
  await bot.sendMessage(chatId, `🔊 *${targetName} has been unmuted.* 🐦`, { parse_mode: 'Markdown' })
})

// /rules
bot.onText(/\/rules/, async (msg) => {
  const chatId = msg.chat.id
  await bot.sendMessage(chatId,
    `📜 *$PECKER Group Rules*\n\n1️⃣ No spam or repeated messages\n2️⃣ No external links or promotions\n3️⃣ No FUD or false info\n4️⃣ No scam or phishing links\n5️⃣ Respect all members\n6️⃣ English only in main chat\n7️⃣ No begging for money or tokens\n8️⃣ DYOR — Not financial advice\n\n⚠️ 3 warnings = permanent ban 🐦`,
    { parse_mode: 'Markdown' }
  )
})

// /buybot
bot.onText(/\/buybot/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const admins = await bot.getChatAdministrators(chatId).catch(() => [])
  const isAdmin = userId === OWNER_ID || admins.some(a => a.user.id === userId)
  if (!isAdmin) {
    await bot.sendMessage(chatId, 'Only admins can enable the buy bot.')
    return
  }
  buyBotActive = true
  buyBotChatId = chatId
  lastTxHash = null  // Reset so it picks up from latest tx
  await bot.sendMessage(chatId, '🟢 *Buy bot is now active!* Every new $PECKER buy will be posted here 🐦', { parse_mode: 'Markdown' })
})

// /stopbuybot
bot.onText(/\/stopbuybot/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const admins = await bot.getChatAdministrators(chatId).catch(() => [])
  const isAdmin = userId === OWNER_ID || admins.some(a => a.user.id === userId)
  if (!isAdmin) return
  buyBotActive = false
  buyBotChatId = null
  await bot.sendMessage(chatId, '🔴 Buy bot stopped.')
})

// ─── ANTI-SPAM + AI RESPONSES ─────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.chat.type === 'private') return

  const chatId = msg.chat.id
  const userId = msg.from.id
  const text = msg.text

  // Update last activity time for silence detection
  lastActivityTime[chatId] = Date.now()

  // Skip commands
  if (text.startsWith('/')) return

  try {
    const admins = await bot.getChatAdministrators(chatId)
    const isAdmin = userId === OWNER_ID || admins.some(a => a.user.id === userId)
    if (isAdmin) return

    // Intercept CA keywords
    const lowerText = text.toLowerCase().trim()
    const caKeywords = ['ca', 'contract', 'contract address', 'token address', 'addy', 'address']
    if (caKeywords.some(k => lowerText === k || lowerText.includes(k))) {
      await bot.sendMessage(chatId, '*$PECKER Contract Address*\n\nBNB Chain - BEP-20\nAlways verify before buying\n\nTap to copy:', { parse_mode: 'Markdown', reply_to_message_id: msg.message_id })
      await bot.sendMessage(chatId, '`' + CA + '`', { parse_mode: 'Markdown' })
      return
    }

    // Block external links
    const hasExternalLink = /https?:\/\/(?!t\.me\/pecker|pecker-website|peckeronbsc|x\.com\/pecker)/i.test(text)
    if (hasExternalLink) {
      await bot.deleteMessage(chatId, msg.message_id)
      await bot.sendMessage(chatId, `⚠️ @${msg.from.username || msg.from.first_name} — external links are not allowed in this group! 🐦`)
      return
    }

    // AI responses
    const peckerKeywords = ['pecker', 'token', 'price', 'buy', 'sell', 'ca', 'contract', 'rug', 'scam', 'legit', 'moon', 'pump', 'airdrop', 'when', 'how', 'what', 'why', 'safe', 'launch', 'listing', 'dex', 'pancake', 'bnb', 'chart', 'mc', 'market cap', 'tax', 'wallet', 'tokenomics', 'roadmap', 'team', 'dev', 'website', 'web', 'link', 'whitepaper', 'hello', 'hi', 'hey', 'gm', 'good morning']
    const shouldRespond = peckerKeywords.some(kw => text.toLowerCase().includes(kw))

    if (shouldRespond && text.length > 5) {
      const response = await getAIResponse(text, msg.from.first_name)
      if (response) {
        await bot.sendMessage(chatId, response, { reply_to_message_id: msg.message_id })
      }
    }
  } catch (e) {
    console.error('Message handler error:', e.message)
  }
})

// ─── WELCOME NEW MEMBERS ──────────────────────────────────────────────────────
bot.on('new_chat_members', async (msg) => {
  const chatId = msg.chat.id
  // Update activity so silence timer resets on joins
  lastActivityTime[chatId] = Date.now()
  for (const member of msg.new_chat_members) {
    if (!member.is_bot) {
      await sendWelcome(chatId, member)
    }
  }
})

console.log('🐦 PECKER BOT is live and pecking!')
