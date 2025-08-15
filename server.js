import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import Pino from 'pino'
import fs from 'fs'
import cron from 'node-cron'

const ADMIN_NUMBER = "923351300389" // Admin ka number
const DATA_FILE = './data.json'

// Data load function
function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ sessions: {}, users: {} }, null, 2))
    }
    return JSON.parse(fs.readFileSync(DATA_FILE))
}

// Data save function
function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions')
    const sock = makeWASocket({
        logger: Pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state
    })

    sock.ev.on('creds.update', saveCreds)

    // Auto profit every day at midnight
    cron.schedule('0 0 * * *', () => {
        let data = loadData()
        for (let number in data.users) {
            let user = data.users[number]
            if (user.deposit >= 500) {
                user.balance += 100 // daily profit
            }
        }
        saveData(data)
        console.log("Daily profit added ✅")
    })

    sock.ev.on('messages.upsert', async m => {
        let msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        let from = msg.key.remoteJid.replace(/[^0-9]/g, '')
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

        let data = loadData()
        if (!data.users[from]) {
            data.users[from] = { deposit: 0, balance: 0 }
            saveData(data)
        }

        // Commands
        if (text.toLowerCase() === 'menu') {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `💚 *Earn Pakistan Bot* 💚\n\n1️⃣ Deposit: Send amount to EasyPaisa 0300xxxxxxx & msg admin\n2️⃣ Daily profit: 100 PKR per 500 PKR deposit\n3️⃣ Withdraw when balance >= deposit × 10\n\nYour Balance: ${data.users[from].balance} PKR`
            })
        }

        // Admin approve deposit
        if (from === ADMIN_NUMBER && text.startsWith('approve')) {
            let parts = text.split(' ')
            if (parts.length === 3) {
                let target = parts[1]
                let amount = parseInt(parts[2])
                if (!data.users[target]) data.users[target] = { deposit: 0, balance: 0 }
                data.users[target].deposit += amount
                saveData(data)
                await sock.sendMessage(msg.key.remoteJid, { text: `Approved ${amount} PKR for ${target}` })
            }
        }

        // Withdraw request
        if (text.toLowerCase() === 'withdraw') {
            let user = data.users[from]
            if (user.balance >= user.deposit * 10) {
                await sock.sendMessage(msg.key.remoteJid, { text: `✅ Withdraw request sent to admin` })
                await sock.sendMessage(`${ADMIN_NUMBER}@s.whatsapp.net`, { text: `User ${from} wants to withdraw ${user.balance} PKR` })
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ You need at least ${user.deposit * 10} PKR to withdraw` })
            }
        }
    })
}

startBot()
