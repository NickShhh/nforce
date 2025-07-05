const express = require("express");
const cors = require("cors");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const bansRouter = require("./routes/bans");
app.use("/bans", bansRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 N-FORCE backend running on port ${PORT}`);
});