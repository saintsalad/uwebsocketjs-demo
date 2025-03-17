import { App } from "uWebSockets.js";

const app = App();
let clients = new Map();
let nextUserId = 1;

// Initial boy position
let boy = { x: 100, y: 100, speed: 2, color: "blue", size: 20 };
let moveInterval = null;
let colorToggleInterval = null;
let sizeToggleInterval = null;

function moveBoyRandomly() {
  boy.x += (Math.random() * 10 - 5) * boy.speed;
  boy.y += (Math.random() * 10 - 5) * boy.speed;

  // Keep within bounds
  boy.x = Math.max(50, Math.min(450, boy.x));
  boy.y = Math.max(50, Math.min(450, boy.y));

  broadcastState();
}

// Set initial movement interval
function startMovementInterval(intervalTime) {
  // Clear any existing interval first
  if (moveInterval) {
    clearInterval(moveInterval);
  }
  moveInterval = setInterval(moveBoyRandomly, intervalTime);
}

// Start with default 1-second interval
startMovementInterval(1000);

// Broadcast boy's position & chat to all clients
function broadcastState() {
  const data = JSON.stringify({
    action: "update_boy",
    x: boy.x,
    y: boy.y,
    color: boy.color,
    size: boy.size,
  });
  clients.forEach((userId, client) => client.send(data));
}

function broadcastChat(message, senderId) {
  const data = JSON.stringify({
    action: "chat",
    text: message,
    userId: senderId,
  });
  clients.forEach((userId, client) => client.send(data));
}

// Add CORS handling for WebSocket upgrades
app.ws("/*", {
  // Add upgrade handler for CORS
  upgrade: (res, req, context) => {
    // Get the origin header
    const origin = req.getHeader("origin");

    // Set CORS headers to allow all origins (for development)
    // For production, you should restrict this to specific trusted origins
    res.writeHeader("Access-Control-Allow-Origin", origin || "*");
    res.writeHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.writeHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type"
    );
    res.writeHeader("Access-Control-Allow-Credentials", "true");

    // Upgrade the connection
    res.upgrade(
      {
        // Custom data to attach to the WebSocket
        userId: nextUserId++,
      },
      // Second argument is the requested URL
      req.getHeader("sec-websocket-key"),
      req.getHeader("sec-websocket-protocol"),
      req.getHeader("sec-websocket-extensions"),
      context
    );
  },

  open: (ws) => {
    // Use the userId we attached during upgrade
    const userId = ws.getUserData().userId;
    clients.set(ws, userId);

    // Send initial boy position WITH color AND size
    ws.send(
      JSON.stringify({
        action: "update_boy",
        x: boy.x,
        y: boy.y,
        color: boy.color,
        size: boy.size,
      })
    );

    // Inform user of their ID
    ws.send(JSON.stringify({ action: "assigned_id", userId: userId }));

    console.log(`New viewer connected (ID: ${userId})`);
  },

  message: (ws, message) => {
    let data = JSON.parse(Buffer.from(message));
    const userId = clients.get(ws);

    if (data.action === "chat") {
      console.log(`Chat from User ${userId}: ${data.text}`);

      broadcastChat(`User ${userId}: ${data.text}`, userId);

      if (data.text === "jump") {
        boy.y -= 50;
        broadcastState();
      } else if (data.text === "run") {
        // Increase speed moderately but increase update frequency for smoothness
        boy.speed = 8;

        // Update position 10 times per second instead of once per second
        startMovementInterval(100);

        // Use array of colors instead of just red/green
        const colors = ["red", "green", "blue", "purple", "orange", "yellow"];
        let colorIndex = 0;
        boy.color = colors[0]; // Start with first color

        // Create interval to toggle colors
        if (colorToggleInterval) {
          clearInterval(colorToggleInterval);
        }

        // Create interval to toggle size
        if (sizeToggleInterval) {
          clearInterval(sizeToggleInterval);
        }

        // Change colors every 100ms, cycling through array
        colorToggleInterval = setInterval(() => {
          colorIndex = (colorIndex + 1) % colors.length;
          boy.color = colors[colorIndex];
          // Force broadcast with each color change to ensure size is also sent
          broadcastState();
        }, 100);

        // Toggle size between small and large
        let growingSize = true;
        boy.size = 20; // Reset size before starting
        sizeToggleInterval = setInterval(() => {
          // Make size changes more dramatic
          if (growingSize) {
            boy.size += 8;
            if (boy.size >= 60) growingSize = false;
          } else {
            boy.size -= 8;
            if (boy.size <= 10) growingSize = true;
          }
          // We're broadcasting from the color interval now
        }, 50);

        // Reset after 5 seconds
        setTimeout(() => {
          boy.speed = 2;
          startMovementInterval(1000);

          // Stop toggling and reset to defaults
          clearInterval(colorToggleInterval);
          clearInterval(sizeToggleInterval);
          colorToggleInterval = null;
          sizeToggleInterval = null;
          boy.color = "blue";
          boy.size = 20;
          broadcastState();
        }, 5000);

        broadcastState();
      }
    }
  },
  close: (ws) => {
    const userId = clients.get(ws);
    clients.delete(ws);
    console.log(`Viewer disconnected (ID: ${userId})`);
  },
});

app.listen(9001, () =>
  console.log("WebSocket server running on ws://localhost:9001")
);
