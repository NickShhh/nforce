const express = require("express")
const cors = require("cors")
const dotenv = require("dotenv")
const bansRoutes = require("./routes/bans")

dotenv.config()
const app = express()

app.use(cors())
app.use(express.json())
app.use("/bans", bansRoutes)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
	console.log(`🚀 N-FORCE backend running on port ${PORT}`)
})
