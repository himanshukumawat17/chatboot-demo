const express = require("express");
const app = express();
const PORT = 3000;

app.use(express.json());

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (email === "test@example.com" && password === "123456") {
    return res.json({
      success: true,
      message: "Login successful",
      token: "dummy-token-123"
    });
  }

  res.status(401).json({
    success: false,
    message: "Invalid credentials"
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
