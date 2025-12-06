const express = require("express");
const app = express();
const cors = require("cors");
const port = 3000;

// middlewares

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("contest x server is running");
});
app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
